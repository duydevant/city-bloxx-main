import { registerAs } from '@nestjs/config';
import { JwtAlgorithm } from 'src/common/enums';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  algorithm: JwtAlgorithm.HS256,
  issuer: process.env.JWT_ISSUER,
  audience: process.env.JWT_AUDIENCE,
  // Keep as string durations (e.g. "1d", "30m") — consumed via TimeUtil.getTtlValue / ms
  accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '30d',
}));
