import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientStockException extends HttpException {
  constructor(variantId: string, available: number) {
    super(
      {
        code: 'INSUFFICIENT_STOCK',
        message: `Variant ${variantId} has insufficient stock. Available: ${available}`,
        variantId,
        available,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
