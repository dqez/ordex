import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { APP_FILTER } from '@nestjs/core';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { winstonConfig } from './common/logger/winston.config';
import {
  CorrelationIdMiddleware,
  RequestLoggingMiddleware,
} from './common/middleware/correlation-id.middleware';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { RedisProvider } from './common/redis/redis.provider';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      cache: true,
    }),
    WinstonModule.forRoot(winstonConfig),
    PrismaModule,
    HealthModule,
    AuthModule,
    UserModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    RedisProvider,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggingMiddleware)
      .forRoutes('*');
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes('auth/login', 'auth/register', 'auth/refresh');
  }
}
