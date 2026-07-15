import { HttpException, HttpStatus } from '@nestjs/common';

export class StockReservationConflictException extends HttpException {
  constructor(variantId: string) {
    super(
      {
        code: 'STOCK_CONFLICT',
        message: `Stock reservation conflict for variant ${variantId}. Please retry your request.`,
        variantId,
      },
      HttpStatus.CONFLICT,
    );
  }
}
