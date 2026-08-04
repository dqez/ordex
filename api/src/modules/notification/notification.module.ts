import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProcessor } from './notification.processor';
import { EmailChannel } from './channels/email.channel';
import { NOTIFICATION_CHANNELS } from './interfaces/notification-channel.interface';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    EmailChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (emailChannel: EmailChannel) => {
        return [emailChannel];
      },
      inject: [EmailChannel],
    },
  ],
  imports: [BullModule.registerQueue({ name: 'notification-queue' })],
  exports: [NotificationService],
})
export class NotificationModule {}
