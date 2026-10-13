import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Database — required
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  DB_CONNECTION: Joi.string().valid('postgres').required(),
  DB_SCHEMA: Joi.string().required(),

  // Redis — REDIS_URL or REDIS_HOST, at least one required
  REDIS_HOST: Joi.string().allow('').optional(),
  REDIS_PORT: Joi.number().allow('').optional(),

  // JWT
  JWT_SECRET: Joi.string().min(64).required(),
  JWT_ALGORITHM: Joi.string().valid('HS256').default('HS256'),
  JWT_ISSUER: Joi.string().required(),
  JWT_AUDIENCE: Joi.string().required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  MAIL_OUTBOX_KEY: Joi.string().hex().length(64).required(),
  REDIS_URL: Joi.string().uri().required(),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  MAX_ACTIVE_SESSIONS: Joi.number().integer().min(1).max(100).default(10),
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(12).max(128).default(12),
  REQUIRE_EMAIL_VERIFICATION: Joi.boolean().default(true),
  REGISTRATION_ENABLED: Joi.boolean().default(true),
  ADMIN_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .max(255)
    .empty('')
    .optional(),
  ADMIN_PASSWORD: Joi.string()
    .min(Joi.ref('PASSWORD_MIN_LENGTH'))
    .max(128)
    .empty('')
    .optional(),
  ADMIN_FULL_NAME: Joi.string().max(150).empty('').optional(),
  AUTH_ALLOWED_ORIGINS: Joi.string().required(),
  FRONTEND_USER_PORTAL_URL: Joi.string().uri().required(),
  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().integer().required(),
  MAIL_SENDER: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),
  ...Object.fromEntries(
    [
      'LOGIN',
      'REGISTER',
      'REFRESH',
      'FORGOT_PASSWORD',
      'RESET_PASSWORD',
      'VERIFY_EMAIL',
      'RESEND_VERIFICATION',
    ].flatMap((route) => [
      [`${route}_RATE_LIMIT`, Joi.number().integer().min(1).max(10000)],
      [`${route}_RATE_WINDOW_SECONDS`, Joi.number().integer().min(1).max(86400)],
    ]),
  ),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().optional(),
  JWT_REFRESH_TOKEN_EXPIRES_IN: Joi.string().optional(),
  COOKIE_SECURE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.valid(true).required(),
    otherwise: Joi.optional(),
  }),
})
  .and('ADMIN_EMAIL', 'ADMIN_PASSWORD')
  .unknown(true);
