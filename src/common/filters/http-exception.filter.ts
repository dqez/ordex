import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.correlationId;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        errorCode = (res['error'] as string) ?? 'HTTP_EXCEPTION';
        message = Array.isArray(res['message'])
          ? (res['message'] as string[]).join(', ')
          : ((res['message'] as string) ?? message);
      } else {
        message = exceptionResponse as string;
      }
    }

    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    this.logger.log(logLevel, `Exception: ${errorCode} - ${message}`, {
      correlationId,
      statusCode,
      path: request.url,
      method: request.method,
      ...(statusCode >= 500 && { stack: (exception as Error)?.stack }),
    });

    response.status(statusCode).json({
      statusCode,
      error: errorCode,
      message,
      correlationId: correlationId ?? null,
      timestamp: new Date().toISOString(),
    });
