export type NotificationJobPayload = {
  userId: string;
  type:
    | 'order_confirmed'
    | 'payment_received'
    | 'payment_failed'
    | 'order_shipped';
  data: { orderId: string; orderNumber: string; total?: string };
  reason?: string;
};
