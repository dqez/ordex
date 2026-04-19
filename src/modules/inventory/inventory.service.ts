import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

export interface InventoryResponse {
  variantId: string;
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
  version: number;
  updatedAt: Date;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(
    variantId: string,
    quantity: number,
    maxRetries = 3,
  ): Promise<InventoryResponse> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    const available = inventory.quantity - inventory.reserved;
    if (available < quantity) {
      throw new ConflictException('Insufficient stock');
    }

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const updated = await this.prisma.inventory.update({
          where: { variantId, version: inventory.version + attempt },
          data: {
            reserved: inventory.reserved + quantity,
            version: { increment: 1 }, // Optimistic locking
          },
        });
        return updated as unknown as InventoryResponse;
      } catch {
        attempt++;
      }
    }
    throw new ConflictException('Failed to reserve stock after max retries');
  }

  async release(
    variantId: string,
    quantity: number,
  ): Promise<InventoryResponse> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    const newReserved = Math.max(0, inventory.reserved - quantity);
    const updated = await this.prisma.inventory.update({
      where: { variantId },
      data: {
        reserved: newReserved,
        version: { increment: 1 }, // Optimistic locking
      },
    });

    return updated as unknown as InventoryResponse;
  }

  async deduct(
    variantId: string,
    quantity: number,
    reservedToRelease: number,
  ): Promise<InventoryResponse> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    const updated = await this.prisma.inventory.update({
      where: { variantId },
      data: {
        quantity: inventory.quantity - quantity,
        reserved: Math.max(0, inventory.reserved - reservedToRelease),
        version: { increment: 1 }, // Optimistic locking
      },
    });

    return updated as unknown as InventoryResponse;
  }

  async getAvailable(variantId: string): Promise<number> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }
    return inventory.quantity - inventory.reserved;
  }

  async checkLowStock(variantId: string): Promise<boolean> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }
    return (
      inventory.quantity - inventory.reserved <= inventory.lowStockThreshold
    );
  }

  async updateThreshold(
    variantId: string,
    threshold: number,
  ): Promise<InventoryResponse> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    const updated = await this.prisma.inventory.update({
      where: { variantId },
      data: {
        lowStockThreshold: threshold,
        version: { increment: 1 }, // Optimistic locking
      },
    });

    return updated as unknown as InventoryResponse;
  }
}
