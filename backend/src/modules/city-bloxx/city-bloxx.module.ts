import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { GamePolicyService } from './common/game-policy.service';
import { GameStore } from './common/game-store.service';
import { GameWorkerService } from './common/game-worker.service';
import { MaintenanceService } from './maintenance.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { VerificationService } from './verification.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [
    CloudController,
    RunsController,
    BoardsController,
    AnalyticsController,
    ModerationController,
  ],
  providers: [
    GamePolicyService,
    GameStore,
    CloudService,
    GameWorkerService,
    RunsService,
    BoardsService,
    VerificationService,
    AnalyticsService,
    ModerationService,
    MaintenanceService,
  ],
  exports: [
    GamePolicyService,
    GameStore,
    GameWorkerService,
    MaintenanceService,
    ModerationService,
    AnalyticsService,
  ],
})
export class CityBloxxModule {}
