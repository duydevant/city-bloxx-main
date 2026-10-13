import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import _ from 'lodash';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { ERROR_RESPONSE } from 'src/common/constants';
import { HttpErrorResponseDto } from 'src/common/dto';
import { Logger } from 'winston';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string }>();
    const isHttpException = exception instanceof HttpException;
    const httpStatus = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorData: Partial<HttpErrorResponseDto> = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
    };

    if (isHttpException) {
      let exceptionResponse: unknown = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        exceptionResponse = { message: exceptionResponse };
      }
      _.assign(
        errorData,
        { statusCode: exception.getStatus() },
        exceptionResponse as object,
      );
    } else {
      this.logger.error({
        context: 'AllExceptionFilter.catch',
        message: 'A non-http error being thrown somewhere',
      });
      _.assign(errorData, {
        ...ERROR_RESPONSE.INTERNAL_SERVER_ERROR,
      });
    }

    const isProductionEnv = this.configService.get<boolean>('app.isProductionEnv');
    if (isProductionEnv) delete errorData.details;

    httpAdapter.reply(ctx.getResponse(), errorData, httpStatus);
  }
}
