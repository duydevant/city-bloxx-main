import { ForbiddenException, INestApplication, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { boundedJson } from './common/middleware/bounded-json.middleware';
import { getAppConfig } from './config/app.config';

export function configureApplication(app: INestApplication) {
  const { trustProxy } = getAppConfig();
  const express = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: unknown) => void;
  };
  express.set('trust proxy', trustProxy);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      /^\/api\/v1\/(?:city-bloxx\/(profile|save|runs|daily|leaderboards|analytics)|admin\/city-bloxx)(\/|\?|$)/.test(
        req.url,
      )
    )
      res.setHeader('Cache-Control', 'no-store');
    else if (/^\/api\/v1\/city-bloxx\/catalog(\/|\?|$)/.test(req.url))
      res.setHeader('Cache-Control', 'public, max-age=300');
    next();
  });
  app.use(boundedJson());
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const allowed = (process.env.AUTH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new ForbiddenException('Origin is not allowed'), false);
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
}
