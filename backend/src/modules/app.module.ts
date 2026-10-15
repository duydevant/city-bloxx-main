import {
  ClassSerializerInterceptor,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { SuccessResponseInterceptor } from 'src/common/interceptors';
import { RequestIdMiddleware } from 'src/common/middleware/request-id.middleware';
import { getWinstonConfig } from 'src/common/utilities/log.util';
import {
  appConfiguration,
  codeExpiresConfiguration,
  databaseConfig,
  databaseConfiguration,
  googleConfiguration,
  jwtConfiguration,
  redisConfiguration,
  validationSchema,
} from 'src/config';
import { AllExceptionFilter } from 'src/exceptions';
import { PayloadValidationPipe } from 'src/pipes';
import { CityBloxxModule } from './city-bloxx/city-bloxx.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfiguration,
        databaseConfiguration,
        jwtConfiguration,
        redisConfiguration,
        googleConfiguration,
        codeExpiresConfiguration,
      ],
      validationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const appName = config.get<string>('app.appName') || 'App';
        return getWinstonConfig(appName);
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => databaseConfig,
    }),
    HealthModule,
    SecurityModule,
    CityBloxxModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionFilter },
    { provide: APP_PIPE, useClass: PayloadValidationPipe },
    // Order matters: ClassSerializer runs first (innermost), Success wrap runs second (outermost)
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SuccessResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
