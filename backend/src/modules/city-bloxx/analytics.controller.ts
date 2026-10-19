import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsBatchDto, GuestAnalyticsBatchDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';
import { Public, RequireAllPermissions } from '../security/policy';
import { AuthRequest } from '../security/types';

@ApiTags('City Bloxx telemetry & catalog')
@Controller({ path: 'city-bloxx', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('catalog')
  @Public()
  catalog(@Req() req: AuthRequest) {
    return this.analytics.catalog(req.ip || 'unknown');
  }

  @Post('analytics/events')
  @HttpCode(200)
  @ApiBearerAuth()
  @RequireAllPermissions('city_bloxx_profile:read')
  recordEvents(@Req() req: AuthRequest, @Body() dto: AnalyticsBatchDto) {
    return this.analytics.recordAuthenticated(req.actor, dto);
  }

  @Post('analytics/guest-events')
  @HttpCode(200)
  @Public()
  recordGuestEvents(@Req() req: AuthRequest, @Body() dto: GuestAnalyticsBatchDto) {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const referer =
      typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
    return this.analytics.recordGuest(dto, req.ip || 'unknown', origin, referer);
  }
}
