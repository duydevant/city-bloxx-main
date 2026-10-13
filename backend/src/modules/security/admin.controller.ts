import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  ActiveDto,
  AdminCreateUserDto,
  AdminUpdateUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  ListDto,
  PermissionIdsDto,
  PermissionUpdateDto,
  RoleIdsDto,
  RoleUpdateDto,
  UserStatusDto,
} from './dto';
import { RequireAllPermissions as Policy } from './policy';
import { AuthRequest } from './types';

const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Admin users')
@ApiBearerAuth()
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly admin: AdminService) {}
  @Policy('users:read') @Get() list(@Req() r: AuthRequest, @Query() q: ListDto) {
    return this.admin.list(r.actor, 'users', q);
  }
  @Policy('users:create') @Post() create(
    @Req() r: AuthRequest,
    @Body() d: AdminCreateUserDto,
  ) {
    return this.admin.createUser(r.actor, d);
  }
  @Policy('users:read') @Get(':id') detail(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.detail(r.actor, 'users', id);
  }
  @Policy('users:update') @Patch(':id') update(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: AdminUpdateUserDto,
  ) {
    return this.admin.updateUser(r.actor, id, d);
  }
  @Policy('users:delete') @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.statusUser(r.actor, id);
  }
  @Policy('users:update_status') @Patch(':id/status') status(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: UserStatusDto,
  ) {
    return this.admin.statusUser(r.actor, id, d.status);
  }
  @Policy('users:read') @Get(':id/roles') roles(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.userRelation(r.actor, id, 'roles');
  }
  @Policy('users:assign_roles') @Put(':id/roles') replaceRoles(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: RoleIdsDto,
  ) {
    return this.admin.assignRoles(r.actor, id, d.roleIds, 'replace');
  }
  @Policy('users:assign_roles') @Post(':id/roles/:roleId') addRole(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Param('roleId', uuid) roleId: string,
  ) {
    return this.admin.assignRoles(r.actor, id, [roleId], 'add');
  }
  @Policy('users:assign_roles') @Delete(':id/roles/:roleId') removeRole(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Param('roleId', uuid) roleId: string,
  ) {
    return this.admin.assignRoles(r.actor, id, [roleId], 'remove');
  }
  @Policy('users:read') @Get(':id/permissions') permissions(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.userRelation(r.actor, id, 'permissions');
  }
  @Policy('sessions:read') @Get(':id/sessions') sessions(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.userRelation(r.actor, id, 'sessions');
  }
  @Policy('sessions:revoke') @Delete(':id/sessions') revoke(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.revoke(r.actor, id);
  }
}

@ApiTags('Admin roles')
@ApiBearerAuth()
@Controller({ path: 'admin/roles', version: '1' })
export class AdminRolesController {
  constructor(private readonly admin: AdminService) {}
  @Policy('roles:read') @Get() list(@Req() r: AuthRequest, @Query() q: ListDto) {
    return this.admin.list(r.actor, 'roles', q);
  }
  @Policy('roles:create') @Post() create(
    @Req() r: AuthRequest,
    @Body() d: CreateRoleDto,
  ) {
    return this.admin.create(r.actor, 'roles', d);
  }
  @Policy('roles:read') @Get(':id') detail(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.detail(r.actor, 'roles', id);
  }
  @Policy('roles:update') @Patch(':id') update(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: RoleUpdateDto,
  ) {
    return this.admin.update(r.actor, 'roles', id, d);
  }
  @Policy('roles:delete') @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.update(r.actor, 'roles', id, undefined);
  }
  @Policy('roles:update') @Patch(':id/status') status(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: ActiveDto,
  ) {
    return this.admin.update(r.actor, 'roles', id, d);
  }
  @Policy('roles:read') @Get(':id/permissions') permissions(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.roleRelation(r.actor, id, 'permissions');
  }
  @Policy('roles:assign_permissions') @Put(':id/permissions') replacePermissions(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: PermissionIdsDto,
  ) {
    return this.admin.assignPermissions(r.actor, id, d.permissionIds, 'replace');
  }
  @Policy('roles:assign_permissions')
  @Post(':id/permissions/:permissionId')
  addPermission(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Param('permissionId', uuid) p: string,
  ) {
    return this.admin.assignPermissions(r.actor, id, [p], 'add');
  }
  @Policy('roles:assign_permissions')
  @Delete(':id/permissions/:permissionId')
  removePermission(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Param('permissionId', uuid) p: string,
  ) {
    return this.admin.assignPermissions(r.actor, id, [p], 'remove');
  }
  @Policy('roles:read') @Get(':id/users') users(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.roleRelation(r.actor, id, 'users');
  }
}

@ApiTags('Admin permissions')
@ApiBearerAuth()
@Controller({ path: 'admin/permissions', version: '1' })
export class AdminPermissionsController {
  constructor(private readonly admin: AdminService) {}
  @Policy('permissions:read') @Get() list(@Req() r: AuthRequest, @Query() q: ListDto) {
    return this.admin.list(r.actor, 'permissions', q);
  }
  @Policy('permissions:read') @Get('resources') resources(@Req() r: AuthRequest) {
    return this.admin.resources(r.actor);
  }
  @Policy('permissions:manage') @Post() create(
    @Req() r: AuthRequest,
    @Body() d: CreatePermissionDto,
  ) {
    return this.admin.create(r.actor, 'permissions', d);
  }
  @Policy('permissions:read') @Get(':id') detail(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.detail(r.actor, 'permissions', id);
  }
  @Policy('permissions:manage') @Patch(':id') update(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: PermissionUpdateDto,
  ) {
    return this.admin.update(r.actor, 'permissions', id, d);
  }
  @Policy('permissions:manage') @Delete(':id') remove(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.update(r.actor, 'permissions', id, undefined);
  }
  @Policy('permissions:manage') @Patch(':id/status') status(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
    @Body() d: ActiveDto,
  ) {
    return this.admin.update(r.actor, 'permissions', id, d);
  }
}

@ApiTags('Admin audit and sessions')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminOperationsController {
  constructor(private readonly admin: AdminService) {}
  @Policy('audit_logs:read') @Get('audit-logs') audits(
    @Req() r: AuthRequest,
    @Query() q: ListDto,
  ) {
    return this.admin.list(r.actor, 'audit_logs', q);
  }
  @Policy('audit_logs:read') @Get('audit-logs/:id') audit(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.detail(r.actor, 'audit_logs', id);
  }
  @Policy('sessions:read') @Get('sessions') sessions(
    @Req() r: AuthRequest,
    @Query() q: ListDto,
  ) {
    return this.admin.list(r.actor, 'auth_sessions', q);
  }
  @Policy('sessions:revoke') @Delete('sessions/:id') revoke(
    @Req() r: AuthRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.revoke(r.actor, undefined, id);
  }
}
