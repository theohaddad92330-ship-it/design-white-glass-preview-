import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { missingScopes, scopeSignature } from '../../common/util/oauth-scope-gap'
import { ConnectorScopeGapEntity } from '../../database/entities/connector-scope-gap.entity'
import { NotificationsService } from '../notifications/notifications.service'
import {
  SCOPE_GAP_CONNECTORS,
  SCOPE_GAP_PROVIDERS,
  withoutProtocolScopes,
  type ScopeGapProvider,
} from './connector-scope-registry'

/** Un accord de ce temps sans reconnexion n'est plus « un consentement neuf » : l'app a pu changer depuis. */
const FRESH_CONSENT_TTL_MS = 14 * 24 * 60 * 60 * 1000

type ScopeGapView = {
  provider: ScopeGapProvider
  label: string
  missingScopes: string[]
  /** Vrai : l'écart est apparu juste après un consentement neuf — c'est l'app qui ne propose pas la portée. */
  freshConsent: boolean
}

export type IncompleteConnectorRow = {
  provider: ScopeGapProvider
  label: string
  /** Espaces de travail distincts concernés. */
  workspaces: number
  /** Utilisateurs concernés. */
  users: number
  /** Dont l'écart est né d'un consentement neuf (côté app, non réparable par l'utilisateur). */
  appSide: number
  missingScopes: Array<{ scope: string; workspaces: number }>
}

type ConnectionRow = { user_id: string; workspace_id: string | null; scope: string | null }

const tokens = (list: string): string[] => list.split(/\s+/).filter(Boolean)

@Injectable()
export class ConnectorScopeGapsService {
  private logger = new Logger(ConnectorScopeGapsService.name)

