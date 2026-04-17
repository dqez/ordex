import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import * as net from 'net';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);

    const isReachable = await this.checkTcpConnection(host, port);

    const result = this.getStatus(key, isReachable);

    if (!isReachable) {
      throw new HealthCheckError('Redis ping check failed', result);
    }

    return result;
  }

  private checkTcpConnection(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 3000;

      socket.setTimeout(timeout);

      socket
        .once('connect', () => {
          socket.destroy();
          resolve(true);
        })
        .once('error', () => {
          socket.destroy();
          resolve(false);
        })
        .once('timeout', () => {
          socket.destroy();
          resolve(false);
        })
        .connect(port, host);
    });
  }
}
