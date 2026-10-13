import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerId = req.headers['x-request-id'];
    const id =
      typeof headerId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(headerId)
        ? headerId
        : uuidv4();
    (req as Request & { requestId: string }).requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
