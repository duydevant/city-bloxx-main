import { validate } from 'class-validator';
import { ValidatorOptions } from 'class-validator/types/validation/ValidatorOptions';
import { classValidatorExceptionFactory } from 'src/pipes';

/**
 * It is good to make validatorExceptionFactory is the same as PayloadValidationPipe.exceptionFactory
 **/
export async function validateDtoByGroups(
  dto: object,
  groups: string[],
  validatorOptions?: ValidatorOptions,
) {
  const validateErrors = await validate(dto, {
    groups,
    ...validatorOptions,
  });

  if (validateErrors.length) {
    throw classValidatorExceptionFactory(validateErrors);
  }
}
