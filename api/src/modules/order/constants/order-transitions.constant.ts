import { OrderStatus } from '@generated/prisma/enums';

export const VALID_ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, OrderStatus[]>
> = {
  pending: [OrderStatus.stock_reserved, OrderStatus.cancelled],
  stock_reserved: [OrderStatus.paid, OrderStatus.cancelled],
  paid: [OrderStatus.processing, OrderStatus.refunded],
  payment_failed: [OrderStatus.stock_reserved, OrderStatus.cancelled],
  processing: [OrderStatus.shipped],
  shipped: [OrderStatus.delivered],
  delivered: [OrderStatus.completed],
  completed: [],
  cancelled: [],
  refunded: [],
};
