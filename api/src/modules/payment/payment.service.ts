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
}
