import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  CRM_INCREMENTAL_PROVIDERS,
  CRM_INCREMENTAL_SYNC,
  CRM_PROVIDER_READ_SCOPE,
  isStaleSinceHumanCorrection,
  type CrmProvider,
  type CrmReadConflict,
  type CrmReadObject,
  type CrmReadStatus,
  type IncomingRecord,
  type IntegrationExchange,
  type StartSyncInput,
  type SyncEntityType,
  type SyncOutcome,
} from '@bellum/contracts'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { CrmSyncCursorEntity } from '../../database/entities/crm-sync-cursor.entity'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { demoCrmExchanges, demoCrmReadStatus } from '../demo/demo-dataset'
import { buildExchanges, EXCHANGES_SQL, type ExchangeRow } from './crm-exchanges'
import { crmSyncDisabled } from '../crm-sync/crm-sync.config'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { CrmImportService, type CrmAccountSource, type CrmSource } from './crm-import.service'
import { adapterAccountSource, adapterContactSource } from './crm-sources'
import { CrmDealFactsHarvester } from './crm-deal-facts-harvest'
import { crmCapabilities } from './crm.service'
import { CRM_MIRROR_SYNC, type CrmMirrorSync } from '../crm-mirror/crm-mirror.port'
import { CrmDisappearedArchiver } from './crm-disappeared-archiver'
import { crmSyncErrorHint } from './crm-sync-error-hint'
import { crmRefresh, crmSyncIntervalMs } from '../crm-sync/crm-sync-schedule'
import { CrmFirstImportEnqueuer } from '../crm-first-import/crm-first-import.enqueuer'

/** Les deux objets que la synchro rapproche, comptes d'abord (un contact se rattache à son compte). */
const ENTITIES: readonly SyncEntityType[] = ['account', 'contact']

/** Passages enchaînés par objet et par jour quand la lecture est tronquée : la borne de volume, pas de qualité. */
const MAX_PASSES_PER_RUN = 3
const SCHEDULED_LIMIT = 1000
/** Écarts proposés rendus à l'écran : les plus récents, bornés. */
const CONFLICTS_SHOWN = 20

/**
 * J.7 — UNE seule vérité pour « dernière synchro » : la date d'un passage réel quand il y en a (curseurs), sinon
 * la dernière utilisation de la connexion (`last_used_at`) — la MÊME que le registre d'outils
 * et que le panneau des sources de Laura. Sans elle, la carte disait « Pas encore synchronisé »
 * pendant que l'en-tête affichait une date, pour un CRM (HubSpot) qui n'a pas de curseur.
 */
function lastSyncOf(
  cursorRows: readonly Pick<CrmSyncCursorEntity, 'last_run_at' | 'last_success_at' | 'last_error'>[],
  connection: Pick<CrmConnectionEntity, 'last_used_at'> | undefined,
): string | null {
  // #4290.16 — avec des curseurs, la date est celle de la dernière synchro RÉUSSIE (jamais d'un essai raté, ni de la
  // connexion) ; une ligne d'avant la colonne, sans erreur, a réussi à `last_run_at`.
  if (cursorRows.length > 0) {
    const wins = cursorRows.flatMap(row => {
      const at = row.last_success_at ?? (row.last_error ? null : row.last_run_at)
      return at ? [at.getTime()] : []
    })
    return wins.length > 0 ? new Date(Math.max(...wins)).toISOString() : null
  }
  // #recette-21-10-K2 — `updated_at` / `created_at` bougent à chaque jeton rafraîchi ou reprise en échec :
  // ce n'est pas une synchro. Seule une utilisation réelle de la connexion en est une.
  const stamp = connection?.last_used_at
  return stamp ? new Date(stamp).toISOString() : null
}

