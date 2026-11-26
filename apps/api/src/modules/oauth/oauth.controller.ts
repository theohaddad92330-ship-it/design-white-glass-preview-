import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { JwtGuard } from '../auth/jwt.guard'
import { MCP_SCOPES, readOAuthConfig } from './oauth-config'
import { OAuthClientsService } from './oauth-clients.service'
import { OAuthConsentService, parseScope } from './oauth-consent.service'
import { OAuthGrantsService } from './oauth-grants.service'
import { buildAuthServerMetadata } from './oauth-metadata'
import { OAuthService } from './oauth.service'
import { renderConsentPage, renderErrorPage } from './oauth-view'
import { OptionalJwtGuard } from './optional-jwt.guard'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'

type AuthedRequest = Request & { user?: CurrentUserPayload }

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Append query params to a validated redirect URI (handles existing query). */
function redirectWith(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  return url.toString()
}

@Controller()
export class OAuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly clients: OAuthClientsService,
    private readonly grants: OAuthGrantsService,
    private readonly consent: OAuthConsentService,
    private readonly oauth: OAuthService,
    private readonly brands: WorkspaceBrandService,
  ) {}

  private cfg() {
    return readOAuthConfig(this.config)
  }

  // ── RFC 8414 Authorization Server Metadata ────────────────────────────────
  @Get('.well-known/oauth-authorization-server')
  metadata() {
    const { enabled, issuer } = this.cfg()
    if (!enabled) throw new NotFoundException('MCP OAuth is not enabled')
    return buildAuthServerMetadata(issuer)
  }

  // ── RFC 7591 Dynamic Client Registration ──────────────────────────────────
  @Post('oauth/register')
  @HttpCode(201)
  // Tighter than the global throttle: DCR is unauthenticated and must not be a
  // free client-minting endpoint.
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async register(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    if (!this.cfg().enabled) {
      res.status(503).json({ error: 'temporarily_unavailable', error_description: 'MCP is not enabled' })
      return
    }
    try {
      const registered = await this.clients.register({
        redirect_uris: Array.isArray(body['redirect_uris']) ? (body['redirect_uris'] as string[]) : [],
        client_name: typeof body['client_name'] === 'string' ? body['client_name'] : undefined,
        scope: typeof body['scope'] === 'string' ? body['scope'] : undefined,
      })
      res.status(201).json(registered)
    } catch (err) {
      const payload = (err as { response?: unknown })?.response ?? { error: 'invalid_client_metadata' }
      res.status(400).json(payload)
    }
  }

  // ── Authorization endpoint ────────────────────────────────────────────────
  @Get('oauth/authorize')
  @UseGuards(OptionalJwtGuard)
  async authorize(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query() query: Record<string, string>,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    const { enabled, issuer, resource } = this.cfg()
    if (!enabled) {
      res.status(404).send(renderErrorPage('Indisponible', 'La connexion MCP n’est pas activée sur ce serveur.'))
      return
    }

    const clientId = str(query['client_id'])
    const redirectUri = str(query['redirect_uri'])
    const client = await this.clients.findByClientId(clientId)

    // Step 1 — validate client + redirect BEFORE anything else. On failure we
    // must NOT redirect (open-redirect prevention): show an on-domain page.
    if (!client || !redirectUri || !this.clients.isRegisteredRedirectUri(client, redirectUri)) {
      res.status(400).send(renderErrorPage('Requête invalide', 'client_id ou redirect_uri inconnu.'))
      return
    }

    const state = str(query['state'])

    // Step 2 — validate the rest; errors now redirect back to the trusted URI.
    if (str(query['response_type']) !== 'code') {
      res.redirect(redirectWith(redirectUri, { error: 'unsupported_response_type', state }))
      return
    }
    const codeChallenge = str(query['code_challenge'])
    if (!codeChallenge || str(query['code_challenge_method']) !== 'S256') {
      res.redirect(
        redirectWith(redirectUri, { error: 'invalid_request', error_description: 'PKCE S256 required', state }),
      )
      return
    }
    const requestedScope = str(query['scope']) || 'mcp:read'
    const scopes = parseScope(requestedScope)
    if (scopes.length === 0 || !scopes.every(s => (MCP_SCOPES as readonly string[]).includes(s))) {
      res.redirect(redirectWith(redirectUri, { error: 'invalid_scope', state }))
      return
    }
    const requestedResource = str(query['resource'])
    if (requestedResource && requestedResource.replace(/\/$/, '') !== resource) {
      res.redirect(redirectWith(redirectUri, { error: 'invalid_target', error_description: 'unknown resource', state }))
      return
    }

    // Step 3 — authenticate the Bellum user via the session cookie. Not logged
    // in → bounce to the web login, which returns here after a full navigation.
    const user = req.user
    if (!user) {
      const selfUrl = `${issuer}${req.originalUrl}`
      const frontendUrl = (this.config.get<string>('frontendUrl') ?? '').replace(/\/$/, '')
      res.redirect(`${frontendUrl}/login?returnTo=${encodeURIComponent(selfUrl)}`)
      return
    }

    const normalizedScope = scopes.join(' ')

    // Step 4 — skip consent if already granted for this scope; else render it.
    const existing = await this.consent.findActiveConsent(user.userId, clientId)
    if (existing && parseScope(requestedScope).every(s => parseScope(existing.scope).includes(s))) {
      const code = await this.grants.createAuthorizationCode({
        clientId,
        userId: user.userId,
        redirectUri,
        scope: normalizedScope,
        resource,
        codeChallenge,
        codeChallengeMethod: 'S256',
      })
      res.redirect(redirectWith(redirectUri, { code, state }))
      return
    }

    const consentToken = this.consent.signConsentToken(user.userId, clientId, normalizedScope)
    res.status(200).send(
      renderConsentPage({
        // La marque de l'espace : cet écran est un écran de CONFIANCE, et le
        // nom d'un fournisseur inconnu est ce qui y fait renoncer.
        brandName: (await this.brands.getForUser(user.userId)).name,
        clientName: client.client_name || clientId,
        scope: normalizedScope,
        consentToken,
        userEmail: user.email || '',
        hidden: {
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: normalizedScope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          resource,
        },
      }),
    )
  }

  // ── Consent decision ──────────────────────────────────────────────────────
  @Post('oauth/authorize/decision')
  @UseGuards(OptionalJwtGuard)
  async decision(@Req() req: AuthedRequest, @Res() res: Response, @Body() body: Record<string, string>): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    const user = req.user
    if (!user) {
      res.status(401).send(renderErrorPage('Session expirée', 'Reconnectez-vous puis relancez l’autorisation.'))
      return
    }

    const clientId = str(body['client_id'])
    const redirectUri = str(body['redirect_uri'])
    const state = str(body['state'])

    // Re-validate client + redirect (never trust the form blindly).
    const client = await this.clients.findByClientId(clientId)
    if (!client || !redirectUri || !this.clients.isRegisteredRedirectUri(client, redirectUri)) {
      res.status(400).send(renderErrorPage('Requête invalide', 'client_id ou redirect_uri inconnu.'))
      return
    }

    // CSRF: verify the signed token AND that it binds THIS user + client.
    let verified: { userId: string; clientId: string; scope: string }
    try {
      verified = this.consent.verifyConsentToken(str(body['consent_token']))
    } catch {
      res.status(403).send(renderErrorPage('Autorisation refusée', 'Jeton de consentement invalide ou expiré.'))
      return
    }
    if (verified.userId !== user.userId || verified.clientId !== clientId) {
      res
        .status(403)
        .send(renderErrorPage('Autorisation refusée', 'Le consentement ne correspond pas à votre session.'))
      return
    }

    if (str(body['decision']) !== 'approve') {
      res.redirect(redirectWith(redirectUri, { error: 'access_denied', state }))
      return
    }

    const resource = this.cfg().resource
    const scope = verified.scope
    await this.consent.grantConsent(user.userId, clientId, scope, resource)
    const code = await this.grants.createAuthorizationCode({
      clientId,
      userId: user.userId,
      redirectUri,
      scope,
      resource,
      codeChallenge: str(body['code_challenge']),
      codeChallengeMethod: 'S256',
    })
    res.redirect(redirectWith(redirectUri, { code, state }))
  }

  // ── Token endpoint ────────────────────────────────────────────────────────
  @Post('oauth/token')
  @HttpCode(200)
  async token(@Body() body: Record<string, string>, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    if (!this.cfg().enabled) {
      res.status(503).json({ error: 'temporarily_unavailable' })
      return
    }
    const grantType = str(body['grant_type'])
    let result
    if (grantType === 'authorization_code') {
      result = await this.oauth.exchangeAuthorizationCode({
        code: str(body['code']),
        redirectUri: str(body['redirect_uri']),
        clientId: str(body['client_id']),
        codeVerifier: str(body['code_verifier']) || undefined,
      })
    } else if (grantType === 'refresh_token') {
      result = await this.oauth.exchangeRefreshToken({
        refreshToken: str(body['refresh_token']),
        clientId: str(body['client_id']),
        scope: str(body['scope']) || undefined,
      })
    } else {
      res.status(400).json({ error: 'unsupported_grant_type' })
      return
    }

    if (OAuthService.isError(result)) {
      const status = result.error === 'invalid_client' ? 401 : 400
      res.status(status).json(result)
      return
    }
    res.status(200).json(result)
  }

  // ── Token introspection (internal — resource server only) ─────────────────
  @Post('oauth/introspect')
  @HttpCode(200)
  @UseGuards(InternalSecretGuard)
  async introspect(@Body() body: Record<string, string>) {
    return this.oauth.introspect(str(body['token']))
  }

  // ── Connected apps management (browser, JWT) ──────────────────────────────
  @Get('oauth/connections')
  @UseGuards(JwtGuard)
  async listConnections(@CurrentUser() user: CurrentUserPayload) {
    const grants = await this.consent.listConnections(user.userId)
    const enriched = await Promise.all(
      grants.map(async g => {
        const client = await this.clients.findByClientId(g.client_id)
        return {
          id: g.id,
          client_id: g.client_id,
          client_name: client?.client_name ?? g.client_id,
          scope: g.scope,
          created_at: g.created_at,
        }
      }),
    )
    return enriched
  }

  @Delete('oauth/connections/:id')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async revokeConnection(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string): Promise<void> {
    const grants = await this.consent.listConnections(user.userId)
    const target = grants.find(g => g.id === id)
    await this.consent.revokeConnection(user.userId, id)
    if (target) await this.grants.revokeForClient(user.userId, target.client_id)
  }
}
