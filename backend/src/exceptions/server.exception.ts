import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpErrorResponseDto } from 'src/common/dto';
import { ServerExceptionType } from 'src/common/enums/server-exception-type.enum';

export class ServerException extends HttpException {
  public readonly type: ServerExceptionType;
  public readonly details?: unknown;

  constructor(
    response: HttpErrorResponseDto,
    type?: ServerExceptionType,
    details?: unknown,
    status?: number,
  ) {
    const statusCode: number =
      status || response.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = {
      ...response,
      errorCode: type || response.errorCode,
    };
    super(errorResponse, statusCode);
    this.type = type || ServerExceptionType.INTERNAL_SERVER_ERROR;
    this.details = details;
  }

  // Static factory methods for common error types
  static badRequest(
    message: string,
    type: ServerExceptionType,
    details?: any,
  ): ServerException {
    return new ServerException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: type,
        message,
      },
      type,
      details,
    );
  }

  static notFound(
    message: string,
    type: ServerExceptionType,
    details?: any,
  ): ServerException {
    return new ServerException(
      {
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: type,
        message,
      },
      type,
      details,
    );
  }

  static forbidden(
    message: string,
    type: ServerExceptionType,
    details?: any,
  ): ServerException {
    return new ServerException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        errorCode: type,
        message,
      },
      type,
      details,
    );
  }

  static conflict(
    message: string,
    type: ServerExceptionType,
    details?: any,
  ): ServerException {
    return new ServerException(
      {
        statusCode: HttpStatus.CONFLICT,
        errorCode: type,
        message,
      },
      type,
      details,
    );
  }

  static unprocessableEntity(
    message: string,
    type: ServerExceptionType,
    details?: any,
  ): ServerException {
    return new ServerException(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: type,
        message,
      },
      type,
      details,
    );
  }
}
