import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { PrismaService } from '../../prisma/prisma.service';
import slugify from 'slugify';
import { UpdateProductDto } from './dto/update-product.dto';
import { generateSku } from '../../common/utils/sku-generation.util';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sellerId: string, dto: CreateProductDto) {
    const slug = slugify(dto.name, { lower: true, strict: true });

    const existing = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(`Product with slug "${slug}" already exists`);
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          seller_id: sellerId,
          category_id: dto.categoryId,
          name: dto.name,
          slug,
          description: dto.description,
          base_price: dto.basePrice,
          currency: dto.currency ?? 'VND',
          status: 'draft',
          productVariants: {
            create: dto.variants.map((v) => ({
              name: v.name,
              sku: v.sku || generateSku(dto.name, v.attributes),
              price: v.price,
              attributes: v.attributes ?? {},
              inventory: {
                create: {
                  quantity: v.initialStock,
                },
              },
            })),
          },
        },
        include: {
          productVariants: {
            include: {
              inventory: true,
            },
          },
        },
      });

      return product;
    });
  }

  async findAll() {
    return this.prisma.product.findMany({
      where: { is_deleted: false, status: 'active' },
      include: {
        category: { select: { id: true, name: true } },
        seller: { select: { id: true, full_name: true } },
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, is_deleted: false },
      include: {
        category: { select: { id: true, name: true } },
        seller: { select: { id: true, full_name: true } },
        productVariants: {
          include: { inventory: true },
        },
        productImages: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findMyProducts(sellerId: string) {
    return this.prisma.product.findMany({
      where: { seller_id: sellerId, is_deleted: false },
      orderBy: { created_at: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, is_deleted: false },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.seller_id !== sellerId) {
      throw new ForbiddenException('You can only update your own products');
    }

    const data: Record<string, unknown> = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = slugify(dto.name, { lower: true, strict: true });
      const existing = await this.prisma.product.findUnique({
        where: { slug: data.slug as string },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Slug "${data.slug as string}" already exists`,
        );
      }
    }

    if (dto.categoryId) data.category_id = dto.categoryId;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.basePrice !== undefined) data.base_price = dto.basePrice;
    if (dto.currency) data.currency = dto.currency;
    if (dto.status) data.status = dto.status;

    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, sellerId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, is_deleted: false },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.seller_id !== sellerId) {
      throw new ForbiddenException('You can only delete your own products');
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return { message: 'Product soft deleted successfully' };
  }

  //Variant management

  async getVariants(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, is_deleted: false },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.productVariant.findMany({
      where: { product_id: productId, is_active: true },
      include: { inventory: true },
    });
  }

  async addVariant(productId: string, sellerId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, is_deleted: false },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.seller_id !== sellerId) {
      throw new ForbiddenException(
        'You can only add variants to your own product',
      );
    }

    const sku = dto.sku || generateSku(product.name, dto.attributes);

    const existingSku = await this.prisma.productVariant.findUnique({
      where: { sku },
    });
    if (existingSku) throw new ConflictException(`SKU ${sku} already exists`);

    return this.prisma.$transaction(async (tx) => {
      return tx.productVariant.create({
        data: {
          product_id: productId,
          name: dto.name,
          sku,
          price: dto.price,
          attributes: dto.attributes ?? {},
          inventory: {
            create: { quantity: dto.initialStock },
          },
        },
        include: { inventory: true },
      });
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    sellerId: string,
    dto: UpdateVariantDto,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, is_deleted: false },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.seller_id !== sellerId) {
      throw new ForbiddenException('Not your product');
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product_id: productId },
    });

    if (!variant) throw new NotFoundException('Variant not found');

    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.attributes) data.attributes = dto.attributes;
    if (dto.isActive !== undefined) data.is_active = dto.isActive;

    if (dto.sku && dto.sku !== variant.sku) {
      const existingSku = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku)
        throw new ConflictException(`SKU ${dto.sku} already exists`);
      data.sku = dto.sku;
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data,
    });
  }

  async removeVariant(productId: string, variantId: string, sellerId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, is_deleted: false },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.seller_id !== sellerId)
      throw new ForbiddenException('Not your product');

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product_id: productId },
    });

    if (!variant) throw new NotFoundException('Variant not found');

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { is_active: false },
    });

    return { message: 'Variant disabled successfully' };
  }
}
