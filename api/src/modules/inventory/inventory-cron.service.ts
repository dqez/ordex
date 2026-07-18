import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { LowStockRow } from './types/low-stock-row.type';

@Injectable()
export class InventoryCronService {
  constructor(private prisma: PrismaService) {}

  @Cron('0 0 * * *')
  async checkLowStockDaily() {
    const lowStockItems = await this.prisma.$queryRaw<LowStockRow[]>`
      SELECT variant_id, quantity - reserved as available
      FROM inventory
      WHERE quantity - reserved <= low_stock_threshold;
    `;

    console.warn(
      `[LOW STOCK] Found ${lowStockItems.length} variants below stock threshold.`,
    );
    for (const item of lowStockItems) {
      console.warn(
        `[LOW STOCK] Variant ${item.variant_id} crossed threshold: ${item.available} remaining`,
      );
    }
  }
}
