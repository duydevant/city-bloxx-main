import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { FinishRunDto, StartRunDto } from './runs.dto';
import { RunsService } from './runs.service';
import { VerificationService } from './verification.service';
import { Public, RequireAllPermissions } from '../security/policy';
import { AuthRequest } from '../security/types';

@ApiTags('City Bloxx runs')
@Controller({ path: 'city-bloxx', version: '1' })
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly verification: VerificationService,
  ) {}
  @Get('daily/today')
  @Public()
  daily(@Req() req: AuthRequest) {
    return this.runs.today(req.ip || 'unknown');
  }
  @Post('runs/start')
  @HttpCode(200)
  @ApiOkResponse({
    description:
      'Canonical server config and recoverable 24-hour ticket; identical request returns original response',
  })
  @ApiBearerAuth()
  @RequireAllPermissions('city_bloxx_runs:start')
  start(@Req() req: AuthRequest, @Body() dto: StartRunDto) {
    return this.runs.start(req.actor, dto);
  }
  @Post('runs/finish')
  @ApiAcceptedResponse({
    description:
      'Submission durably queued or processing; poll own run status after two seconds',
  })
  @ApiOkResponse({
    description: 'Stored terminal result for an identical submission retry',
  })
  @ApiBearerAuth()
  @RequireAllPermissions('city_bloxx_runs:finish')
  async finish(
    @Req() req: AuthRequest,
    @Body() dto: FinishRunDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.runs.finish(req.actor, dto);
    const terminal = ['accepted', 'rejected'].includes(result.status);
    if (!terminal) this.verification.request();
    res.status(terminal ? 200 : 202);
    if (!terminal) res.setHeader('Retry-After', '2');
    return result;
  }
  @Get('runs/:runId')
  @ApiBearerAuth()
  @RequireAllPermissions('city_bloxx_runs:read')
  status(
    @Req() req: AuthRequest,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.runs.status(req.actor, id);
  }
}
