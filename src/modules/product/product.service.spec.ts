import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { ProductService } from './product.service';
import { generateSlug } from '@common/utils/slug.util';
import { SkuService } from './sku.service';
import { uploadFile } from '@common/utils/r2.util';

jest.mock('@common/utils/slug.util', () => ({ generateSlug: jest.fn() }));
jest.mock('@common/utils/r2.util', () => ({ uploadFile: jest.fn() }));

const mockProduct = (overrides = {}) => ({
  id: 'prod-uuid-1',
  sellerId: 'seller-uuid-1',
  categoryId: 'cat-uuid-1',
  name: 'iPhone 15 Pro',
  slug: 'iphone-15-pro',
  description: 'Latest Apple flagship',
  basePrice: 29990000,
  currency: 'VND',
  status: 'ACTIVE',
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  variants: [],
  images: [],
  ...overrides,
});

const mockVariant = (overrides = {}) => ({
  id: 'var-uuid-1',
  productId: 'prod-uuid-1',
  sku: 'ORD-PROD-UUID-001',
  name: '256GB Space Gray',
  price: 29990000,
  attributes: { storage: '256GB', color: 'Space Gray' },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockImage = (overrides = {}) => ({
  id: 'img-uuid-1',
  productId: 'prod-uuid-1',
  url: 'https://example.com/iphone.jpg',
  altText: 'iPhone 15 Pro',
  sortOrder: 0,
  createdAt: new Date(),
  ...overrides,
});

const mockInventory = (overrides = {}) => ({
  variantId: 'var-uuid-1',
  quantity: 50,
  reserved: 5,
  lowStockThreshold: 5,
  version: 1,
  ...overrides,
});

describe('ProductService', () => {
  let service: ProductService;
  let prisma: jest.Mocked<PrismaService>;
  let skuService: jest.Mocked<SkuService>;

  beforeEach(() => {
    prisma = {
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      productVariant: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      productImage: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      inventory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    skuService = {
      generateForVariant: jest.fn(),
      generateRandom: jest.fn(),
    } as unknown as jest.Mocked<SkuService>;

    service = new ProductService(prisma, skuService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const sellerId = 'seller-uuid-1';
    const dto = {
      categoryId: 'cat-uuid-1',
      name: 'iPhone 15 Pro',
      description: 'Latest Apple flagship',
      basePrice: 29990000,
    };

    it('should create a product with auto-generated slug', async () => {
      const category = { id: 'cat-uuid-1', name: 'Electronics' };
      const created = mockProduct();

      (generateSlug as jest.Mock).mockResolvedValue('iphone-15-pro');
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(category);
      (prisma.product.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(sellerId, dto);

      expect(generateSlug).toHaveBeenCalledWith(
        'iPhone 15 Pro',
        expect.any(Function),
      );
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'iPhone 15 Pro',
          slug: 'iphone-15-pro',
        }),
      });
      expect(result.name).toBe('iPhone 15 Pro');
    });

    it('should throw NotFoundException when category does not exist', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(sellerId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use provided slug over auto-generated one', async () => {
      const dtoWithSlug = { ...dto, slug: 'custom-iphone-slug' };
      const created = mockProduct({ slug: 'custom-iphone-slug' });

      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 'cat-uuid-1',
      });
      (prisma.product.create as jest.Mock).mockResolvedValue(created);

      await service.create(sellerId, dtoWithSlug);

      expect(generateSlug).not.toHaveBeenCalled();
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'custom-iphone-slug' }),
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated products', async () => {
      const products = [mockProduct(), mockProduct({ id: 'prod-uuid-2' })];
      (prisma.product.findMany as jest.Mock).mockResolvedValue(products);
      (prisma.product.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('should filter by categoryId', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ categoryId: 'cat-uuid-1' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-uuid-1' }),
        }),
      );
    });

    it('should filter by price range', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ minPrice: 10000000, maxPrice: 50000000 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            basePrice: { gte: 10000000, lte: 50000000 },
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ status: 'ACTIVE' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should filter by sellerId', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ sellerId: 'seller-uuid-1' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellerId: 'seller-uuid-1' }),
        }),
      );
    });

    it('should sort by name ascending', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ sortBy: 'name', sortOrder: 'asc' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  describe('findOne', () => {
    it('should return product with variants and images', async () => {
      const product = mockProduct({
        variants: [mockVariant()],
        images: [mockImage()],
      });

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);

      const result = await service.findOne('prod-uuid-1');

      expect(result.id).toBe('prod-uuid-1');
      expect(result.variants).toHaveLength(1);
      expect(result.images).toHaveLength(1);
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('searchByName', () => {
    it('should search products by name case-insensitively', async () => {
      const products = [mockProduct({ name: 'iPhone 15 Pro' })];
      (prisma.product.findMany as jest.Mock).mockResolvedValue(products);

      const result = await service.searchByName('iphone');

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'iphone', mode: 'insensitive' },
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should handle special characters in search query', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.product.count as jest.Mock).mockResolvedValue(0);

      const result = await service.searchByName("iPhone's (Pro) [2024]");

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: "iPhone's (Pro) [2024]", mode: 'insensitive' },
          }),
        }),
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    const sellerId = 'seller-uuid-1';
    const dto = { name: 'iPhone 16 Pro' };

    it('should update product when seller owns it', async () => {
      const existing = mockProduct({ sellerId });
      const updated = {
        ...existing,
        name: 'iPhone 16 Pro',
        slug: 'iphone-16-pro',
      };

      (generateSlug as jest.Mock).mockResolvedValue('iphone-16-pro');
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.product.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('prod-uuid-1', sellerId, dto);

      expect(result.name).toBe('iPhone 16 Pro');
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const existing = mockProduct({ sellerId: 'other-seller' });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);

      await expect(
        service.update('prod-uuid-1', sellerId, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', sellerId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should regenerate slug when name changes', async () => {
      const existing = mockProduct({ sellerId, name: 'Old Name' });
      const updated = { ...existing, name: 'New Name', slug: 'new-name' };

      (generateSlug as jest.Mock).mockResolvedValue('new-name');
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.product.update as jest.Mock).mockResolvedValue(updated);

      await service.update('prod-uuid-1', sellerId, { name: 'New Name' });

      expect(generateSlug).toHaveBeenCalledWith(
        'New Name',
        expect.any(Function),
      );
    });

    it('should not regenerate slug when name does not change', async () => {
      const existing = mockProduct({ sellerId, name: 'iPhone 15 Pro' });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);

      await service.update('prod-uuid-1', sellerId, {
        description: 'New description',
      });

      expect(generateSlug).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should soft delete product when seller owns it', async () => {
      const existing = mockProduct({ sellerId: 'seller-uuid-1' });
      const deleted = { ...existing, isDeleted: true, deletedAt: new Date() };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.product.update as jest.Mock).mockResolvedValue(deleted);

      await service.softDelete('prod-uuid-1', 'seller-uuid-1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-uuid-1' },
        data: expect.objectContaining({ isDeleted: true }),
      });
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const existing = mockProduct({ sellerId: 'other-seller' });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(existing);

      await expect(
        service.softDelete('prod-uuid-1', 'seller-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addVariant', () => {
    it('should add variant with auto-generated SKU and create inventory', async () => {
      const product = mockProduct({ sellerId: 'seller-uuid-1' });
      const variant = mockVariant();
      const dto = {
        name: '256GB Space Gray',
        price: 29990000,
        attributes: { storage: '256GB', color: 'Space Gray' },
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (skuService.generateForVariant as jest.Mock).mockReturnValue(
        'ORD-PROD-UUID-001',
      );
      (prisma.productVariant.count as jest.Mock).mockResolvedValue(0);
      (prisma.productVariant.create as jest.Mock).mockResolvedValue(variant);
      (prisma.inventory.create as jest.Mock).mockResolvedValue(mockInventory());

      const result = await service.addVariant(
        'prod-uuid-1',
        'seller-uuid-1',
        dto,
      );

      expect(skuService.generateForVariant).toHaveBeenCalledWith(
        'prod-uuid-1',
        0,
      );
      expect(prisma.inventory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          variantId: 'var-uuid-1',
          quantity: 0,
          reserved: 0,
        }),
      });
      expect((result as { sku: string }).sku).toBe('ORD-PROD-UUID-001');
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const product = mockProduct({ sellerId: 'other-seller' });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);

      await expect(
        service.addVariant('prod-uuid-1', 'seller-uuid-1', {
          name: 'Test',
          price: 100,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateVariant', () => {
    it('should update variant when product is owned by seller', async () => {
      const product = mockProduct({
        sellerId: 'seller-uuid-1',
        id: 'prod-uuid-1',
      });
      const variant = mockVariant({ productId: 'prod-uuid-1' });
      const updated = { ...variant, name: 'Updated Variant' };

      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        variant,
      );
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (prisma.productVariant.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateVariant(
        'var-uuid-1',
        'seller-uuid-1',
        { name: 'Updated Variant' },
      );

      expect((result as { name: string }).name).toBe('Updated Variant');
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const variant = mockVariant({ productId: 'prod-uuid-1' });
      const product = mockProduct({ sellerId: 'other-seller' });

      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        variant,
      );
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);

      await expect(
        service.updateVariant('var-uuid-1', 'seller-uuid-1', {
          name: 'Hacked',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteVariant', () => {
    it('should delete variant when not linked to order items', async () => {
      const variant = mockVariant();
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        variant,
      );
      (prisma.productVariant.count as jest.Mock).mockResolvedValue(0);
      (prisma.productVariant.delete as jest.Mock).mockResolvedValue(variant);

      await service.deleteVariant('var-uuid-1');

      expect(prisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-uuid-1' },
      });
    });

    it('should throw ConflictException when variant has order items', async () => {
      const variant = mockVariant();
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        variant,
      );
      (prisma.productVariant.count as jest.Mock).mockResolvedValue(5);

      await expect(service.deleteVariant('var-uuid-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('uploadImages', () => {
    it('should upload images to R2 and save ProductImage records', async () => {
      const product = mockProduct({ sellerId: 'seller-uuid-1' });
      const mockFile = {
        buffer: Buffer.from('fake'),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
        size: 1024,
      } as Express.Multer.File;

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (uploadFile as jest.Mock).mockResolvedValue(
        'https://r2.example.com/uploads/iphone.jpg',
      );
      (prisma.productImage.create as jest.Mock).mockResolvedValue(mockImage());

      const result = await service.uploadImages(
        'prod-uuid-1',
        'seller-uuid-1',
        [mockFile],
      );

      expect(uploadFile).toHaveBeenCalledWith(mockFile);
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          url: 'https://r2.example.com/uploads/iphone.jpg',
        }),
      });
      expect(result).toHaveLength(1);
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const product = mockProduct({ sellerId: 'other-seller' });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);

      await expect(
        service.uploadImages(
          'prod-uuid-1',
          'seller-uuid-1',
          [] as Express.Multer.File[],
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteImage', () => {
    it('should delete image when product is owned by seller', async () => {
      const product = mockProduct({
        sellerId: 'seller-uuid-1',
        id: 'prod-uuid-1',
      });
      const image = mockImage({ productId: 'prod-uuid-1' });

      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue(image);
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (prisma.productImage.delete as jest.Mock).mockResolvedValue(image);

      await service.deleteImage('img-uuid-1', 'seller-uuid-1');

      expect(prisma.productImage.delete).toHaveBeenCalledWith({
        where: { id: 'img-uuid-1' },
      });
    });

    it('should throw ForbiddenException when seller does not own product', async () => {
      const image = mockImage({ productId: 'prod-uuid-1' });
      const product = mockProduct({ sellerId: 'other-seller' });

      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue(image);
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);

      await expect(
        service.deleteImage('img-uuid-1', 'seller-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
