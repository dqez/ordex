import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { SkuService } from './sku.service';
import { ProductController } from './product.controller';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ProductService, SkuService],
  controllers: [ProductController],
  exports: [ProductService],
})
export class ProductModule {}
