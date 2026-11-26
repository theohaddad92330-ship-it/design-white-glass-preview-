import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { AtsConnectResult, AtsSnapshot, AtsStatus, AtsTestResult } from '@bellum/contracts'
import { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { demoAtsConnection } from '../demo/demo-dataset'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  readBoondManagerConfig,
  readBoondManagerOAuthApp,
  type BoondManagerConfig,
} from '../zero-layer/boondmanager-config'
import { BoondManagerClient } from '../zero-layer/boondmanager.client'
import { AtsCredentialsService } from './ats-credentials.service'
import { BoondOAuthClient, newPkcePair, type BoondTokens } from './boond-oauth.client'
import {
  parseCandidate,
  parseConsultant,
  parseMission,
  parseNeed,
  selectBenched,
  selectEndedMissions,
  selectEndingMissions,
  selectInterviewedCandidates,
} from './ats-parse'

/** Fenêtre par défaut des alertes de fin de mission (rapport : J-30). */
const DEFAULT_ENDING_WITHIN_DAYS = 30
/** Seuil d'intercontrat du rapport : plus de 30 jours sans mission. */
const DEFAULT_BENCH_MIN_DAYS = 30
/** Durée de l'aller-retour d'autorisation (l'utilisateur lit l'écran de consentement de Boond). */
const STATE_TTL_MS = 10 * 60 * 1000

type OAuthCallbackResult =
  { ok: true } | { ok: false; reason: 'invalid_state' | 'missing_verifier' | 'not_configured' | 'exchange_failed' }

/**
 * L'ATS/ERP de l'ESN.
 *
 * Deux changements par rapport à ce qui existait (la source « couche zéro »
 * lisait BoondManager avec une variable d'environnement globale) :
 *
 * 1. **Les identifiants sont par ESPACE** (décision Louis du 03/08). Un SaaS
 *    multi-client ne peut pas partager un seul ATS entre toutes les ESN. La
 *    variable d'environnement reste en REPLI — un opérateur qui teste sur une
 *    instance interne n'a rien à refaire — et le statut dit laquelle des deux
 *    sert, parce que « ça marche chez moi mais pas chez le client » est
 *    exactement ce que cette distinction évite.
 * 2. **La lecture va au-delà des sociétés** : consultants, besoins ouverts,
 *    missions qui se terminent. Ce sont les quatre questions que se pose un
 *    business manager chaque semaine (§5.4 des méta-analyses).
 *
 * **Écrire est possible, mais jamais sans porte.** Bellum lit l'ERP, rapproche, alerte ; une écriture (création de
 * mission, TJM, statut d'un besoin) ne part qu'après la validation d'un responsable (`AtsWriteService`).
 *
 * **OAuth2 uniquement pour une connexion neuve** (#4688) : la Marketplace BoondManager interdit les jetons permanents.
 * Les connexions héritées (`user_token`, `client_jwt`) continuent de fonctionner à l'identique, mais plus aucun chemin
 * n'en crée. Les jetons OAuth2 sont chiffrés au repos et ne sont jamais journalisés ni rendus par une route.
 */
@Injectable()
export class AtsService {
  private readonly logger = new Logger(AtsService.name)

  constructor(
    @InjectRepository(AtsConnectionEntity)
    private readonly connections: Repository<AtsConnectionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // La SEULE résolution d'identifiants ATS du dépôt (#4687) — la couche zéro appelle la même.
    private readonly credentials: AtsCredentialsService,
  ) {}

