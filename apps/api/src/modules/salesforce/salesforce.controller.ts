import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { readSalesforceConfig } from './salesforce-config'
import { SalesforceConnectQueryDto } from './dto/salesforce.dto'
import { SalesforceService, type SalesforceDisconnectResult, type SalesforceStatus } from './salesforce.service'

/**
 * Salesforce OAuth integration. Most routes are JWT-guarded and derive the user
 * from the token. The `callback` is the exception: it is a top-level browser
 * redirect from Salesforce, so it can't carry our JWT — the caller is
 * authenticated by a signed, short-lived `state` (see SalesforceService), and
 * the handler bounces the browser back to the SPA rather than returning JSON.
 * The whole controller is inert until SALESFORCE_* env vars are set.
 */
@Controller('salesforce')
export class SalesforceController {
  constructor(private readonly salesforce: SalesforceService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<SalesforceStatus> {
    return this.salesforce.getStatus(user.userId)
  }

  @Get('connect')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload, @Query() query: SalesforceConnectQueryDto): { url: string } {
    // #4431.2 — le domaine d'organisation saisi sur la carte (facultatif) et la case sandbox.
    return {
      url: this.salesforce.buildAuthorizeUrl(user.userId, { domain: query.domain, sandbox: query.sandbox === 'true' }),
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readSalesforceConfig()?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    // #4431.4 — Salesforce rend `error` / `error_description` quand il refuse le consentement (domaine exigé,
    // application non approuvée…). Son texte voyage jusqu'à la carte : jamais un échec muet.
    const refusal = (errorDescription ?? error)?.trim()
    if (refusal) return back(`salesforce=error&reason=${encodeURIComponent(refusal.slice(0, 300))}`)
    if (!code || !state) return back('salesforce=error&reason=missing_code')
    const result = await this.salesforce.handleCallback(code, state)
    return result.ok ? back('salesforce=connected') : back(`salesforce=error&reason=${result.reason ?? 'unknown'}`)
  }

  // #4186.1 — l'export de contact vers ce CRM passe désormais par la porte
  // commune : `POST /crm/push/contact` (`provider: 'salesforce'`). Cette route
  // écrivait en direct, sans trace ni prévisualisation.

  /**
   * Déconnecte — et révoque server-side. `revoked: false` + `warning` disent à
   * l'écran que Salesforce n'a pas confirmé la révocation : la déconnexion
   * locale a quand même eu lieu (jamais un 204 silencieux qui masquerait
   * l'échec).
   */
  @Delete()
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<SalesforceDisconnectResult> {
    return this.salesforce.disconnect(user.userId)
  }
}
