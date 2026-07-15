/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse: any =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const errorCode =
      typeof exceptionResponse === 'object' && exceptionResponse.code
        ? exceptionResponse.code
        : status === 500
          ? 'INTERNAL_SERVER_ERROR'
          : 'HTTP_ERROR';

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message: exceptionResponse.message || exceptionResponse,
        details: exceptionResponse,
      },
      correlationId: request['correlationId'],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
