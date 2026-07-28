import { PaymentProvider, PaymentStatus } from '@generated/prisma/enums';

export type CheckoutResult = {
  orderId: string;
  orderNumber: string;
  payment: {
    id: string;
    provider: PaymentProvider;
    clientSecret: string | undefined;
    status: PaymentStatus;
  };
};
