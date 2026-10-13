import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import {
  EmailDto,
  LoginDto,
  PasswordDto,
  ProfileDto,
  RegisterDto,
  ResetDto,
  TokenDto,
} from './dto';
import { boolEnv } from './infrastructure.service';
import { CookieMutation, Public, RequireAllPermissions } from './policy';
import { AuthRequest } from './types';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: boolEnv('COOKIE_SECURE', process.env.NODE_ENV === 'production'),
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }
  private cookie(req: AuthRequest): string {
    return (req.cookies as Record<string, string> | undefined)?.refresh_token || '';
  }
  private send(res: Response, tokens: Awaited<ReturnType<AuthService['login']>>) {
    res.cookie('refresh_token', tokens.refreshToken, {
      ...this.options(),
      expires: new Date(tokens.sessionExpiresAt),
    });
    const { refreshToken: _secret, sessionExpiresAt: _expiry, ...safe } = tokens;
    void _secret;
    void _expiry;
    return safe;
  }
  @Public() @Post('register') register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
  ) {
    return this.auth.register(dto, req.ip);
  }
  @Public() @Post('login') async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(
      res,
      await this.auth.login(dto, req.ip, req.get('user-agent') || ''),
    );
  }
  @Public()
  @CookieMutation()
  @ApiCookieAuth('refresh_token')
  @Post('refresh')
  async refresh(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.auth.refresh(this.cookie(req), req.ip));
  }
  @Public()
  @CookieMutation()
  @ApiOperation({
    security: [{ bearer: [] }, { refresh_token: [] }],
    description:
      'Log out with a Bearer access token or the refresh cookie. Cookie-only requests require an allowed Origin.',
  })
  @Post('logout')
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = req.actor
      ? await this.auth.logout(req.actor)
      : await this.auth.cookieLogout(this.cookie(req), req.ip);
    res.clearCookie('refresh_token', this.options());
    return result;
  }
  @ApiBearerAuth()
  @Post('logout-all')
  async logoutAll(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.actor, true);
    res.clearCookie('refresh_token', this.options());
    return result;
  }
  @ApiBearerAuth()
  @Get('me')
  async me(@Req() req: AuthRequest) {
    await this.auth.security.identity(req.actor);
    return this.auth.security.summary(req.actor.userId);
  }
  @ApiBearerAuth()
  @Get('sessions')
  sessions(@Req() req: AuthRequest) {
    return this.auth.sessions(req.actor);
  }
  @ApiBearerAuth()
  @Delete('sessions/:id')
  revoke(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.auth.revokeOwn(req.actor, id);
  }
  @Public() @Post('forgot-password') forgot(@Body() dto: EmailDto) {
    return this.auth.recovery(dto);
  }
  @Public() @Post('resend-verification') resend(@Body() dto: EmailDto) {
    return this.auth.recovery(dto, true);
  }
  @Public() @Post('reset-password') reset(@Body() dto: ResetDto) {
    return this.auth.consume(dto, 'reset');
  }
  @Public() @Post('verify-email') verify(@Body() dto: TokenDto) {
    return this.auth.consume(dto, 'verify');
  }
}

@ApiTags('Own profile')
@ApiBearerAuth()
@Controller({ path: 'users/me', version: '1' })
export class ProfileController {
  constructor(private readonly auth: AuthService) {}
  @RequireAllPermissions('profile:read') @Get() async me(@Req() req: AuthRequest) {
    await this.auth.security.authorize(req.actor, ['profile:read']);
    return this.auth.security.summary(req.actor.userId);
  }
  @RequireAllPermissions('profile:update') @Patch() update(
    @Req() req: AuthRequest,
    @Body() dto: ProfileDto,
  ) {
    return this.auth.profile(req.actor, dto);
  }
  @Post('change-password') change(@Req() req: AuthRequest, @Body() dto: PasswordDto) {
    return this.auth.change(req.actor, dto);
  }
  @Get('permissions') async permissions(@Req() req: AuthRequest) {
    await this.auth.security.identity(req.actor);
    return this.auth.security.permissions(req.actor.userId);
  }
}
