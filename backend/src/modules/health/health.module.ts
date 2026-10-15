import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CityBloxxModule } from '../city-bloxx/city-bloxx.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule, CityBloxxModule],
  controllers: [HealthController],
})
export class HealthModule {}
