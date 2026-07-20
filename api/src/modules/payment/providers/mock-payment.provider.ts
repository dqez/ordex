import { Injectable } from '@nestjs/common';
import {
  CreatePaymentIntentInput,
  PaymentIntentResult,
  PaymentProviderInterface,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProviderInterface {
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentResult> {
    return Promise.resolve({
      providerPaymentId: `mock_${input.orderId}`,
      status: 'succeeded',
      rawResponse: {},
    });
  }

  verifyWebhookSignature(_payload: Buffer, _signature: string): boolean {
    return true;
  }
}
