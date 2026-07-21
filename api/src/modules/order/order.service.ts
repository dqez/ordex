import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '../../../generated/prisma/enums';
import { VALID_ORDER_TRANSITIONS } from './constants/order-transitions.constant';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async transitionOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    reason?: string,
    changedBy?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const allowedStatuses = VALID_ORDER_TRANSITIONS[order.status];
    if (!allowedStatuses || !allowedStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${nextStatus}'`,
      );
    }

    const [updatedOrder] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: nextStatus,
        },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          order_id: orderId,
          from_status: order.status,
          to_status: nextStatus,
          changed_by: changedBy,
          reason: reason,
        },
      }),
    ]);

    return updatedOrder;
  }
}
