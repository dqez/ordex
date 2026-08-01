import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProviderInterface,
} from './interfaces/payment-provider.interface';
import { Prisma } from '@generated/prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private paymentProvider: PaymentProviderInterface,
    @InjectQueue('order-queue') private readonly orderQueue: Queue,
  ) {}

  async createPayment(
    orderId: string,
    amount: Prisma.Decimal,
    currency: string = 'vnd',
  ) {
    const intent = await this.paymentProvider.createPaymentIntent({
      orderId,
      amount,
      currency,
    });

    const payment = await this.prisma.payment.create({
      data: {
        order_id: orderId,
        provider: intent.provider,
        provider_payment_id: intent.providerPaymentId,
        amount,
        currency,
        status: intent.status,
        metadata: JSON.parse(
          JSON.stringify(intent.rawResponse),
        ) as Prisma.InputJsonObject,
      },
    });

    return {
      payment,
      clientSecret: intent.clientSecret,
      redirectUrl: intent.redirectUrl,
    };
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    const event = this.paymentProvider.verifyWebhookSignature(
      payload,
      signature,
    );

    if (event === null) {
      throw new BadRequestException('Invalid signature');
    }

    const stripeEvent = event as {
      id: string;
      type: string;
      data: { object: { id: string; metadata?: { orderId?: string } } };
    };

    const eventId = stripeEvent.id;
    const existing = await this.prisma.idempotencyKey.findFirst({
      where: {
        key: eventId,
        resource_type: 'stripe_webhook',
      },
    });
    if (existing) {
      return;
    }
    await this.prisma.idempotencyKey.create({
      data: {
        key: stripeEvent.id,
        resource_type: 'stripe_webhook',
        request_hash: stripeEvent.type,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const paymentIntent = stripeEvent.data.object;
    const orderId = paymentIntent.metadata?.orderId;
    if (!orderId) {
      console.log(`OrderId not found`);
      return;
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        provider_payment_id: paymentIntent.id,
      },
    });
    if (!payment) {
      console.log('Payment not found');
      return;
    }

    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'succeeded' },
        });
        await this.orderQueue.add('ConfirmOrder', {
          orderId,
          paymentId: payment.id,
        });
        break;
      case 'payment_intent.payment_failed':
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed' },
        });
        await this.orderQueue.add('HandlePaymentFailure', {
          orderId,
          paymentId: payment.id,
        });
        break;
      default:
        break;
    }

    await this.prisma.idempotencyKey.update({
      where: { key: stripeEvent.id },
      data: {
        resource_id: orderId,
        response_code: HttpStatus.OK,
        response_body: stripeEvent.data.object,
      },
    });
  }
}
