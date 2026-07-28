import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@generated/prisma/enums';
import type { Order } from '@generated/prisma/client';
import { VALID_ORDER_TRANSITIONS } from './constants/order-transitions.constant';
import { CheckoutDto } from './dto/checkout.dto';
import { generateOrderNumber } from '../../common/utils/order-number.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentService } from '../payment/payment.service';
import { Prisma } from '@generated/prisma/client';
import { createHash } from 'crypto';
import { CheckoutResult } from './types/checkout-result.type';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payment: PaymentService,
    @InjectQueue('order-queue') private readonly orderQueue: Queue,
  ) {}

  async transitionOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    reason?: string,
    changedBy?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const allowedStatues = VALID_ORDER_TRANSITIONS[order.status];
    if (!allowedStatues || !allowedStatues.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${nextStatus}'`,
      );
    }

    const [updateOrder] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: nextStatus,
        },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          order_id: orderId,
          from_status: order.status,
          to_status: nextStatus,
          changed_by: changedBy,
          reason: reason,
        },
      }),
    ]);

    return updateOrder;
  }

  async checkout(userId: string, dto: CheckoutDto) {
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ userId, dto }))
      .digest('hex');

    await this.prisma.idempotencyKey.deleteMany({
      where: {
        key: dto.idempotencyKey,
        expires_at: { lte: new Date() },
      },
    });

    // Step 1 — claim the idempotency key. This is the ONLY place that can
    // legitimately produce a P2002 for `idempotencyKey.key`, so it gets its
    // own try/catch instead of sharing one with the business logic below —
    // otherwise an unrelated unique-constraint error further down (e.g. an
    // order_number or provider_payment_id collision) would be misread as
    // "duplicate idempotency key".
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          resource_type: 'create_order',
          request_hash: requestHash,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { key: dto.idempotencyKey },
        });

        if (existing?.request_hash !== requestHash) {
          throw new ConflictException(
            'The Idempotency Key has already been used for another request',
          );
        }

        if (existing?.response_body) {
          return existing.response_body as unknown as CheckoutResult;
        }

        throw new ConflictException(
          'The request is being processed, please try again later',
        );
      }
      throw error;
    }

    // Step 2 — actually run the checkout. This try/catch's job is ONLY to
    // detect "checkout did not complete" and clean up the key so a retry can
    // start fresh. Once `result` is assigned below, checkout has genuinely
    // succeeded (order created, stock reserved, payment intent created, cart
    // cleared) — persisting the cached response is handled separately in
    // Step 3, deliberately outside this try/catch.
    let order!: Order;
    let result!: CheckoutResult;

    try {
      const cart = await this.prisma.cart.findUnique({
        where: { user_id: userId },
        include: {
          cartItems: {
            orderBy: { added_at: 'desc' },
            include: {
              productVariant: {
                include: { product: true },
              },
            },
          },
        },
      });

      if (!cart || cart.cartItems.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const address = await this.prisma.address.findFirst({
        where: { id: dto.shippingAddressId, user_id: userId },
      });
      if (!address) throw new NotFoundException('Address not found');

      const subtotal = cart.cartItems.reduce(
        (sum, item) => sum.add(item.productVariant.price.mul(item.quantity)),
        new Prisma.Decimal(0),
      );

      order = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            order_number: generateOrderNumber(),
            user_id: userId,
            status: OrderStatus.pending,
            shipping_address: {
              full_name: address.full_name,
              phone: address.phone,
              address_line: address.address_line,
              ward: address.ward,
              district: address.district,
              city: address.city,
            },
            subtotal: subtotal,
            discount_amount: 0,
            total: subtotal,
          },
        });

        await tx.orderItem.createMany({
          data: cart.cartItems.map((item) => ({
            order_id: newOrder.id,
            variant_id: item.variant_id,
            product_name: item.productVariant.product.name,
            variant_name: item.productVariant.name,
            sku: item.productVariant.sku,
            price: item.productVariant.price,
            quantity: item.quantity,
            subtotal: item.productVariant.price.mul(item.quantity),
          })),
        });
        //cart is cleared later (after stock is reserved), not here - see below.
        return newOrder;
      });

      let stockReserved = false;
      const items = cart.cartItems.map((item) => ({
        variantId: item.variant_id,
        quantity: item.quantity,
      }));

      try {
        await this.inventory.reserveStock(items);
        stockReserved = true;

        await this.transitionOrderStatus(order.id, OrderStatus.stock_reserved);

        // Clear the cart BEFORE calling out to Stripe: createPayment is the
        // one step with an external side effect, so we want nothing left
        // that can fail after it succeeds.
        await this.prisma.cartItem.deleteMany({ where: { cart_id: cart.id } });

        const newPayment = await this.payment.createPayment(order.id, subtotal);

        result = {
          orderId: order.id,
          orderNumber: order.order_number,
          payment: {
            id: newPayment.payment.id,
            provider: newPayment.payment.provider,
            clientSecret: newPayment.clientSecret ?? undefined,
            status: newPayment.payment.status,
          },
        };
      } catch (error) {
        if (stockReserved) {
          await this.inventory.releaseStock(items).catch(() => {});
        }
        await this.transitionOrderStatus(
          order.id,
          OrderStatus.cancelled,
          error instanceof Error ? error.message : 'Checkout failed',
        );
        throw error;
      }
    } catch (error) {
      await this.prisma.idempotencyKey
        .delete({ where: { key: dto.idempotencyKey } })
        .catch(() => {});
      throw error;
    }

    // Step 3 — checkout already succeeded. Persisting the cached response is
    // best-effort: this request still returns success either way, and we
    // deliberately do NOT delete the key on failure here — that would let a
    // retry create a duplicate order/payment. Worst case, a retry is blocked
    // with "please try again later" until the key naturally expires, which
    // is the safe failure mode.
    try {
      await this.prisma.idempotencyKey.update({
        where: { key: dto.idempotencyKey },
        data: {
          resource_id: order.id,
          response_code: HttpStatus.CREATED,
          response_body: result,
        },
      });
    } catch (error) {
      this.logger.error(
        `Checkout succeeded (order=${order.id}) but failed to persist idempotency response for key ${dto.idempotencyKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return result;
  }
}
