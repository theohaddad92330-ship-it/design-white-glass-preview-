import { Body, Controller, Get, HttpCode, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { AuthOutcome, MfaEnrollResponse, MfaStatus } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { LastUsedLogin } from '../../common/decorator/last-used-login.decorator'
import { AttachRefreshCookieInterceptor } from '../../common/interceptor/refresh-cookie.interceptor'
import { JwtGuard } from './jwt.guard'
import { MfaChallengeDto } from './dto/mfa-challenge.dto'
import { MfaCodeDto } from './dto/mfa-code.dto'
import { MfaService } from './mfa.service'

/**
 * TOTP two-factor endpoints, mounted under `/auth/2fa`. Enrollment/management
 * routes are JWT-guarded and derive the user from the cookie session. The
 * `challenge` route is the exception: it runs BEFORE a session exists, so it is
 * authenticated by the short-lived `mfaToken` issued at login instead of a JWT,
 * and — on success — issues the very same session cookies a normal login does
 * (via `AttachRefreshCookieInterceptor`).
 */
@Controller('auth/2fa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<MfaStatus> {
    return this.mfa.getStatus(user.userId)
  }

  @Post('enroll')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  enroll(@CurrentUser() user: CurrentUserPayload): Promise<MfaEnrollResponse> {
    return this.mfa.enroll(user.userId, user.email)
  }

  @Post('verify')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async verify(@CurrentUser() user: CurrentUserPayload, @Body() dto: MfaCodeDto): Promise<MfaStatus> {
    await this.mfa.verifyAndEnable(user.userId, dto.code)
    return { enabled: true }
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async disable(@CurrentUser() user: CurrentUserPayload, @Body() dto: MfaCodeDto): Promise<MfaStatus> {
    await this.mfa.disable(user.userId, dto.code)
    return { enabled: false }
  }

  @Post('challenge')
  @HttpCode(200)
  // Finding #4 : plafond dédié sur le second facteur, en plus du verrou lié au
  // compte dans MfaService. Défense de débit contre le bourrage du code 6 chiffres.
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  @LastUsedLogin('password')
  @UseInterceptors(AttachRefreshCookieInterceptor)
  challenge(@Body() dto: MfaChallengeDto): Promise<AuthOutcome> {
    return this.mfa.challenge(dto.mfaToken, dto.code)
  }
}
