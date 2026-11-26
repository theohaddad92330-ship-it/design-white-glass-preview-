import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { SESSION_REVOKED_CODE, type ActiveSession } from '@bellum/contracts'
import { unwrap } from '@bellum/utils'
import type { Request, Response } from 'express'
import { clientIp, ensureDeviceId, getDeviceId, userAgent } from './device-cookie'
import { SessionRegistryService } from './session-registry.service'
import { CredentialsAuthService } from './credentials-auth.service'
import { EmailVerificationService } from './email-verification.service'
import { OAuthService } from './oauth-auth.service'
import { PasswordResetService } from './password-reset.service'
import { SessionService } from './session.service'
import type { AuthFailure } from './auth.types'
import { AccessCookie } from '../../common/decorator/access-cookie.decorator'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { LastUsedLogin } from '../../common/decorator/last-used-login.decorator'
import { RefreshCookie } from '../../common/decorator/refresh-cookie.decorator'
import {
  AttachRefreshCookieInterceptor,
  ClearRefreshCookieInterceptor,
} from '../../common/interceptor/refresh-cookie.interceptor'
import { JwtGuard } from './jwt.guard'
import { ConfirmResetPasswordDto } from './dto/confirm-reset-password.dto'
import { LoginDto } from './dto/login.dto'
import { OauthCallbackDto } from './dto/oauth-callback.dto'
import { RefreshDto } from './dto/refresh.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { RequestOtpDto } from './dto/request-otp.dto'
import { VerifyOtpDto } from './dto/verify-otp.dto'
import { SignupDto } from './dto/signup.dto'
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto'

