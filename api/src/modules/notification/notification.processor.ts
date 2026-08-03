import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannelInterface,
} from './interfaces/notification-channel.interface';
import { NotificationJobPayload } from './types/notification-job.type';

@Processor('notification-queue')
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannelInterface[],
    private readonly logger = new Logger(NotificationProcessor.name),
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: job.data.userId },
      include: { userNotificationSettings: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const matchedChannels = this.channels.filter((channel) =>
      channel.supports(job.data.type),
    );
    const errors: Error[] = [];

    for (const channel of matchedChannels) {
      let pendingNotificationId: string | undefined;

      try {
        const existingNotification = await this.prisma.notification.findFirst({
          where: {
            user_id: user.id,
            type: job.data.type,
            channel: channel.channel,
            status: 'sent',
            metadata: { equals: job.data.data },
          },
        });

        if (existingNotification) continue;

        const newNotification = await this.prisma.notification.create({
          data: {
            user_id: user.id,
            type: job.data.type,
            channel: channel.channel,
            status: 'pending',
            metadata: job.data.data,
          },
        });

        pendingNotificationId = newNotification.id;

        await channel.send({
          userId: user.id,
          email: user.email,
          type: job.data.type,
          data: job.data.data,
        });

        await this.prisma.notification.update({
          where: { id: pendingNotificationId },
          data: {
            status: 'sent',
            sent_at: new Date(),
          },
        });
      } catch (error) {
        if (pendingNotificationId) {
          await this.prisma.notification.update({
            where: { id: pendingNotificationId },
            data: {
              status: 'failed',
            },
          });
        }
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `Failed to send notifications: ${errors.length} channels failed`,
      );
    }
  }
}
