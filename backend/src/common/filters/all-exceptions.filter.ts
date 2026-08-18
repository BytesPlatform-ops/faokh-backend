import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppException } from '../errors/app.exception';
import { ErrorCode, type ErrorCodeValue } from '../errors/error-codes';

export interface ErrorEnvelope {
  error: {
    code: ErrorCodeValue;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

interface Normalized {
  status: HttpStatus;
  code: ErrorCodeValue;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Turns everything thrown anywhere in the application into the one documented
 * error envelope. Two rules matter most:
 *
 *  1. Unrecognised failures return a fixed generic message. Stack traces and
 *     driver text are logged, never serialised — an error body is an untrusted
 *     surface an attacker can read.
 *  2. The `requestId` in the body matches the `x-request-id` response header
 *     and the server log line, so a user-reported failure is one grep away.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    const normalized = this.normalize(exception);

    const envelope: ErrorEnvelope = {
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    };

    this.log(exception, normalized, request, requestId);
    response.status(normalized.status).json(envelope);
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Please wait a moment and try again.',
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // A query the driver rejected is a bug in our code, not the caller's.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Something went wrong. Please try again.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong. Please try again.',
    };
  }

  private fromHttpException(exception: HttpException): Normalized {
    // `getStatus()` is typed as `number`; these are HttpStatus values in fact,
    // and naming that lets the comparisons below stay type-safe.
    const status: HttpStatus = exception.getStatus();
    const body = exception.getResponse();

    // ValidationPipe throws a BadRequestException whose body carries the
    // per-field messages; surface them as structured details rather than a
    // single flattened string the frontend has to parse.
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;

      if (typeof record.code === 'string') {
        return {
          status,
          code: record.code as ErrorCodeValue,
          message: typeof record.message === 'string' ? record.message : exception.message,
        };
      }

      if (status === HttpStatus.BAD_REQUEST && Array.isArray(record.message)) {
        return {
          status,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Some of the submitted values are not valid.',
          details: { issues: record.message as string[] },
        };
      }
    }

    return {
      status,
      code: this.codeForStatus(status),
      message:
        status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Something went wrong. Please try again.'
          : exception.message,
    };
  }

  private fromPrisma(exception: Prisma.PrismaClientKnownRequestError): Normalized {
    switch (exception.code) {
      case 'P2002': {
        // Unique violation. The field list is schema metadata, not user data,
        // so it is safe to return and genuinely useful to the caller.
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? (target as string[]) : undefined;
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.DUPLICATE_RESOURCE,
          message: 'A record with these details already exists.',
          ...(fields ? { details: { fields } } : {}),
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'The requested record could not be found.',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'A referenced record does not exist.',
        };
      case 'P2034':
      case 'P2028':
        // A write conflict, deadlock, or a transaction that could not complete
        // under contention. Two brokers reached for the same unit at the same
        // instant: the loser is a conflict, not a server fault, and telling it
        // so is what lets the UI say "someone just took this unit" instead of
        // "something went wrong".
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.UNIT_NOT_AVAILABLE,
          message:
            'That unit was taken by another booking a moment ago. Please refresh and choose again.',
        };
      case 'P2024':
        // The connection pool was exhausted. Genuinely a capacity problem, and
        // a 503 tells a load balancer to retry where a 500 tells it not to.
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'The service is busy. Please try again in a moment.',
        };
      case 'P2023':
        // Malformed value for a typed column — in practice, something that is
        // not a UUID arriving in an `/:id` path segment. That is a caller
        // asking for a resource that cannot exist, not a server fault, and
        // reporting it as a 500 sends people hunting for a bug that isn't one.
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'The requested record could not be found.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Something went wrong. Please try again.',
        };
    }
  }

  private codeForStatus(status: HttpStatus): ErrorCodeValue {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.DUPLICATE_RESOURCE;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private log(
    exception: unknown,
    normalized: Normalized,
    request: Request,
    requestId: string,
  ): void {
    // Only the route pattern and method are logged — never the query string or
    // body, which routinely carry names, emails and phone numbers.
    const context = {
      requestId,
      method: request.method,
      route: (request.route as { path?: string } | undefined)?.path ?? request.path,
      status: normalized.status,
      code: normalized.code,
    };

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(context, exception instanceof Error ? exception.stack : String(exception));
      return;
    }

    // 4xx is the API working as designed; keep it at debug so real problems
    // stay visible in production logs.
    this.logger.debug(context);
  }
}
