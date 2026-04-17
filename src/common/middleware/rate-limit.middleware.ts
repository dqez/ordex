import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@common/redis/redis.provider';

const LIMITS: Record<string, number> = {
  '/api/v1/auth/login': 5,
  '/api/v1/auth/register': 3,
  '/api/v1/auth/refresh': 10,
};

const WINDOW_SECONDS = 60;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const limit = LIMITS[req.path];
    if (!limit) return next();

    const ip = req.ip ?? 'unknown';
    const key = `rl:${ip}:${req.path}`;

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }

    if (current > limit) {
      throw new HttpException(
        'Too many requests, please try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
