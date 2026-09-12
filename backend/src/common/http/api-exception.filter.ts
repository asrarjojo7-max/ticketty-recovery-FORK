import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import {
  normalizeRequestId,
  RequestWithId,
} from './request-context.middleware';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_OPERATION'
  | 'RATE_LIMITED'
  | 'REQUEST_FAILED'
  | 'INTERNAL_ERROR';

export function errorCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    // 402 مخصصة حصراً لمنع حالة الاشتراك عمليةً (عقد الهندسة §2) —
    // المصادقة 401 والصلاحيات 403 تبقيان كما هما تماماً.
    case 402:
      return 'SUBSCRIPTION_REQUIRED';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}

function httpMessage(exception: HttpException): string | string[] {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    (typeof response.message === 'string' || Array.isArray(response.message))
  ) {
    return response.message as string | string[];
  }
  return exception.message;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const requestId =
      request.requestId ?? normalizeRequestId(request.headers['x-request-id']);

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL_ERROR';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = errorCodeForStatus(status);
      const exceptionResponse = exception.getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'errorCode' in exceptionResponse &&
        exceptionResponse.errorCode === 'PASSWORD_CHANGE_REQUIRED'
      ) {
        code = 'PASSWORD_CHANGE_REQUIRED';
      }
      message = httpMessage(exception);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_OPERATION';
        message = 'A record with the same unique value already exists';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        code = 'VALIDATION_ERROR';
        message = 'The referenced record is invalid';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'The requested record was not found';
      }
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.path,
          errorType:
            exception instanceof Error ? exception.name : 'UnknownException',
        }),
      );
    }

    response
      .status(status)
      .json({ statusCode: status, code, message, requestId });
  }
}
