import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { configureApplication } from './bootstrap';
import { setupSwagger } from './common/docs';
import { getWinstonConfig } from './common/utilities/log.util';
import { getAppConfig } from './config';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const { appName, appPort, isProductionEnv } = getAppConfig();
  const logger = WinstonModule.createLogger(getWinstonConfig(appName));
  const app = await NestFactory.create(AppModule, {
    logger,
    rawBody: true,
  });

  configureApplication(app);

  setupSwagger(app);

  await app.listen(appPort);
  if (!isProductionEnv) {
    logger.log({
      message: `Application ready — Swagger http://localhost:${appPort}/swagger — API http://localhost:${appPort}/api`,
      context: 'Application',
    });
  }
}

void bootstrap();
