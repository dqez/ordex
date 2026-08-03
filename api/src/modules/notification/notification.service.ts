import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationJobPayload } from './types/notification-job.type';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification-queue') private queue: Queue,
    private readonly logger = new Logger(NotificationService.name),
  ) {}

  async dispatchNotification(payload: NotificationJobPayload): Promise<void> {
    await this.queue.add('SendNotification', payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.logger.log(
      `Dispatched notification job: ${payload.type} for user ${payload.userId}`,
    );
  }

  async getUserNotification(userId: string) {
    return await this.prisma.notification.findMany({
      where: { user_id: userId },
    });
  }
}
