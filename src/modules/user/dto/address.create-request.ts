import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddressCreateRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsString()
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MaxLength(255)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsString()
  @MaxLength(100)
  district!: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}
