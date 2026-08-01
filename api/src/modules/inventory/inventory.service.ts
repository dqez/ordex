import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReserveStockItemDto } from './dto/reserve-stock.dto';
import { InsufficientStockException } from '../../common/exceptions/insufficient-stock.exception';
import { StockReservationConflictException } from '../../common/exceptions/stock-reservation-conflict.exception';
import { jitterBackoff, sleep } from '../../common/utils/retry.util';

const MAX_RETRY = 3;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger = new Logger(InventoryService.name),
  ) {}

  async deductStock(items: ReserveStockItemDto[]): Promise<void> {
    for (const item of items) {
      const affected = await this.prisma.$executeRaw`
        UPDATE inventory
        SET quantity = quantity - ${item.quantity},
            reserved = reserved - ${item.quantity}
        WHERE variant_id = ${item.variantId}::uuid
          AND reserved >= ${item.quantity}
          AND quantity >= ${item.quantity}
      `;
      if (affected === 0) {
        this.logger.warn(
          `Cannot deduct stock with variantId = ${item.variantId}`,
        );
      }
    }
  }

  async reserveStock(items: ReserveStockItemDto[]): Promise<void> {
    for (const item of items) {
      await this.reserveSingleItem(item.variantId, item.quantity, 0);
    }
  }

  async releaseStock(items: ReserveStockItemDto[]): Promise<void> {
    for (const item of items) {
      const affected = await this.prisma.$executeRaw`
        UPDATE inventory
        SET reserved = reserved - ${item.quantity}
        WHERE variant_id = ${item.variantId}::uuid
          AND reserved >= ${item.quantity}
      `;
      if (affected === 0) {
        this.logger.warn(
          `Cannot release stock with variantId = ${item.variantId}`,
        );
      }
    }
  }

  async getStock(variantId: string) {
    return this.prisma.inventory.findFirst({
      where: { variant_id: variantId },
    });
  }

  private async reserveSingleItem(
    variantId: string,
    qty: number,
    attempt: number,
  ): Promise<void> {
    const current = await this.prisma.inventory.findFirst({
      where: { variant_id: variantId },
    });

    if (!current) {
      throw new InsufficientStockException(variantId, 0);
    }

    const available = current.quantity - current.reserved;

    if (qty > available) {
      throw new InsufficientStockException(variantId, available);
    }

    const affected = await this.prisma.$executeRaw`
      UPDATE inventory
      SET reserved = reserved + ${qty},
          version = version + 1
      WHERE variant_id = ${variantId}::uuid
        AND version = ${current.version}
        AND (quantity - reserved) >= ${qty}
      `;

    if (affected === 0) {
      if (attempt >= MAX_RETRY - 1) {
        throw new StockReservationConflictException(variantId);
      }
      await sleep(jitterBackoff(attempt));
      return this.reserveSingleItem(variantId, qty, attempt + 1);
    }

    const after = await this.prisma.inventory.findFirst({
      where: { variant_id: variantId },
    });

    if (after) {
      const wasAbove = available > current.low_stock_threshold;
      const isNowBelow =
        after.quantity - after.reserved <= after.low_stock_threshold;

      if (wasAbove && isNowBelow) {
        console.log(
          `[LOW STOCK] Variant ${variantId} crossed threshold: ${after.quantity - after.reserved} remaining`,
        );
      }
    }
  }
}