function throwAuthFailure(failure: AuthFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'invalid_credentials':
    case 'invalid_refresh_token':
    case 'user_not_found':
    case 'oauth_tokens_invalid':
      throw new UnauthorizedException(message)
    // Session tenue 24 h (15/09/2026) : une panne du fournisseur n'est PAS un
    // jeton invalide. Un 401 renverrait le navigateur à la connexion ; un 503
    // lui dit de garder sa session et de retenter.
    case 'auth_provider_unavailable':
      throw new ServiceUnavailableException({ code, message })
    case 'email_taken':
    case 'signup_failed':
    case 'oauth_url_failed':
    case 'delete_failed':
    case 'otp_failed':
    case 'otp_invalid':
    case 'otp_expired':
    case 'otp_throttled':
    case 'otp_max_attempts':
      throw new BadRequestException(message)
    // Le CODE voyage avec le message. Sans lui, l'écran devait deviner la cause
    // en cherchant des mots dans la prose — et il rangeait les trois causes sous
    // « Lien invalide », si bien qu'un lien EXPIRÉ (refaire une demande), un lien
    // DÉJÀ UTILISÉ (le mot de passe est peut-être déjà changé) et un mot de passe
    // refusé par Supabase se ressemblaient. Trois gestes différents, un seul
    // écran : c'est ce qui a rendu l'incident du 25/08 indiagnosticable.
    // R15-7 : le CODE voyage, pour que l'appareil révoqué le dise au lieu de
    // relancer un refresh que rien ne peut faire aboutir.
    case SESSION_REVOKED_CODE:
      throw new UnauthorizedException({ code, message })
    case 'reset_token_invalid':
      throw new UnauthorizedException({ code, message: 'Lien de réinitialisation invalide ou déjà utilisé.' })
    case 'reset_token_expired':
      throw new UnauthorizedException({
        code,
        message: 'Lien de réinitialisation expiré. Veuillez refaire une demande.',
      })
    case 'password_update_failed':
      // Ce n'est PAS un problème de lien : le lien a été échangé avec succès et
      // c'est le mot de passe que le fournisseur refuse. L'écran doit le dire,
      // sans quoi la personne redemande un lien qui ne changera rien.
      throw new BadRequestException({ code, message })
    case 'logout_failed':
      throw new InternalServerErrorException(message)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown auth failure code: ${String(_exhaustive)}`)
    }
  }
}

@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean
  private readonly cookieDomain: string | undefined

  constructor(
    private readonly credentials: CredentialsAuthService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly oauth: OAuthService,
    private readonly sessionService: SessionService,
    private readonly sessionRegistry: SessionRegistryService,
    config: ConfigService,
  ) {
    this.cookieSecure = config.get<string>('nodeEnv') === 'production'
    this.cookieDomain = config.get<string>('cookieDomain', '')?.trim() || undefined
  }

  /** Records the calling browser as a device and enforces the concurrent-device
   *  cap (evicts the LRU beyond the limit). Best-effort: never blocks the auth
   *  response on a registry hiccup. */
  private async trackDevice(req: Request, res: Response, userId: string): Promise<void> {
    try {
      const deviceId = ensureDeviceId(req, res, { secure: this.cookieSecure, domain: this.cookieDomain })
      await this.sessionRegistry.registerAndEnforce(userId, deviceId, clientIp(req), userAgent(req))
    } catch {
      // best-effort — auth must still succeed if the registry is unavailable
    }
  }

  @Post('login')
  @HttpCode(200)
  @LastUsedLogin('password')
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const outcome = unwrap(await this.credentials.login(dto.email, dto.password), throwAuthFailure)
    if (outcome.status === 'authenticated') {
      await this.trackDevice(req, res, outcome.session.user.id)
    }
    return outcome
  }

  @Post('signup')
  @LastUsedLogin('password')
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async signup(@Body() dto: SignupDto) {
    return unwrap(
      await this.emailVerification.signup(dto.email, dto.password, dto.first_name, dto.last_name),
      throwAuthFailure,
    )
  }

  @Post('refresh')
  @HttpCode(200)
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async refresh(
    @Body() dto: RefreshDto,
    @RefreshCookie() cookieToken: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Cookie is the secure source of truth; body is a fallback for tests
    // and explicit-refresh scenarios.
    const refreshToken = cookieToken || dto.refresh_token
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant')
    }
    const session = unwrap(await this.sessionService.refresh(refreshToken), throwAuthFailure)

    // Anti password-sharing: an evicted device (LRU beyond the MAX_ACTIVE_DEVICES
    // cap, or a manual sign-out) is kicked here on its next refresh. Fail-open on
    // a registry error so a DB hiccup never locks everyone out.
    const deviceId = getDeviceId(req)
    if (deviceId) {
      let revoked = false
      try {
        revoked = await this.sessionRegistry.isRevoked(session.user.id, deviceId)
      } catch {
        revoked = false
      }
      if (revoked) throwAuthFailure({ code: SESSION_REVOKED_CODE, message: 'Session révoquée sur cet appareil' })
    }
    await this.trackDevice(req, res, session.user.id)
    return session
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @UseInterceptors(ClearRefreshCookieInterceptor)
  async logout(
    @AccessCookie() accessToken: string | null,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ): Promise<void> {
    // Finding #6 : révoquer la session de CET appareil, pas seulement effacer le
    // cookie — sinon un jeton d'accès volé survit à la déconnexion jusqu'à son exp.
    const deviceId = getDeviceId(req)
    if (deviceId) {
      await this.sessionRegistry.revokeDevice(user.userId, deviceId)
    }
    this.sessionService.invalidateSession(user.userId)
    unwrap(await this.credentials.logout(accessToken ?? ''), throwAuthFailure)
  }

  @Get('session')
  @UseGuards(JwtGuard)
  async session(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.sessionService.getSessionCached(user.userId), throwAuthFailure)
  }

  @Get('session/state')
  @UseGuards(JwtGuard)
  async sessionState(@CurrentUser() user: CurrentUserPayload) {
    return this.sessionService.getLifecycleState(user.userId)
  }

  @Get('sessions')
  @UseGuards(JwtGuard)
  async sessions(@CurrentUser() user: CurrentUserPayload, @Req() req: Request): Promise<ActiveSession[]> {
    return this.sessionRegistry.list(user.userId, getDeviceId(req))
  }

  @Post('sessions/:id/revoke')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async revokeSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.sessionRegistry.revoke(user.userId, id)
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    unwrap(await this.passwordReset.resetPassword(dto.email), throwAuthFailure)
    return { ok: true }
  }

  @Post('confirm-reset-password')
  @HttpCode(200)
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async confirmResetPassword(@Body() dto: ConfirmResetPasswordDto) {
    const proof = { expiresAt: dto.expires_at, signature: dto.signature }
    return unwrap(await this.passwordReset.confirmResetPassword(dto.token_hash, dto.password, proof), throwAuthFailure)
  }

  @Post('request-otp')
  @HttpCode(200)
  // Tighter than the global 60/min: caps email-code sends so the endpoint can't
  // be turned into an email-bombing amplifier. Shares the Redis counter.
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async requestOtp(@Body() dto: RequestOtpDto) {
    unwrap(await this.credentials.requestOtp(dto.email), throwAuthFailure)
    return { ok: true }
  }

  @Post('verify-otp')
  @HttpCode(200)
  @LastUsedLogin('otp')
  // Defence-in-depth against brute-forcing the 6-digit code (on top of Supabase's
  // own single-use + attempt limits on the OTP itself).
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const outcome = unwrap(await this.credentials.verifyOtp(dto.email, dto.code), throwAuthFailure)
    if (outcome.status === 'authenticated') {
      await this.trackDevice(req, res, outcome.session.user.id)
    }
    return outcome
  }

  @Get('oauth/google')
  async oauthGoogle() {
    const url = unwrap(await this.oauth.oauthGoogleUrl(), throwAuthFailure)
    return { url }
  }

  @Post('oauth/callback')
  @HttpCode(200)
  @LastUsedLogin('google')
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async oauthCallback(@Body() dto: OauthCallbackDto) {
    return unwrap(await this.oauth.oauthCallback(dto.access_token, dto.refresh_token), throwAuthFailure)
  }

  @Post('verify-email-otp/:userId')
  @HttpCode(200)
  @LastUsedLogin('password')
  @UseInterceptors(AttachRefreshCookieInterceptor)
  async verifyEmailOtp(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() dto: VerifyEmailOtpDto) {
    return unwrap(await this.emailVerification.verifyEmailOtp(userId, dto.code), throwAuthFailure)
  }

  @Post('resend-email-otp/:userId')
  @HttpCode(200)
  async resendEmailOtp(@Param('userId', new ParseUUIDPipe()) userId: string) {
    unwrap(await this.emailVerification.resendEmailOtp(userId), throwAuthFailure)
    return { ok: true }
  }

  @Delete('account')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @UseInterceptors(ClearRefreshCookieInterceptor)
  async deleteAccount(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    unwrap(await this.credentials.deleteAccount(user.userId), throwAuthFailure)
  }
}
