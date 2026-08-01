import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService],
  imports: [PaymentModule],
})
export class WebhookModule {}
