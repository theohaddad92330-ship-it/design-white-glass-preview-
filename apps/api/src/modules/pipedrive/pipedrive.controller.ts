import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { readPipedriveConfig } from './pipedrive-config'
import { PipedriveService, type PipedriveDisconnectResult, type PipedriveStatus } from './pipedrive.service'

/**
 * Pipedrive OAuth integration. Most routes are JWT-guarded and derive the user
 * from the token. The `callback` is the exception: it is a top-level browser
 * redirect from Pipedrive, so it can't carry our JWT — the caller is
 * authenticated by a signed, short-lived `state` (see PipedriveService), and the
 * handler bounces the browser back to the SPA rather than returning JSON. The
 * whole controller is inert until PIPEDRIVE_* env vars are set.
 */
@Controller('pipedrive')
export class PipedriveController {
  constructor(private readonly pipedrive: PipedriveService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<PipedriveStatus> {
    return this.pipedrive.getStatus(user.userId)
  }

  @Get('connect')
  @UseGuards(JwtGuard)
  connect(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.pipedrive.buildAuthorizeUrl(user.userId) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readPipedriveConfig()?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    if (!code || !state) return back('pipedrive=error&reason=missing_code')
    const result = await this.pipedrive.handleCallback(code, state)
    return result.ok ? back('pipedrive=connected') : back(`pipedrive=error&reason=${result.reason ?? 'unknown'}`)
  }

  // #4186.1 — l'export de contact vers ce CRM passe désormais par la porte
  // commune : `POST /crm/push/contact` (`provider: 'pipedrive'`). Cette route
  // écrivait en direct, sans trace ni prévisualisation.

  /**
   * Déconnecte — et révoque server-side. `revoked: false` + `warning` disent à
   * l'écran que Pipedrive n'a pas confirmé la révocation : la déconnexion
   * locale a quand même eu lieu (jamais un 204 silencieux qui masquerait
   * l'échec).
   */
  @Delete()
  @UseGuards(JwtGuard)
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<PipedriveDisconnectResult> {
    return this.pipedrive.disconnect(user.userId)
  }
}
