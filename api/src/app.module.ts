import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ProductModule } from './modules/product/product.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as winston from 'winston';
import { PrismaModule } from './prisma/prisma.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
      }),
    }),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonModuleUtilities.format.nestLike('Ordex', {
              colors: true,
              prettyPrint: true,
            }),
          ),
        }),

        // new winston.transports.File({
        //   filename: 'logs/error.log',
        //   level: 'error',
        //   format: winston.format.combine(
        //     winston.format.timestamp(),
        //     winston.format.json()
        //   ),
        // }),
      ],
    }),
    ProductModule,
    AuthModule,
    UserModule,
    InventoryModule,
    OrderModule,
    PaymentModule,
    NotificationModule,
    AnalyticsModule,
    PrismaModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, //guard1: jwt auth - default for all route need auth
    { provide: APP_GUARD, useClass: RolesGuard }, //guard2: roles check, run after jwt guard
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
