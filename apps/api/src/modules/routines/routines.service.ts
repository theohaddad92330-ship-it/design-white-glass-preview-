import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, MoreThanOrEqual, Not, Repository } from 'typeorm'
import {
  combineTriggerEvents,
  type NoReplyFollowUpDryRun,
  ROUTINE_SELECTABLE_STATUSES,
  type RoutineBlocker,
  type RoutineDefinition,
  type RoutineKey,
  type RoutineObservation,
  type RoutineRunNowResult,
  type RoutineRunView,
  type RoutineStatus,
  type RoutineSubscription,
  type RoutineView,
  type TriggerEvent,
  type UpdateRoutineRequest,
  applyRoutineContent,
  type RoutineContentView,
  type UpdateRoutineContentRequest,
  updateRoutineContentRequestSchema,
  type WorkspaceProfile,
  type WorkspaceRole,
  workspaceProfileOf,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { RoutinePreferenceEntity } from './routine-preference.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { AgendaService } from '../agenda/agenda.service'
import { AtsService } from '../ats/ats.service'
import { CrmService } from '../crm/crm.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { findRoutine, ROUTINE_CATALOG } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { orderRoutinesForRole } from './routine-role-order'
import { isRoutineDue, nextRoutineTrigger, occurrenceKey, routineObjectKey, routineRunKey } from './routine-schedule'
import { routineVersionNotesSince } from './routine-version-notes'
import {
  isFailedOutcome,
  ROUTINE_BUDGET_STOP_OUTCOME,
  ROUTINE_FAILURE_PREFIX,
  ROUTINE_MAX_ATTEMPTS,
  routineRetryDue,
} from './routine-retry'
import { RoutineBudgetCapEntity } from './routine-budget-cap.entity'
import { RoutineContentEntity } from './routine-content.entity'
import { correlationStorage, getCorrelationContext } from '../../correlation-id/correlation-id.store'

/** #2843.21 — le fil de corrélation d'une occurrence : `routine-run:<run_key>` (≤ 128, `provider_costs`). */
const ROUTINE_COST_CORRELATION_PREFIX = 'routine-run:'

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

/**
 * Le moteur de routines.
 *
 * Trois responsabilités, et pas une de plus : composer la vue (catalogue +
 * abonnement + ce qui bloque), écrire l'abonnement, et exécuter une occurrence
 * exactement une fois.
 *
 * Ce qui rend « exactement une fois » vrai : l'insertion de la trace précède
 * l'envoi, et sa clé d'unicité est `utilisateur:routine:jour-local`. Si deux
 * replicas balayent en même temps, le second se prend une violation de
 * contrainte et s'arrête — plutôt que de poster une seconde notification. On
 * préfère l'ordre « je réserve puis j'envoie » à l'ordre inverse : rater un
 * envoi se répare, un double envoi ne se rattrape pas.
 */
/** #2843.21/.24 — la lecture back-office : par routine, jamais agrégée entre comptes. */
export type RoutineBackofficeRuns = {
  userId: string
  routines: Array<{
    key: string
    runs: number
    failures: number
    /** Tentatives au-delà de la première (reprises #2843.20). */
    retries: number
    /** Médiane des durées MESURÉES ; `null` = aucune mesurée (jamais 0). */
    medianDurationMs: number | null
    maxDurationMs: number | null
    /**
     * #2843.21 — somme des coûts TARIFÉS rattachés aux exécutions (fil `routine-run:<clé>`) ;
     * `null` = aucun coût mesuré, jamais 0 (GA-18/19).
     */
    costUsd: number | null
    /** #2843.21 — le coût de CHAQUE exécution mesurée, rattaché à sa clé. */
    costByRun: Array<{ runKey: string; costUsd: number }>
    /** #2843.19 — le plafond réglé au back-office ; `null` = aucun. */
    capUsd: number | null
    /** #2843.19 — occurrences arrêtées par ce plafond. */
    stoppedByCap: number
  }>
}

/** Un message proactif d'une routine, arbitré avec les autres du même balayage. */
type ProactiveItem = {
  key: string
  priority: number | null
  type: 'system'
  title: string
  body?: string
  link?: string | null
  /** #2843.13 — l'owner réglé, quand ce n'est pas l'abonné. Jamais transmis tel quel. */
  recipient?: string
}

/** #2843.13 — ce que le moteur lit des réglages de l'utilisateur sur UNE routine. */
type RoutinePreference = Pick<RoutinePreferenceEntity, 'autonomy' | 'owner_user_id'>

@Injectable()
export class RoutinesService {
  private readonly logger = new Logger(RoutinesService.name)

  constructor(
    @InjectRepository(RoutineSubscriptionEntity)
    private readonly subscriptions: Repository<RoutineSubscriptionEntity>,
    @InjectRepository(RoutineRunEntity)
    private readonly runs: Repository<RoutineRunEntity>,
    // Lecture directe du SCHÉMA, pas du service `AccountsService` d'un autre
    // module (GA-07) — `AccountEntity` est déjà enregistrée dans ce module
    // pour la même raison que `TerritorySnapshotEntity`/`ConsultantEntity`
    // (voir `routines.module.ts`).
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly notifications: NotificationsService,
    private readonly executors: RoutineExecutors,
    private readonly mailbox: MailboxService,
    private readonly agenda: AgendaService,
    private readonly ats: AtsService,
    private readonly crm: CrmService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2843.29 — le type d'espace (profil canonique de l'ESN) : lecture du SCHÉMA,
    // pas du service `esn-profile` (GA-07). Optionnel : absent = aucun profil connu.
    @Optional()
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles?: Repository<EsnProfileEntity>,
    // #2843.13 — autonomie et owner réglés par l'utilisateur ; absent = défauts du catalogue.
    @Optional()
    @InjectRepository(RoutinePreferenceEntity)
    private readonly preferences?: Repository<RoutinePreferenceEntity>,
    // #2843.19 — le plafond de coût par routine, réglé au BACK-OFFICE seul (c132).
    @Optional()
    @InjectRepository(RoutineBudgetCapEntity)
    private readonly caps?: Repository<RoutineBudgetCapEntity>,
    // #2843.30 — le contenu (gabarit) d'une routine, réglé par espace.
    @Optional()
    @InjectRepository(RoutineContentEntity)
    private readonly contents?: Repository<RoutineContentEntity>,
  ) {}

  /**
   * Le catalogue vu par un utilisateur : ses réglages et ce qui l'empêche de
   * tourner.
   *
   * Effet de bord assumé : la première consultation MATÉRIALISE les défauts en
   * base. C'est ce qui fait qu'une routine ne peut jamais partir avant d'avoir
   * été VUE — l'exigence du rapport commence par « visible », et une
   * notification reçue par quelqu'un qui ignore d'où elle vient est la
   * meilleure façon de faire couper toutes les autres.
   */
  /**
   * #2398.13/#2205.38 — simulation (ZÉRO écriture, ZÉRO appel modèle) de la
   * routine `no_reply_follow_up`. Voir le docblock de
   * `RoutineExecutors.dryRunNoReplyFollowUp` pour la raison de la limiter à
   * CETTE seule routine plutôt qu'un endpoint générique.
   */
  dryRunNoReplyFollowUp(userId: string): Promise<NoReplyFollowUpDryRun> {
    return this.executors.dryRunNoReplyFollowUp(userId)
  }

  async list(userId: string): Promise<RoutineView[]> {
    // PERF (P5, 29/09 — `GET /routines` mesuré à 1,6-4,7 s, appelé par /actions,
    // /missions/suivi et /settings/routines) : la matérialisation, les
    // souscriptions, les bloqueurs, le rôle et SURTOUT la dernière exécution de
    // chacune des ~42 routines (un `findOne` par routine, en série) s'enchaînaient.
    // Les dernières exécutions tiennent maintenant en UNE requête, et les cinq
    // lectures indépendantes partent ensemble. Même réponse, même ordre.
    const [rows, lastRuns, blockers, role, profile, preferences] = await Promise.all([
      this.materializeDefaults(userId),
      this.lastRunsByKey(userId),
      this.resolveBlockers(userId),
      this.roleOf(userId),
      this.profileOf(userId),
      this.preferencesOf(userId),
    ])
    const byKey = new Map(rows.map(row => [row.routine_key, row]))

    const views: RoutineView[] = []
    for (const definition of ROUTINE_CATALOG) {
      const row = byKey.get(definition.key)
      const subscription = this.toSubscription(definition.key, row, preferences.get(definition.key))
      const last = lastRuns.get(definition.key)
      const seenVersion = row?.seen_version ?? definition.version
      const updated = seenVersion < definition.version
      views.push({
        definition,
        subscription,
        blockers: definition.requires.flatMap(requirement =>
          blockers.has(requirement) ? [blockers.get(requirement)!] : [],
        ),
        lastRunAt: last?.created_at?.toISOString() ?? null,
        lastOutcome: last?.outcome ?? null,
        // #2205.26/.55 — un échec doit se DISTINGUER visuellement d'un
        // résultat normal, pas seulement se lire dans le texte. Dérivé de la
        // même convention `Échec : ` que ce service écrit lui-même (ligne
        // ~314) : jamais deviné, jamais recopié ailleurs. `undefined` sans
        // exécution passée — « jamais exécutée » n'est pas « a réussi ».
        lastFailed: last ? isFailedOutcome(last.outcome) : undefined,
        nextTriggerAt: nextRoutineTrigger(subscription, definition.cadence, new Date()),
        // #2916 (#2399.6/.7) — pas de ligne (jamais matérialisée, ex. dans un
        // test qui mocke `find`) = même défaut que `toSubscription` : rien de
        // vu encore ne peut être « en retard ».
        updated,
        ...(updated ? { versionNotes: routineVersionNotesSince(definition.key, seenVersion, definition) } : {}),
      })
    }
    // #2399.8 — le rôle change l'ORDRE, jamais le CONTENU (doctrine
    // `c76_role_reordonne_jamais_ne_filtre`) : même 42 routines pour tout le
    // monde, un manager les lit juste dans un ordre différent d'un commercial.
    // #2843.29 — le type d'espace aussi : ordre seulement, jamais présence (c76).
    return orderRoutinesForRole(views, role, view => view.definition.key, profile)
  }

  /**
   * #2205.49-52/.62 — l'HISTORIQUE d'une routine, au-delà du dernier résultat
   * que {@link list} expose déjà.
   *
   * `take: 20` : un journal d'audit se consulte, il ne se fait pas défiler à
   * l'infini depuis un panneau de réglages — la même borne que le reste de
   * l'écran (`RoutineFunctioningDialog.tsx`) plutôt qu'une pagination que rien ne demande
   * encore.
   */
  async listRuns(userId: string, key: string): Promise<RoutineRunView[]> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')

    const rows = await this.runs.find({
      where: { user_id: userId, routine_key: definition.key },
      order: { created_at: 'DESC' },
      take: 20,
    })

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      notified: row.notified,
      outcome: row.outcome,
      // Même convention que `lastFailed` ci-dessus (ligne ~94) : jamais
      // redevinée, jamais dupliquée sous un second nom.
      failed: isFailedOutcome(row.outcome),
      // #2205.54 — relayée telle quelle, jamais recalculée ici.
      proofRef: row.proof_ref ?? null,
    }))
  }

  /**
   * #2843.18 (lot L13) — ce que la routine a donné sur trente jours, pour CE
   * compte : exécutions, prises de parole, échecs. Ni coût ni durée.
   */
  async observation(userId: string, key: string, now: Date = new Date()): Promise<RoutineObservation> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    const since = new Date(now.getTime() - 30 * 24 * 3600_000)
    const rows = await this.runs.find({
      where: { user_id: userId, routine_key: definition.key, created_at: MoreThanOrEqual(since) },
      select: ['notified', 'outcome'],
      take: 2000,
    })
    return {
      days: 30,
      runs: rows.length,
      notified: rows.filter(row => row.notified).length,
      failed: rows.filter(row => isFailedOutcome(row.outcome)).length,
    }
  }

  /**
   * #2843.19/.21/.24 (lot L13) — BACK-OFFICE SEUL (`RoutinesBackofficeController`,
   * `InternalSecretGuard`) : tentatives, échecs et durées des 30 derniers jours,
   * routine par routine, pour UN utilisateur. Le client n'en lit rien.
   */
  async backofficeRuns(userId: string, now: Date = new Date()): Promise<RoutineBackofficeRuns> {
    const since = new Date(now.getTime() - 30 * 24 * 3600_000)
    const [rows, costs, caps] = await Promise.all([
      this.runs.find({
        where: { user_id: userId, created_at: MoreThanOrEqual(since) },
        order: { created_at: 'DESC' },
        take: 2000,
      }),
      this.routineCosts(userId, since),
      this.caps ? this.caps.find({ where: { user_id: userId } }) : Promise.resolve([]),
    ])
    const capOf = new Map((caps ?? []).map(cap => [cap.routine_key as string, Number(cap.cost_cap_usd)]))
    const byKey = new Map<string, RoutineRunEntity[]>()
    for (const row of rows) byKey.set(row.routine_key, [...(byKey.get(row.routine_key) ?? []), row])
    return {
      userId,
      routines: [...byKey.entries()].map(([key, list]) => {
        const durations = list
          .map(row => row.duration_ms)
          .filter((value): value is number => typeof value === 'number')
          .sort((a, b) => a - b)
        const costByRun = list.flatMap(row => {
          const cost = costs.get(row.run_key)
          return cost === undefined ? [] : [{ runKey: row.run_key, costUsd: cost }]
        })
        return {
          key,
          runs: list.length,
          failures: list.filter(row => isFailedOutcome(row.outcome)).length,
          retries: list.reduce((sum, row) => sum + Math.max(0, (row.attempt ?? 1) - 1), 0),
          medianDurationMs: durations.length ? durations[Math.floor((durations.length - 1) / 2)] : null,
          maxDurationMs: durations.length ? durations[durations.length - 1] : null,
          costUsd: costByRun.length ? roundUsd(costByRun.reduce((sum, run) => sum + run.costUsd, 0)) : null,
          costByRun,
          capUsd: capOf.get(key) ?? null,
          stoppedByCap: list.filter(row => row.outcome === ROUTINE_BUDGET_STOP_OUTCOME).length,
        }
      }),
    }
  }

  /**
   * #2843.19 — règle (ou efface, `null`) le plafond d'une routine pour UN utilisateur.
   * Appelé par la seule route back-office (`InternalSecretGuard`) ; jamais par le client.
   */
  async setBudgetCap(userId: string, key: string, capUsd: number | null): Promise<void> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    if (capUsd !== null && (!Number.isFinite(capUsd) || capUsd < 0)) {
      throw new BadRequestException('Plafond invalide.')
    }
    if (!this.caps) throw new BadRequestException('Plafond indisponible.')
    if (capUsd === null) {
      await this.caps.delete({ user_id: userId, routine_key: definition.key })
      return
    }
    await this.caps.save(
      this.caps.create({ user_id: userId, routine_key: definition.key, cost_cap_usd: String(capUsd) }),
    )
  }

  /**
   * #2843.21 — le coût TARIFÉ de chaque exécution d'un utilisateur, par clé d'occurrence.
   * Le rattachement est le fil de corrélation que `executeOccurrence` pose autour de
   * l'exécuteur : toute ligne `provider_costs` écrite pendant l'exécution le porte
   * (`ProviderCostService.record`), sans que ce module écrive un coût lui-même (GA-26).
   * Une ligne non tarifée (`cost_usd` NULL) ne compte pas pour 0 : elle est ignorée.
   */
  private async routineCosts(userId: string, since: Date): Promise<Map<string, number>> {
    let rows: Array<{ correlation_id: string; cost_usd: string | null }> = []
    try {
      rows =
        (await this.runs.query(
          `SELECT correlation_id, cost_usd FROM provider_costs
            WHERE correlation_id LIKE $1 AND created_at >= $2
              AND (user_id IS NULL OR user_id = $3)`,
          [`${ROUTINE_COST_CORRELATION_PREFIX}${userId}:%`, since, userId],
        )) ?? []
    } catch (error) {
      // Coût illisible = non mesuré (`null` au back-office), jamais 0 (GA-18/19).
      this.logger.warn(`Coût des routines illisible (${(error as Error).message})`)
    }
    const byRun = new Map<string, number>()
    for (const row of rows) {
      if (row.cost_usd === null || row.cost_usd === undefined) continue
      const runKey = row.correlation_id.slice(ROUTINE_COST_CORRELATION_PREFIX.length)
      byRun.set(runKey, roundUsd((byRun.get(runKey) ?? 0) + Number(row.cost_usd)))
    }
    return byRun
  }

  /**
   * #2843.19 — vrai quand le plafond de CETTE routine (30 jours glissants) est atteint.
   * Sans plafond, aucune lecture. Une lecture en échec n'arrête rien : un plafond
   * illisible n'est pas un plafond atteint.
   */
  private async budgetExceeded(key: RoutineKey, userId: string, now: Date): Promise<boolean> {
    if (!this.caps) return false
    try {
      const cap = await this.caps.findOne({ where: { user_id: userId, routine_key: key } })
      if (!cap) return false
      const costs = await this.routineCosts(userId, new Date(now.getTime() - 30 * 24 * 3600_000))
      let spent = 0
      for (const [runKey, cost] of costs) if (runKey.startsWith(`${userId}:${key}:`)) spent += cost
      return spent >= Number(cap.cost_cap_usd)
    } catch (error) {
      this.logger.warn(`Plafond de routine illisible (${(error as Error).message})`)
      return false
    }
  }

  /**
   * La dernière exécution de CHAQUE routine de l'utilisateur, en une requête
   * (`DISTINCT ON`) — jamais un `findOne` par routine (P5, 29/09).
   */
  private async lastRunsByKey(userId: string): Promise<Map<string, { created_at: Date; outcome: string }>> {
    const rows = await this.runs.query(
      `SELECT DISTINCT ON (routine_key) routine_key, created_at, outcome
         FROM routine_runs
        WHERE user_id = $1
        ORDER BY routine_key, created_at DESC`,
      [userId],
    )
    const map = new Map<string, { created_at: Date; outcome: string }>()
    for (const row of (rows ?? []) as Array<{ routine_key: string; created_at: Date | string; outcome: string }>) {
      map.set(row.routine_key, {
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        outcome: row.outcome,
      })
    }
    return map
  }

  /**
   * Écrit les défauts manquants, sans jamais toucher aux lignes existantes.
   *
   * Une routine ajoutée au catalogue plus tard apparaît donc chez tout le monde
   * à la prochaine visite, avec son défaut — et une routine que quelqu'un avait
   * coupée reste coupée, parce qu'elle a déjà sa ligne.
   *
   * Rend les souscriptions de l'utilisateur, défauts matérialisés (une lecture
   * de moins qu'avant : la liste sert directement, sans relire).
   */
  private async materializeDefaults(userId: string): Promise<RoutineSubscriptionEntity[]> {
    const existing = await this.subscriptions.find({ where: { user_id: userId } })
    const known = new Set(existing.map(row => row.routine_key))
    const missing = ROUTINE_CATALOG.filter(definition => !known.has(definition.key))
    if (!missing.length) return existing

    try {
      await this.subscriptions.insert(
        missing.map(definition => ({
          user_id: userId,
          routine_key: definition.key,
          status: definition.defaultEnabled ? ('active' as const) : ('paused' as const),
          enabled: definition.defaultEnabled,
          hour: definition.defaultHour,
          weekday: definition.defaultWeekday,
          channel: definition.defaultChannel,
          time_zone: 'Europe/Paris',
          // #2916 (#2399.6/.7) — première apparition = a VU la version
          // actuelle du catalogue, pas une version antérieure devinée.
          seen_version: definition.version,
        })),
      )
    } catch (error) {
      // Deux onglets ouverts en même temps : la contrainte d'unicité tranche,
      // et l'écran s'affiche quand même.
      this.logger.warn(`Routine defaults insert skipped: ${(error as Error).message}`)
    }
    return this.subscriptions.find({ where: { user_id: userId } })
  }

  /**
   * Ce qui manque, une fois pour toutes les routines.
   *
   * Résolu ici plutôt que dans chaque exécuteur : sans messagerie connectée,
   * quatre routines sont muettes, et il vaut mieux le dire une fois à l'écran
   * que laisser quatre cases cochées ne rien faire tous les matins.
   */
  private async resolveBlockers(userId: string): Promise<Map<string, RoutineBlocker>> {
    const blockers = new Map<string, RoutineBlocker>()
    const [mailbox, agenda, ats, crm] = await Promise.allSettled([
      this.mailbox.status(userId),
      this.agenda.status(userId),
      this.ats.status(userId),
      this.crm.isConnected(userId),
    ])

    const mailboxReadable = mailbox.status === 'fulfilled' && mailbox.value.connected && mailbox.value.capabilities.read
    if (!mailboxReadable) blockers.set('mailbox_read', 'mailbox_not_connected')

    const agendaReadable = agenda.status === 'fulfilled' && agenda.value.connected && agenda.value.capabilities.read
    if (!agendaReadable) blockers.set('agenda_read', 'agenda_not_connected')

    if (!(ats.status === 'fulfilled' && ats.value.connected)) blockers.set('ats', 'ats_not_connected')

    if (!(crm.status === 'fulfilled' && crm.value)) blockers.set('crm', 'crm_not_connected')

    // #2399.8/#2399.9 — `no_accounts` était déjà déclaré (`routineBlockerSchema`,
    // i18n des deux langues) mais jamais PRODUIT : une routine `requires:
    // ['accounts']` (ex. `referencing_window`) se montrait activable même sans
    // aucun compte à surveiller — une automatisation séduisante mais non
    // exécutable, exactement ce que le NO-GO interdit. L'échec de la mesure
    // (pas d'espace actif, comptage illisible) NE bloque PAS : « je n'ai pas pu
    // compter » n'est jamais « zéro » (GA-18/GA-19) — bloquer à tort serait
    // pire qu'un faux négatif ponctuel.
    const workspaceId = await this.workspaceOf(userId)
    if (workspaceId) {
      try {
        const count = await this.accounts.count({
          where: { workspace_id: workspaceId, assigned_to: userId, status: Not('deleted') },
        })
        if (count === 0) blockers.set('accounts', 'no_accounts')
      } catch (error) {
        this.logger.warn(`Compteur de comptes personnels illisible (${(error as Error).message})`)
      }
    }

    return blockers
  }

  /** L'abonnement effectif : la ligne en base, ou le défaut du catalogue. */
  private toSubscription(
    key: RoutineKey,
    row: RoutineSubscriptionEntity | undefined,
    preference?: RoutinePreference | null,
  ): RoutineSubscription {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    if (!row) {
      return {
        key,
        status: definition.defaultEnabled ? 'active' : 'paused',
        enabled: definition.defaultEnabled,
        hour: definition.defaultHour,
        weekday: definition.defaultWeekday,
        channel: definition.defaultChannel,
        timeZone: 'Europe/Paris',
        maxItemsPerRun: null,
        // #2843.13 — jamais touchée : le niveau du catalogue, l'abonné lui-même.
        autonomy: preference?.autonomy ?? null,
        ownerUserId: preference?.owner_user_id ?? null,
      }
    }
    // `row.status` peut être absent sur une ligne écrite AVANT la migration
    // `RoutineSubscriptionStatus1796322045000` et lue avant tout backfill (le
    // backfill couvre les lignes déjà en base, pas un repli applicatif) : on
    // dérive alors de `enabled`, jamais l'inverse — la même règle que le
    // backfill SQL, pour ne jamais faire mentir une ligne ancienne.
    const status = row.status ?? (row.enabled ? 'active' : 'paused')
    return {
      key,
      status,
      // Miroir dérivé, jamais lu depuis la colonne `enabled` elle-même une
      // fois `status` connu (GA-26 : une seule vérité une fois la migration
      // passée).
      enabled: status === 'active',
      hour: row.hour,
      weekday: row.weekday,
      channel: row.channel,
      timeZone: row.time_zone,
      // #2205.45 — une ligne écrite AVANT la migration `RoutineSubscriptionMaxItemsPerRun`
      // n'a pas cette colonne en mémoire (mock de test, ligne ancienne) : `null`,
      // jamais un défaut deviné.
      maxItemsPerRun: row.max_items_per_run ?? null,
      autonomy: preference?.autonomy ?? null,
      ownerUserId: preference?.owner_user_id ?? null,
    }
  }

  /**
   * #2398.7 — le PROCHAIN statut d'un abonnement, à partir d'un patch qui peut
   * porter `status` (le chemin neuf, écran) ou `enabled` (le chemin déprécié,
   * conservé le temps qu'un appelant migre).
   *
   * Seuls `active`/`paused`/`disabled` sont acceptés depuis l'écran
   * (`ROUTINE_SELECTABLE_STATUSES`) : `draft`/`error`/`deprecated` n'ont pas
   * encore de mécanisme qui les PRODUIT (voir `routineStatusSchema`), les
   * accepter en écriture ouvrirait un état que rien ne sait ni afficher ni
   * faire sortir.
   */
  private resolveNextStatus(patch: UpdateRoutineRequest, currentStatus: RoutineStatus): RoutineStatus {
    if (patch.status !== undefined) {
      if (!ROUTINE_SELECTABLE_STATUSES.includes(patch.status as (typeof ROUTINE_SELECTABLE_STATUSES)[number])) {
        throw new BadRequestException('Statut non réglable depuis cet écran.')
      }
      return patch.status
    }
    if (patch.enabled !== undefined) return patch.enabled ? 'active' : 'paused'
    return currentStatus
  }

  async update(userId: string, key: string, patch: UpdateRoutineRequest): Promise<RoutineView> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    if (definition.cadence === 'weekly' && patch.weekday === null) {
      throw new BadRequestException('Une routine hebdomadaire doit avoir un jour.')
    }

    // #2843 (#2205.45) — le plafond n'existe QUE pour `no_reply_follow_up`,
    // la seule routine où le calcul de la cible est déjà séparé de
    // l'écriture. L'accepter pour une autre routine créerait un réglage
    // mort : rien ne le lirait jamais côté exécuteur.
    if (patch.maxItemsPerRun !== undefined && definition.key !== 'no_reply_follow_up') {
      throw new BadRequestException('Plafond de destinataires non réglable pour cette routine.')
    }

    await this.savePreference(userId, definition, patch)

    const existing = await this.subscriptions.findOne({ where: { user_id: userId, routine_key: definition.key } })
    const current = this.toSubscription(definition.key, existing ?? undefined)
    const status = this.resolveNextStatus(patch, current.status)

    await this.subscriptions.save(
      this.subscriptions.create({
        ...(existing ? { id: existing.id } : {}),
        user_id: userId,
        routine_key: definition.key,
        status,
        // Miroir écrit ICI, jamais ailleurs (GA-26) : `enabled` ne redevient
        // jamais un réglage indépendant, même reçu explicitement dans `patch`.
        enabled: status === 'active',
        hour: patch.hour ?? current.hour,
        weekday: patch.weekday === undefined ? current.weekday : patch.weekday,
        channel: patch.channel ?? current.channel,
        time_zone: current.timeZone,
        // #2916 (#2399.6/.7) — un simple réglage (heure, canal…) ne marque
        // JAMAIS une version comme vue : seul le geste explicite le fait.
        // Sans ligne existante, l'abonnement NAÎT à jour (même règle qu'à la
        // matérialisation des défauts).
        seen_version: patch.acknowledgeVersion ? definition.version : (existing?.seen_version ?? definition.version),
        max_items_per_run: patch.maxItemsPerRun === undefined ? current.maxItemsPerRun : patch.maxItemsPerRun,
      }),
    )

    const views = await this.list(userId)
    const view = views.find(entry => entry.definition.key === definition.key)
    if (!view) throw new BadRequestException('Routine inconnue.')
    return view
  }

  /**
   * Exécute toutes les routines dues pour un utilisateur.
   *
   * Rend le nombre d'occurrences RÉELLEMENT exécutées — pas le nombre de
   * notifications : une routine qui tourne et n'a rien à dire compte quand
   * même, c'est ce qui permet de répondre « elle a tourné, il n'y avait rien »
   * plutôt que de laisser un doute.
   */
  async runDueFor(userId: string, now: Date = new Date()): Promise<number> {
    // Salle de démonstration : les routines s'y afficheraient comme actives et
    // posteraient des notifications sur des données scriptées, devant un
    // prospect. On montre l'écran, on ne joue pas les envois.
    if (await this.workspaceContext.isDemoWorkspace(userId)) return 0

    const rows = await this.subscriptions.find({ where: { user_id: userId } })
    const byKey = new Map(rows.map(row => [row.routine_key, row]))
    const blockers = await this.resolveBlockers(userId)
    const preferences = await this.preferencesOf(userId)

    let executed = 0
    /**
     * Les messages proactifs du balayage, arbitrés ENSEMBLE à la fin.
     *
     * L'arbitrage de proactivité trie ses candidats par priorité, mais il était
     * appelé avec un seul candidat : un tri sur un élément ne trie rien. Le premier
     * message de la journée gagnait sa place quelle que soit son importance, et
     * une alerte grave arrivée en cinquième position se faisait supprimer
     * pendant que quatre messages anodins étaient partis.
     *
     * C'est ici que le défaut se voyait le plus : vingt-six routines passent
     * dans la même boucle, pour le même utilisateur, en quelques secondes.
     */
    const proactive: ProactiveItem[] = []
    // #2875/#2402.1 (vague F/G 27/09) — les événements canoniques que les
    // routines Delivery construisent (`DeliveryRoutinesService`), recueillis
    // pour la corrélation multi-signal #2402.14 : même règle que
    // `InterventionsSweeper.logCombinedSignals`, appliquée ici au même espace
    // plutôt qu'au même compte.
    const triggerEvents: TriggerEvent[] = []
    for (const definition of ROUTINE_CATALOG) {
      const subscription = this.toSubscription(definition.key, byKey.get(definition.key))
      // Une routine dont la capacité manque ne tourne pas : elle enverrait une
      // notification vide tous les jours et se ferait couper.
      if (definition.requires.some(requirement => blockers.has(requirement))) continue

      const lastRun = await this.runs.findOne({
        where: { user_id: userId, routine_key: definition.key },
        order: { created_at: 'DESC' },
      })
      const lastKey = lastRun?.run_key.split(':').pop() ?? null

      // Une routine CONTINUE n'a pas d'occurrence journalière : elle produit une
      // occurrence par OBJET, réservée une par une. C'est ce qui permet de servir
      // « -1 h avant CHAQUE rendez-vous » sans rater le deuxième de la journée
      // ni re-notifier le premier tous les quarts d'heure.
      if (definition.cadence === 'continuous') {
        if (!isRoutineDue(subscription, definition.cadence, now, lastKey)) continue
        executed += await this.runContinuous(definition.key, userId, now)
        continue
      }

      // #2843.20 — une occurrence du jour échouée se REPREND (backoff, même ligne) :
      // elle passe avant le test « déjà faite aujourd'hui » qui la bloquerait.
      const runKey = routineRunKey(userId, definition.key, subscription.timeZone, now)
      const retrying = subscription.enabled && lastRun?.run_key === runKey && routineRetryDue(lastRun, now)
      if (!retrying && !isRoutineDue(subscription, definition.cadence, now, lastKey)) continue

      const attempt = retrying ? (lastRun.attempt ?? 1) + 1 : 1
      if (!(await this.reserveOccurrence(userId, definition.key, runKey, retrying ? attempt - 1 : null, now))) continue

      const result = await this.executeOccurrence(
        definition.key,
        userId,
        now,
        runKey,
        attempt,
        subscription.maxItemsPerRun,
        preferences.get(definition.key),
      )
      if (result.triggerEvent) triggerEvents.push(result.triggerEvent)
      if (result.proactive) proactive.push(result.proactive)
      executed += 1
    }

    // Un seul arbitrage pour tout le balayage : c'est ce qui rend la priorité
    // opérante. Ce qui dépasse le plafond est enregistré et marqué supprimé —
    // visible dans le centre d'actions, sans interrompre — jamais mis en file.
    await this.deliver(userId, proactive)
    this.logCombinedDeliveryTriggers(triggerEvents)
    return executed
  }

  /**
   * Réserve une occurrence AVANT de l'exécuter : rater un envoi se répare, un
   * double envoi non. Première tentative = insertion (l'unicité de `run_key`
   * tranche entre deux instances) ; reprise (#2843.20) = écriture
   * conditionnelle sur la MÊME ligne, gagnée par une seule instance.
   */
  private async reserveOccurrence(
    userId: string,
    key: RoutineKey,
    runKey: string,
    previousAttempt: number | null,
    now: Date,
  ): Promise<boolean> {
    if (previousAttempt === null) {
      try {
        await this.runs.insert({
          user_id: userId,
          routine_key: key,
          run_key: runKey,
          notified: false,
          outcome: 'En cours…',
          attempt: 1,
          attempted_at: now,
        })
        return true
      } catch {
        // Violation d'unicité = une autre instance a pris l'occurrence.
        return false
      }
    }
    const claimed = await this.runs.update(
      { run_key: runKey, attempt: previousAttempt, outcome: Like(`${ROUTINE_FAILURE_PREFIX}%`) },
      { attempt: previousAttempt + 1, attempted_at: now, outcome: 'En cours…' },
    )
    return (claimed?.affected ?? 0) > 0
  }

  /**
   * Exécute UNE occurrence déjà réservée et écrit sa trace (résultat, preuve,
   * durée). Au {@link ROUTINE_MAX_ATTEMPTS}-ième échec, l'abonnement passe en
   * statut `error` (#2843.9) et un message le dit dans l'application.
   */
  private async executeOccurrence(
    key: RoutineKey,
    userId: string,
    now: Date,
    runKey: string,
    attempt: number,
    maxItemsPerRun: number | null,
    preference?: RoutinePreference | null,
  ): Promise<{ proactive: ProactiveItem | null; triggerEvent: TriggerEvent | null; outcome: string }> {
    const startedAt = Date.now()
    // #2843.19 — plafond de coût atteint (back-office) : l'occurrence N'A PAS LIEU et le
    // dit sous un statut nommé, sans chiffre (c132). Ce n'est pas un échec : pas de reprise.
    if (await this.budgetExceeded(key, userId, now)) {
      await this.runs.update(
        { run_key: runKey },
        { notified: false, outcome: ROUTINE_BUDGET_STOP_OUTCOME, proof_ref: null, duration_ms: 0 },
      )
      return { proactive: null, triggerEvent: null, outcome: ROUTINE_BUDGET_STOP_OUTCOME }
    }
    try {
      // L'espace est résolu ICI et passé à l'exécuteur : les routines du
      // Delivery raisonnent par espace, pas par utilisateur — une facture
      // bloquée l'est pour l'ESN, pas pour la personne qui regarde.
      const workspaceId = await this.workspaceOf(userId)
      const health = await this.connectorHealth(userId)
      // #2843.21 — l'exécuteur tourne sous le fil `routine-run:<clé>` : chaque coût
      // fournisseur écrit pendant lui (`provider_costs.correlation_id`) se rattache à
      // CETTE occurrence, lu au back-office seul.
      const outcome = await correlationStorage.run(
        { ...(getCorrelationContext() ?? {}), correlationId: `${ROUTINE_COST_CORRELATION_PREFIX}${runKey}` },
        () =>
          this.executors.run(
            key,
            userId,
            now,
            workspaceId,
            health,
            // #2205.45 — le plafond réglé sur CET abonnement, jamais recalculé
            // côté exécuteur.
            maxItemsPerRun,
          ),
      )
      // #2205.54 — relayée telle quelle depuis l'exécuteur, jamais recalculée.
      // #2843.24 — la durée, lue en back-office seulement (jamais exposée au client).
      await this.runs.update(
        { run_key: runKey },
        {
          notified: outcome.notified,
          outcome: outcome.outcome,
          proof_ref: outcome.proofRef ?? null,
          duration_ms: Date.now() - startedAt,
        },
      )
      // `proactive` : une routine interrompt sans avoir été demandée, donc elle
      // passe par le plafond du §7 — mise de côté et arbitrée avec les autres.
      // #2843.30 — le gabarit de l'espace habille le texte calculé ; sans gabarit, rien ne change.
      const template =
        outcome.notified && outcome.notification && workspaceId ? await this.templateOf(workspaceId, key) : null
      const proactive = this.applyPreference(
        key,
        outcome.notified && outcome.notification
          ? {
              key,
              priority: outcome.priority ?? null,
              type: 'system' as const,
              title: outcome.notification.title,
              body: applyRoutineContent(template, outcome.notification.body ?? ''),
              link: outcome.notification.link,
            }
          : null,
        preference,
      )
      return { proactive, triggerEvent: outcome.triggerEvent ?? null, outcome: outcome.outcome }
    } catch (error) {
      // La trace reste, avec la cause : une routine qui échoue en silence est
      // pire qu'une routine qui échoue en le disant.
      const message = (error as Error).message
      this.logger.warn(`Routine ${key} failed for user`, { user: { id: userId }, error: message, attempt })
      const failure = `${ROUTINE_FAILURE_PREFIX}${message}`
      // Un échec n'a jamais rien produit de vérifiable.
      await this.runs.update(
        { run_key: runKey },
        { notified: false, outcome: failure, proof_ref: null, duration_ms: Date.now() - startedAt },
      )
      return {
        proactive: await this.disableAfterRepeatedFailures(key, userId, attempt),
        triggerEvent: null,
        outcome: failure,
      }
    }
  }

  /** #2843.9 — `error` est désormais PRODUIT : trois échecs de suite coupent la routine, et le disent. */
  private async disableAfterRepeatedFailures(
    key: RoutineKey,
    userId: string,
    attempt: number,
  ): Promise<ProactiveItem | null> {
    if (attempt < ROUTINE_MAX_ATTEMPTS) return null
    try {
      await this.subscriptions.update({ user_id: userId, routine_key: key }, { status: 'error', enabled: false })
    } catch (error) {
      this.logger.warn(`Routine ${key} : statut error non écrit (${(error as Error).message})`)
      return null
    }
    const name = findRoutine(key)?.name.fr ?? key
    return {
      key,
      priority: 80,
      type: 'system',
      title: `Routine « ${name} » arrêtée après ${ROUTINE_MAX_ATTEMPTS} échecs`,
      body: 'Elle ne repart que si tu la réactives, une fois la cause réglée.',
      link: '/settings/routines',
    }
  }

  /**
   * #2843.10 — « lancer maintenant » UNE routine, hors horaire. Même moteur que
   * le balayeur (réservation, trace, durée, statut `error`) ; la clé porte la
   * MINUTE, donc deux clics rapprochés n'exécutent qu'une fois. Aucune
   * exécution en salle de démonstration, ni quand une capacité manque.
   */
  async runNow(userId: string, key: string, now: Date = new Date()): Promise<RoutineRunNowResult> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    if (await this.workspaceContext.isDemoWorkspace(userId)) return { executed: false, outcome: null, reason: 'demo' }
    const blockers = await this.resolveBlockers(userId)
    if (definition.requires.some(requirement => blockers.has(requirement))) {
      return { executed: false, outcome: null, reason: 'blocked' }
    }
    const runKey = `${userId}:${definition.key}:manual:${now.toISOString().slice(0, 16)}`
    if (!(await this.reserveOccurrence(userId, definition.key, runKey, null, now))) {
      return { executed: false, outcome: null, reason: 'already_running' }
    }
    const row = await this.subscriptions.findOne({ where: { user_id: userId, routine_key: definition.key } })
    const subscription = this.toSubscription(definition.key, row ?? undefined)
    const preference = await this.preferenceOf(userId, definition.key)
    const result = await this.executeOccurrence(
      definition.key,
      userId,
      now,
      runKey,
      1,
      subscription.maxItemsPerRun,
      preference,
    )
    await this.deliver(userId, result.proactive ? [result.proactive] : [])
    return { executed: true, outcome: result.outcome }
  }

  /**
   * #2402.14 — plusieurs routines Delivery dues dans le MÊME balayage, sur le
   * MÊME espace, forment un cas plus fort (même règle que
   * `InterventionsSweeper.logCombinedSignals`). Journalisé seulement : la
   * composition ne rend ni notification ni ligne supplémentaire, et jamais de
   * probabilité — {@link combineTriggerEvents} ne rend que le MAX de gravité.
   */
  private logCombinedDeliveryTriggers(events: readonly TriggerEvent[]): void {
    const groups = new Map<string, TriggerEvent[]>()
    for (const event of events) {
      const key = `${event.scope.workspaceId}:${event.object.subjectType}:${event.object.subjectId}`
      const group = groups.get(key)
      if (group) group.push(event)
      else groups.set(key, [event])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const combined = combineTriggerEvents(group)
      this.logger.log(
        `Signaux Delivery combinés sur ${combined.subjectType}/${combined.subjectId} : ${combined.triggerTypes.join(' + ')}`,
      )
    }
  }

  /**
   * L'état de chaque capacité, pour la routine de santé (PDF 6, famille G).
   *
   * Résolu ICI et non dans l'exécuteur : ce service interroge déjà les quatre
   * connecteurs pour calculer les empêchements de chaque routine. Le redemander
   * ailleurs ferait deux lectures et, surtout, deux vérités sur le même fait.
   *
   * Une capacité qu'on n'a pas pu lire n'apparaît PAS : « je n'ai pas réussi à
   * regarder » n'est pas « c'est cassé », et notifier la première comme la
   * seconde ferait chercher une panne là où il n'y en a pas.
   */
  private async connectorHealth(userId: string): Promise<Record<string, string>> {
    const health: Record<string, string> = {}
    const [mailbox, agenda, crm] = await Promise.allSettled([
      this.mailbox.status(userId),
      this.agenda.status(userId),
      this.crm.isConnected(userId),
    ])

    if (mailbox.status === 'fulfilled' && mailbox.value.connected && !mailbox.value.capabilities.draft) {
      // Connectée, mais sans droit d'écriture : c'est exactement `read_only`,
      // et c'est ce qui fait échouer une relance APRÈS le clic.
      health.mailbox = 'read_only'
    }
    if (agenda.status === 'fulfilled' && agenda.value.connected && !agenda.value.capabilities.write) {
      health.agenda = 'read_only'
    }
    if (crm.status === 'rejected') health.crm = 'degraded'
    return health
  }

  /** L'espace actif, ou une chaîne vide si l'utilisateur n'en a aucun — une
   *  routine ne doit jamais tomber parce qu'un siège a été révoqué. */
  private async workspaceOf(userId: string): Promise<string> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return workspaceId
    } catch {
      return ''
    }
  }

  /** Même tolérance que {@link workspaceOf} : sans espace résolvable, `null`
   *  retombe sur la lecture par défaut (`routineReadingOf`), jamais une erreur
   *  qui ferait échouer tout l'écran pour un simple ordre d'affichage. */
  /** #2843.30 — le gabarit de l'espace pour cette routine ; `null` = le texte par défaut. */
  async content(userId: string, key: string): Promise<RoutineContentView> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    const workspaceId = await this.workspaceOf(userId)
    return { key: definition.key, template: workspaceId ? await this.templateOf(workspaceId, definition.key) : null }
  }

  /** #2843.30 — règle le gabarit POUR L'ESPACE (mêmes droits que les autres réglages de routine). */
  async setContent(userId: string, key: string, body: UpdateRoutineContentRequest): Promise<RoutineContentView> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    const parsed = updateRoutineContentRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Gabarit invalide.')
    const workspaceId = await this.workspaceOf(userId)
    if (!workspaceId || !this.contents) throw new BadRequestException('Aucun espace actif.')
    await this.contents.save(
      this.contents.create({
        workspace_id: workspaceId,
        routine_key: definition.key,
        template: parsed.data.template,
        updated_by: userId,
      }),
    )
    return { key: definition.key, template: parsed.data.template }
  }

  /** #2843.30 — retour au défaut : la ligne de l'espace s'efface, le défaut n'est jamais recopié. */
  async resetContent(userId: string, key: string): Promise<RoutineContentView> {
    const definition = findRoutine(key)
    if (!definition) throw new BadRequestException('Routine inconnue.')
    const workspaceId = await this.workspaceOf(userId)
    if (!workspaceId || !this.contents) throw new BadRequestException('Aucun espace actif.')
    await this.contents.delete({ workspace_id: workspaceId, routine_key: definition.key })
    return { key: definition.key, template: null }
  }

  private async templateOf(workspaceId: string, key: RoutineKey): Promise<string | null> {
    if (!this.contents) return null
    try {
      const row = await this.contents.findOne({ where: { workspace_id: workspaceId, routine_key: key } })
      return row?.template ?? null
    } catch (error) {
      // Illisible = le texte par défaut, jamais une notification vide.
      this.logger.warn(`Gabarit de routine illisible (${(error as Error).message})`)
      return null
    }
  }

  /** #2843.13 — les réglages de l'utilisateur, routine par routine (une requête). */
  private async preferencesOf(userId: string): Promise<Map<RoutineKey, RoutinePreference>> {
    if (!this.preferences) return new Map()
    try {
      const rows = await this.preferences.find({ where: { user_id: userId } })
      return new Map((rows ?? []).map(row => [row.routine_key, row]))
    } catch (error) {
      this.logger.warn(`Réglages de routine illisibles (${(error as Error).message})`)
      return new Map()
    }
  }

  private async preferenceOf(userId: string, key: RoutineKey): Promise<RoutinePreference | null> {
    if (!this.preferences) return null
    try {
      return await this.preferences.findOne({ where: { user_id: userId, routine_key: key } })
    } catch {
      return null
    }
  }

  /**
   * #2843.13 — valide puis écrit l'autonomie et l'owner. Autonomie : le niveau du
   * catalogue ou `n0_inform`, jamais au-dessus, jamais un niveau intermédiaire qui
   * ne changerait rien. Owner : seulement pour une routine de portée `workspace`
   * (elle lit l'espace, jamais la boîte ni l'agenda de la personne), et seulement
   * un membre du même espace.
   */
  private async savePreference(userId: string, definition: RoutineDefinition, patch: UpdateRoutineRequest) {
    if (patch.autonomy === undefined && patch.ownerUserId === undefined) return
    if (patch.autonomy && patch.autonomy !== 'n0_inform' && patch.autonomy !== definition.automationLevel) {
      throw new BadRequestException('Autonomie non réglable à ce niveau pour cette routine.')
    }
    if (patch.ownerUserId) {
      if (definition.scope !== 'workspace') {
        throw new BadRequestException('Owner réglable seulement pour une routine qui lit l’espace.')
      }
      const workspaceId = await this.workspaceOf(userId)
      const membership = workspaceId ? await this.workspaceContext.getMembership(patch.ownerUserId, workspaceId) : null
      if (!membership) throw new BadRequestException('Owner hors de l’espace.')
    }
    if (!this.preferences) throw new BadRequestException('Réglage indisponible.')
    const current = await this.preferenceOf(userId, definition.key)
    await this.preferences.save(
      this.preferences.create({
        user_id: userId,
        routine_key: definition.key,
        autonomy: patch.autonomy === undefined ? (current?.autonomy ?? null) : patch.autonomy,
        // Un owner égal à l'abonné revient au défaut : une seule façon de dire « moi ».
        owner_user_id:
          patch.ownerUserId === undefined
            ? (current?.owner_user_id ?? null)
            : patch.ownerUserId === userId
              ? null
              : patch.ownerUserId,
      }),
    )
  }

  /**
   * #2843.13 — ce que l'autonomie et l'owner changent au résultat d'une exécution :
   * `n0_inform` le garde dans l'historique sans notifier ; un owner (routine de
   * l'espace seulement) le reçoit à la place de l'abonné.
   */
  private applyPreference(
    key: RoutineKey,
    item: ProactiveItem | null,
    preference: RoutinePreference | null | undefined,
  ): ProactiveItem | null {
    if (!item) return null
    if (preference?.autonomy === 'n0_inform') return null
    const owner = preference?.owner_user_id
    if (owner && findRoutine(key)?.scope === 'workspace') return { ...item, recipient: owner }
    return item
  }

  /** #2843.13 — un arbitrage par destinataire : l'abonné toujours, chaque owner pour ce qui lui revient. */
  private async deliver(userId: string, items: readonly ProactiveItem[]): Promise<void> {
    const byRecipient = new Map<string, Omit<ProactiveItem, 'recipient'>[]>([[userId, []]])
    for (const { recipient, ...item } of items) {
      const target = recipient ?? userId
      byRecipient.set(target, [...(byRecipient.get(target) ?? []), item])
    }
    for (const [recipient, list] of byRecipient) await this.notifications.createProactiveBatch(recipient, list)
  }

  /**
   * #2843.29 — le profil de l'espace (`staffing` / `forfait_conseil`), lu sur le
   * profil CANONIQUE de l'ESN. Illisible ou non renseigné = `null` : aucune
   * supposition, l'ordre reste celui du rôle seul.
   */
  private async profileOf(userId: string): Promise<WorkspaceProfile | null> {
    if (!this.esnProfiles) return null
    try {
      const workspaceId = await this.workspaceOf(userId)
      if (!workspaceId) return null
      const row = await this.esnProfiles.findOne({
        where: { workspace_id: workspaceId, is_workspace_canonical: true, is_current: true },
        select: { id: true, workspace_profile: true },
      })
      return workspaceProfileOf(row)
    } catch {
      return null
    }
  }

  private async roleOf(userId: string): Promise<WorkspaceRole | null> {
    try {
      const { role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return role
    } catch {
      return null
    }
  }

  /**
   * Une routine continue : une occurrence par objet, chacune réservée avant sa
   * notification.
   *
   * La clé ne porte PAS de date — « ce rendez-vous a été annoncé » est vrai pour
   * toujours, et y mettre le jour ferait re-notifier le même rendez-vous le
   * lendemain matin. Rend le nombre d'objets réellement traités.
   */
  private async runContinuous(key: RoutineKey, userId: string, now: Date): Promise<number> {
    let outcome: Awaited<ReturnType<RoutineExecutors['run']>>
    try {
      outcome = await this.executors.run(
        key,
        userId,
        now,
        await this.workspaceOf(userId),
        await this.connectorHealth(userId),
      )
    } catch (error) {
      this.logger.warn(`Routine ${key} failed for user`, { user: { id: userId }, error: (error as Error).message })
      return 0
    }

    let handled = 0
    for (const item of outcome.items ?? []) {
      const runKey = routineObjectKey(userId, key, item.objectId)
      try {
        await this.runs.insert({
          user_id: userId,
          routine_key: key,
          run_key: runKey,
          notified: false,
          outcome: 'En cours…',
        })
      } catch {
        // Déjà annoncé — par une autre instance, ou par le balayage précédent.
        continue
      }
      // Une routine CONTINUE interrompt elle aussi : même plafond.
      await this.notifications.createNotification(userId, {
        type: 'system',
        title: item.notification.title,
        body: item.notification.body,
        link: item.notification.link,
        origin: 'proactive',
        priority: item.priority ?? null,
      })
      await this.runs.update({ run_key: runKey }, { notified: true, outcome: item.outcome })
      handled += 1
    }
    return handled
  }

  /** Les utilisateurs susceptibles d'avoir une routine due — ceux qui ont au
   *  moins un abonnement explicite, plus ceux servis par les défauts. */
  async subscribedUserIds(): Promise<string[]> {
    const rows = await this.subscriptions.find({ select: ['user_id'] })
    return [...new Set(rows.map(row => row.user_id))]
  }

  /** Le jour local courant d'un abonnement — exposé pour les tests du balayeur. */
  currentOccurrence(timeZone: string, now: Date): string {
    return occurrenceKey(timeZone, now)
  }
}
