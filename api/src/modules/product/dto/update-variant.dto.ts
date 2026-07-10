import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateVariantDto } from './create-variant.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateVariantDto extends PartialType(
  OmitType(CreateVariantDto, ['initialStock'] as const),
) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
