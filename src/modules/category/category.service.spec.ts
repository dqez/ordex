import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CategoryService } from './category.service';
import { generateSlug } from '@common/utils/slug.util';

jest.mock('@common/utils/slug.util', () => ({
  generateSlug: jest.fn(),
}));

const mockCategory = (overrides = {}) => ({
  id: 'cat-uuid-1',
  name: 'Electronics',
  slug: 'electronics',
  parentId: null,
  description: 'Electronic devices',
  imageUrl: 'https://example.com/cat.jpg',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  parent: null,
  children: [],
  products: [],
  ...overrides,
});

describe('CategoryService', () => {
  let service: CategoryService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      category: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      product: {
        count: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new CategoryService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a category with auto-generated slug', async () => {
      const dto = { name: 'Electronics', description: 'Electronic devices' };
      const created = mockCategory();

      (generateSlug as jest.Mock).mockResolvedValue('electronics');
      (prisma.category.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(dto);

      expect(generateSlug).toHaveBeenCalledWith(
        'Electronics',
        expect.any(Function),
      );
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Electronics',
          slug: 'electronics',
        }),
      });
      expect(result.name).toBe('Electronics');
    });

    it('should create a subcategory when parentId is provided', async () => {
      const parentCategory = mockCategory({
        id: 'parent-uuid',
        name: 'Electronics',
        slug: 'electronics',
      });
      const dto = {
        name: 'Smartphones',
        parentId: 'parent-uuid',
        description: 'Mobile phones',
      };
      const created = mockCategory({
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: 'parent-uuid',
      });

      (generateSlug as jest.Mock).mockResolvedValue('smartphones');
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(
        parentCategory,
      );
      (prisma.category.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(dto);

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-uuid' },
      });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Smartphones',
          parentId: 'parent-uuid',
        }),
      });
      expect(result.parentId).toBe('parent-uuid');
    });

    it('should throw NotFoundException when parentId does not exist', async () => {
      const dto = { name: 'Smartphones', parentId: 'nonexistent-uuid' };

      (generateSlug as jest.Mock).mockResolvedValue('smartphones');
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should use provided slug over auto-generated one', async () => {
      const dto = { name: 'Electronics', slug: 'custom-slug' };
      const created = mockCategory({ slug: 'custom-slug' });

      (generateSlug as jest.Mock).mockResolvedValue('electronics');
      (prisma.category.create as jest.Mock).mockResolvedValue(created);

      await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'custom-slug' }),
      });
    });
  });

  describe('findAll', () => {
    it('should return all categories (flat list)', async () => {
      const categories = [
        mockCategory({ id: 'cat-1', name: 'Electronics', slug: 'electronics' }),
        mockCategory({ id: 'cat-2', name: 'Fashion', slug: 'fashion' }),
      ];

      (prisma.category.findMany as jest.Mock).mockResolvedValue(categories);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(prisma.category.findMany).toHaveBeenCalledWith({ where: {} });
    });

    it('should filter by isActive status', async () => {
      const activeCategories = [
        mockCategory({ id: 'cat-1', name: 'Electronics', isActive: true }),
      ];

      (prisma.category.findMany as jest.Mock).mockResolvedValue(
        activeCategories,
      );

      await service.findAll({ isActive: true });

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });
  });

  describe('findOne', () => {
    it('should return a single category with children', async () => {
      const child = mockCategory({
        id: 'child',
        name: 'Smartphones',
        parentId: 'parent',
      });
      const category = mockCategory({
        id: 'parent',
        name: 'Electronics',
        children: [child],
      });

      (prisma.category.findUnique as jest.Mock).mockResolvedValue(category);

      const result = await service.findOne('parent');

      expect(result.id).toBe('parent');
      expect(result.children).toHaveLength(1);
    });

    it('should throw NotFoundException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update category name and regenerate slug', async () => {
      const existing = mockCategory({ id: 'cat-1', name: 'Electronics' });
      const updated = {
        ...existing,
        name: 'Consumer Electronics',
        slug: 'consumer-electronics',
      };

      (generateSlug as jest.Mock).mockResolvedValue('consumer-electronics');
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.category.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('cat-1', {
        name: 'Consumer Electronics',
      });

      expect(generateSlug).toHaveBeenCalledWith(
        'Consumer Electronics',
        expect.any(Function),
      );
      expect(prisma.category.update).toHaveBeenCalled();
      expect(result.name).toBe('Consumer Electronics');
    });

    it('should throw NotFoundException when updating non-existent category', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not regenerate slug when name does not change', async () => {
      const existing = mockCategory({ id: 'cat-1', name: 'Electronics' });

      (prisma.category.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.category.update as jest.Mock).mockResolvedValue(existing);

      await service.update('cat-1', { description: 'Updated description' });

      expect(generateSlug).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a category with no products', async () => {
      const category = mockCategory({ id: 'cat-1' });

      (prisma.category.findUnique as jest.Mock).mockResolvedValue(category);
      (prisma.category.count as jest.Mock).mockResolvedValue(0);
      (prisma.category.delete as jest.Mock).mockResolvedValue(category);

      await service.delete('cat-1');

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });

    it('should throw ConflictException when category has products', async () => {
      const category = mockCategory({ id: 'cat-1' });

      (prisma.category.findUnique as jest.Mock).mockResolvedValue(category);
      (prisma.category.count as jest.Mock).mockResolvedValue(5);

      await expect(service.delete('cat-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.delete('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTree', () => {
    it('should return nested tree structure', async () => {
      const child = mockCategory({
        id: 'child-1',
        name: 'Smartphones',
        parentId: 'root-1',
      });
      const root = mockCategory({
        id: 'root-1',
        name: 'Electronics',
        children: [child],
      });

      (prisma.category.findMany as jest.Mock).mockResolvedValue([root, child]);

      const result = await service.getTree();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
