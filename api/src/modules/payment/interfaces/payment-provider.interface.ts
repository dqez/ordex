import { PaymentStatus, Prisma } from '@generated/prisma/client';
import Stripe from 'stripe';

export type CreatePaymentIntentInput = {
  orderId: string;
  amount: Prisma.Decimal;
  currency: string;
};

export type PaymentIntentResult = {
  provider: 'stripe' | 'vnpay';
  providerPaymentId: string;
  status: PaymentStatus;
  clientSecret?: string;
  redirectUrl?: string;
  rawResponse: Record<string, unknown>;
};

export interface PaymentProviderInterface {
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentResult>;

  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
  ): Stripe.Event | null;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