/** #4290.16 — l'instant du dernier essai EN ÉCHEC, s'il est plus récent que la dernière réussite ; sinon `null`. */
function lastAttemptOf(
  rows: readonly Pick<CrmSyncCursorEntity, 'last_run_at' | 'last_success_at' | 'last_error' | 'last_attempt_at'>[],
): string | null {
  // #4467 — une passe en échec garde `last_run_at` (la dernière réussite) : l'instant de l'essai est `last_attempt_at`.
  const attemptOf = (row: (typeof rows)[number]) => row.last_attempt_at ?? row.last_run_at
  const failed = rows.filter(row => row.last_error && attemptOf(row))
  if (failed.length === 0) return null
  const attempt = Math.max(...failed.map(row => (attemptOf(row) as Date).getTime()))
  const win = lastSyncOf(rows, undefined)
  return win !== null && Date.parse(win) >= attempt ? null : new Date(attempt).toISOString()
}

/** J.2 — les objets que les portées accordées d'un portail HubSpot permettent de lire. */
export function hubspotReadObjects(scope: string): CrmReadObject[] {
  const caps = crmCapabilities(scope)
  return [
    ...(caps.companiesRead ? (['accounts'] as const) : []),
    ...(caps.contactsRead ? (['contacts'] as const) : []),
    ...(caps.dealsRead ? (['deals'] as const) : []),
  ]
}

type ProviderRun =
  | { ran: false; reason: 'not_incremental' | 'first_import_pending' | 'not_connected' }
  | { ran: true; outcomes: SyncOutcome[] }

/**
 * #4189 — la synchro INCRÉMENTALE des CRM qui relisent par l'adaptateur commun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT, ET CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un passage lit ce qui a bougé depuis le CURSEUR (date de modification > curseur
 * stocké par espace, fournisseur et objet — `crm_sync_cursors`), le rapproche par
 * `CrmImportService` (liens `sync_links`, provenance `connector` sous `human`) et ne
 * fait avancer le curseur QUE sur un passage abouti :
 *  - simulation : jamais ; échec : jamais (`last_error` garde le message tel quel) ;
 *  - lecture non ordonnée (Attio) tronquée : jamais — les fiches non lues seraient
 *    sautées à jamais ; ordonnée tronquée : oui, rien de plus ancien n'est resté derrière ;
 *  - fiches sans date de modification : le curseur ne bouge pas (jamais une date devinée).
 *
 * La PREMIÈRE reprise d'un espace est un geste humain (simulation d'abord) : le passage
 * automatique ne part que pour un couple (fournisseur, objet) qui a déjà un curseur
 * posé par une reprise réelle. Une correction humaine n'est jamais écrasée ; l'écart
 * est compté (`sync_runs.conflict_count`) et journalisé.
 */
@Injectable()
export class CrmReadSyncService {
  private readonly logger = new Logger(CrmReadSyncService.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    private readonly imports: CrmImportService,
    @InjectRepository(CrmSyncCursorEntity) private readonly cursors: Repository<CrmSyncCursorEntity>,
    @InjectRepository(CrmConnectionEntity) private readonly connections: Repository<CrmConnectionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly locks?: SingletonLockService,
    // #3918.8 — les affaires Pipedrive / Odoo versées au cache que lisent les règles de signaux.
    @Optional() private readonly dealFacts?: CrmDealFactsHarvester,
    // SYNC-C — le miroir (SYNC-A) : absent, la passe nocturne ne fait que les fiches et l'archivage.
    @Optional() @Inject(CRM_MIRROR_SYNC) private readonly mirror?: CrmMirrorSync,
    // SYNC-C.4 — les fiches disparues du CRM sont archivées (jamais supprimées).
    @Optional() private readonly disappeared?: CrmDisappearedArchiver,
    // CRM-SYNC-D.1 — le rattrapage des CRM branchés avant la reprise automatique (SYNC-B).
    @Optional() private readonly firstImport?: CrmFirstImportEnqueuer,
  ) {}

