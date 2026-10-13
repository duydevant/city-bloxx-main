import { HttpStatus } from '@nestjs/common';

export const ERROR_RESPONSE = {
  // General
  INTERNAL_SERVER_ERROR: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'internal_server_error',
    message: `Internal Server Error`,
  },
  UNAUTHORIZED: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'unauthorized',
    message: 'Authentication required',
  },
  BAD_REQUEST: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'bad_request',
    message: `Bad Request`,
  },
  INVALID_CREDENTIALS: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'invalid_credentials',
    message:
      'Incorrect username or password. Please check your credentials and try again',
  },
  RESOURCE_FORBIDDEN: {
    statusCode: HttpStatus.FORBIDDEN,
    errorCode: 'resource_forbidden',
    message: 'Access denied',
  },
  RESOURCE_NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'resource_not_found',
    message: 'Resource not found',
  },
  REQUEST_PAYLOAD_VALIDATION_ERROR: {
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    errorCode: 'request_payload_validation_error',
    message: 'Invalid request payload data',
  },
  // Authentication
  USER_ALREADY_EXISTS: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'user_already_exists',
    message: 'Unable to create account with provided credentials',
  },
  EMAIL_NOT_VERIFIED: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'email_not_verified',
    message: 'Email not verified',
  },
  USER_DEACTIVATED: {
    statusCode: HttpStatus.FORBIDDEN,
    errorCode: 'user_deactivated',
    message: 'Account access denied',
  },
  INVALID_TOKEN_USAGE: {
    statusCode: HttpStatus.FORBIDDEN,
    errorCode: 'invalid_token_usage',
    message: 'Invalid token type',
  },
  INVALID_GOOGLE_TOKEN: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'invalid_google_token',
    message: 'Invalid Google token',
  },
  EMAIL_ALREADY_VERIFIED: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'email_already_verified',
    message: 'Email already verified',
  },
  LINK_EXPIRED: {
    statusCode: HttpStatus.GONE,
    errorCode: 'verification_link_expired',
    message: 'Verification link has expired',
  },
  USER_NOT_FOUND: {
    statusCode: HttpStatus.NOT_FOUND,
    errorCode: 'user_not_found',
    message: 'User not found',
  },
  PASSWORD_NOT_CHANGED: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'password_not_changed',
    message: 'New password must not be the same as a previously used password',
  },
  ENTITY_PRIMARY_USER_ALREADY_EXISTS: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'entity_primary_user_already_exists',
    message: 'Entity primary user already exists',
  },
  OTP_NOT_VERIFIED: {
    statusCode: HttpStatus.UNAUTHORIZED,
    errorCode: 'otp_not_verified',
    message: 'OTP verification required',
  },
  OTP_EXPIRED: {
    statusCode: HttpStatus.GONE,
    errorCode: 'otp_code_expired',
    message: 'The OTP code has expired. Please request a new code.',
  },
  OTP_RESEND_TOO_SOON: {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    errorCode: 'otp_resend_too_soon',
    message: 'Please wait before requesting a new OTP',
  },
  CURRENT_PASSWORD_REQUIRED: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'current_password_required',
    message: 'Current password is required',
  },
  NEED_CREATE_NEW_PASSWORD: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'need_create_new_password',
    message: 'You must create a new password.',
  },
  NEED_BUSINESS_POC: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'need_business_poc',
    message: 'You must create business poc',
  },
  CREATE_CONTRACT_ERROR: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'create_contract_error',
    message: 'Unable to create contract',
  },
  APPROVED_CONTRACT: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'approved_contract',
    message: 'Contract approved',
  },
  INVALID_PRIMARY_ENTITY_USER_UPDATE: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'invalid_primary_entity_user_update',
    message: 'Invalid primary entity user update',
  },
  BUSINESS_ENTITY_CONTACT_EMAIL_ALREADY_EXISTS: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'business_entity_contact_email_already_exists',
    message: 'Business entity contact email already exists',
  },
  BUSINESS_ENTITY_GOV_ID_ALREADY_EXISTS: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'business_entity_gov_id_already_exists',
    message: 'GOV ID already exists. Please try another ID',
  },
  INVALID_ENTITY_USER_ROLE: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'invalid_entity_user_role',
    message: 'Invalid entity user role',
  },
  CANNOT_DEACTIVATE_PRIMARY_ENTITY_USER: {
    statusCode: HttpStatus.BAD_REQUEST,
    errorCode: 'cannot_deactivate_primary_entity_user',
    message: 'Cannot deactivate primary entity user',
  },
  INVALID_OBJECT: (objectName: string) => {
    const errorCodeFormat = objectName.replace(' ', '_').toLowerCase();
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: `invalid_${errorCodeFormat}`,
      message: `Invalid ${objectName}`,
    };
  },
  ANOTHER_CONTRACT_IN_PROCESSING: {
    statusCode: HttpStatus.CONFLICT,
    errorCode: 'another_contract_in_processing',
    message: 'Another contract is currently being processed',
  },
  DOWNLOAD_COOLDOWN_ACTIVE: {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    errorCode: 'download_cooldown_active',
    message:
      'Please wait a moment before trying to download again. A cooldown period is active.',
  },
};
