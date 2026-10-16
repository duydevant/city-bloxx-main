import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { GamePolicyService } from './common/game-policy.service';
import { GameStore } from './common/game-store.service';
import { GameWorkerService } from './common/game-worker.service';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { VerificationService } from './verification.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [CloudController, RunsController, BoardsController],
  providers: [
    GamePolicyService,
    GameStore,
    CloudService,
    GameWorkerService,
    RunsService,
    BoardsService,
    VerificationService,
  ],
  exports: [GamePolicyService, GameStore, GameWorkerService],
})
export class CityBloxxModule {}
