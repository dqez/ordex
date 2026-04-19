import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { generateSlug } from '@common/utils/slug.util';

export interface CreateCategoryRequest {
  name: string;
  parentId?: string;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  slug?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  parentId?: string | null;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  parent?: CategoryResponse | null;
  children?: CategoryResponse[];
  products?: unknown[];
}

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryRequest): Promise<CategoryResponse> {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const slug = dto.slug
      ? dto.slug
      : await generateSlug(dto.name, async (baseSlug) => {
          const existing = await this.prisma.category.findFirst({
            where: { slug: { startsWith: baseSlug } },
          });
          return !!existing;
        });

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return category as CategoryResponse;
  }

  async findAll(filter?: { isActive?: boolean }): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      where: filter ?? {},
    });
    return categories as CategoryResponse[];
  }

  async findOne(id: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category as CategoryResponse;
  }

  async update(
    id: string,
    dto: UpdateCategoryRequest,
  ): Promise<CategoryResponse> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = await generateSlug(dto.name, async (baseSlug) => {
        const found = await this.prisma.category.findFirst({
          where: { slug: { startsWith: baseSlug }, id: { not: id } },
        });
        return !!found;
      });
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    return updated as CategoryResponse;
  }

  async delete(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const productCount = await this.prisma.category.count({
      where: { id, products: { some: {} } },
    });

    if (productCount > 0) {
      throw new ConflictException(
        'Cannot delete category with associated products',
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }

  async getTree(): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      include: {
        children: {
          include: { children: true },
        },
      },
    });
    return categories as CategoryResponse[];
  }
}
