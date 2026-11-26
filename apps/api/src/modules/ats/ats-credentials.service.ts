import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { refreshTrackingFailure } from '../../common/util/oauth-refresh'
import { AtsConnectionEntity } from '../../database/entities/ats-connection.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { parseGrantedScopes } from '../zero-layer/boond-scopes'
import {
  readBoondManagerConfig,
  readBoondManagerOAuthApp,
  type BoondManagerConfig,
} from '../zero-layer/boondmanager-config'
import { BoondOAuthClient, type BoondTokens } from './boond-oauth.client'

/** Marge de refresh du patron CRM (`crm.service.ts`) : on renouvelle un peu AVANT l'expiration rendue par Boond. */
const REFRESH_SKEW_MS = 60 * 1000

/**
 * LA résolution des identifiants ATS — la seule du dépôt (#4687, GA-26).
 *
 * Avant ce lot il y en avait deux pour la même intégration : celle d'`AtsService` (la ligne `ats_connections` de
 * l'ESPACE, repli sur l'environnement) et celle de la couche zéro, qui lisait l'environnement et ignorait ce que le
 * client avait saisi — l'« historique interne » d'une analyse restait vide alors que la connexion existait. Les deux
 * appellent maintenant cette classe.
 *
 * La clé est l'ESPACE, jamais l'utilisateur ni une variable globale : l'analyse d'un compte lit la connexion de
 * l'espace du compte. Un espace sans ligne retombe sur l'environnement (l'opérateur qui teste une instance interne
 * n'a rien à refaire) ; un espace AVEC ligne n'y retombe jamais — ses identifiants périmés rendent `null`, pas ceux
 * du serveur.
 */
@Injectable()
export class AtsCredentialsService {
  private readonly logger = new Logger(AtsCredentialsService.name)
  /** Un refresh par connexion à la fois : un refresh token tournant ne se rejoue pas. */
  private readonly refreshing = new Map<string, Promise<string | null>>()

  constructor(
    @InjectRepository(AtsConnectionEntity)
    private readonly connections: Repository<AtsConnectionEntity>,
  ) {}

  /**
   * La configuration effective d'un espace : la sienne, sinon celle du serveur. `null` = aucune (ou jeton à
   * reconnecter) ; l'appelant doit alors le DIRE, pas rendre une liste vide. Sans espace connu : environnement seul.
   */
  async resolveForWorkspace(workspaceId: string | null | undefined): Promise<BoondManagerConfig | null> {
    const row = workspaceId ? await this.connections.findOne({ where: { workspace_id: workspaceId } }) : null
    if (row && (row.auth_mode !== 'oauth2' || row.access_token_enc)) {
      const base = readBoondManagerConfig()
      const config: BoondManagerConfig = {
        baseUrl: (row.base_url ?? base?.baseUrl ?? 'https://ui.boondmanager.com/api').replace(/\/+$/, ''),
        searchParam: base?.searchParam ?? 'keywords',
        // #4693 — limiteur, coupe-circuit, compteurs et dictionnaire sont PAR connexion (espace + hôte), jamais partagés.
        connectionKey: `${row.workspace_id}|${row.base_url ?? 'default'}`,
      }
      if (row.auth_mode === 'oauth2') {
        // #4691 — les scopes ACCORDÉS viennent de la colonne, jamais supposés ; non rendus = aucun accordé.
        config.grantedScopes = parseGrantedScopes(row.scopes)
        const accessToken = await this.validAccessToken(row)
        return accessToken ? { ...config, accessToken } : null
      }
      if (!row.credentials_enc) return null
      const secret = decryptToken(row.credentials_enc)
      if (row.auth_mode === 'user_token') return { ...config, userToken: secret }
      const [clientToken, clientKey] = secret.split('\n')
      if (!clientToken || !clientKey) return null
      return { ...config, clientToken, clientKey }
    }
    return readBoondManagerConfig()
  }

  /** Les colonnes de jeton à écrire. Le refresh reçu est RÉÉCRIT à chaque échange (il peut être tournant). */
  tokenColumns(tokens: BoondTokens, previousRefreshEnc: string | null) {
    return {
      access_token_enc: encryptToken(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : previousRefreshEnc,
      // L'expiration vient du `expires_in` rendu par Boond ; absent, elle reste inconnue (jamais une durée supposée).
      expires_at: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    }
  }

  /** Jeton d'accès valable : celui de la base, ou un refresh UNIQUE. `null` = « à reconnecter ». */
  private async validAccessToken(row: AtsConnectionEntity): Promise<string | null> {
    if (!row.access_token_enc) return null
    const notExpiring = !row.expires_at || row.expires_at.getTime() - Date.now() > REFRESH_SKEW_MS
    if (notExpiring) return decryptToken(row.access_token_enc)
    // Un refresh déjà refusé ne se rejoue pas : pas d'appel en boucle, seul un nouveau consentement répare.
    if (row.refresh_failed_at) return null
    if (!row.refresh_token_enc) {
      await this.connections.update({ id: row.id }, { refresh_failed_at: new Date() }).catch(() => undefined)
      return null
    }
    const inFlight = this.refreshing.get(row.id)
    if (inFlight) return inFlight
    const run = this.refreshOnce(row).finally(() => this.refreshing.delete(row.id))
    this.refreshing.set(row.id, run)
    return run
  }

  private async refreshOnce(row: AtsConnectionEntity): Promise<string | null> {
    const app = readBoondManagerOAuthApp(row.base_url ?? undefined)
    if (!app) return null
    try {
      const refreshed = await refreshTrackingFailure(
        () => new BoondOAuthClient(app).refresh(decryptToken(row.refresh_token_enc as string)),
        () => this.connections.update({ id: row.id }, { refresh_failed_at: new Date() }),
      )
      await this.connections.update(
        { id: row.id },
        { ...this.tokenColumns(refreshed, row.refresh_token_enc), last_used_at: new Date(), refresh_failed_at: null },
      )
      return refreshed.accessToken
    } catch (error) {
      this.logger.warn(`BoondManager OAuth refresh failed: ${(error as Error).message}`)
      return null
    }
  }
}
