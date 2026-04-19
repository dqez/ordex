import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':variantId')
  getInventory(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventoryService.getAvailable(variantId);
  }

  @Patch(':variantId/threshold')
  updateThreshold(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body('threshold') threshold: number,
  ) {
    return this.inventoryService.updateThreshold(variantId, threshold);
  }

  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  reserve(
    @Body('variantId') variantId: string,
    @Body('quantity') quantity: number,
  ) {
    return this.inventoryService.reserve(variantId, quantity);
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  release(
    @Body('variantId') variantId: string,
    @Body('quantity') quantity: number,
  ) {
    return this.inventoryService.release(variantId, quantity);
  }

  @Post('deduct')
  @HttpCode(HttpStatus.OK)
  deduct(
    @Body('variantId') variantId: string,
    @Body('quantity') quantity: number,
    @Body('reservedToRelease') reservedToRelease: number,
  ) {
    return this.inventoryService.deduct(variantId, quantity, reservedToRelease);
  }
}
