import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [HealthController],
})
export class HealthModule {}