  async status(userId: string): Promise<AtsStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    const oauthAvailable = readBoondManagerOAuthApp() !== null
    const rest = { lastExchangeAt: null, needsReconnect: false, scopes: null, instanceLabel: null, oauthAvailable }
    // Démonstration : l'écran montre une connexion « branchée » fictive (aucune ligne, aucun jeton, aucun appel sortant).
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      const demo = demoAtsConnection()
      return {
        connected: true,
        provider: 'boondmanager',
        authMode: 'oauth2',
        connectedAt: demo.connectedAt,
        fromEnvironment: false,
        ...rest,
        lastExchangeAt: demo.lastExchangeAt,
        scopes: demo.scopes,
        instanceLabel: demo.instanceLabel,
      }
    }
    if (row && (row.auth_mode !== 'oauth2' || row.access_token_enc)) {
      const oauth = row.auth_mode === 'oauth2'
      return {
        connected: true,
        provider: row.provider,
        authMode: row.auth_mode,
        connectedAt: row.created_at?.toISOString() ?? null,
        fromEnvironment: false,
        ...rest,
        lastExchangeAt: oauth ? (row.last_used_at?.toISOString() ?? null) : null,
        // Un refresh refusé, ou un jeton expiré sans refresh token : seul « reconnecter » répare.
        needsReconnect: oauth && (Boolean(row.refresh_failed_at) || this.expiredWithoutRefresh(row)),
        scopes: oauth ? (row.scopes ?? null) : null,
      }
    }
    // Repli serveur : la connexion existe, mais elle n'appartient pas à l'espace.
    // Le dire évite le « ça marche chez moi » qui ne marche pas chez le client.
    const env = readBoondManagerConfig()
    if (env) {
      return {
        connected: true,
        provider: 'boondmanager',
        authMode: env.userToken ? 'user_token' : 'client_jwt',
        connectedAt: null,
        fromEnvironment: true,
        ...rest,
      }
    }
    return { connected: false, provider: null, authMode: null, connectedAt: null, fromEnvironment: false, ...rest }
  }

  private expiredWithoutRefresh(row: AtsConnectionEntity): boolean {
    return !row.refresh_token_enc && Boolean(row.expires_at) && (row.expires_at as Date).getTime() <= Date.now()
  }

  /**
   * Démarre l'autorisation OAuth2 : PKCE S256, `state` signé. Le `code_verifier` reste côté serveur, chiffré, sur la
   * ligne de l'espace — jamais dans l'URL ni dans un cookie. Ne crée AUCUN secret collé.
   */
  async startOAuth(userId: string): Promise<AtsConnectResult> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException("La connexion d'un ATS est désactivée dans l'espace de démonstration.")
    }
    const app = readBoondManagerOAuthApp()
    if (!app) throw new BadRequestException("La connexion BoondManager n'est pas configurée sur ce serveur.")
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const { verifier, challenge } = newPkcePair()
    const state = this.signState(userId, workspaceId)
    const pending = {
      oauth_state_hash: this.hashState(state),
      oauth_verifier_enc: encryptToken(verifier),
      oauth_started_at: new Date(),
    }
    const existing = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (existing) {
      await this.connections.update({ id: existing.id }, pending)
    } else {
      await this.connections.save(
        this.connections.create({
          workspace_id: workspaceId,
          created_by: userId,
          provider: 'boondmanager',
          auth_mode: 'oauth2',
          credentials_enc: null,
          base_url: null,
          last_used_at: null,
          ...pending,
        }),
      )
    }
    return { url: new BoondOAuthClient(app).buildAuthorizeUrl({ state, codeChallenge: challenge }) }
  }

  /**
   * Le retour de Boond. Ne lève jamais vers le navigateur : rend une raison que le contrôleur transforme en redirection.
   * Un `state` invalide est refusé AVANT toute lecture ou écriture en base ; le `state` est à usage unique.
   */
  async completeOAuth(code: string, state: string): Promise<OAuthCallbackResult> {
    const app = readBoondManagerOAuthApp()
    if (!app) return { ok: false, reason: 'not_configured' }
    const signed = this.verifyState(state)
    if (!signed || !code) return { ok: false, reason: 'invalid_state' }

    const row = await this.connections.findOne({ where: { workspace_id: signed.workspaceId } })
    if (!row?.oauth_state_hash || !this.sameHash(row.oauth_state_hash, this.hashState(state))) {
      return { ok: false, reason: 'invalid_state' }
    }
    if (!row.oauth_started_at || Date.now() - row.oauth_started_at.getTime() > STATE_TTL_MS) {
      return { ok: false, reason: 'invalid_state' }
    }
    const burn = { oauth_state_hash: null, oauth_verifier_enc: null, oauth_started_at: null }
    if (!row.oauth_verifier_enc) {
      await this.connections.update({ id: row.id }, burn)
      return { ok: false, reason: 'missing_verifier' }
    }
    // Usage unique : le state est brûlé AVANT l'échange, qu'il réussisse ou non.
    const verifier = decryptToken(row.oauth_verifier_enc)
    await this.connections.update({ id: row.id }, burn)

    let tokens: BoondTokens
    try {
      tokens = await new BoondOAuthClient(app).exchangeCode(code, verifier)
    } catch (error) {
      this.logger.warn(`BoondManager OAuth code exchange failed: ${(error as Error).message}`)
      return { ok: false, reason: 'exchange_failed' }
    }
    await this.connections.update(
      { id: row.id },
      {
        auth_mode: 'oauth2' as const,
        // Reconnecter migre une connexion héritée : le secret collé n'a plus de raison d'exister.
        credentials_enc: null,
        ...this.credentials.tokenColumns(tokens, null),
        scopes: tokens.scope,
        last_used_at: new Date(),
        refresh_failed_at: null,
      },
    )
    return { ok: true }
  }

  private stateSecret(): string {
    const secret = process.env['INTERNAL_API_SECRET']?.trim()
    if (!secret) throw new Error('BoondManager OAuth state signing requires INTERNAL_API_SECRET')
    return secret
  }

  private signState(userId: string, workspaceId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, w: workspaceId, t: Date.now(), n: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  /** `null` = invalide (forme, signature, péremption) : aucune raison de toucher la base. */
  private verifyState(state: string): { userId: string; workspaceId: string } | null {
    const [payload, sig, extra] = String(state ?? '').split('.')
    if (!payload || !sig || extra !== undefined) return null
    const expected = createHmac('sha256', this.stateSecret()).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        u?: unknown
        w?: unknown
        t?: unknown
      }
      if (typeof decoded.u !== 'string' || typeof decoded.w !== 'string' || typeof decoded.t !== 'number') return null
      if (Date.now() - decoded.t > STATE_TTL_MS) return null
      return { userId: decoded.u, workspaceId: decoded.w }
    } catch {
      return null
    }
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex')
  }

  private sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && timingSafeEqual(x, y)
  }

  /**
   * Déconnecte l'espace : on RÉVOQUE chez Boond d'abord (une connexion supprimée chez nous ne laisse pas un jeton vivant
   * chez eux), puis on purge. Une révocation en échec ne retient pas l'utilisateur : la purge a lieu, l'échec est journalisé
   * sans jeton.
   */
  async disconnect(userId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (row?.auth_mode === 'oauth2') await this.revokeAtProvider(row)
    await this.connections.delete({ workspace_id: workspaceId })
  }

  private async revokeAtProvider(row: AtsConnectionEntity): Promise<void> {
    const app = readBoondManagerOAuthApp(row.base_url ?? undefined)
    if (!app) {
      this.logger.warn('BoondManager OAuth: App non configurée, révocation impossible avant la purge')
      return
    }
    const client = new BoondOAuthClient(app)
    const targets: Array<[string | null, 'access_token' | 'refresh_token']> = [
      [row.refresh_token_enc, 'refresh_token'],
      [row.access_token_enc, 'access_token'],
    ]
    for (const [enc, hint] of targets) {
      if (!enc) continue
      try {
        await client.revoke(decryptToken(enc), hint)
      } catch (error) {
        this.logger.warn(`BoondManager OAuth revoke (${hint}) failed: ${(error as Error).message}`)
      }
    }
  }

  /**
   * La configuration effective : celle de l'espace, sinon celle du serveur.
   * `null` = aucune ; l'appelant doit alors le DIRE, pas rendre une liste vide.
   */
  async resolveConfigFor(userId: string): Promise<BoondManagerConfig | null> {
    return this.resolveConfig(userId)
  }

  private async resolveConfig(userId: string): Promise<BoondManagerConfig | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.credentials.resolveForWorkspace(workspaceId)
  }

  /**
   * L'instantané hebdomadaire d'un business manager : ce qui se termine, qui
   * est sur le banc, ce qui est ouvert.
   *
   * Chaque bloc est indépendant (`allSettled`) : un endpoint de l'ERP en panne
   * ne doit pas effacer les deux autres réponses.
   */
  async snapshot(
    userId: string,
    options: {
      endingWithinDays?: number
      benchMinDays?: number
      /** #4065.9 — missions TERMINÉES depuis N jours (période passée). */
      endedSinceDays?: number
      /** #4065.9 — candidats vus en entretien depuis N jours : la liste des candidats n'est lue QUE sur demande. */
      interviewedSinceDays?: number
    } = {},
  ): Promise<AtsSnapshot> {
    const status = await this.status(userId)
    const empty: AtsSnapshot = { status, endingMissions: [], benchedConsultants: [], openNeeds: [] }
    if (!status.connected) return empty

    const config = await this.resolveConfig(userId)
    if (!config) return empty

    const client = new BoondManagerClient(config)
    const now = new Date()
    const [missions, consultants, needs, candidates] = await Promise.allSettled([
      client.listRecords('/deliveries'),
      client.listRecords('/resources'),
      client.listRecords('/opportunities'),
      options.interviewedSinceDays ? client.listRecords('/candidates') : Promise.resolve(null),
    ])

    const parsedMissions =
      missions.status === 'fulfilled'
        ? missions.value.flatMap(raw => {
            const mission = parseMission(raw, now)
            return mission ? [mission] : []
          })
        : []
    const parsedConsultants =
      consultants.status === 'fulfilled'
        ? consultants.value.flatMap(raw => {
            const consultant = parseConsultant(raw, now)
            return consultant ? [consultant] : []
          })
        : []
    const parsedNeeds =
      needs.status === 'fulfilled'
        ? needs.value.flatMap(raw => {
            const need = parseNeed(raw)
            return need ? [need] : []
          })
        : []

    // #4065.9 — `candidatesRead: false` = la liste n'a pas répondu : ce n'est PAS « aucun candidat vu ».
    const candidatesRead = candidates.status === 'fulfilled' && candidates.value !== null
    const parsedCandidates =
      candidates.status === 'fulfilled' && candidates.value
        ? candidates.value.flatMap(raw => {
            const candidate = parseCandidate(raw)
            return candidate ? [candidate] : []
          })
        : []

    return {
      status,
      endingMissions: selectEndingMissions(parsedMissions, options.endingWithinDays ?? DEFAULT_ENDING_WITHIN_DAYS),
      benchedConsultants: selectBenched(parsedConsultants, options.benchMinDays ?? DEFAULT_BENCH_MIN_DAYS),
      openNeeds: parsedNeeds.slice(0, 25),
      ...(options.endedSinceDays ? { endedMissions: selectEndedMissions(parsedMissions, options.endedSinceDays) } : {}),
      ...(options.interviewedSinceDays
        ? {
            candidatesRead,
            interviewedCandidates: selectInterviewedCandidates(parsedCandidates, options.interviewedSinceDays, now),
          }
        : {}),
    }
  }

  /** Vérifie que les identifiants saisis répondent, avant de dire « connecté ». */
  async test(userId: string): Promise<AtsTestResult> {
    // Démonstration : la connexion « branchée » est fictive (aucun jeton, aucun appel sortant) — le verdict l'est aussi.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return { reachable: true, warnings: demoAtsConnection().warnings }
    }
    const config = await this.resolveConfig(userId)
    if (!config) throw new BadRequestException('Aucun ATS connecté.')
    try {
      const client = new BoondManagerClient(config)
      // #4690 — « qui suis-je et quels droits ai-je ? » : Tier 1, au lieu d'une liste de ressources en Tier 2.
      const reachable = await client.probeCurrentUser()
      // #4688.11 — `meta.warnings` de l'éditeur : remontés à l'écran Intégrations, plus avalés.
      return { reachable, warnings: client.responseWarnings }
    } catch (error) {
      this.logger.warn(`ATS reachability probe failed: ${(error as Error).message}`)
      return { reachable: false, warnings: [] }
    }
  }
}
