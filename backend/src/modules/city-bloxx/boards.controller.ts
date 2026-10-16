import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BoardQuery, BoardsService } from './boards.service';
import { Public, RequireAllPermissions } from '../security/policy';
import { AuthRequest } from '../security/types';

@ApiTags('City Bloxx leaderboards')
@Controller({ path: 'city-bloxx/leaderboards', version: '1' })
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}
  @Get('quick')
  @Public()
  quick(@Req() req: AuthRequest, @Query() query: BoardQuery) {
    return this.boards.list('quick', query, req.ip || 'unknown');
  }
  @Get('daily')
  @Public()
  daily(@Req() req: AuthRequest, @Query() query: BoardQuery) {
    return this.boards.list('daily', query, req.ip || 'unknown');
  }
  @Get(':mode/me')
  @ApiBearerAuth()
  @RequireAllPermissions('city_bloxx_runs:read')
  me(@Req() req: AuthRequest, @Param('mode') mode: string, @Query() query: BoardQuery) {
    return this.boards.me(req.actor, mode, query);
  }
}
