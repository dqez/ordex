import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class PageOptionsDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  sortBy?: string;

  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder = SortOrder.DESC;

  get skip(): number {
    return (this.page! - 1) * this.limit!;
  }
}

export class PageMetaDto {
  total: number;
  page: number;
  limit: number;
  totalPages: number;

  constructor({
    pageOptionsDto,
    total,
  }: {
    pageOptionsDto: PageOptionsDto;
    total: number;
  }) {
    this.page = pageOptionsDto.page!;
    this.limit = pageOptionsDto.limit!;
    this.total = total;
    this.totalPages = Math.ceil(this.total / this.limit);
  }
}

export class PaginatedResponseDto<T> {
  success: boolean;
  data: T[];
  meta: PageMetaDto;

  constructor(data: T[], meta: PageMetaDto) {
    this.success = true;
    this.data = data;
    this.meta = meta;
  }
}