  /**
   * La NUIT = le rapprochement COMPLET (SYNC-C, C.4) — 04:55 Europe/Paris, après le rapprochement HubSpot de
   * 04:40 (`CrmSyncScheduler`), avant le rafraîchissement de veille de 05:20. Le jour, la synchro fréquente
   * (`CrmFrequentSyncService`, toutes les `CRM_SYNC_INTERVAL_MINUTES`) lit ce qui a bougé ; la nuit relit TOUT :
   *  - les fiches (comptes, contacts) depuis le curseur, comme avant ;
   *  - les fiches DISPARUES côté CRM sont archivées dans Bellum (`CrmDisappearedArchiver`), jamais supprimées ;
   *  - le miroir en `mode: 'full'` (affaires, activités, propriétaires, pipelines), si SYNC-A est branché.
   * Attio (curseur `created_at`, pas de date de modification) : ses MODIFICATIONS ne remontent que par cette
   * relecture nocturne bornée — le curseur ne passe que sur un passage complet, la nuit lui en donne un.
   *
   * `@Cron` se déclenche sur CHAQUE réplique : sans verrou singleton, deux passages reliraient deux fois le CRM
   * d'un client, donc sans verrou on ne lance pas. Coupe-circuit : `CRM_SYNC_DISABLED` (lu dans `syncAll`).
   */
  @Cron('55 4 * * *', { name: 'crm-read-sync', timeZone: 'Europe/Paris' })
  @Correlated('cron:crm-read-sync.runDailySync')
  async runDailySync(): Promise<void> {
    if (!this.locks) {
      this.logger.warn('CRM full reconciliation skipped: no singleton lock available')
      return
    }
    await withSingletonLock(this.locks, 'crm-read-sync', async () => {
      const outcome = await this.syncAll({ full: true })
      if (outcome.workspaces > 0) this.logger.log('CRM full reconciliation pass complete', outcome)
    })
  }

  /** Une reprise (manuelle ou automatique) d'un objet d'un CRM, depuis son curseur. */
  async run(userId: string, input: StartSyncInput, opts: { ignoreCursor?: boolean } = {}): Promise<SyncOutcome> {
    const adapter = this.adapters.get(input.provider)
    const source = this.imports.assertSource(adapter?.read ? adapter : undefined)
    if (!(await source.status(userId)).connected) this.imports.assertSource(undefined)

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const previous = await this.cursors.findOne({
      where: { workspace_id: workspaceId, provider: input.provider, entity_type: input.entityType },
    })
    // #4290.15 — une reprise rejouée relit depuis le début : le curseur d'un passage antérieur peut avoir
    // dépassé des fiches lues mais écartées (sans e-mail ni nom) ; elles ne se rattrapaient jamais.
    const since = opts.ignoreCursor ? undefined : previous?.cursor_at?.toISOString()

    // La source est enveloppée pour garder ce qui a été RÉELLEMENT consommé : c'est lui, et lui seul, qui porte le curseur.
    const seen: IncomingRecord[] = []
    let truncated = false
    const outcome =
      input.entityType === 'account'
        ? await this.imports.importAccounts(
            userId,
            this.record(adapterAccountSource(source), seen, flag => (truncated = flag)),
            input,
            since ? { since } : {},
          )
        : await this.imports.importContacts(
            userId,
            this.record(adapterContactSource(source), seen, flag => (truncated = flag)),
            input,
            since ? { since } : {},
          )

    if (!input.dryRun) await this.saveCursor(workspaceId, input, previous, outcome, seen, truncated)
    return outcome
  }

  /** Enveloppe une source : retient les fiches lues et si la lecture a été tronquée. */
  private record<S extends CrmSource | CrmAccountSource>(
    source: S,
    seen: IncomingRecord[],
    onTruncated: (flag: boolean) => void,
  ): S {
    const wrap =
      <A extends unknown[]>(read: (...args: A) => Promise<{ records: IncomingRecord[]; truncated: boolean }>) =>
      async (...args: A) => {
        const page = await read(...args)
        seen.push(...page.records)
        onTruncated(page.truncated)
        return page
      }
    if ('listContacts' in source) return { ...source, listContacts: wrap(source.listContacts.bind(source)) }
    return { ...source, listCompanies: wrap((source as CrmAccountSource).listCompanies.bind(source)) } as S
  }

