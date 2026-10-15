import { Body, Controller, Get, HttpCode, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GameProfileDto, SaveResolveDto, SaveWriteDto } from './cloud.dto';
import { CloudService } from './cloud.service';
import { RequireAllPermissions } from '../security/policy';
import { AuthRequest } from '../security/types';

@ApiTags('City Bloxx cloud')
@ApiBearerAuth()
@Controller({ path: 'city-bloxx', version: '1' })
export class CloudController {
  constructor(private readonly cloud: CloudService) {}
  @Get('profile')
  @RequireAllPermissions('city_bloxx_profile:read')
  profile(@Req() req: AuthRequest) {
    return this.cloud.profile(req.actor);
  }
  @Patch('profile')
  @RequireAllPermissions('city_bloxx_profile:update')
  patchProfile(@Req() req: AuthRequest, @Body() dto: GameProfileDto) {
    return this.cloud.patchProfile(req.actor, dto);
  }
  @Get('save')
  @RequireAllPermissions('city_bloxx_save:read')
  save(@Req() req: AuthRequest) {
    return this.cloud.read(req.actor);
  }
  @Put('save')
  @RequireAllPermissions('city_bloxx_save:write')
  write(@Req() req: AuthRequest, @Body() dto: SaveWriteDto) {
    return this.cloud.write(req.actor, dto);
  }
  @Post('save/resolve')
  @HttpCode(200)
  @RequireAllPermissions('city_bloxx_save:write')
  resolve(@Req() req: AuthRequest, @Body() dto: SaveResolveDto) {
    return this.cloud.write(req.actor, dto);
  }
}
