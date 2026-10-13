import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';

export const SKIP_SUCCESS_WRAP_KEY = 'skipSuccessWrap';

export interface WrappedResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
  path: string;
}

@Injectable()
export class SuccessResponseInterceptor<T> implements NestInterceptor<
  T,
  WrappedResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<WrappedResponse<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUCCESS_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const request = context.switchToHttp().getRequest<{ url?: string }>();
    return next.handle().pipe(
      map((data) => {
        // If handler already returned wrapped shape, pass through
        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data as T;
        }
        // Paginated shape passthrough: { data, pagination }
        const res: WrappedResponse<T> = {
          success: true,
          data: data,
          timestamp: new Date().toISOString(),
          path: request?.url ?? '',
        };
        return res;
      }),
    );
  }
}
