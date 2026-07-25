import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProviderInterface,
} from './interfaces/payment-provider.interface';
import { Prisma } from '@generated/prisma/client';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private paymentProvider: PaymentProviderInterface,
  ) {}

  async createPayment(
    orderId: string,
    amount: number,
    currency: string = 'usd',
  ) {
    const intent = await this.paymentProvider.createPaymentIntent({
      orderId,
      amount,
      currency,
    });

    const payment = await this.prisma.payment.create({
      data: {
        order_id: orderId,
        provider: 'stripe',
        provider_payment_id: intent.providerPaymentId,
        amount: amount,
        currency: currency,
        status: intent.status,
        metadata: intent.rawResponse as Prisma.InputJsonObject,
      },
    });

    return payment;
  }
}
