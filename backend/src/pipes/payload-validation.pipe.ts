import { ValidationPipe } from '@nestjs/common';
import { ValidationPipeOptions } from '@nestjs/common/pipes/validation.pipe';
import { ValidationError } from 'class-validator';
import { ERROR_RESPONSE } from 'src/common/constants';
import { ServerException } from 'src/exceptions';

interface PayloadValidationPipeOptions extends ValidationPipeOptions {
  protocol?: 'http' | 'websocket';
}

const classValidatorExceptionFactory = (errors: ValidationError[]) => {
  const getDetails = (acc: object, val: ValidationError): object => {
    const { property, constraints, children } = val;
    if (constraints) {
      acc[property] = Object.values(constraints).join(', ');
    } else if (children?.length) {
      acc[property] = children.reduce(getDetails, {});
    }
    return acc;
  };
  const exceptionResponse = {
    ...ERROR_RESPONSE.REQUEST_PAYLOAD_VALIDATION_ERROR,
    message: `ValidateFailed: ${errors.map((e) => e.property).join(', ')}`,
    details: errors.reduce(getDetails, {}),
  };
  return new ServerException(exceptionResponse);
};

class PayloadValidationPipe extends ValidationPipe {
  constructor(options?: PayloadValidationPipeOptions) {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: classValidatorExceptionFactory,
      ...options,
    });
  }
}

export { PayloadValidationPipe, classValidatorExceptionFactory };
