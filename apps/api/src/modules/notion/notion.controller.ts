import { connectorSearchResult, type ConnectorSearchResult } from '@bellum/contracts'
import { Body, Controller, Delete, Get, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaEnvelope } from '../ia/ia.client'
import { JwtGuard } from '../auth/jwt.guard'
import { NotionIngestDto } from './dto/notion.dto'
import { readNotionConfig } from './notion-config'
import type { NotionPageSummary } from './notion.client'
import { NotionService, type NotionStatus } from './notion.service'

/**
 * Notion OAuth integration. Most routes are JWT-guarded and derive the user from
 * the token. The `callback` is the exception: it is a top-level browser redirect
 * from Notion, so it can't carry our JWT — the caller is authenticated by a
 * signed, short-lived `state` (see NotionService), and the handler bounces the
 * browser back to the SPA rather than returning JSON. The whole controller is
 * inert until NOTION_* env vars are set.
 */
@Controller('notion')
export class NotionController {
  constructor(private readonly notion: NotionService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<NotionStatus> {
    return this.notion.getStatus(user.userId)
  }

  @Get('connect')
  @UseGuards(JwtGuard)
  connect(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.notion.buildAuthorizeUrl(user.userId) }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readNotionConfig()?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:5173'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)

    if (!code || !state) return back('notion=error&reason=missing_code')
    const result = await this.notion.handleCallback(code, state)
    return result.ok ? back('notion=connected') : back(`notion=error&reason=${result.reason ?? 'unknown'}`)
  }

  /** List the pages/databases shared with the connected integration. */
  @Get('pages')
  @UseGuards(JwtGuard)
  async pages(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
  ): Promise<ConnectorSearchResult<NotionPageSummary>> {
    // Qualifiée : « aucune page partagée » et « je n'ai pas le droit de
    // regarder » ne peuvent plus se lire pareil.
    return connectorSearchResult(await this.notion.listPages(user.userId, q))
  }

  /** Ingest a selected Notion page into the caller's RAG store. */
  @Post('ingest')
  @UseGuards(JwtGuard)
  ingest(@CurrentUser() user: CurrentUserPayload, @Body() dto: NotionIngestDto): Promise<IaEnvelope> {
    return this.notion.ingestPage(user.userId, { pageId: dto.pageId, title: dto.title, category: dto.category })
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.notion.disconnect(user.userId)
  }
}
