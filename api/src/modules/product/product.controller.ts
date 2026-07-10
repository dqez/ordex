import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Roles('seller')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(user.id, dto);
  }

  @Public()
  @Get()
  findAll() {
    return this.productService.findAll();
  }

  @Roles('seller')
  @Get('me')
  findMyProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.productService.findMyProducts(user.id);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findOne(id);
  }

  @Roles('seller')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, user.id, dto);
  }

  @Roles('seller')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productService.remove(id, user.id);
  }

  //Variant endpoints

  @Public()
  @Get(':id/variants')
  getVariants(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.getVariants(id);
  }

  @Roles('seller')
  @Post(':id/variants')
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productService.addVariant(id, user.id, dto);
  }

  @Roles('seller')
  @Patch(':id/variants/:variantId')
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productService.updateVariant(id, variantId, user.id, dto);
  }

  @Roles('seller')
  @Delete(':id/variants/:variantId')
  removeVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.productService.removeVariant(id, variantId, user.id);
  }
}
