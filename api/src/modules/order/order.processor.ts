import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InventoryService } from '../inventory/inventory.service';
import { OrderService } from './order.service';
import { Job } from 'bullmq';
import { ReserveStockItemDto } from '../inventory/dto/reserve-stock.dto';

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
    return Promise.resolve(
      console.log(`[ORDEX] Unknown job name: ${job.name}`),
    );
  }
}
