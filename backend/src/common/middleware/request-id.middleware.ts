import { randomBytes } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const INBOUND_HEADER = 'x-request-id';
/** Bounded and character-restricted so a hostile header cannot poison logs. */
const SAFE_INBOUND = /^[A-Za-z0-9_-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(INBOUND_HEADER);
    req.requestId =
      inbound !== undefined && SAFE_INBOUND.test(inbound)
        ? inbound
        : `req_${randomBytes(12).toString('hex')}`;
    res.setHeader(INBOUND_HEADER, req.requestId);
    next();
  }
}
