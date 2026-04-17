import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { UserService } from './user.service';

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  fullName: 'Test User',
  addresses: [],
};

describe('UserService', () => {
  let service: UserService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new UserService(prisma);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should return user with addresses', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.getCurrentUser('user-uuid-1');

      expect(result.addresses).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ include: { addresses: expect.anything() } }),
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        fullName: 'Updated Name',
      });

      const result = await service.update('user-uuid-1', {
        fullName: 'Updated Name',
      });

      expect(result.fullName).toBe('Updated Name');
    });

    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { fullName: 'Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
