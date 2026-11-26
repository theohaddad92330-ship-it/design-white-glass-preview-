import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Repository } from 'typeorm'
import { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
// Reuse the CRM module's AES-256-GCM token helper — same "encrypt OAuth secrets
// at rest" need, same key derivation.
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { IaClient, type IaEnvelope } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { readNotionConfig, type NotionConfig } from './notion-config'
import { NotionClient, type NotionPageSummary, type NotionTokens } from './notion.client'

/** OAuth `state` is valid for 10 minutes — long enough for consent, short
 *  enough to bound replay. */
const STATE_TTL_MS = 10 * 60 * 1000
const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'

export type NotionStatus = {
  configured: boolean
  connected: boolean
  provider?: 'notion'
  accountLabel?: string | null
  connectedAt?: string
}

type CallbackResult = { ok: boolean; reason?: string }

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name)

  constructor(
    @InjectRepository(NotionConnectionEntity)
    private readonly connections: Repository<NotionConnectionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly ia: IaClient,
  ) {}

  private requireConfig(): NotionConfig {
    const config = readNotionConfig()
    if (!config) throw new ServiceUnavailableException('Notion integration is not configured on this server')
    return config
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim() || process.env['NOTION_CLIENT_SECRET']?.trim()
    if (!secret) throw new Error('Notion state signing requires INTERNAL_API_SECRET or NOTION_CLIENT_SECRET')
    return secret
  }

  /** Sign `userId` into a tamper-proof, short-lived OAuth state parameter. */
  private signState(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  /** Verify + decode a state parameter, returning the userId or throwing. */
  private verifyState(state: string): string {
    const [payload, sig] = state.split('.')
    if (!payload || !sig) throw new BadRequestException('Invalid state')
    const expected = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('Bad state signature')
    let decoded: { u?: string; t?: number }
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      throw new BadRequestException('Corrupt state')
    }
    if (!decoded.u || typeof decoded.t !== 'number' || Date.now() - decoded.t > STATE_TTL_MS) {
      throw new BadRequestException('Expired state')
    }
    return decoded.u
  }

  /** Connection status for the caller's workspace. Returns early WITHOUT touching
   *  the DB when Notion isn't configured — keeps the endpoint healthy even if the
   *  migration hasn't run in that environment. */
  async getStatus(userId: string): Promise<NotionStatus> {
    if (readNotionConfig() === null) return { configured: false, connected: false }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const conn = await this.connections.findOne({ where: workspaceScopeWhere(workspaceId) })
    if (!conn) return { configured: true, connected: false }
    return {
      configured: true,
      connected: true,
      provider: 'notion',
      accountLabel: conn.workspace_name,
      connectedAt: conn.created_at?.toISOString(),
    }
  }

  /** Build the Notion consent URL the browser is redirected to. */
  buildAuthorizeUrl(userId: string): string {
    const config = this.requireConfig()
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      owner: 'user',
      state: this.signState(userId),
    })
    return `${NOTION_AUTHORIZE_URL}?${params.toString()}`
  }

  /** Handle the OAuth redirect: exchange the code, persist an encrypted
   *  connection. Never throws to the browser — the controller turns the result
   *  into a redirect with a friendly reason. */
  async handleCallback(code: string, state: string): Promise<CallbackResult> {
    let userId: string
    try {
      userId = this.verifyState(state)
    } catch {
      return { ok: false, reason: 'invalid_state' }
    }
    try {
      const config = this.requireConfig()
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const tokens = await new NotionClient(config).exchangeCode(code)
      if (!tokens.accessToken) return { ok: false, reason: 'exchange_failed' }
      await this.upsertConnection(userId, workspaceId, tokens)
      return { ok: true }
    } catch (error) {
      this.logger.error('Notion OAuth callback failed', { error, user: { id: userId } })
      return { ok: false, reason: 'exchange_failed' }
    }
  }

  private async upsertConnection(userId: string, workspaceId: string, tokens: NotionTokens): Promise<void> {
    const existing = await this.connections.findOne({ where: workspaceScopeWhere(workspaceId) })
    const patch = {
      user_id: userId,
      workspace_id: workspaceId,
      notion_workspace_id: tokens.workspaceId,
      workspace_name: tokens.workspaceName ?? 'Notion',
      bot_id: tokens.botId,
      access_token_enc: encryptToken(tokens.accessToken),
    }
    if (existing) {
      await this.connections.update({ id: existing.id }, patch)
    } else {
      await this.connections.insert(patch)
    }
  }

  /** Decrypt the workspace's Notion access token (Notion tokens don't expire, so
   *  there is no refresh flow). */
  private async getAccessToken(workspaceId: string): Promise<string> {
    const conn = await this.connections.findOne({ where: workspaceScopeWhere(workspaceId) })
    if (!conn) throw new NotFoundException('No Notion connection')
    return decryptToken(conn.access_token_enc)
  }

  /** List the pages and databases shared with the connected integration. */
  async listPages(userId: string, query?: string): Promise<NotionPageSummary[]> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getAccessToken(workspaceId)
    return new NotionClient(config).listPages(accessToken, query ?? '')
  }

  /**
   * Ingest a Notion page into the caller's RAG store: fetch the page's block text
   * and hand it to the EXISTING RAG ingestion pipeline (IaClient.ragIngest → the
   * IA service persists it in `rag_documents`). No new ingestion path is created.
   */
  async ingestPage(userId: string, input: { pageId: string; title?: string; category?: string }): Promise<IaEnvelope> {
    const config = this.requireConfig()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accessToken = await this.getAccessToken(workspaceId)

    const content = await new NotionClient(config).fetchPageText(accessToken, input.pageId)
    if (!content.trim()) {
      throw new BadRequestException('La page Notion ne contient aucun texte à indexer')
    }

    return this.ia.ragIngest({
      userId,
      workspaceId,
      title: input.title?.trim() || 'Page Notion',
      content,
      category: input.category?.trim() || 'Notion',
    })
  }

  /** Drop the workspace's Notion connection (does not revoke server-side at Notion). */
  async disconnect(userId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.connections.delete(workspaceScopeWhere(workspaceId))
  }
}
