import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { connectorSearchResult, type ConnectorSearchResult } from '@bellum/contracts'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import {
  CreateCalendarEventDto,
  DriveFilesQueryDto,
  DriveIngestDto,
  DriveSearchQueryDto,
  ExportSheetDto,
  GmailThreadsQueryDto,
  GoogleAuthorizeQueryDto,
  SendGmailDto,
  GoogleClassifyMessageDto,
  UpcomingEventsQueryDto,
} from './dto/google.dto'
import { frontendOrigin, readGoogleConfig } from './google-config'
import type {
  CalendarEventSummary,
  CreatedCalendarEvent,
  CreatedDraft,
  CreatedSpreadsheet,
  DriveFilePage,
  GmailMessageSummary,
} from './google.client'
import { GoogleService, type GoogleStatus } from './google.service'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'

/**
 * Google Workspace OAuth integration (Calendar / Gmail / Drive). Most routes are
 * JWT-guarded and derive the user from the token. The `callback` is the exception:
 * it is a top-level browser redirect from Google, so it can't carry our JWT — the
 * caller is authenticated by a signed, short-lived `state` (see GoogleService),
 * and the handler bounces the browser back to the SPA rather than returning JSON.
 * The whole controller is inert until GOOGLE_* env vars are set (no-op).
 */
@Controller('google')
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<GoogleStatus> {
    return this.google.getStatus(user.userId)
  }

  /**
   * #4546 — Liste TOUTES les connexions Google du commercial.
   *
   * Un commercial peut connecter plusieurs boîtes Gmail. La liste sert à
   * l'écran Intégrations pour afficher chaque boîte et sa ligne « Déconnecter ».
   */
  @Get('connections')
  @UseGuards(JwtGuard)
  listConnections(@CurrentUser() user: CurrentUserPayload) {
    return this.google.listConnections(user.userId)
  }

  /**
   * Returns the Google consent URL the SPA navigates the browser to.
   * #2078.23 — `?level=read|read_write` choisit la liste de portées ; le niveau
   * est obligatoire (400 sinon) et ne voyage pas dans le `state`.
   */
  @Get('authorize')
  @UseGuards(JwtGuard)
  authorize(@CurrentUser() user: CurrentUserPayload, @Query() query: GoogleAuthorizeQueryDto): { url: string } {
    return { url: this.google.buildAuthorizeUrl(user.userId, query.level) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readGoogleConfig()?.frontendUrl ?? frontendOrigin()
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    if (!code || !state) return back('google=error&reason=missing_code')
    const result = await this.google.handleCallback(code, state)
    return result.ok ? back('google=connected') : back(`google=error&reason=${result.reason ?? 'unknown'}`)
  }

  /** Create a Calendar event / relance reminder. */
  @Post('calendar/events')
  @UseGuards(JwtGuard)
  createEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCalendarEventDto,
  ): Promise<CreatedCalendarEvent> {
    return this.google.createCalendarEvent(user.userId, dto)
  }

  /** Send a single email from the user's connected Gmail mailbox. */
  @Post('gmail/send')
  @UseGuards(JwtGuard)
  sendGmail(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendGmailDto,
  ): Promise<{ id: string; threadId: string | null }> {
    return this.google.sendGmail(user.userId, dto)
  }

  /** Compose a Gmail draft (review-first — NOT sent). */
  @Post('gmail/draft')
  @UseGuards(JwtGuard)
  createDraft(@CurrentUser() user: CurrentUserPayload, @Body() dto: SendGmailDto): Promise<CreatedDraft> {
    return this.google.createGmailDraft(user.userId, dto)
  }

  /** Read recent Gmail exchanges with one contact (metadata only). */
  @Get('gmail/threads')
  @UseGuards(JwtGuard)
  async gmailThreads(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: GmailThreadsQueryDto,
  ): Promise<ConnectorSearchResult<GmailMessageSummary>> {
    // Qualifiée : « aucun échange avec ce contact » est une information de
    // vente ; « je n'ai pas le droit de lire ta messagerie » en est une autre.
    return connectorSearchResult(
      await this.google.listGmailWithContact(user.userId, { email: query.email, maxResults: query.maxResults }),
    )
  }

  /** List upcoming calendar events, optionally filtered by an account domain/name. */
  @Get('calendar/events/upcoming')
  @UseGuards(JwtGuard)
  async upcomingEvents(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: UpcomingEventsQueryDto,
  ): Promise<ConnectorSearchResult<CalendarEventSummary>> {
    // C'est exactement ici qu'un agenda plein s'est affiché vide le 16/08.
    return connectorSearchResult(
      await this.google.listUpcomingEvents(user.userId, { query: query.query, maxResults: query.maxResults }),
    )
  }

  /** Export a contacts grid into a new Google Sheet in the user's Drive. */
  @Post('sheets/export')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  exportSheet(@CurrentUser() user: CurrentUserPayload, @Body() dto: ExportSheetDto): Promise<CreatedSpreadsheet> {
    return this.google.exportSheet(user.userId, dto)
  }

  /** List the user's Drive Google Docs + PDFs (paginated). */
  @Get('drive/files')
  @UseGuards(JwtGuard)
  driveFiles(@CurrentUser() user: CurrentUserPayload, @Query() query: DriveFilesQueryDto): Promise<DriveFilePage> {
    return this.google.listDriveFiles(user.userId, {
      pageSize: query.pageSize,
      pageToken: query.pageToken,
      search: query.search,
    })
  }

  /** Ingest a selected Drive document into the existing RAG store. */
  /**
   * Cherche dans le CONTENU des documents (garde-fou n°25). Un CV s'appelle
   * presque toujours `CV_2024_v3.pdf` : chercher « Java » dans les NOMS ne rend
   * jamais rien, et l'utilisateur en conclut qu'il n'a pas le document.
   */
  @Get('drive/search')
  @UseGuards(JwtGuard)
  async searchDrive(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: DriveSearchQueryDto,
  ): Promise<ConnectorSearchResult<DriveFilePage['files'][number]> & { nextPageToken: string | null }> {
    const page = await this.google.searchDriveContent(user.userId, { query: query.q, pageSize: query.pageSize })
    // `searched: true` est le mot qui manquait. Un tableau vide ne dit pas s'il
    // n'y avait rien ou si on n'avait pas le droit de regarder ; désormais le
    // 200 dit « j'ai cherché » et le 503 dit « je n'ai pas pu ».
    return { ...connectorSearchResult(page.files), nextPageToken: page.nextPageToken }
  }

  @Post('drive/ingest')
  @UseGuards(JwtGuard)
  driveIngest(@CurrentUser() user: CurrentUserPayload, @Body() dto: DriveIngestDto) {
    return this.google.ingestDriveFile(user.userId, dto.fileId)
  }

  /**
   * Déconnecte toutes les connexions Google (sans ID) ou une connexion précise.
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
    await this.google.disconnect(user.userId, connectionId)
  }
  /**
   * Classe un message : étiquette, et archivage si demandé.
   *
   * Demande la portée RESTREINTE `gmail.modify`, absente du défaut. Sans elle,
   * le service refuse avec un message lisible — le bouton ne doit pas exister
   * côté écran, mais la route ne fait pas confiance à l'écran.
   */
  @Post('gmail/classify')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  classifyMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: GoogleClassifyMessageDto,
  ): Promise<{ id: string; labelIds: string[] }> {
    return this.google.classifyMessage(user.userId, dto)
  }
}
