import { NotificationChannel } from '@generated/prisma/enums';

export type SendNotificationPayload = {
  userId: string;
  email?: string;
  type: string;
  data: object;
};

export interface NotificationChannelInterface {
  channel: NotificationChannel;

  supports(type: string): boolean;

  send(payload: SendNotificationPayload): Promise<void>;
}

export const NOTIFICATION_CHANNELS = 'NOTIFICATION_CHANNELS';
