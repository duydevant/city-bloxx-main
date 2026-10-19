import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModerationActionDto, ModerationRunsQueryDto } from './moderation.dto';
import { ModerationService } from './moderation.service';
import { RequireAllPermissions } from '../security/policy';
import { AuthRequest } from '../security/types';

@ApiTags('City Bloxx admin moderation')
@ApiBearerAuth()
@Controller({ path: 'admin/city-bloxx', version: '1' })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('runs')
  @RequireAllPermissions('city_bloxx_moderation:read')
  list(@Req() req: AuthRequest, @Query() query: ModerationRunsQueryDto) {
    return this.moderation.list(req.actor, query);
  }

  @Get('runs/:runId')
  @RequireAllPermissions('city_bloxx_moderation:read')
  detail(
    @Req() req: AuthRequest,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
  ) {
    return this.moderation.detail(req.actor, runId);
  }

  @Post('runs/:runId/quarantine')
  @HttpCode(200)
  @RequireAllPermissions('city_bloxx_moderation:update')
  quarantine(
    @Req() req: AuthRequest,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.moderation.quarantine(req.actor, runId, dto);
  }

  @Post('runs/:runId/release')
  @HttpCode(200)
  @RequireAllPermissions('city_bloxx_moderation:update')
  release(
    @Req() req: AuthRequest,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.moderation.release(req.actor, runId, dto);
  }
}
