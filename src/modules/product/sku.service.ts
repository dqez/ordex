import { Injectable } from '@nestjs/common';
import { generateSku, generateSkuForVariant } from '@common/utils/sku.util';

@Injectable()
export class SkuService {
  generateForVariant(productId: string, variantIndex: number): string {
    return generateSkuForVariant(productId, variantIndex);
  }

  generateRandom(): string {
    return generateSku();
  }
}
