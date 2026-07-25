export type CreatePaymentIntentInput = {
  orderId: string;
  amount: number;
  currency: string;
};

export type PaymentIntentResult = {
  providerPaymentId: string;
  status: 'pending' | 'succeeded' | 'failed';
  rawResponse: Record<string, unknown>;
};

export interface PaymentProviderInterface {
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentResult>;

  verifyWebhookSignature(payload: Buffer, signature: string): boolean;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
