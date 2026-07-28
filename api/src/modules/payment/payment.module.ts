import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { StripePaymentProvider } from './providers/stripe-payment.provider';

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: StripePaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER, PaymentService],
})
export class PaymentModule {}
