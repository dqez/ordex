import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelInterface,
  SendNotificationPayload,
} from '../interfaces/notification-channel.interface';
import { NotificationChannel } from '@generated/prisma/enums';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailChannel implements NotificationChannelInterface {
  channel: NotificationChannel = NotificationChannel.email;
  private resend: Resend;
  private readonly logger = new Logger(EmailChannel.name);
  private emailFrom: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.emailFrom = this.configService.getOrThrow<string>('EMAIL_FROM');
    this.resend = new Resend(apiKey);
  }

  supports(_type: string): boolean {
    return true;
  }

  async send(payload: SendNotificationPayload): Promise<void> {
    if (!payload.email) {
      this.logger.warn(
        `Skipping email dispatch for user ${payload.userId} due to missing email address`,
      );
      return;
    }

    const { subject, html } = this.buildEmailTemplate(payload);

    await this.resend.emails.send({
      from: this.emailFrom,
      to: payload.email,
      subject,
      html,
    });

    this.logger.log(`[Email] Sent ${payload.type} to ${payload.email}`);
  }

  private buildEmailTemplate(payload: SendNotificationPayload): {
    subject: string;
    html: string;
  } {
    switch (payload.type) {
      case 'order_confirmed':
        return {
          subject: `Order #${payload.data.orderNumber} confirmed`,
          html: `<h1>Thank you for your order.</h1>`,
        };

      case 'payment_received':
        return {
          subject: `Payment Received for Order #${payload.data.orderNumber}`,
          html: `<h1>Thank you for your payment</h1>`,
        };
      case 'payment_failed':
        return {
          subject: `Payment Failed for Order #${payload.data.orderNumber}`,
          html: `<h1>Please try again</h1>`,
        };
      case 'order_shipped':
        return {
          subject: `Your Order #${payload.data.orderNumber} Has Been Shipped`,
          html: `<h1>Your order will arrive soon.</h1>`,
        };
      default:
        throw new Error(
          `Unsuppported notification type for email: ${payload.type}`,
        );
    }
  }
}
