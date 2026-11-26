import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThan, Not, Repository, type FindOptionsWhere } from 'typeorm'
import {
  PROACTIVITY_DEFAULT_CAP,
  accountFactAgePhrase,
  findRecurringNeed,
  decideProactivity,
  EMPTY_INTERRUPTION_STATE,
  isInterruptionSilenced,
  type MessageOrigin,
  defaultNotificationPreferences,
  isInQuietHours,
  notificationLevelFor,
  notificationLevelSchema,
  readRecentSignals,
  type ReadRecentSignal,
  TEAM_NOTIFICATION_TYPES,
  type NotificationInboxScope,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationType,
  type PaginatedResult,
  type UpdateNotificationPreferences,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import { personDisplayName } from '../action-os/run-trace'
import { IntegrationsService } from '../integrations/integrations.service'
import { SmsChannelService } from './sms/sms-channel.service'
import { observeSpan } from '../../common/observability-span'
import { collectSignals, selectNewSignals } from './new-signals'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'

/**
 * An account with a `priority_score` at or above this bar is worth alerting on
 * even when the analysis surfaced no discrete `recent_signals` — a high-priority
 * target is itself the "buy signal".
 */
const BUY_SIGNAL_PRIORITY_THRESHOLD = 70
/** #4648 — une suppression de notifications avance par lots de cette taille (premier passage = tout le stock). */
const REMOVE_BATCH = 500

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly integrations: IntegrationsService,
    // #1938.4 — décision Louis 13/09 batch 13 : le relais SMS des alertes
    // urgentes. EN DERNIER et optionnel : trois specs construisent ce service
    // par position, et un paramètre inséré au milieu les décalerait en silence.
    @Optional() private readonly sms?: SmsChannelService,
    // #4072.4 — le lecteur UNIQUE des faits du compte (#4069.1). EN DERNIER et
    // optionnel : absent, l'alerte est byte-identique.
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  /**
   * #4072.4 — « ce fait neuf répète un besoin passé » : la récurrence est un
   * signal fort (Louis 12/10), elle se DIT dans la cloche, datée, sans jamais
   * nommer d'où vient le besoin passé. Aucun besoin passé ou lecture en panne
   * ⇒ `null` : l'alerte reste ce qu'elle était.
   */
  private async recurrenceNote(
    account: Pick<AccountEntity, 'id' | 'user_id' | 'workspace_id'>,
    fact: { label: string; date: string | null },
  ): Promise<string | null> {
    if (!this.accountFacts || !account.workspace_id) return null
    try {
      const read = await this.accountFacts.forAccount({
        workspaceId: account.workspace_id,
        userId: account.user_id,
        accountId: account.id,
      })
      const past = findRecurringNeed(fact, read?.facts ?? [])
      if (!past) return null
      const when = formatFactDate(past.date)
      return when
        ? `Besoin récurrent : déjà exprimé le ${when} (${accountFactAgePhrase(past.ageDays)})`
        : `Besoin récurrent : déjà exprimé ${accountFactAgePhrase(past.ageDays)}`
    } catch (err) {
      this.logger.warn('recurrence lookup failed (non-fatal)', {
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /* -------------------------- preferences -------------------------- */

  /** The user's toggles, falling back to defaults when no row exists yet. */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const row = await this.prefs.findOne({ where: { user_id: userId } })
    if (!row) return { ...defaultNotificationPreferences }
    return {
      buy_signals: row.buy_signals,
      relance_reminders: row.relance_reminders,
      weekly_summary: row.weekly_summary,
      // #2082.16 / GA-26 — chaque repli lit le défaut À SON SEUL ENDROIT
      // (`defaultNotificationPreferences`) au lieu de le RÉÉCRIRE ici. Six
      // littéraux vivaient dans ce bloc ; changer le contrat ne les changeait
      // pas, et c'est exactement ainsi qu'un « défaut corrigé » continue de
      // servir l'ancienne valeur. Le `??` couvre les lignes lues avant la
      // migration qui a ajouté la colonne (et les fixtures anciennes).
      weekly_digest: row.weekly_digest ?? defaultNotificationPreferences.weekly_digest,
      credit_low: row.credit_low ?? defaultNotificationPreferences.credit_low,
      action_overdue: row.action_overdue ?? defaultNotificationPreferences.action_overdue,
      // Cadence de veille (§11) : opt-in strict — un défaut à `true` enverrait
      // un e-mail quotidien à qui ne l'a jamais demandé (#2082.16).
      watchlist_daily_digest: row.watchlist_daily_digest ?? defaultNotificationPreferences.watchlist_daily_digest,
      sidebar_changelog: row.sidebar_changelog,
      newsletter_changelog: row.newsletter_changelog,
      // #2082.4/.5/.6 — les trois annonces d'engagement. Même `??` que
      // ci-dessus : il couvre les lignes écrites AVANT la migration qui a
      // ajouté les colonnes, et il lit le défaut à son seul endroit (GA-26).
      meeting_prep: row.meeting_prep ?? defaultNotificationPreferences.meeting_prep,
      mission_end: row.mission_end ?? defaultNotificationPreferences.mission_end,
      client_reply: row.client_reply ?? defaultNotificationPreferences.client_reply,
      // #4158.19 — les quatre e-mails entre collègues : ENVOIS, donc faux tant
      // que la personne ne les a pas allumés. Le `??` couvre les lignes lues
      // avant la migration `1796498061438`.
      email_on_assignment: row.email_on_assignment ?? defaultNotificationPreferences.email_on_assignment,
      email_on_delegation: row.email_on_delegation ?? defaultNotificationPreferences.email_on_delegation,
      email_on_mention: row.email_on_mention ?? defaultNotificationPreferences.email_on_mention,
      email_on_manager_digest: row.email_on_manager_digest ?? defaultNotificationPreferences.email_on_manager_digest,
      // Plafond de proactivité (1789781294638) : `?? 3` couvre les lignes lues
      // avant la migration. Jamais 0 — un plafond nul ferait taire le produit
      // entier, ce qui n'est le choix de personne.
      proactivity_cap: row.proactivity_cap ?? PROACTIVITY_DEFAULT_CAP,
      // La capacité est ACTIVE par défaut (D49) — c'est un affichage IN-APP,
      // pas un envoi : `NOTIFICATION_IN_APP_PREFERENCE_KEYS` le dit, et
      // l'opt-out reste un geste explicite.
      laura_enabled: row.laura_enabled ?? defaultNotificationPreferences.laura_enabled,
      // Langue des e-mails (1787961843527) : NULL tant que la SPA ne l'a pas
      // reportée. On ne devine PAS — le sender retombe alors sur le défaut FR.
      email_language: readEmailLanguage(row.email_language),
      // Théo D settings-compte.N1 — NULL = aucune plage (le `??` couvre les
      // lignes lues avant la migration `1796574800007`).
      quiet_hours_start: row.quiet_hours_start ?? null,
      quiet_hours_end: row.quiet_hours_end ?? null,
    }
  }

  /** Upsert the user's toggles and return the merged, persisted set. */
  async updatePreferences(userId: string, patch: UpdateNotificationPreferences): Promise<NotificationPreferences> {
    const existing = await this.prefs.findOne({ where: { user_id: userId } })
    if (existing) {
      await this.prefs.update({ id: existing.id }, patch)
    } else {
      await this.prefs.insert({ user_id: userId, ...defaultNotificationPreferences, ...patch })
    }
    return this.getPreferences(userId)
  }

  /* -------------------------- feed -------------------------- */

  /**
   * #4158.14 — la boîte de réception, scopée à l'ESPACE ACTIF.
   *
   * Une notification porte `workspace_id` quand elle naît d'un geste dans un
   * espace (assignation, délégation, mention) : elle ne se lit QUE dans cet
   * espace. `workspace_id IS NULL` = notification personnelle (le produit,
   * Laura) : visible partout, comme avant. La catégorie « Équipe » est un
   * FILTRE de cette même boîte (`scope: 'team'`), jamais une seconde cloche.
   *
   * Sans `workspaceId` (appelant historique, ou personne sans espace), seules
   * les notifications personnelles sont lues — jamais celles d'un espace.
   */
  private inboxWhere(
    userId: string,
    workspaceId: string | null,
    scope: NotificationInboxScope,
    personalSpace = false,
  ): FindOptionsWhere<NotificationEntity> | FindOptionsWhere<NotificationEntity>[] {
    // #4158.56 — les anciennes notifications d'ÉQUIPE sans `workspace_id` (mention de fil Laura,
    // carte assignée, approbation confiée) s'affichaient dans TOUS les espaces. Quand leur lien
    // permet de déduire l'espace, la migration `TeamNotificationsBackfillWorkspace` le pose ; ce qui
    // reste sans espace (rien à en déduire) ne se lit plus que dans l'ESPACE PERSONNEL — celui dont la
    // personne est propriétaire — ou sans espace actif. Ajout seulement : aucune ligne n'est supprimée.
    const teamTypes = In([...TEAM_NOTIFICATION_TYPES])
    const legacyTeamVisible = !workspaceId || personalSpace
    const legacyTeam = { user_id: userId, workspace_id: IsNull(), type: teamTypes }
    if (scope === 'team') {
      const inSpace = workspaceId ? [{ user_id: userId, workspace_id: workspaceId, type: teamTypes }] : []
      const rows = legacyTeamVisible ? [...inSpace, legacyTeam] : inSpace
      return rows.length === 1 ? (rows[0] as FindOptionsWhere<NotificationEntity>) : rows
    }
    const personal = { user_id: userId, workspace_id: IsNull(), type: Not(teamTypes) }
    const rows = [
      personal,
      ...(legacyTeamVisible ? [legacyTeam] : []),
      ...(workspaceId ? [{ user_id: userId, workspace_id: workspaceId }] : []),
    ]
    return rows
  }

  async list(
    userId: string,
    page: number,
    size: number,
    inbox: { workspaceId?: string | null; scope?: NotificationInboxScope; personalSpace?: boolean } = {},
  ): Promise<PaginatedResult<NotificationItem>> {
    const scope = inbox.scope ?? 'all'
    const workspaceId = inbox.workspaceId ?? null
    const [rows, total] = await this.notifications.findAndCount({
      where: this.inboxWhere(userId, workspaceId, scope, inbox.personalSpace ?? false),
      order: { created_at: 'DESC' },
      take: size,
      skip: (page - 1) * size,
    })
    const actorNames = await this.actorNamesOf(rows)
    const totalPages = total === 0 ? 0 : Math.ceil(total / size)
    return {
      data: rows.map(row => toNotificationItem(row, actorNames)),
      pagination: {
        currentPage: page,
        size,
        totalItems: total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }
  }

  /**
   * #4158.14 — l'auteur d'un geste, EN CLAIR : lu au moment d'afficher (un nom
   * corrigé se corrige partout), jamais recopié dans la notification. Aucune
   * ligne avec auteur ⇒ aucune requête.
   */
  private async actorNamesOf(rows: readonly NotificationEntity[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map(row => row.actor_user_id).filter((id): id is string => !!id))]
    const names = new Map<string, string>()
    if (ids.length === 0) return names
    const profiles = await this.notifications.manager.query<
      Pick<ProfileEntity, 'user_id' | 'first_name' | 'last_name' | 'email'>[]
    >(`SELECT user_id, first_name, last_name, email FROM profiles WHERE user_id = ANY($1::uuid[])`, [ids])
    for (const profile of profiles) {
      const name = personDisplayName(profile as ProfileEntity)
      if (name) names.set(profile.user_id, name)
    }
    return names
  }

  async unreadCount(
    userId: string,
    inbox: { workspaceId?: string | null; scope?: NotificationInboxScope; personalSpace?: boolean } = {},
  ): Promise<number> {
    const where = this.inboxWhere(userId, inbox.workspaceId ?? null, inbox.scope ?? 'all', inbox.personalSpace ?? false)
    return this.notifications.count({
      where: Array.isArray(where) ? where.map(w => ({ ...w, read_at: IsNull() })) : { ...where, read_at: IsNull() },
    })
  }

  /** Mark a single notification read. Scoped by user_id so a caller can never
   *  flip another user's row (defence-in-depth on top of RLS). */
  async markRead(userId: string, id: string): Promise<void> {
    await this.notifications.update({ id, user_id: userId, read_at: IsNull() }, { read_at: new Date() })
  }

  /** « Tout marquer lu » vaut pour la boîte que la personne VOIT : l'espace
   *  actif et le personnel. Jamais les notifications d'un autre de ses espaces. */
  async markAllRead(
    userId: string,
    inbox: { workspaceId?: string | null; personalSpace?: boolean } = {},
  ): Promise<void> {
    const readAt = new Date()
    const where = this.inboxWhere(userId, inbox.workspaceId ?? null, 'all', inbox.personalSpace ?? false)
    for (const criteria of Array.isArray(where) ? where : [where]) {
      await this.notifications.update({ ...criteria, read_at: IsNull() }, { read_at: readAt })
    }
  }

  /**
   * #4648 — « Vider » (Louis 27/10/2026) : SUPPRIME pour de bon la boîte que la personne VOIT (l'espace actif et le
   * personnel), comme « Tout marquer lu ». ⚠️ Écart ASSUMÉ et daté avec « on archive, on ne supprime pas » : cette
   * règle porte sur les FAITS collectés sur un compte ; une notification est un message adressé à une personne.
   * Rend le nombre de lignes supprimées.
   */
  async clearInbox(
    userId: string,
    inbox: { workspaceId?: string | null; personalSpace?: boolean } = {},
  ): Promise<number> {
    const where = this.inboxWhere(userId, inbox.workspaceId ?? null, 'all', inbox.personalSpace ?? false)
    const { deleted } = await this.removeWhere(Array.isArray(where) ? where : [where])
    return deleted
  }

  /**
   * #4648 — la purge hebdomadaire (Louis 27/10/2026) : TOUT ce qui est né avant `cutoff`, lu comme non lu, pour tous
   * les utilisateurs — ne garder que les lues ferait revenir l'accumulation par l'autre bout. Rend des COMPTES,
   * jamais un titre ni un contenu (garde `notification-titles-no-sensitive-data.spec.ts`).
   */
  purgeOlderThan(cutoff: Date): Promise<{ deleted: number; users: number }> {
    return this.removeWhere([{ created_at: LessThan(cutoff) }])
  }

  /**
   * #4648 — LA suppression de notifications, unique (GA-26) : le bouton et le cron passent ici. Par lots bornés, chaque
   * lot portant le critère complet (dont `user_id` pour le geste — jamais un `where` sur le seul `id`) : un premier
   * passage sur tout le stock ne tient pas un verrou géant, et un passage interrompu se reprend là où il s'est arrêté.
   */
  private async removeWhere(
    criteria: readonly FindOptionsWhere<NotificationEntity>[],
  ): Promise<{ deleted: number; users: number }> {
    const users = new Set<string>()
    let deleted = 0
    for (const where of criteria) {
      for (;;) {
        const rows = await this.notifications.find({
          where,
          select: { id: true, user_id: true },
          take: REMOVE_BATCH,
        })
        if (rows.length === 0) break
        const result = await this.notifications.delete({ ...where, id: In(rows.map(row => row.id)) })
        deleted += result.affected ?? 0
        for (const row of rows) users.add(row.user_id)
        if (rows.length < REMOVE_BATCH) break
      }
    }
    return { deleted, users: users.size }
  }

  /** Insert one notification. Internal — callers are triggers, not HTTP. */
  /**
   * Crée une notification — et décide si elle a le droit d'INTERROMPRE.
   *
   * Le plafond de proactivité (PDF 6 §7) s'applique ici et nulle part ailleurs :
   * c'est le seul passage obligé des vingt-six routines, et le mettre plus haut
   * obligerait chacune à s'en souvenir. Trois règles :
   *
   *  - un message `failure` ou `user_triggered` passe TOUJOURS et ne consomme
   *    aucune place — un échec est une information que l'utilisateur a le droit
   *    d'avoir, et une réponse à son geste ne l'interrompt pas ;
   *  - un message `proactive` au-delà du plafond est **enregistré et marqué
   *    supprimé** : il reste visible dans le centre d'actions, sans notifier.
   *    Il n'est jamais mis en file — demain a ses propres messages ;
   *  - un échec de lecture du compteur laisse PASSER le message. Un plafond qui
   *    tombe en silence doit faire du bruit, pas du silence : c'est la version
   *    inverse du défaut qu'il corrige.
   */
  async createNotification(
    userId: string,
    input: {
      type: NotificationType
      title: string
      body?: string
      link?: string | null
      origin?: MessageOrigin
      priority?: number | null
      // #2404.7 — D'OÙ vient l'information : ce que l'espace a BRANCHÉ (sa
      // messagerie, son CRM) ou un registre public nommable — jamais un de
      // nos fournisseurs d'enrichissement. `undefined`/absent reste `null`,
      // jamais deviné (GA-18/GA-19).
      source?: string | null
      // #3922.n — le lien externe vérifiable du signal cité ; absent = `null`, jamais deviné.
      sourceUrl?: string | null
      sourceKind?: string | null
      // #4158.14 — un geste de COLLÈGUE dans un espace : l'espace et l'auteur.
      // Absents ⇒ `null`, notification personnelle comme avant.
      workspaceId?: string | null
      actorUserId?: string | null
    },
  ): Promise<NotificationEntity> {
    // #2442.4 (épopée #2879) — LE span notification : ce passage est déjà le seul obligé des routines.
    return observeSpan('notification', 'create', async () => {
      const origin = input.origin ?? 'user_triggered'
      const suppressed = origin === 'proactive' ? await this.exceedsCap(userId, input.priority ?? null) : false

      const saved = await this.notifications.save(
        this.notifications.create({
          user_id: userId,
          type: input.type,
          title: input.title,
          body: input.body ?? '',
          link: input.link ?? null,
          read_at: null,
          origin,
          priority: input.priority ?? null,
          // #2404.3 — le quadrant NOMMÉ de `priority`, jamais un second calcul :
          // il nomme pour l'écran, il ne pèse dans AUCUNE décision du plafond
          // de proactivité (voir `exceedsCap`, qui ne lit que `priority`).
          level: notificationLevelFor(input.priority ?? null),
          suppressed_at: suppressed ? new Date() : null,
          // #2404.7 — voir docblock ci-dessus.
          source: input.source ?? null,
          source_url: input.sourceUrl ?? null,
          source_kind: input.sourceUrl ? (input.sourceKind ?? null) : null,
          workspace_id: input.workspaceId ?? null,
          actor_user_id: input.actorUserId ?? null,
        }),
      )
      if (origin === 'proactive' && !suppressed) await this.countProactive(userId)
      if (!suppressed) this.relayBySms(userId, input.type, input.title)
      return saved
    })
  }

  /**
   * #1938.4 — décision Louis 13/09 batch 13 : une notification qui a le droit
   * d'interrompre est proposée au canal SMS — et à lui seul de décider (type
   * urgent, fournisseur branché, numéro vérifié, consentement, type coché).
   *
   * Branché ICI, au passage obligé, et non chez chaque émetteur : les trois
   * alertes urgentes naissent dans trois modules différents (analyse, crédits,
   * planificateur), et un relais posé chez l'un oublierait les deux autres.
   * Un message SUPPRIMÉ par le plafond de proactivité ne passe pas : un SMS est
   * une interruption, et c'est l'interruption que le plafond retire.
   *
   * Sans attendre : un envoi facturé ne doit pas rallonger le débit d'un crédit
   * ni la fin d'une analyse. Le canal ne lève pas ; le `catch` protège d'un
   * défaut futur qui le ferait lever quand même. Seul le TITRE voyage — il est
   * déjà tenu de ne porter aucune donnée sensible, le corps non.
   */
  private relayBySms(userId: string, type: NotificationType, title: string): void {
    const sms = this.sms
    if (!sms) return
    void (async () => {
      // Théo D settings-compte.N1 — la plage de tranquillité : rien ne sonne, la
      // cloche garde l'alerte. Relue à chaque envoi, dans le fuseau du profil.
      if (await this.inQuietHours(userId)) return
      await sms.dispatch(userId, { type, title })
    })().catch((error: unknown) => {
      this.logger.warn(`SMS relay failed (non-fatal): ${error instanceof Error ? error.name : 'unknown'}`)
    })
  }

  /**
   * Théo D settings-compte.N1 — `now` est-il dans la plage de tranquillité de
   * cette personne ? Fuseau du profil, à défaut Europe/Paris (le fuseau de
   * référence nommé du produit). Une plage illisible LAISSE PASSER : une alerte
   * urgente manquée coûte plus qu'un SMS de nuit, et l'in-app la porte de toute façon.
   */
  private async inQuietHours(userId: string): Promise<boolean> {
    try {
      const rows = await this.notifications.manager.query<
        { quiet_hours_start: string | null; quiet_hours_end: string | null; timezone: string | null }[]
      >(
        `SELECT np.quiet_hours_start, np.quiet_hours_end, p.timezone
           FROM notification_preferences np
           LEFT JOIN profiles p ON p.user_id = np.user_id
          WHERE np.user_id = $1`,
        [userId],
      )
      const row = rows?.[0]
      if (!row) return false
      return isInQuietHours(
        { start: row.quiet_hours_start, end: row.quiet_hours_end, timeZone: row.timezone ?? 'Europe/Paris' },
        new Date(),
      )
    } catch (error) {
      this.logger.warn(`Quiet hours unreadable, letting through: ${(error as Error).message}`)
      return false
    }
  }

  /**
   * Un LOT de messages proactifs, arbitré ENSEMBLE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT QUE CETTE MÉTHODE CORRIGE
   * ─────────────────────────────────────────────────────────────────────────
   * `decideProactivity` trie ses candidats par priorité — mais il était appelé
   * avec UN candidat à la fois. Un tri sur un élément ne trie rien : le premier
   * message de la journée gagnait sa place quelle que soit son importance, et
   * une alerte grave arrivée en cinquième position se faisait supprimer pendant
   * que quatre messages anodins étaient partis.
   *
   * Le balayage des routines est l'endroit où ce défaut se voyait le plus :
   * vingt-six routines passent dans la même boucle, pour le même utilisateur,
   * en quelques secondes. Les arbitrer ensemble rend enfin la priorité utile.
   *
   * Ce que la méthode NE change pas : ce qui dépasse est enregistré et marqué
   * supprimé — visible dans le centre d'actions, sans interrompre. Rien n'est
   * mis en file : demain a ses propres messages.
   */
  async createProactiveBatch(
    userId: string,
    candidates: readonly {
      key: string
      priority: number | null
      type: NotificationType
      title: string
      body?: string
      link?: string | null
      // #2404.7 — voir `createNotification` : même règle, même absence de défaut deviné.
      source?: string | null
    }[],
  ): Promise<NotificationEntity[]> {
    if (candidates.length === 0) return []

    let notified = new Set(candidates.map(candidate => candidate.key))
    // #1938.13 — le budget d'interruption partagé tait le LOT entier, avant
    // même de lire le plafond de volume : « coupé »/« en retrait » disent
    // qu'on ne parle pas aujourd'hui, pas qu'on parle un peu moins.
    if (await this.interruptionSilenced(userId)) {
      notified = new Set()
    } else {
      try {
        const cap = await this.proactivityCap(userId)
        const sent = await this.sentToday(userId)
        const verdict = decideProactivity(
          candidates.map(candidate => ({
            key: candidate.key,
            origin: 'proactive' as const,
            priority: candidate.priority ?? PROACTIVITY_DEFAULT_CAP * 10,
          })),
          { cap, alreadySentToday: sent },
        )
        notified = new Set(verdict.notify.map(entry => entry.key))
      } catch (error) {
        // Même repli qu'à l'unité : un plafond illisible laisse TOUT passer. Mieux
        // vaut une notification de trop qu'un message important avalé par une
        // panne de compteur.
        this.logger.warn(`Proactivity cap unreadable for batch, letting through: ${(error as Error).message}`)
      }
    }

    const saved: NotificationEntity[] = []
    for (const candidate of candidates) {
      const allowed = notified.has(candidate.key)
      saved.push(
        await this.notifications.save(
          this.notifications.create({
            user_id: userId,
            type: candidate.type,
            title: candidate.title,
            body: candidate.body ?? '',
            link: candidate.link ?? null,
            read_at: null,
            origin: 'proactive',
            priority: candidate.priority ?? null,
            // #2404.3 — même dérivation que `createNotification`, pas une seconde.
            level: notificationLevelFor(candidate.priority ?? null),
            suppressed_at: allowed ? null : new Date(),
            // #2404.7 — voir `createNotification`.
            source: candidate.source ?? null,
          }),
        ),
      )
      // Le compteur avance message par message : l'incrémenter en bloc ferait
      // diverger le compteur et les lignes si l'écriture échoue en cours de lot.
      if (allowed) await this.countProactive(userId)
      // #1938.4 — même règle qu'à l'unité : seul ce qui interrompt est relayé.
      if (allowed) this.relayBySms(userId, candidate.type, candidate.title)
    }
    return saved
  }

  /**
   * Ce message dépasse-t-il le plafond du jour, OU le budget d'interruption
   * partagé le tait-il ?
   *
   * `decideProactivity` tranche sur un candidat unique : le service ne voit pas
   * l'ensemble de la journée d'un coup, il voit les messages arriver un par un.
   * La règle est la même — priorité nulle, jamais ; au-delà du plafond, jamais.
   *
   * #1938.13 — s'y ajoute le budget d'interruption partagé avec la bulle de
   * Laura (`interruption-budget.ts`) : « coupé » et « en retrait » tenaient la
   * bulle sur un écran sans jamais borner ce second canal. Voir
   * `interruptionSilenced` pour ce qui est délibérément HORS de ce contrôle.
   */
  private async exceedsCap(userId: string, priority: number | null): Promise<boolean> {
    if (await this.interruptionSilenced(userId)) return true
    try {
      const cap = await this.proactivityCap(userId)
      const sent = await this.sentToday(userId)
      const verdict = decideProactivity(
        [{ key: 'candidate', origin: 'proactive', priority: priority ?? PROACTIVITY_DEFAULT_CAP * 10 }],
        { cap, alreadySentToday: sent },
      )
      return verdict.notify.length === 0
    } catch (error) {
      // Un plafond illisible laisse passer : mieux vaut une notification de trop
      // qu'un message important avalé par une panne de compteur.
      this.logger.warn(`Proactivity cap unreadable, letting through: ${(error as Error).message}`)
      return false
    }
  }

  /**
   * #1938.13 — LE BUDGET D'INTERRUPTION PARTAGÉ, CONSULTÉ PAR CE CANAL.
   *
   * `canInterrupt` (bulle de Laura sur un écran) et ce canal lisent la MÊME
   * ligne `notification_preferences` (`laura_enabled`, `laura_retreat_until`) —
   * `laura.service.ts` l'écrit déjà. Consulter `isInterruptionSilenced` ici
   * évite une seconde lecture de « coupé »/« en retrait » qui diverge
   * (GA-26) ; c'est le sous-ensemble PENSÉ pour un canal sans écran (voir son
   * docblock dans `interruption-budget.ts`).
   *
   * Volontairement HORS de ce contrôle, à dessein : le throttle (réduit le
   * plafond, ne coupe rien) et `screensServed` (n'a pas de sens hors écran) —
   * ils restent propres à la bulle. Un budget illisible laisse PASSER, même
   * repli que le plafond de volume juste au-dessus : mieux vaut une
   * notification de trop qu'un canal muet par panne de lecture.
   */
  private async interruptionSilenced(userId: string): Promise<boolean> {
    try {
      const rows = await this.notifications.manager.query<
        { laura_enabled: boolean | null; laura_retreat_until: Date | string | null }[]
      >(`SELECT laura_enabled, laura_retreat_until FROM notification_preferences WHERE user_id = $1`, [userId])
      const row = rows[0]
      if (!row) return false
      const state = {
        ...EMPTY_INTERRUPTION_STATE,
        disabled: row.laura_enabled === false,
        retreatUntil: row.laura_retreat_until ? new Date(row.laura_retreat_until).getTime() : null,
      }
      return isInterruptionSilenced(state, Date.now())
    } catch (error) {
      this.logger.warn(`Interruption budget unreadable, letting through: ${(error as Error).message}`)
      return false
    }
  }

  private async proactivityCap(userId: string): Promise<number> {
    const rows = await this.notifications.manager.query<{ proactivity_cap: number | null }[]>(
      `SELECT proactivity_cap FROM notification_preferences WHERE user_id = $1`,
      [userId],
    )
    const value = rows[0]?.proactivity_cap
    return typeof value === 'number' && Number.isFinite(value) ? value : PROACTIVITY_DEFAULT_CAP
  }

  private async sentToday(userId: string): Promise<number> {
    const rows = await this.notifications.manager.query<{ sent_count: number }[]>(
      `SELECT sent_count FROM proactivity_counters WHERE user_id = $1 AND local_day = CURRENT_DATE`,
      [userId],
    )
    return rows[0]?.sent_count ?? 0
  }

  /** Compte une interruption de plus. Best-effort : rater un incrément laisse
   *  passer un message de trop, le contraire ferait taire un message dû. */
  private async countProactive(userId: string): Promise<void> {
    try {
      await this.notifications.manager.query(
        `INSERT INTO proactivity_counters (user_id, local_day, sent_count, updated_at)
         VALUES ($1, CURRENT_DATE, 1, now())
         ON CONFLICT (user_id, local_day)
         DO UPDATE SET sent_count = proactivity_counters.sent_count + 1, updated_at = now()`,
        [userId],
      )
    } catch (error) {
      this.logger.warn(`Proactivity counter not incremented: ${(error as Error).message}`)
    }
  }

  /** Count notifications of a kind created since `since` — used by schedulers to
   *  de-duplicate periodic sends (e.g. one weekly summary per week). */
  async countSince(userId: string, type: NotificationType, since: Date): Promise<number> {
    const rows = await this.notifications.find({ where: { user_id: userId, type } })
    return rows.filter(n => n.created_at instanceof Date && n.created_at >= since).length
  }

  /* -------------------------- triggers -------------------------- */

  /**
   * Real delivery for the "Signaux d'achat" toggle: when an analysis completes,
   * if the account surfaced signals (or a high priority score) and the owner has
   * `buy_signals` enabled, drop an in-app notification. Best-effort and
   * idempotent-ish: safe to call once per completed run. Never throws to the
   * caller (the analysis worker) — a notification failure must not fail the run.
   */
  async notifyBuySignalForAccount(
    accountId: string,
    // #3920.a — le fait NEUF que la veille a trouvé, quelle que soit sa source
    // (offre, BODACC, ouverture Sirene, presse…). Absent = chemin d'origine
    // (fin d'analyse), byte-identique : le corps est lu dans `recent_signals`.
    fact?: { label: string; source: string; date: string | null; url?: string | null; body?: string },
  ): Promise<void> {
    try {
      const account = await this.accounts.findOne({ where: { id: accountId } })
      if (!account) return

      // #3928.a — le lecteur UNIQUE de `recent_signals` (même libellé, même
      // source, même doublon que la veille, Mes cibles et Laura).
      // #3920 — fin d'analyse (pas de fait neuf de la veille) : seuls les signaux
      // DATÉS de moins de 30 jours sonnent, jamais un signal sans date ni périmé.
      const freshLabels = new Set(selectNewSignals(collectSignals(account), new Set()).map(c => c.label))
      const signals = fact
        ? readRecentSignals(account.recent_signals)
        : readRecentSignals(account.recent_signals).filter(s => freshLabels.has(s.label))
      const strongPriority = (account.priority_score ?? 0) >= BUY_SIGNAL_PRIORITY_THRESHOLD
      if (!fact && signals.length === 0 && !strongPriority) return

      const prefs = await this.getPreferences(account.user_id)
      if (!prefs.buy_signals) return

      // One notification per completed run: the caller (the analysis worker's
      // `completed` handler) fires exactly once per job, so no extra dedup guard
      // is needed here.
      const companyName = account.company_name || 'Ce compte'
      const cited = fact
        ? readRecentSignals([{ signal: fact.label, source: fact.source, url: fact.url ?? null }])[0]
        : signals[0]
      const recurrence = fact ? await this.recurrenceNote(account, fact) : null
      const body = fact
        ? [fact.body ?? [fact.label, formatFactDate(fact.date)].filter(Boolean).join(' · '), recurrence]
            .filter(Boolean)
            .join(' · ')
        : buildBuySignalBody(signals, account.priority_score)
      await this.createNotification(account.user_id, {
        type: 'buy_signal',
        title: `Nouveau signal — ${companyName}`,
        body,
        // #3922.7 — la cloche mène à la veille du compte, où chaque signal porte son lien source.
        link: `/accounts/${accountId}?tab=veille`,
        // #2404.7 — mesuré en production : le panneau ne rendait aucune
        // source, sur ce déclencheur le plus visible du centre de
        // notifications. `recent_signals[].source` existait déjà (voir
        // `firstSignalSource`), il n'était simplement jamais relayé ici.
        source: fact ? fact.source || null : firstSignalSource(signals),
        // #3922.n — la preuve du signal cité, cliquable depuis la cloche
        // elle-même (lue par `readRecentSignals` : URL http(s) ou `null`).
        // #3920.a — un fait neuf de la veille porte SON lien, validé par le même lecteur.
        sourceUrl: cited?.source_url ?? null,
        sourceKind: cited?.source_kind ?? null,
      })

      // Fan the same buy signal out to the user's connected channels (Slack /
      // Discord / Teams / Google Chat / generic webhook). Best-effort — the
      // service swallows per-channel failures, but guard the whole call too so a
      // channel outage never fails the in-app notification above.
      await this.integrations.notifyUser(account.user_id, {
        type: 'buy_signal',
        text: `🔥 Nouveau signal — ${companyName}\n${body}`,
        data: { accountId, companyName, priorityScore: account.priority_score ?? null, link: `/accounts/${accountId}` },
      })
    } catch (err) {
      this.logger.warn('notifyBuySignalForAccount failed (non-fatal)', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #3920.crm (lot M01, 09/10/2026) — l'alerte « nouveau signal » pour les
   * signaux CRM (affaire perdue, dormante, à renouveler) qu'un balayage vient
   * de consigner pour la PREMIÈRE fois sur ce compte (`recordOnce`, jamais un
   * rappel quotidien du même fait). UNE alerte par compte et par passage :
   * la source est le CRM, nommé par sa capacité (« Votre CRM »), jamais par
   * son éditeur. Même préférence et même lien que les autres signaux d'achat :
   * la veille du compte, où chaque affaire est listée avec sa date.
   */
  async notifyCrmSignalsForAccount(accountId: string, evidences: readonly string[]): Promise<void> {
    const facts = evidences.filter(evidence => evidence.trim().length > 0)
    if (facts.length === 0) return
    try {
      const account = await this.accounts.findOne({ where: { id: accountId } })
      if (!account) return
      const prefs = await this.getPreferences(account.user_id)
      if (!prefs.buy_signals) return
      const companyName = account.company_name || 'Ce compte'
      // #3928.a — les faits CRM passent par le MÊME lecteur que les autres signaux.
      const body = buildBuySignalBody(
        readRecentSignals(facts.map(signal => ({ signal, source: CRM_SIGNAL_SOURCE }))),
        account.priority_score,
      )
      await this.createNotification(account.user_id, {
        type: 'buy_signal',
        title: `Nouveau signal — ${companyName}`,
        body,
        link: `/accounts/${accountId}?tab=veille`,
        source: CRM_SIGNAL_SOURCE,
      })
    } catch (err) {
      this.logger.warn('notifyCrmSignalsForAccount failed (non-fatal)', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** #3920.a — la date d'un fait neuf, lisible (« 5 oct. 2026 »), jamais l'ISO
 *  brut ; illisible ou absente → rien (la cloche nomme le fait sans dater). */
function formatFactDate(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    parsed,
  )
}

/** Only the two shipped locales survive a read; anything else (legacy row,
 *  hand-edited value) reads as "unknown" rather than as a wrong language. */
function readEmailLanguage(value: string | null | undefined): NotificationPreferences['email_language'] {
  return value === 'fr' || value === 'en' ? value : null
}

function toNotificationItem(row: NotificationEntity, actorNames: ReadonlyMap<string, string>): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    link: row.link ?? null,
    read_at: row.read_at ? row.read_at.toISOString() : null,
    created_at: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
    // #2404.3 — l'APPELANT manquant : `level` était dérivé et écrit à la
    // création (`notificationLevelFor`, ci-dessus) mais jamais relayé jusqu'au
    // wire — la cloche n'avait donc aucun moyen de le lire. `safeParse` plutôt
    // qu'un cast : une valeur de colonne hors énumération (jamais écrite par ce
    // service, mais la colonne reste un `text` libre) redevient `null`, jamais
    // une des quatre valeurs devinée.
    level: readNotificationLevel(row.level),
    // #2404.7 — même défaut que #2404.3 : `source` est écrit à la création
    // (`createNotification`) et doit être relayé jusqu'au wire, pas droppé ici.
    source: row.source ?? null,
    // #3922.n — relayé jusqu'au wire, jamais droppé ici (même défaut que #2404.3/.7).
    source_url: row.source_url ?? null,
    source_kind: row.source_kind ?? null,
    // #4158.14 — l'auteur EN CLAIR, ou `null` : jamais « un collègue » inventé
    // quand on ne sait pas qui (GA-18/GA-19).
    actor_name: row.actor_user_id ? (actorNames.get(row.actor_user_id) ?? null) : null,
    derived: false,
  }
}

function readNotificationLevel(value: string | null): NotificationItem['level'] {
  if (value === null) return null
  const parsed = notificationLevelSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** #3920.crm — le CRM nommé par sa CAPACITÉ, jamais par son éditeur (`crm-presence.ts`). */
const CRM_SIGNAL_SOURCE = 'Votre CRM'

/** Human-readable body from the signals read by `readRecentSignals`. */
function buildBuySignalBody(signals: readonly ReadRecentSignal[], priorityScore: number | null): string {
  const [first] = signals
  if (first) {
    const extra = signals.length > 1 ? ` (+${signals.length - 1} autre${signals.length > 2 ? 's' : ''})` : ''
    return `${truncate(first.label, 160)}${extra}`
  }
  return `Compte prioritaire (score ${priorityScore ?? '—'}/100) — à traiter en priorité.`
}

/** #2404.7 — la source du signal le plus visible (celui que `buildBuySignalBody`
 *  cite), jamais devinée quand elle est absente. */
function firstSignalSource(signals: readonly ReadRecentSignal[]): string | null {
  return signals[0]?.source ?? null
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
}
