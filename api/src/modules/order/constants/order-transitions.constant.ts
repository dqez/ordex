import { OrderStatus } from '@prisma/client';

export const VALID_ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, OrderStatus[]>
> = {
  pending: [OrderStatus.confirmed, OrderStatus.cancelled],
  confirmed: [OrderStatus.paid, OrderStatus.cancelled],
  paid: [OrderStatus.processing, OrderStatus.refunded],
  processing: [OrderStatus.shipped],
  shipped: [OrderStatus.delivered],
  delivered: [OrderStatus.completed],
  payment_failed: [OrderStatus.cancelled],
  completed: [],
  cancelled: [],
  refunded: [],
};
