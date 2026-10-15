import { Module } from '@nestjs/common';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { GamePolicyService } from './common/game-policy.service';
import { GameStore } from './common/game-store.service';
import { GameWorkerService } from './common/game-worker.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [CloudController],
  providers: [GamePolicyService, GameStore, CloudService, GameWorkerService],
  exports: [GamePolicyService, GameStore, GameWorkerService],
})
export class CityBloxxModule {}
