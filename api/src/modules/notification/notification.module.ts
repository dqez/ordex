import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProcessor } from './notification.processor';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationProcessor],
  imports: [BullModule.registerQueue({ name: 'notification-queue' })],
  exports: [NotificationService],
})
export class NotificationModule {}
