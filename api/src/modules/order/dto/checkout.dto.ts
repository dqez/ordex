import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  @IsNotEmpty()
  shippingAddressId!: string;

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsUUID()
  @IsNotEmpty()
  idempotencyKey!: string;
}
