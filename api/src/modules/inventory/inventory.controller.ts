import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReserveStockDto } from './dto/reserve-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Roles('admin')
  @Post('reserve')
  reserve(@Body() dto: ReserveStockDto) {
    return this.inventoryService.reserveStock(dto.items);
  }

  @Roles('admin')
  @Post('release')
  release(@Body() dto: ReserveStockDto) {
    return this.inventoryService.releaseStock(dto.items);
  }

  @Roles('admin', 'seller')
  @Get(':variantId')
  getStock(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventoryService.getStock(variantId);
  }
}
