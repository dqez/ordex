import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { BullModule } from '@nestjs/bullmq';

@Module({
  providers: [
    PaymentService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: StripePaymentProvider,
    },
  ],
  imports: [BullModule.registerQueue({ name: 'order-queue' })],
  exports: [PAYMENT_PROVIDER, PaymentService],
})
export class PaymentModule {}
