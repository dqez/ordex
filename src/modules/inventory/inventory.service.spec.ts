import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { InventoryService } from './inventory.service';

const mockInventory = (overrides = {}) => ({
  variantId: 'var-uuid-1',
  quantity: 50,
  reserved: 5,
  lowStockThreshold: 5,
  version: 1,
  updatedAt: new Date(),
  ...overrides,
});

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      inventory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new InventoryService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reserve', () => {
    it('should reserve stock when sufficient quantity available', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 5 });
      const updated = mockInventory({ quantity: 50, reserved: 10, version: 2 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.reserve('var-uuid-1', 5);

      expect(result.reserved).toBe(10);
      expect(prisma.inventory.update).toHaveBeenCalledWith({
        where: { variantId: 'var-uuid-1', version: 1 },
        data: { reserved: 10, version: { increment: 1 } },
      });
    });

    it('should throw ConflictException when insufficient stock', async () => {
      const inventory = mockInventory({ quantity: 10, reserved: 8 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);

      await expect(service.reserve('var-uuid-1', 5)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when max retries exceeded', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 5 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockRejectedValue(
        new Error('Optimistic lock'),
      );

      await expect(service.reserve('var-uuid-1', 5, 2)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when variant not found', async () => {
      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.reserve('nonexistent', 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('release', () => {
    it('should release reserved stock', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 10 });
      const updated = mockInventory({ quantity: 50, reserved: 5, version: 2 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.release('var-uuid-1', 5);

      expect(result.reserved).toBe(5);
    });

    it('should never release below zero', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 3 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockResolvedValue(
        mockInventory({ quantity: 50, reserved: 0, version: 2 }),
      );

      const result = await service.release('var-uuid-1', 10);

      expect(result.reserved).toBe(0);
      expect(prisma.inventory.update).toHaveBeenCalledWith({
        where: { variantId: 'var-uuid-1' },
        data: { reserved: 0, version: { increment: 1 } },
      });
    });
  });

  describe('deduct', () => {
    it('should deduct quantity and reserved on payment success', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 10 });
      const updated = mockInventory({ quantity: 40, reserved: 5, version: 2 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.deduct('var-uuid-1', 5, 5);

      expect(result.quantity).toBe(40);
      expect(result.reserved).toBe(5);
    });
  });

  describe('getAvailable', () => {
    it('should return quantity minus reserved', async () => {
      const inventory = mockInventory({ quantity: 50, reserved: 5 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);

      const result = await service.getAvailable('var-uuid-1');

      expect(result).toBe(45);
    });

    it('should throw NotFoundException when inventory not found', async () => {
      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getAvailable('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkLowStock', () => {
    it('should return true when available stock is at or below threshold', async () => {
      const inventory = mockInventory({
        quantity: 5,
        reserved: 3,
        lowStockThreshold: 5,
      });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);

      const result = await service.checkLowStock('var-uuid-1');

      expect(result).toBe(true);
    });

    it('should return false when sufficient stock', async () => {
      const inventory = mockInventory({
        quantity: 50,
        reserved: 5,
        lowStockThreshold: 5,
      });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);

      const result = await service.checkLowStock('var-uuid-1');

      expect(result).toBe(false);
    });
  });

  describe('updateThreshold', () => {
    it('should update lowStockThreshold', async () => {
      const inventory = mockInventory({ lowStockThreshold: 5 });
      const updated = mockInventory({ lowStockThreshold: 10, version: 2 });

      (prisma.inventory.findUnique as jest.Mock).mockResolvedValue(inventory);
      (prisma.inventory.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateThreshold('var-uuid-1', 10);

      expect((result as { lowStockThreshold: number }).lowStockThreshold).toBe(
        10,
      );
    });
  });
});
