import { Injectable } from '@nestjs/common';
import {
  CreatePaymentIntentInput,
  PaymentIntentResult,
  PaymentProviderInterface,
} from '../interfaces/payment-provider.interface';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripePaymentProvider implements PaymentProviderInterface {
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
    const result = await this.stripe.paymentIntents.create({
      amount: input.amount * 100,
      currency: input.currency,
      metadata: { orderId: input.orderId },
    });
    return {
      providerPaymentId: result.id,
      status:
        result.status === 'succeeded'
          ? 'succeeded'
          : result.status === 'canceled'
            ? 'failed'
            : 'pending',
      rawResponse: result.lastResponse,
    };
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch {
      return false;
    }
    return true;
  }
}
