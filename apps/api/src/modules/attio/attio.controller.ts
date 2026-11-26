import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { readAttioConfig } from './attio-config'
import { AttioService, type AttioDisconnectResult, type AttioStatus } from './attio.service'

/**
 * Attio OAuth integration. Most routes are JWT-guarded and derive the user from
 * the token. The `callback` is the exception: it is a top-level browser redirect
 * from Attio, so it can't carry our JWT — the caller is authenticated by a
 * signed, short-lived `state` (see AttioService), and the handler bounces the
 * browser back to the SPA rather than returning JSON. The whole controller is
 * inert until ATTIO_* env vars are set.
 */
@Controller('attio')
export class AttioController {
  constructor(private readonly attio: AttioService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<AttioStatus> {
    return this.attio.getStatus(user.userId)
  }

  @Get('connect')
  @UseGuards(JwtGuard)
  connect(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.attio.buildAuthorizeUrl(user.userId) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readAttioConfig()?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    if (!code || !state) return back('attio=error&reason=missing_code')
    const result = await this.attio.handleCallback(code, state)
    return result.ok ? back('attio=connected') : back(`attio=error&reason=${result.reason ?? 'unknown'}`)
  }

  // #4186.1 — l'export de contact vers ce CRM passe désormais par la porte
  // commune : `POST /crm/push/contact` (`provider: 'attio'`). Cette route
  // écrivait en direct, sans trace ni prévisualisation.

  /**
   * Déconnecte — la ligne locale est TOUJOURS effacée. `revoked: false` +
   * `warning` disent à l'écran qu'Attio n'a pas confirmé la révocation (il n'y
   * a pas d'endpoint côté Attio pour la demander) : jamais un 204 silencieux
   * qui masquerait ça.
   */
  @Delete()
  @UseGuards(JwtGuard)
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<AttioDisconnectResult> {
    return this.attio.disconnect(user.userId)
  }
}
