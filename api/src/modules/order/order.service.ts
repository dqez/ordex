import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '../../../generated/prisma/enums';
import { VALID_ORDER_TRANSITIONS } from './constants/order-transitions.constant';
import { CheckoutDto } from './dto/checkout.dto';
import { generateOrderNumber } from '../../common/utils/order-number.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('order-queue') private orderQueue: Queue,
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

    const allowedStatuses = VALID_ORDER_TRANSITIONS[order.status];
    if (!allowedStatuses || !allowedStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${nextStatus}'`,
      );
    }

    const [updatedOrder] = await this.prisma.$transaction([
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

    return updatedOrder;
  }

  async checkout(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      include: {
        cartItems: {
          orderBy: { added_at: 'desc' },
          include: {
            productVariant: {
              include: {
                product: true,
              },
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

    const subtotal = cart.cartItems.reduce((sum, item) => {
      return sum + item.quantity * item.productVariant.price.toNumber();
    }, 0);

    const order = await this.prisma.$transaction(async (tx) => {
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
          subtotal: item.quantity * item.productVariant.price.toNumber(),
        })),
      });

      await tx.cartItem.deleteMany({
        where: { cart_id: cart.id },
      });

      return newOrder;
    });

    await this.orderQueue.add('process-order', {
      orderId: order.id,
      items: cart.cartItems.map((item) => ({
        variantId: item.variant_id,
        quantity: item.quantity,
      })),
    });

    return { orderId: order.id, orderNumber: order.order_number };
  }
}
