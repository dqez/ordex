import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { BullModule } from '@nestjs/bullmq';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderProcessor } from './order.processor';

@Module({
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor],
  imports: [BullModule.registerQueue({ name: 'order-queue' }), InventoryModule],
})
export class OrderModule {}