  private async saveCursor(
    workspaceId: string,
    input: StartSyncInput,
    previous: CrmSyncCursorEntity | null,
    outcome: SyncOutcome,
    seen: readonly IncomingRecord[],
    truncated: boolean,
  ): Promise<void> {
    const rule = CRM_INCREMENTAL_SYNC[input.provider as CrmProvider]
    let cursorAt = previous?.cursor_at ?? null
    let lastError: string | null = null

    if (outcome.unavailable) {
      lastError = outcome.unavailable
    } else if (rule && (rule.ordered || !truncated)) {
      const newest = seen.reduce<number>((max, record) => {
        const ms = record.modifiedAt ? Date.parse(record.modifiedAt) : Number.NaN
        return Number.isNaN(ms) ? max : Math.max(max, ms)
      }, cursorAt?.getTime() ?? Number.NEGATIVE_INFINITY)
      if (Number.isFinite(newest)) cursorAt = new Date(newest)
    }

    try {
      await this.cursors.upsert(
        {
          workspace_id: workspaceId,
          provider: input.provider,
          entity_type: input.entityType,
          cursor_at: cursorAt,
          // #recette-21-10-K2 — `last_run_at` = la dernière synchro RÉUSSIE : un passage indisponible
          // (autorisation expirée…) garde l'ancienne date, ou aucune (jamais « à l'instant »). L'échec
          // vit dans `last_error`.
          last_run_at: outcome.unavailable ? (previous?.last_run_at ?? null) : new Date(),
          // #4467 — l'essai, réussi ou non, a sa date : « dernier essai ce matin » quand chaque passe échoue.
          last_attempt_at: new Date(),
          // #4290.16 — la date de la dernière synchro RÉUSSIE : un passage en échec ne la touche pas.
          ...(lastError === null ? { last_success_at: new Date() } : {}),
          last_error: lastError,
        },
        ['workspace_id', 'provider', 'entity_type'],
      )
    } catch (error) {
      // Un curseur non posé = le prochain passage relit un peu plus, jamais une perte.
      this.logger.warn(
        `Curseur de synchro non enregistré (${input.provider}/${input.entityType}): ${(error as Error).message}`,
      )
    }
  }

