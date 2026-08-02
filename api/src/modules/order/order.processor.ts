import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InventoryService } from '../inventory/inventory.service';
import { OrderService } from './order.service';
import { Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderStatus } from '@generated/prisma/enums';
import { Logger } from '@nestjs/common';

@Processor('order-queue')
export class OrderProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly orderService: OrderService,
    private readonly logger = new Logger(OrderProcessor.name),
  ) {
    super();
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[ORDEX] Order queue worker: job ${job.id} completed!`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ orderId: string; paymentId: string }>, error: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `[DLQ ALERT] Job ${job.name} (id: ${job.id}) moved to DLQ after ${job.attemptsMade} attempts`,
        {
          jobData: job.data,
          errorMessage: error.message,
        },
      );
    }
  }

  async process(job: Job<{ orderId: string; paymentId: string }>) {
    switch (job.name) {
      case 'ConfirmOrder': {
        const orderId = job.data.orderId;
        const items = await this.getItemsFromOrder(orderId);
        await this.inventoryService.deductStock(items);
        await this.orderService.transitionOrderStatus(
          orderId,
          OrderStatus.paid,
        );
        break;
      }
      case 'HandlePaymentFailure': {
        const orderId = job.data.orderId;
        const items = await this.getItemsFromOrder(orderId);
        await this.inventoryService.releaseStock(items);
        await this.orderService.transitionOrderStatus(
          orderId,
          OrderStatus.payment_failed,
        );
        break;
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        break;
    }
  }

  private async getItemsFromOrder(orderId: string) {
    const orderItems = await this.prisma.orderItem.findMany({
      where: { order_id: orderId },
    });
    return orderItems.map((i) => ({
      variantId: i.variant_id,
      quantity: i.quantity,
    }));
  }
}
