import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { AddressService } from './address.service';

const mockAddress = {
  id: 'addr-uuid-1',
  userId: 'user-uuid-1',
  fullName: 'Test User',
  phone: '0900000000',
  addressLine: '123 Main St',
  district: 'District 1',
  city: 'Ho Chi Minh',
  isDefault: false,
  createdAt: new Date('2024-01-01'),
};

describe('AddressService', () => {
  let service: AddressService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      address: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new AddressService(prisma);
  });

  describe('getAddresses', () => {
    it('should return addresses ordered by isDefault then createdAt', async () => {
      (prisma.address.findMany as jest.Mock).mockResolvedValue([mockAddress]);

      const result = await service.getAddresses('user-uuid-1');

      expect(result).toEqual([mockAddress]);
      expect(prisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-uuid-1' } }),
      );
    });
  });

  describe('createAddress', () => {
    it('should create address without unset when not default', async () => {
      (prisma.address.create as jest.Mock).mockResolvedValue(mockAddress);

      const result = await service.createAddress('user-uuid-1', {
        fullName: 'Test User',
        phone: '0900000000',
        addressLine: '123 Main St',
        district: 'District 1',
        city: 'Ho Chi Minh',
        isDefault: false,
      });

      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(mockAddress);
    });

    it('should unset other default addresses when creating as default', async () => {
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.create as jest.Mock).mockResolvedValue({ ...mockAddress, isDefault: true });

      await service.createAddress('user-uuid-1', {
        fullName: 'Test User',
        phone: '0900000000',
        addressLine: '123 Main St',
        district: 'District 1',
        city: 'Ho Chi Minh',
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('updateAddress', () => {
    it('should update address when user owns it', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.update as jest.Mock).mockResolvedValue({ ...mockAddress, fullName: 'New Name' });

      const result = await service.updateAddress('user-uuid-1', 'addr-uuid-1', { fullName: 'New Name' });

      expect(result.fullName).toBe('New Name');
    });

    it('should throw NotFoundException when address not owned by user', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAddress('user-uuid-1', 'addr-uuid-1', { fullName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should unset other defaults when updating to default', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.update as jest.Mock).mockResolvedValue({ ...mockAddress, isDefault: true });

      await service.updateAddress('user-uuid-1', 'addr-uuid-1', { isDefault: true });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('deleteAddress', () => {
    it('should delete address when user owns it', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.delete as jest.Mock).mockResolvedValue(mockAddress);

      await service.deleteAddress('user-uuid-1', 'addr-uuid-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-uuid-1' } });
    });

    it('should throw NotFoundException when address not owned by user', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteAddress('user-uuid-1', 'addr-uuid-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setDefaultAddress', () => {
    it('should set address as default and unset others', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.address.updateMany as jest.Mock).mockResolvedValue({});
      (prisma.address.update as jest.Mock).mockResolvedValue({ ...mockAddress, isDefault: true });

      const result = await service.setDefaultAddress('user-uuid-1', 'addr-uuid-1');

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-uuid-1' },
        data: { isDefault: true },
      });
      expect(result.isDefault).toBe(true);
    });

    it('should throw NotFoundException when address not owned by user', async () => {
      (prisma.address.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.setDefaultAddress('user-uuid-1', 'addr-uuid-1')).rejects.toThrow(NotFoundException);
    });
  });
});
