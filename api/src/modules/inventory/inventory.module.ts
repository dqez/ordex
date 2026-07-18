import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryCronService } from './inventory-cron.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryCronService],
  exports: [InventoryService, InventoryCronService],
})
export class InventoryModule {}
