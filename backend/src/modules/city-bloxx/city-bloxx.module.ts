import { Module } from '@nestjs/common';
import { GamePolicyService } from './common/game-policy.service';
import { GameStore } from './common/game-store.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  providers: [GamePolicyService, GameStore],
  exports: [GamePolicyService, GameStore],
})
export class CityBloxxModule {}
