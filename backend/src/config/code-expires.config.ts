import { registerAs } from '@nestjs/config';
import { APP_DEFAULTS } from 'src/common/constants';

export default registerAs('codeExpires', () => ({
  verifyEmail:
    process.env.VERIFY_EMAIL_EXPIRES_IN || APP_DEFAULTS.VERIFY_EMAIL_EXPIRES_IN,
  resetPassword:
    process.env.RESET_PASSWORD_EXPIRES_IN || APP_DEFAULTS.RESET_PASSWORD_EXPIRES_IN,
  verifyOTP: process.env.VERIFY_OTP_EXPIRES_IN || APP_DEFAULTS.VERIFY_OTP_EXPIRES_IN,
  otpCooldown: process.env.OTP_COOLDOWN
    ? +process.env.OTP_COOLDOWN
    : APP_DEFAULTS.OTP_COOLDOWN,
}));
