import { Injectable } from '@nestjs/common';
import {
  CreatePaymentIntentInput,
  PaymentIntentResult,
  PaymentProviderInterface,
} from '../interfaces/payment-provider.interface';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@generated/prisma/enums';

@Injectable()
export class StripePaymentProvider implements PaymentProviderInterface {
  private static readonly ZERO_DECIMAL_CURRENCIES = new Set([
    'vnd',
    'jpy',
    'krw',
  ]);

  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private config: ConfigService) {
    const secretKey = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.stripe = new Stripe(secretKey, { apiVersion: '2026-06-24.dahlia' });
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentResult> {
    const currency = input.currency.toLowerCase();
    const amount = StripePaymentProvider.ZERO_DECIMAL_CURRENCIES.has(currency)
      ? Math.round(input.amount.toNumber())
      : Math.round(input.amount.mul(100).toNumber());

    const result = await this.stripe.paymentIntents.create({
      amount,
      currency,
      metadata: { orderId: input.orderId },
    });

    return {
      provider: 'stripe',
      providerPaymentId: result.id,
      status: this.mapStripeStatus(result.status),
      clientSecret: result.client_secret ?? undefined,
      redirectUrl: undefined,
      rawResponse: result as unknown as Record<string, unknown>,
    };
  }

  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
  ): Record<string, unknown> | null {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
      return event as unknown as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private mapStripeStatus(
    stripeStatus: Stripe.PaymentIntent.Status,
  ): PaymentStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
        return 'failed';
      case 'processing':
        return 'processing';
      default:
        // requires_payment_method / requires_confirmation / requires_action / requires_capture
        return 'pending';
    }
  }
}