  /**
   * Le passage AUTOMATIQUE d'un CRM pour l'espace de `userId` : comptes puis contacts, réels,
   * seulement si une première reprise a déjà posé un curseur.
   */
  async syncProvider(userId: string, provider: string, opts: { maxPasses?: number } = {}): Promise<ProviderRun> {
    if (!(CRM_INCREMENTAL_PROVIDERS as readonly string[]).includes(provider))
      return { ran: false, reason: 'not_incremental' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const outcomes: SyncOutcome[] = []
    for (const entityType of ENTITIES) {
      const cursor = await this.cursors.findOne({
        where: { workspace_id: workspaceId, provider, entity_type: entityType },
      })
      if (!cursor?.last_run_at) continue
      for (let pass = 0; pass < (opts.maxPasses ?? MAX_PASSES_PER_RUN); pass++) {
        const outcome = await this.run(userId, {
          provider: provider as StartSyncInput['provider'],
          entityType,
          dryRun: false,
          limit: SCHEDULED_LIMIT,
        })
        outcomes.push(outcome)
        if (outcome.unavailable || !outcome.truncated) break
      }
    }
    // #3918.8 — après les comptes (un deal se rattache à son compte) : les affaires de Pipedrive et
    // d'Odoo rejoignent `crm_deal_facts`, relu par les MÊMES règles que HubSpot. Best-effort : une
    // lecture d'affaires en échec ne fait jamais échouer la synchro des fiches.
    if (outcomes.length > 0) {
      await this.dealFacts?.harvest(userId, provider).catch((error: unknown) => {
        this.logger.warn(`Affaires CRM non versées (${provider})`, { error })
        return 0
      })
    }
    if (outcomes.length > 0) return { ran: true, outcomes }
    // CRM-SYNC-D.1 — RATTRAPAGE : un CRM branché sans curseur n'est plus un simple avertissement. La première
    // reprise est mise en file (idempotent : un verrou par (espace, CRM), un échec recule d'une heure) ; la passe
    // suivante, une fois les curseurs posés, synchronise. Un CRM déconnecté ne met rien en file.
    if (!(await this.adapters.get(provider)?.status(userId))?.connected) return { ran: false, reason: 'not_connected' }
    const queued = await this.firstImport?.enqueueCatchUp({
      userId,
      workspaceId,
      provider: provider as CrmProvider,
    })
    if (queued === 'queued')
      this.logger.log(`Synchro CRM ${provider} : première reprise mise en file (aucun curseur encore posé)`)
    return { ran: false, reason: 'first_import_pending' }
  }

  /** Tous les espaces qui ont un de ces CRM branché. Coupé par `CRM_SYNC_DISABLED`. */
  async syncAll(opts: { full?: boolean } = {}): Promise<{ workspaces: number; failed: number }> {
    if (crmSyncDisabled()) return { workspaces: 0, failed: 0 }
    const rows = await this.connections.find({ where: { provider: In([...CRM_INCREMENTAL_PROVIDERS]) }, take: 200 })
    let failed = 0
    for (const row of rows) {
      try {
        await this.syncProvider(row.user_id, row.provider)
        if (opts.full && row.workspace_id) await this.reconcileFully(row.user_id, row.workspace_id, row.provider)
      } catch (error) {
        failed += 1
        // Un espace en échec ne prive pas les autres : un jeton périmé n'arrête pas le passage.
        this.logger.warn(`Synchro CRM non aboutie (${row.provider})`, {
          workspaceId: row.workspace_id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { workspaces: rows.length, failed }
  }

  /** La part « complète » de la nuit : fiches disparues archivées, miroir relu en entier. Best-effort, chaque part isolée. */
  private async reconcileFully(userId: string, workspaceId: string, provider: string): Promise<void> {
    try {
      const archived = await this.disappeared?.archiveMissing(userId, workspaceId, provider)
      if (archived && archived.skipped.length > 0)
        this.logger.warn(`Archivage CRM ${provider} partiel`, { skipped: archived.skipped })
    } catch (error) {
      this.logger.warn(`Archivage des fiches disparues non abouti (${provider})`, { error })
    }
    try {
      await this.mirror?.syncProvider({ workspaceId, provider: provider as CrmProvider, mode: 'full' })
    } catch (error) {
      this.logger.warn(`Miroir CRM complet non abouti (${provider})`, { error })
    }
  }

  /** SYNC-C — l'instant du dernier passage RÉEL de cet espace pour ce fournisseur (curseurs) ; `null` = jamais. */
  async lastPassAt(workspaceId: string, provider: string): Promise<Date | null> {
    const rows = await this.cursors.find({ where: { workspace_id: workspaceId, provider } })
    const times = rows.flatMap(row => (row.last_run_at ? [row.last_run_at.getTime()] : []))
    return times.length > 0 ? new Date(Math.max(...times)) : null
  }

  /** SYNC-C — la dernière erreur d'un passage, sur les curseurs existants (jamais un curseur créé pour porter une erreur). */
  async recordPassError(workspaceId: string, provider: string, message: string | null): Promise<void> {
    // #4467 — une erreur de passe est un ESSAI : sa date est gardée pour que la carte dise quand et pourquoi.
    await this.cursors.update(
      { workspace_id: workspaceId, provider },
      message === null ? { last_error: null } : { last_error: message, last_attempt_at: new Date() },
    )
  }

  /**
   * Ce que l'écran affiche, par CRM BRANCHÉ : le périmètre RÉELLEMENT lu (le contrat), sur quoi se cale la
   * synchro, la date de dernière synchro (celle d'un passage réel qui a ABOUTI — jamais « maintenant », jamais celle d'un échec),
   * la dernière erreur, et le nombre de fiches modifiées des deux côtés au dernier passage.
   */
  async status(userId: string): Promise<CrmReadStatus[]> {
    const connected = await this.adapters.connected(userId)
    if (connected.length === 0) {
      // #4189.8 — la salle de démonstration MONTRE un écart proposé (données fictives, marquées `demo`) ;
      // aucun CRM réel n'est lu ni écrit, et rien n'est semé en base.
      if (!(await this.workspaceContext.isDemoWorkspace(userId))) return []
      // SYNC-C.6 — la démonstration montre une synchro RÉCENTE et plausible (un passage il y a 6 min, le suivant
      // au prochain intervalle), pas celle d'il y a deux heures : fictif et marqué `demo`, jamais lu chez un tiers.
      const now = new Date()
      const interval = crmSyncIntervalMs()
      return [
        {
          ...demoCrmReadStatus(now),
          // #4290.17 — la salle dit aussi comment son CRM fictif se met à jour (mêmes constantes que le réel).
          refresh: crmRefresh('hubspot'),
          lastSyncAt: new Date(now.getTime() - Math.min(6 * 60_000, interval - 60_000)).toISOString(),
          nextSyncAt: new Date(now.getTime() + Math.max(interval - 6 * 60_000, 60_000)).toISOString(),
        },
      ]
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.cursors.find({ where: { workspace_id: workspaceId } })
    const lastRuns = await this.cursors.manager.query<
      Array<{ provider: string; entity_type: string; conflict_count: number | null }>
    >(
      `SELECT DISTINCT ON (provider, entity_type) provider, entity_type, conflict_count
         FROM sync_runs
        WHERE workspace_id = $1 AND dry_run = false AND finished_at IS NOT NULL
        ORDER BY provider, entity_type, started_at DESC`,
      [workspaceId],
    )
    const proposed = await this.cursors.manager.query<
      Array<{
        provider: string
        entity_type: 'account' | 'contact'
        proposal: Record<string, { bellum: string | null; crm: string | null } | null> | null
        created_at: Date
        id: string
        internal_id: string | null
        kept_fields: string[] | null
        entity_label: string | null
      }>
    >(
      `SELECT e.id, e.internal_id, r.provider, e.entity_type, e.proposal, e.created_at, e.kept_fields, e.entity_label
         FROM sync_record_events e
         JOIN sync_runs r ON r.id = e.run_id
        WHERE e.workspace_id = $1 AND e.action = 'conflict' AND e.proposal IS NOT NULL AND r.dry_run = false
        ORDER BY e.created_at DESC
        LIMIT $2`,
      [workspaceId, CONFLICTS_SHOWN],
    )
    // #4189.9 — un écart déjà tranché par un geste humain POSTÉRIEUR (garder le CRM, ou une correction) ne se repropose pas.
    const internalIds = [...new Set(proposed.flatMap(event => (event.internal_id ? [event.internal_id] : [])))]
    const humanTouches =
      internalIds.length === 0
        ? []
        : await this.cursors.manager.query<Array<{ entity_id: string; field: string; observed_at: Date }>>(
            `SELECT entity_id, field, observed_at FROM field_provenance
              WHERE workspace_id = $1 AND source = 'human' AND entity_id = ANY($2::uuid[])`,
            [workspaceId, internalIds],
          )
    // Les connexions de l'espace : portées accordées (J.2) et dernière activité (J.7).
    const connectionRows = await this.connections.find({ where: { workspace_id: workspaceId } })
    const connectionOf = (provider: string) => connectionRows.find(row => row.provider === provider)
    return connected.map(({ adapter, accountLabel }) => {
      const mine = rows.filter(row => row.provider === adapter.provider)
      const times = mine.flatMap(row => (row.last_run_at ? [row.last_run_at.getTime()] : []))
      return {
        provider: adapter.provider,
        accountLabel,
        // J.2 — HubSpot : les objets lus se DÉRIVENT des portées ACCORDÉES du portail, pas d'une liste figée.
        objects:
          adapter.provider === 'hubspot' && connectionOf('hubspot')?.scope
            ? hubspotReadObjects(connectionOf('hubspot')?.scope ?? '')
            : [...CRM_PROVIDER_READ_SCOPE[adapter.provider]],
        incremental: CRM_INCREMENTAL_SYNC[adapter.provider]?.cursor ?? null,
        lastSyncAt: lastSyncOf(mine, connectionOf(adapter.provider)),
        // #4290.16 — l'essai le plus récent, dit à part SEULEMENT s'il a échoué après la dernière réussite.
        lastAttemptAt: lastAttemptOf(mine),
        // #4290.17 — webhook (temps réel) ou relecture toutes les N min : la carte le DIT.
        refresh: crmRefresh(adapter.provider),
        // SYNC-C.6 — la prochaine synchro prévue : le dernier passage RÉEL + l'intervalle ; rien sans passage (jamais devinée).
        nextSyncAt:
          !crmSyncDisabled() && times.length > 0
            ? new Date(Math.max(...times) + crmSyncIntervalMs()).toISOString()
            : null,
        lastError: mine.find(row => row.last_error)?.last_error ?? null,
        // #4467 — la raison nommée (la phrase vit dans les traductions de l'écran).
        lastErrorHint: crmSyncErrorHint(adapter.provider, mine.find(row => row.last_error)?.last_error ?? null),
        conflicts: lastRuns
          .filter(run => run.provider === adapter.provider)
          .reduce((sum, run) => sum + (run.conflict_count ?? 0), 0),
        conflictItems: proposed
          .filter(event => event.provider === adapter.provider)
          .flatMap((event): CrmReadConflict[] =>
            Object.entries(event.proposal ?? {})
              // Théo D settings-integrations.N3 — « garder Bellum » retenu : l'écart sort de la liste.
              .filter(([field]) => !(event.kept_fields ?? []).includes(field))
              .filter(
                ([field]) =>
                  !humanTouches.some(
                    touch =>
                      touch.entity_id === event.internal_id &&
                      touch.field === field &&
                      isStaleSinceHumanCorrection(event.created_at, touch.observed_at),
                  ),
              )
              .map(([field, values]) => ({
                id: event.id,
                entityType: event.entity_type,
                ...(event.entity_label ? { entityLabel: event.entity_label } : {}),
                field,
                bellumValue: values?.bellum ?? null,
                crmValue: values?.crm ?? null,
                at: new Date(event.created_at).toISOString(),
              })),
          ),
      }
    })
  }

  /**
   * Théo D settings-integrations.N4 — l'historique des échanges : ce qui a RÉELLEMENT été fait avec les outils branchés.
   * La salle de démonstration montre des lignes marquées `demo` ; hors démonstration, aucune opération = liste vide
   * (on n'affiche pas ce qu'on n'a pas).
   */
  async exchanges(userId: string): Promise<IntegrationExchange[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.cursors.manager.query<ExchangeRow[]>(EXCHANGES_SQL, [workspaceId, 50])
    if (rows.length === 0 && (await this.workspaceContext.isDemoWorkspace(userId))) return demoCrmExchanges(new Date())
    return buildExchanges(rows)
  }

  /** Un fournisseur qui ne se relit pas est refusé NOMMÉ — jamais zéro ligne. */
  assertReadable(provider: string): void {
    const adapter = this.adapters.get(provider)
    if (!adapter?.read) throw new BadRequestException('Ce CRM ne se relit pas depuis Bellum.')
  }
}
