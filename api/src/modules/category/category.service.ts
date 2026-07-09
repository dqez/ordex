import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../../prisma/prisma.service';
import slugify from 'slugify';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name, { lower: true, strict: true });

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException(
        `Category with slug "${slug}" already exists`,
      );
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parent_id: dto.parentId,
        description: dto.description,
        image_url: dto.imageUrl,
        sort_order: dto.sortOrder ?? 0,
        is_active: dto.isActive ?? true,
      },
    });
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    });

    return this.buildTree(categories);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, is_active: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const data: Record<string, unknown> = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = slugify(dto.name, { lower: true, strict: true });

      const existing = await this.prisma.category.findUnique({
        where: { slug: data.slug as string },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Category with slug "${data.slug as string}" already exists`,
        );
      }
    }

    if (dto.parentId !== undefined) data.parent_id = dto.parentId;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.image_url = dto.imageUrl;
    if (dto.sortOrder !== undefined) data.sort_order = dto.sortOrder;
    if (dto.isActive !== undefined) data.is_active = dto.isActive;

    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const children = await this.prisma.category.findFirst({
      where: { parent_id: id },
    });

    if (children) {
      throw new ConflictException(
        'Cannot delete category with children. Remove children first.',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category delete successfully' };
  }

  private buildTree(
    categories: {
      id: string;
      parent_id: string | null;
      [key: string]: unknown;
    }[],
  ) {
    const map = new Map<
      string,
      (typeof categories)[0] & { children: typeof categories }
    >();
    const roots: ((typeof categories)[0] & { children: typeof categories })[] =
      [];

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
