import { HttpException, HttpStatus } from '@nestjs/common';

export interface BusinessExceptionOptions {
  errorCode: string;
  message: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

export class BusinessException extends HttpException {
  public readonly errorCode: string;
  public readonly metadata?: Record<string, unknown>;

  constructor(options: BusinessExceptionOptions) {
    const statusCode = options.statusCode ?? HttpStatus.BAD_REQUEST;
    super(
      {
        statusCode,
        error: options.errorCode,
        message: options.message,
        ...(options.metadata ? { metadata: options.metadata } : {}),
      },
      statusCode,
    );
    this.errorCode = options.errorCode;
    this.metadata = options.metadata;
  }
}
