import { registerAs } from '@nestjs/config';
import { APP_DEFAULTS } from 'src/common/constants';
import { NodeEnv } from 'src/common/enums';

export const getAppConfig = () => ({
  nodeEnv: process.env.NODE_ENV || NodeEnv.Local,
  appName: process.env.APP_NAME || APP_DEFAULTS.APP_NAME,
  appPort: +process.env.APP_PORT || APP_DEFAULTS.APP_PORT,
  isProductionEnv: process.env.NODE_ENV === 'production',
  frontendAdminPortalUrl: process.env.FRONTEND_ADMIN_PORTAL_URL,
  frontendUserPortalUrl: process.env.FRONTEND_USER_PORTAL_URL,
  trustProxy: process.env.APP_TRUST_PROXY === 'true' ? 1 : false,
  appUrl: process.env.APP_URL,
});

export default registerAs('app', getAppConfig);
