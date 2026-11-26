import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { connectorSearchResult, type ConnectorSearchResult } from '@bellum/contracts'
import { connectorMessage, scopeMissing } from '../../common/connector-error'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { MicrosoftCalendarEventDto, MicrosoftSendMailDto } from './dto/microsoft.dto'
import type { CalendarEventResult } from './microsoft.client'
import { microsoftFrontendOrigin, readMicrosoftConfig } from './microsoft-config'
import { FILES_READ_SCOPE, MicrosoftService, type MicrosoftStatus } from './microsoft.service'

/**
 * Microsoft 365 / Outlook OAuth integration (Microsoft Graph — Mail + Calendar).
 * Most routes are JWT-guarded and derive the user from the token. The `callback`
 * is the exception: it is a top-level browser redirect from Microsoft, so it
 * can't carry our JWT — the caller is authenticated by a signed, short-lived
 * `state` (see MicrosoftService), and the handler bounces the browser back to
 * the SPA rather than returning JSON. The whole controller is inert until
 * MICROSOFT_* env vars are set.
 */
@Controller('microsoft')
export class MicrosoftController {
  constructor(private readonly microsoft: MicrosoftService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<MicrosoftStatus> {
    return this.microsoft.getStatus(user.userId)
  }

  /**
   * #4546 — Liste TOUTES les connexions Microsoft du commercial.
   *
   * Un commercial peut connecter plusieurs boîtes Outlook. La liste sert à
   * l'écran Intégrations pour afficher chaque boîte et sa ligne « Déconnecter ».
   */
  @Get('connections')
  @UseGuards(JwtGuard)
  listConnections(@CurrentUser() user: CurrentUserPayload) {
    return this.microsoft.listConnections(user.userId)
  }

  @Get('authorize')
  @UseGuards(JwtGuard)
  authorize(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.microsoft.buildAuthorizeUrl(user.userId) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readMicrosoftConfig()?.frontendUrl ?? microsoftFrontendOrigin()
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    if (!code || !state) return back('microsoft=error&reason=missing_code')
    const result = await this.microsoft.handleCallback(code, state)
    return result.ok ? back('microsoft=connected') : back(`microsoft=error&reason=${result.reason ?? 'unknown'}`)
  }

  /** Send a single email through the connected mailbox (one recipient/call + opt-out). */
  @Post('mail/send')
  @UseGuards(JwtGuard)
  sendMail(@CurrentUser() user: CurrentUserPayload, @Body() dto: MicrosoftSendMailDto): Promise<{ to: string }> {
    return this.microsoft.sendMail(user.userId, dto)
  }

  /** Create an Outlook calendar event on the connected mailbox. */
  @Post('calendar/events')
  @UseGuards(JwtGuard)
  createEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: MicrosoftCalendarEventDto,
  ): Promise<CalendarEventResult> {
    return this.microsoft.createCalendarEvent(user.userId, dto)
  }

  /**
   * Cherche dans l'espace documentaire (garde-fou n°25, côté Microsoft 365).
   *
   * Quand la portée documentaire manque, on le DIT au lieu de rendre une liste
   * vide. Mesuré en production le 16/08 : un compte branché avant l'ajout de la
   * portée rendait `[]` sur chaque recherche — indiscernable de « tu n'as aucun
   * document », et rien à l'écran pour s'en douter. Les appels internes (couche
   * zéro) gardent le repli silencieux : eux n'ont personne à prévenir, ils
   * doivent seulement continuer sans cette source.
   */
  @Get('files/search')
  @UseGuards(JwtGuard)
  async searchFiles(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q: string,
  ): Promise<
    ConnectorSearchResult<{
      id: string
      name: string
      mimeType: string | null
      modifiedAt: string | null
      webUrl: string | null
    }>
  > {
    const status = await this.microsoft.getStatus(user.userId)
    if (status.connected && status.capabilities && !status.capabilities.files) {
      // La portée est NOMMÉE. « Il manque un accès » n'apprend rien à
      // l'opérateur qui doit la déclarer côté fournisseur ; `Files.Read.All`
      // lui dit exactement quoi cocher.
      throw scopeMissing({
        provider: 'microsoft',
        capability: 'documents',
        scopes: [FILES_READ_SCOPE],
        message: connectorMessage('scope_missing', 'ton espace documentaire'),
      })
    }
    const items = await this.microsoft.searchFiles(user.userId, { query: q ?? '' })
    // Une liste vide QUALIFIÉE : `searched` dit que la recherche est bien
    // partie. Sans lui, zéro résultat et « pas le droit de regarder » ont
    // exactement la même apparence — c'était la pire des trois pannes du 16/08.
    return connectorSearchResult(items)
  }

  /**
   * Déconnecte toutes les connexions Microsoft (sans ID) ou une connexion précise.
   *
   * #4546 — `:connectionId` cible UNE boîte parmi plusieurs.
   */
  @Delete(['', ':connectionId'])
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async disconnect(
    @CurrentUser() user: CurrentUserPayload,
    @Param('connectionId') connectionId?: string,
  ): Promise<void> {
    await this.microsoft.disconnect(user.userId, connectionId)
  }
}