  constructor(
    @InjectRepository(ConnectorScopeGapEntity)
    private readonly gaps: Repository<ConnectorScopeGapEntity>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * I.1 — au retour du consentement : les portées ACCORDÉES contre les portées DEMANDÉES.
   *
   * Rend les portées manquantes, `[]` si tout est accordé, `null` si le fournisseur ne rend pas ses
   * portées (on ne devine pas). Ne lève JAMAIS : un défaut de surveillance ne casse pas une connexion.
   */
  async recordCallback(input: {
    provider: ScopeGapProvider
    userId: string
    workspaceId: string | null
    requested: string | null | undefined
    granted: string | null | undefined
  }): Promise<string[] | null> {
    const { provider, userId, workspaceId } = input
    try {
      const requested = withoutProtocolScopes(tokens(input.requested ?? '')).join(' ')
      const missing = missingScopes(requested, input.granted)
      if (missing === null) return null
      if (missing.length === 0) {
        await this.gaps.delete({ user_id: userId, provider })
        return []
      }
      // Jamais de jeton ici : le fournisseur, l'utilisateur et les NOMS de portées, rien d'autre.
      this.logger.error('OAuth scope gap at consent', {
        provider,
        missingScopes: missing,
        user: { id: userId },
        workspaceId,
      })
      await this.upsert(userId, workspaceId, provider, missing, true)
      return missing
    } catch (error) {
      this.logger.warn(`Scope gap check failed (non-fatal): ${error instanceof Error ? error.name : 'unknown'}`)
      return null
    }
  }

  /** Le point d'appel des callbacks : la demande vient du registre, jamais recopiée dans chaque connecteur. */
  recordGrant(
    provider: ScopeGapProvider,
    userId: string,
    workspaceId: string | null,
    granted: string | null | undefined,
  ): Promise<string[] | null> {
    const requested = SCOPE_GAP_CONNECTORS[provider].requested(granted)
    return this.recordCallback({ provider, userId, workspaceId, requested, granted })
  }

  /** I.2 — l'écart de CET utilisateur pour CE connecteur, tel que la carte le dit. */
  async gapFor(userId: string, provider: string): Promise<ScopeGapView | null> {
    if (!(SCOPE_GAP_PROVIDERS as readonly string[]).includes(provider)) return null
    const row = await this.gaps.findOne({ where: { user_id: userId, provider } })
    if (!row) return null
    const known = provider as ScopeGapProvider
    return {
      provider: known,
      label: SCOPE_GAP_CONNECTORS[known].label,
      missingScopes: tokens(row.missing_scopes),
      freshConsent: row.fresh_consent,
    }
  }

  /**
   * I.3 — une fois par jour, les connexions EXISTANTES sont comparées à la demande ACTUELLE.
   *
   * **SANS VERROU :** idempotent — l'écart est un upsert par (utilisateur, fournisseur) et la notification
   * passe par `claimNotification` (une prise atomique par signature) : un second replica qui rejoue trouve
   * la ligne à jour et ne notifie pas une seconde fois.
   */
  @Cron('40 6 * * *', { name: 'connector-scope-gaps', timeZone: 'Europe/Paris' })
  async scheduledSweep(): Promise<void> {
    try {
      await this.sweep()
    } catch (error) {
      this.logger.warn(`Scope gap sweep failed: ${error instanceof Error ? error.name : 'unknown'}`)
    }
  }

  async sweep(): Promise<{ checked: number; notified: number }> {
    let checked = 0
    let notified = 0
    for (const provider of SCOPE_GAP_PROVIDERS) {
      const connector = SCOPE_GAP_CONNECTORS[provider]
      const connections = await this.readConnections(provider)
      const existing = new Map((await this.gaps.find({ where: { provider } })).map(row => [row.user_id, row]))
      const live = new Set<string>()
      for (const connection of connections) {
        live.add(connection.user_id)
        const requested = connector.requested(connection.scope)
        // Portées inconnues (jamais rendues par le fournisseur) ou demande inconnue : pas de comparaison.
        if (requested === null || connection.scope === null) continue
        checked += 1
        const missing = missingScopes(withoutProtocolScopes(tokens(requested)).join(' '), connection.scope) ?? []
        const row = existing.get(connection.user_id)
        if (missing.length === 0) {
          if (row) await this.gaps.delete({ id: row.id })
          continue
        }
        const signature = scopeSignature(missing)
        const stale = !!row && Date.now() - new Date(row.updated_at).getTime() > FRESH_CONSENT_TTL_MS
        const sameGap = row?.signature === signature
        // Un écart né d'un consentement neuf reste « côté app » tant qu'il est récent et inchangé.
        const fresh = sameGap && row.fresh_consent && !stale
        const saved =
          sameGap && row.fresh_consent === fresh
            ? row
            : await this.upsert(connection.user_id, connection.workspace_id, provider, missing, fresh)
        if (!fresh && (await this.claimNotification(saved.id, signature))) {
          await this.notify(connection.user_id, provider, missing)
          notified += 1
        }
      }
      for (const [userId, row] of existing) if (!live.has(userId)) await this.gaps.delete({ id: row.id })
    }
    return { checked, notified }
  }

  /** I.4 — les connexions incomplètes, par connecteur. Lecture seule, transverse aux espaces. */
  async incompleteByConnector(): Promise<IncompleteConnectorRow[]> {
    const rows = await this.gaps.find()
    const out: IncompleteConnectorRow[] = []
    for (const provider of SCOPE_GAP_PROVIDERS) {
      const mine = rows.filter(row => row.provider === provider)
      if (mine.length === 0) continue
      const perScope = new Map<string, Set<string>>()
      for (const row of mine)
        for (const scope of tokens(row.missing_scopes)) {
          const set = perScope.get(scope) ?? new Set<string>()
          set.add(row.workspace_id ?? row.user_id)
          perScope.set(scope, set)
        }
      out.push({
        provider,
        label: SCOPE_GAP_CONNECTORS[provider].label,
        workspaces: new Set(mine.map(row => row.workspace_id ?? row.user_id)).size,
        users: new Set(mine.map(row => row.user_id)).size,
        appSide: mine.filter(row => row.fresh_consent).length,
        missingScopes: [...perScope]
          .map(([scope, set]) => ({ scope, workspaces: set.size }))
          .sort((a, b) => b.workspaces - a.workspaces || a.scope.localeCompare(b.scope)),
      })
    }
    return out
  }

  private async readConnections(provider: ScopeGapProvider): Promise<ConnectionRow[]> {
    const connector = SCOPE_GAP_CONNECTORS[provider]
    // La table vient d'une constante du dépôt, jamais d'une entrée : pas d'injection possible.
    const filter = connector.table === 'crm_connections' ? ' WHERE provider = $1' : ''
    const rows: ConnectionRow[] = await this.dataSource.query(
      `SELECT user_id, workspace_id, scope FROM ${connector.table}${filter}`,
      connector.table === 'crm_connections' ? [connector.providerValue] : [],
    )
    return rows
  }

  private async upsert(
    userId: string,
    workspaceId: string | null,
    provider: ScopeGapProvider,
    missing: readonly string[],
    freshConsent: boolean,
  ): Promise<ConnectorScopeGapEntity> {
    const signature = scopeSignature(missing)
    const existing = await this.gaps.findOne({ where: { user_id: userId, provider } })
    return this.gaps.save({
      ...(existing ?? {}),
      user_id: userId,
      workspace_id: workspaceId,
      provider,
      missing_scopes: missing.join(' '),
      signature,
      fresh_consent: freshConsent,
      // Un autre ensemble de portées = un nouveau message ; le même, jamais deux fois.
      notified_signature: existing?.notified_signature ?? null,
    } as ConnectorScopeGapEntity)
  }

  /** Attribution ATOMIQUE de la notification : deux balayages concurrents n'en envoient qu'une. */
  private async claimNotification(id: string, signature: string): Promise<boolean> {
    const result = await this.gaps
      .createQueryBuilder()
      .update()
      .set({ notified_signature: signature })
      .where('id = :id AND notified_signature IS DISTINCT FROM :signature', { id, signature })
      .execute()
    return (result.affected ?? 0) > 0
  }

  private async notify(userId: string, provider: ScopeGapProvider, missing: readonly string[]): Promise<void> {
    const connector = SCOPE_GAP_CONNECTORS[provider]
    const functions = [...new Set(missing.map(scope => connector.features[scope] ?? scope))]
    try {
      await this.notifications.createNotification(userId, {
        type: 'system',
        title: `Reconnecte ${connector.label} pour activer : ${functions.join(', ')}`,
        body: `La connexion ${connector.label} de ton espace date d’avant l’ajout de ces fonctions. Reconnecte-la depuis Réglages › Intégrations : une seule autorisation à accepter.`,
        link: '/integrations',
        origin: 'failure',
      })
    } catch (error) {
      this.logger.warn(`Scope gap notification failed (non-fatal): ${error instanceof Error ? error.name : 'unknown'}`)
    }
  }
}
