import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { JsonObject } from '../../../common/types/json.type';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sku?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsObject()
  @IsOptional()
  attributes?: JsonObject;

  @IsInt()
  @Min(0)
  initialStock!: number;
}
