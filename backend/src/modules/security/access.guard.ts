import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InfrastructureService } from './infrastructure.service';
import { SecurityService } from './security.service';
import { AuthRequest } from './types';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly security: SecurityService,
    private readonly infra: InfrastructureService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const handlers = [ctx.getHandler(), ctx.getClass()];
    const publicRoute = this.reflector.getAllAndOverride<boolean>(
      'auth:public',
      handlers,
    );
    const cookieRoute = this.reflector.getAllAndOverride<boolean>(
      'auth:cookie',
      handlers,
    );
    const segment = req.path.split('/').at(-1);
    if (cookieRoute && (segment === 'refresh' || !req.headers.authorization)) {
      let origin = req.headers.origin;
      if (!origin && req.headers.referer) {
        try {
          origin = new URL(req.headers.referer).origin;
        } catch {
          /* invalid referer */
        }
      }
      const allowed = (process.env.AUTH_ALLOWED_ORIGINS || '')
        .split(',')
        .map((v) => v.trim());
      if (!origin || !allowed.includes(origin))
        throw new ForbiddenException('Invalid request origin');
    }
    const limited = [
      'register',
      'login',
      'refresh',
      'forgot-password',
      'reset-password',
      'verify-email',
      'resend-verification',
    ];
    if (req.path.includes('/auth/') && limited.includes(segment)) {
      const body = req.body as { email?: unknown } | undefined;
      await this.infra.rateLimit(
        segment,
        req.ip || 'unknown',
        typeof body?.email === 'string' ? body.email : undefined,
      );
    }
    // Logout may authenticate via refresh cookie when access JWT expired.
    if (publicRoute && (segment !== 'logout' || !req.headers.authorization)) return true;
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!match) throw new UnauthorizedException();
    try {
      const claims = await this.jwt.verifyAsync<{
        sub: string;
        sid: string;
        type: string;
        ver: number;
        exp: number;
      }>(match[1], {
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (
        claims.type !== 'access' ||
        !uuid.test(claims.sub) ||
        !uuid.test(claims.sid) ||
        !Number.isInteger(claims.ver) ||
        !Number.isFinite(claims.exp)
      )
        throw new UnauthorizedException();
      req.actor = {
        userId: claims.sub,
        sessionId: claims.sid,
        version: claims.ver,
        ip: req.ip,
      };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    await this.security.identity(req.actor);
    const policy = this.reflector.getAllAndOverride<{
      permissions: string[];
      mode: 'all' | 'any';
    }>('auth:permissions', handlers);
    if (req.path.includes('/admin/') && !policy)
      throw new ForbiddenException('Missing route policy');
    if (policy) {
      try {
        await this.security.authorize(req.actor, policy.permissions, policy.mode);
      } catch (e) {
        await this.security.denied(req.actor, policy.permissions.join(','));
        throw e;
      }
    }
    return true;
  }
}
