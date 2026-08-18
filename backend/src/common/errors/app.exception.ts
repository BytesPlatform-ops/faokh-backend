import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, type ErrorCodeValue } from './error-codes';

export interface AppExceptionOptions {
  /** Machine-readable, non-PII context the frontend may render or log. */
  details?: Record<string, unknown>;
  /** Original error, logged server-side only — never serialised to a client. */
  cause?: unknown;
}

/**
 * The single exception type domain code throws. The global filter turns it
 * into the documented error envelope; nothing else needs to know the shape.
 */
export class AppException extends HttpException {
  readonly code: ErrorCodeValue;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    options: AppExceptionOptions = {},
  ) {
    super({ code, message }, status, { cause: options.cause });
    this.code = code;
    this.details = options.details;
  }

  // --- Named constructors -----------------------------------------------------
  // Preferred over `new AppException(...)` at call sites: they fix the status
  // for each code in one place, so a 404 can never be thrown as a 500 by
  // accident and the HTTP contract stays consistent across modules.

  static notFound(
    message: string,
    code: ErrorCodeValue = ErrorCode.NOT_FOUND,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND, options);
  }

  static badRequest(
    code: ErrorCodeValue,
    message: string,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, options);
  }

  static unauthorized(
    message: string,
    code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED, options);
  }

  static forbidden(
    message: string,
    code: ErrorCodeValue = ErrorCode.FORBIDDEN,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN, options);
  }

  /** State conflicts: a taken slot, a reused idempotency key, a duplicate. */
  static conflict(
    code: ErrorCodeValue,
    message: string,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, options);
  }

  static unprocessable(
    code: ErrorCodeValue,
    message: string,
    options?: AppExceptionOptions,
  ): AppException {
    return new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, options);
  }

  static internal(message: string, options?: AppExceptionOptions): AppException {
    return new AppException(
      ErrorCode.INTERNAL_ERROR,
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      options,
    );
  }

  static featureDisabled(feature: string): AppException {
    return new AppException(
      ErrorCode.FEATURE_DISABLED,
      'This capability is not enabled yet.',
      HttpStatus.NOT_IMPLEMENTED,
      { details: { feature } },
    );
  }
}
