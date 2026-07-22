import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InventoryService } from '../inventory/inventory.service';
import { OrderService } from './order.service';
import { Job } from 'bullmq';
import { ReserveStockItemDto } from '../inventory/dto/reserve-stock.dto';
import { OrderStatus } from '@prisma/client';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';

@Processor('order-queue')
export class OrderProcessor extends WorkerHost {
  constructor(
    private inventoryService: InventoryService,
    private orderService: OrderService,
  ) {
    super();
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`[ORDEX] Order queue worker: job ${job.id} completed!`);
  }

  async process(job: Job<{ orderId: string; items: ReserveStockItemDto[] }>) {
    if (job.name === 'process-order') {
      const { orderId, items } = job.data;
      try {
        await this.inventoryService.reserveStock(items);

        await this.orderService.transitionOrderStatus(
          orderId,
          OrderStatus.confirmed,
        );
      } catch (error) {
        if (error instanceof InsufficientStockException) {
          await this.orderService.transitionOrderStatus(
            orderId,
            OrderStatus.cancelled,
            'Insufficient stock',
          );
          return;
        }
        throw error;
      }
    }
  }
}
