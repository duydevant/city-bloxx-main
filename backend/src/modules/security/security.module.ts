import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessGuard } from './access.guard';
import {
  AdminOperationsController,
  AdminPermissionsController,
  AdminRolesController,
  AdminUsersController,
} from './admin.controller';
import { AdminService } from './admin.service';
import { AuthController, ProfileController } from './auth.controller';
import { AuthService } from './auth.service';
import { InfrastructureService } from './infrastructure.service';
import { SecurityService } from './security.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AuthController,
    ProfileController,
    AdminUsersController,
    AdminRolesController,
    AdminPermissionsController,
    AdminOperationsController,
  ],
  providers: [
    SecurityService,
    InfrastructureService,
    AuthService,
    AdminService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [SecurityService, InfrastructureService],
})
export class SecurityModule {}
