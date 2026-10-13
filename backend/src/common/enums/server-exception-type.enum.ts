export enum ServerExceptionType {
  // General errors
  INTERNAL_SERVER_ERROR = 'internal_server_error',
  UNAUTHORIZED = 'unauthorized',
  BAD_REQUEST = 'bad_request',
  RESOURCE_FORBIDDEN = 'resource_forbidden',
  RESOURCE_NOT_FOUND = 'resource_not_found',
  REQUEST_PAYLOAD_VALIDATION_ERROR = 'request_payload_validation_error',

  // Authentication errors
  USER_ALREADY_EXISTS = 'user_already_exists',
  EMAIL_NOT_VERIFIED = 'email_not_verified',
  USER_DEACTIVATED = 'user_deactivated',
  INVALID_TOKEN_USAGE = 'invalid_token_usage',
  INVALID_GOOGLE_TOKEN = 'invalid_google_token',
  EMAIL_ALREADY_VERIFIED = 'email_already_verified',
  LINK_EXPIRED = 'verification_link_expired',
  USER_NOT_FOUND = 'user_not_found',
  PASSWORD_NOT_CHANGED = 'password_not_changed',
  ENTITY_PRIMARY_USER_ALREADY_EXISTS = 'entity_primary_user_already_exists',
  OTP_NOT_VERIFIED = 'otp_not_verified',
  OTP_EXPIRED = 'otp_code_expired',
  OTP_RESEND_TOO_SOON = 'otp_resend_too_soon',
  CURRENT_PASSWORD_REQUIRED = 'current_password_required',

  // Download errors
  DOWNLOAD_COOLDOWN_ACTIVE = 'download_cooldown_active',

  // Generic validation errors
  INVALID_OBJECT = 'invalid_object',
}
