import {
  IsEnum,
  IsNumber,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  API_PREFIX: string = 'api/v1';

  @IsString()
  DATABASE_URL: string = '';

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  REDIS_PORT: number = 6379;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string = '';

  @IsString()
  JWT_ACCESS_EXPIRY: string = '15m';

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string = '';

  @IsString()
  JWT_REFRESH_EXPIRY: string = '7d';

  @IsString()
  GOOGLE_CLIENT_ID: string = '';

  @IsString()
  GOOGLE_CLIENT_SECRET: string = '';

  @IsString()
  GOOGLE_CALLBACK_URL: string = '';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}
