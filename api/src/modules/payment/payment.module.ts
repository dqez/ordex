import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
