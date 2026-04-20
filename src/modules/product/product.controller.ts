import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import {
  CreateProductRequest,
  UpdateProductRequest,
  CreateVariantRequest,
  UpdateVariantRequest,
} from './product.service';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthGuard } from '@modules/auth/guards/auth.guard';

@Controller('products')
@UseGuards(AuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  create(
    @CurrentUser('sellerId') sellerId: string,
    @Body() dto: CreateProductRequest,
  ) {
    return this.productService.create(sellerId, dto);
  }

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('categoryId') categoryId?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('status') status?: string,
    @Query('sellerId') sellerId?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'basePrice' | 'name',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.productService.findAll({
      page,
      limit,
      categoryId,
      minPrice,
      maxPrice,
      status,
      sellerId,
      sortBy,
      sortOrder,
    });
  }

  @Get('search')
  searchByName(@Query('q') query: string) {
    return this.productService.searchByName(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sellerId') sellerId: string,
    @Body() dto: UpdateProductRequest,
  ) {
    return this.productService.update(id, sellerId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sellerId') sellerId: string,
  ) {
    return this.productService.softDelete(id, sellerId);
  }

  @Post(':id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sellerId') sellerId: string,
    @Body() dto: CreateVariantRequest,
  ) {
    return this.productService.addVariant(id, sellerId, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser('sellerId') sellerId: string,
    @Body() dto: UpdateVariantRequest,
  ) {
    return this.productService.updateVariant(variantId, sellerId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVariant(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.productService.deleteVariant(variantId);
  }

  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files'))
  uploadImages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sellerId') sellerId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productService.uploadImages(id, sellerId, files);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser('sellerId') sellerId: string,
  ) {
    return this.productService.deleteImage(imageId, sellerId);
  }
}
