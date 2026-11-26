import { Controller, Delete, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { readZohoConfig, zohoFailureReason } from './zoho-config'
import { ZohoService, type ZohoDisconnectResult, type ZohoStatus } from './zoho.service'

/**
 * #4187 — Zoho CRM OAuth. Routes JWT-guarded, sauf `callback` : redirection
 * navigateur depuis Zoho, authentifiée par le `state` signé, qui renvoie le
 * navigateur vers l'application. Inerte tant que ZOHO_* n'est pas posé.
 *
 * L'export de contact/compte/besoin n'a PAS de route ici : il passe par la porte
 * commune (`POST /crm/push*`, #4186).
 */
@Controller('zoho')
export class ZohoController {
  constructor(private readonly zoho: ZohoService) {}

  /** Le statut du lien de l'espace : de la donnée d'espace que tout membre peut voir (comme la carte des intégrations). */
  @Get('status')
  @UseGuards(JwtGuard)
  @WorkspaceRead()
  status(@CurrentUser() user: CurrentUserPayload): Promise<ZohoStatus> {
    return this.zoho.getStatus(user.userId)
  }

  /** Brancher le CRM de l'ESPACE est un geste d'administration des intégrations. */
  @Get('connect')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.zoho.buildAuthorizeUrl(user.userId) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('location') location: string | undefined,
    @Query('accounts-server') accountsServer: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const config = readZohoConfig()
    const frontendUrl = config?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)
    // #4380 — la raison est un texte lisible (centre de données + URI attendus), jamais une valeur de clé.
    const failed = (reason: string) =>
      back(`zoho=error&reason=${encodeURIComponent(zohoFailureReason(reason, config))}`)

    if (error) return failed(error.slice(0, 64))
    if (!code || !state) return failed('missing_code')
    const result = await this.zoho.handleCallback(code, state, { location, accountsServer })
    return result.ok ? back('zoho=connected') : failed(result.reason ?? 'unknown')
  }

  /** Déconnecte — et révoque server-side ; `revoked: false` + `warning` quand Zoho n'a pas confirmé. */
  @Delete()
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<ZohoDisconnectResult> {
    return this.zoho.disconnect(user.userId)
  }
}
