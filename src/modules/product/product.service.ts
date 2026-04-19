import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { generateSlug } from '@common/utils/slug.util';
import { SkuService } from './sku.service';
import { uploadFile } from '@common/utils/r2.util';

export interface CreateProductRequest {
  categoryId: string;
  name: string;
  description?: string;
  basePrice: number;
  currency?: string;
  status?: 'DRAFT' | 'ACTIVE';
  slug?: string;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  basePrice?: number;
  currency?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  categoryId?: string;
  slug?: string;
}

export interface CreateVariantRequest {
  name: string;
  price: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
}

export interface UpdateVariantRequest {
  name?: string;
  price?: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
}

export interface ProductResponse {
  id: string;
  sellerId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  currency: string;
  status: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category?: unknown;
  variants?: unknown[];
  images?: unknown[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skuService: SkuService,
  ) {}

  async create(
    sellerId: string,
    dto: CreateProductRequest,
  ): Promise<ProductResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const slug = dto.slug
      ? dto.slug
      : await generateSlug(dto.name, async (baseSlug) => {
          const existing = await this.prisma.product.findFirst({
            where: { slug: { startsWith: baseSlug } },
          });
          return !!existing;
        });

    const product = await this.prisma.product.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        name: dto.name,
        slug,
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency ?? 'VND',
        status: dto.status ?? 'DRAFT',
      },
    });

    return product as unknown as ProductResponse;
  }

  async findAll(
    filters: {
      page?: number;
      limit?: number;
      categoryId?: string;
      minPrice?: number;
      maxPrice?: number;
      status?: string;
      sellerId?: string;
      sortBy?: 'createdAt' | 'basePrice' | 'name';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<PaginatedResult<ProductResponse>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isDeleted: false };
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.basePrice = {};
      if (filters.minPrice !== undefined)
        (where.basePrice as Record<string, number>).gte = filters.minPrice;
      if (filters.maxPrice !== undefined)
        (where.basePrice as Record<string, number>).lte = filters.maxPrice;
    }

    const orderBy: Record<string, string> = {};
    if (filters.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder ?? 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, variants: true, images: true },
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: data as unknown as ProductResponse[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true, images: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product as unknown as ProductResponse;
  }

  async searchByName(query: string): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        name: { contains: query, mode: 'insensitive' },
      },
      include: { category: true, variants: true, images: true },
    });
    return products as unknown as ProductResponse[];
  }

  async update(
    id: string,
    sellerId: string,
    dto: UpdateProductRequest,
  ): Promise<ProductResponse> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = await generateSlug(dto.name, async (baseSlug) => {
        const found = await this.prisma.product.findFirst({
          where: { slug: { startsWith: baseSlug }, id: { not: id } },
        });
        return !!found;
      });
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        basePrice: dto.basePrice,
        currency: dto.currency,
        status: dto.status,
        categoryId: dto.categoryId,
      },
    });

    return updated as unknown as ProductResponse;
  }

  async softDelete(id: string, sellerId: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    await this.prisma.product.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async addVariant(
    productId: string,
    sellerId: string,
    dto: CreateVariantRequest,
  ): Promise<unknown> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    const variantCount = await this.prisma.productVariant.count({
      where: { productId },
    });
    const sku = this.skuService.generateForVariant(productId, variantCount);

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        sku,
        name: dto.name,
        price: dto.price,
        attributes: dto.attributes ?? {},
        isActive: dto.isActive ?? true,
      },
    });

    await this.prisma.inventory.create({
      data: {
        variantId: variant.id,
        quantity: 0,
        reserved: 0,
        lowStockThreshold: 5,
        version: 1,
      },
    });

    return variant;
  }

  async updateVariant(
    variantId: string,
    sellerId: string,
    dto: UpdateVariantRequest,
  ): Promise<unknown> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: variant.productId },
    });
    if (!product || product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name,
        price: dto.price,
        attributes: dto.attributes,
        isActive: dto.isActive,
      },
    });

    return updated;
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const orderItemCount = await this.prisma.productVariant.count({
      where: { id: variantId, orderItems: { some: {} } },
    });
    if (orderItemCount > 0) {
      throw new ConflictException(
        'Cannot delete variant with associated order items',
      );
    }

    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  async uploadImages(
    productId: string,
    sellerId: string,
    files: Express.Multer.File[],
  ): Promise<unknown[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    const images = [];
    for (const file of files) {
      const url = await uploadFile(file);
      const image = await this.prisma.productImage.create({
        data: {
          productId,
          url,
          altText: file.originalname,
          sortOrder: 0,
        },
      });
      images.push(image);
    }
    return images;
  }

  async deleteImage(imageId: string, sellerId: string): Promise<void> {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: image.productId },
    });
    if (!product || product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });
  }
}
