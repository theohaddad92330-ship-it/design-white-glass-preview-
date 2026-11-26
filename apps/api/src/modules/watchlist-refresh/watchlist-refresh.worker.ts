import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { InjectRepository } from '@nestjs/typeorm'
import { UnrecoverableError, type Job } from 'bullmq'
import { Repository } from 'typeorm'
import { isFailure } from '@bellum/utils'
import { buildTriggerEvent, triggerPeriodQualifier } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { activeFollowExists } from '../account-follows/account-follow.entity'
import { AnalysisService } from '../analysis/analysis.service'
import { AnalysisOnDemandService } from '../analysis/analysis-ondemand.service'
import { BATCH_LANE_EXTRA_MS, PHASE_TIMEOUT_MS } from '../analysis/analysis.constants'
import { NotificationsService } from '../notifications/notifications.service'
import { buildNewSignalBody, collectSignals, selectNewSignals, signalIdentityKeys } from '../notifications/new-signals'
import { DiscoverAlertEventService } from '../notifications/discover-alerts/discover-alert-event.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import {
  REANALYSIS_JOB,
  REGISTRY_WATCH_JOB,
  isReanalysisDue,
  registryRowToItem,
  WATCHLIST_REFRESH_QUEUE,
  maxSignalAlertsPerDay,
  newSignalItems,
  signalItemsAcrossSources,
  type ReanalysisJobData,
  type RegistrySignalRow,
  type RegistryWatchJobData,
  type WatchSignalItem,
  type WatchlistRefreshJobData,
} from './watchlist-refresh.queue'
import { PublicRegistryWatch } from './public-registry-watch'
import { SignalAlertCap } from './signal-alert-cap'
import { Correlated } from '../../correlation-id/background-correlation'

type SignalSnapshot = Parameters<typeof signalIdentityKeys>[0] & object

/**
 * One IA research call at a time (the refresh is a background nicety — user
 * clicks keep priority), with a BullMQ lock that outlasts the Phase-1 budget
 * so a slow-but-alive refresh is never falsely stalled (same sizing rule as
 * the analysis worker).
 */
const WORKER_OPTIONS = {
  concurrency: 1,
  // LOT (15/10) DATA-C — + l'attente possible d'un lot (voie « lot » ci-dessous).
  lockDuration: PHASE_TIMEOUT_MS.research + BATCH_LANE_EXTRA_MS + 120_000,
}

/**
 * Executes one queued watchlist signal refresh (C4). Reuses the EXISTING
 * dimension-refresh mechanism behind the manual « Actualiser » button —
 * {@link AnalysisOnDemandService.refreshResearch} (Phase 1 re-run, stored
 * contacts/plan untouched) — but deliberately NOT through
 * `AnalysisRefreshService`: that wrapper debits 1 enrichment credit, and a
 * system-initiated refresh must never spend the user's credits (the volume
 * cap in the scheduler is the budget instead).
 *
 * New-signal detection: snapshot the persisted `recent_signals` keys before
 * the refresh, diff after. Only a genuinely NEW signal triggers
 * {@link NotificationsService.notifyBuySignalForAccount} — the existing
 * buy-signal flow (pref-gated in-app notification + outbound integrations
 * fan-out). Re-notifying on every daily tick would spam reps whose accounts
 * simply still carry yesterday's signals.
 */
@Processor(WATCHLIST_REFRESH_QUEUE, WORKER_OPTIONS)
@Injectable()
export class WatchlistRefreshWorker extends WorkerHost {
  private readonly logger = new Logger(WatchlistRefreshWorker.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly onDemand: AnalysisOnDemandService,
    private readonly notifications: NotificationsService,
    // #2151.16 / #2151.21 — le registre des événements de Découvrir. EN
    // DERNIER et optionnel : deux specs construisent ce worker par position, et
    // un paramètre inséré au milieu les décalerait en silence.
    @Optional() private readonly discoverEvents?: DiscoverAlertEventService,
    // #2875 (#2402.1, #2402.3, lot R03) — le registre canonique des
    // déclencheurs, MÊME règle de position : en dernier, optionnel.
    @Optional() private readonly triggers?: TriggerRegistryService,
    // #3916.a — la lecture continue des registres publics (job `registry`).
    // MÊME règle de position : en dernier, optionnel ; absent = no-op strict.
    @Optional() private readonly registry?: PublicRegistryWatch,
    // #3920.a — le compteur du plafond d'alertes. En dernier, optionnel :
    // absent, seul le réglage (`WATCHLIST_ALERTS_MAX_PER_DAY`, 0 = muet) s'applique.
    @Optional() private readonly alertCap?: SignalAlertCap,
    // #4267.5 — la ré-analyse des comptes suivis (job `reanalysis`) passe par le lancement normal. En dernier, optionnel.
    @Optional() private readonly analysis?: AnalysisService,
    // LUD.1 — le profil de l'espace, pour lire les marchés de SON domaine. En dernier, optionnel.
    @Optional() private readonly esnProfile?: EsnProfileService,
  ) {
    super()
  }

  @Correlated('worker:watchlist-refresh')
  async process(
    job: Job<WatchlistRefreshJobData> | Job<RegistryWatchJobData> | Job<ReanalysisJobData>,
  ): Promise<'refreshed' | 'collected' | 'skipped'> {
    if (job.name === REANALYSIS_JOB) return this.processReanalysis(job as Job<ReanalysisJobData>)
    if (job.name === REGISTRY_WATCH_JOB) return this.processRegistry(job as Job<RegistryWatchJobData>)
    const { accountId } = (job as Job<WatchlistRefreshJobData>).data

    // Re-check eligibility at RUN time — the staggered delay means hours can
    // pass between the tick and this job; the rep may have archived the
    // account (or a re-analysis may be in flight) in between.
    // #4267.1 — « suivi » = un suivi EXPLICITE actif ; le rep a pu cliquer « Ne plus suivre » entre-temps.
    const account = await this.accounts.findOne({ where: { id: accountId } })
    const followed = account ? await this.isFollowed(accountId) : false
    if (!account || account.status !== 'completed' || !followed) {
      this.logger.log('Watchlist refresh skipped — account no longer eligible', {
        accountId,
        status: account?.status ?? 'missing',
        followed,
      })
      return 'skipped'
    }

    // #3920.a — l'AVANT porte TOUTES les sources du compte : `recent_signals`,
    // les listes que la phase 1 re-collecte (offres, BODACC, presse, avis,
    // marchés, registre) et les annonces lues en continu. Les mêmes lignes de
    // registre servent aux deux côtés : seule la re-collecte peut créer du neuf.
    const registryRows = await this.registryRowsFor(account.siren)
    const before = signalItemsAcrossSources({
      recentSignals: account.recent_signals,
      rawAnalysis: account.raw_analysis,
      registry: registryRows,
    })

    // UN-BILLED system refresh (see class doc). Scoped to the account OWNER —
    // refreshResearch's findOne(accountId, userId) guard stays effective.
    // LOT (15/10) DATA-A point 2 — `watch` : avec le cache 30 j la phase 1 ne voit plus de nouveauté ; la veille
    // ajoute UN appel Brave News `freshness=pd` par compte (cache 1 j à part, côté IA).
    // LOT (15/10) DATA-C — personne n'attend devant un écran : les appels Claude
    // de ce refresh partent en lot (Message Batches, moitié prix), repli
    // synchrone côté IA si le lot échoue ou tarde.
    const result = await this.onDemand.refreshResearch(accountId, account.user_id, { watch: true, llmLane: 'batch' })
    if (isFailure(result)) {
      // Throw → BullMQ marks the job failed (isolated: the rest of the day's
      // batch is untouched). attempts=1, so no same-day IA re-billing — the
      // account simply becomes a stale candidate for tomorrow's tick.
      const message = `Watchlist signal refresh failed (${result.problem.code}): ${result.problem.message}`
      // Une précondition refusée par l'IA (espace figé, dossier incomplet) ne se corrige pas en réessayant.
      if (result.problem.code === 'precondition_failed') throw new UnrecoverableError(message)
      throw new Error(message)
    }

    const refreshed = await this.accounts.findOne({ where: { id: accountId } })
    const after = signalItemsAcrossSources({
      recentSignals: refreshed?.recent_signals,
      rawAnalysis: refreshed?.raw_analysis,
      registry: registryRows,
    })
    const fresh = newSignalItems(before, after)
    const newSignals = fresh.length

    // ───────────────────────────────────────────────────────────────────────
    // #2151.21 — ÉVÉNEMENT « ANALYSE ACTUALISÉE ».
    // ───────────────────────────────────────────────────────────────────────
    // Ce worker est le seul endroit du dépôt qui SAIT qu'une analyse vient
    // d'être rejouée sur un compte suivi — le balayage de Découvrir le relirait
    // en base sans pouvoir le distinguer d'une retouche de champ. Il consigne
    // donc lui-même, par la porte unique du registre : `record` refuse le
    // doublon, ce qui rend l'appel sûr même si le compte est rafraîchi deux
    // fois dans la même journée (#2151.25).
    //
    // Consigner N'ENVOIE RIEN : un événement d'analyse actualisée n'est pas
    // urgent, il naît sans surface et attend le passage de l'émetteur.
    await this.recordDiscoverEvent('analysis_refreshed', account, refreshed?.company_name ?? '')

    if (newSignals > 0) {
      this.logger.log('Watchlist refresh surfaced new signal(s)', { accountId, newSignals })
      await this.announceNewSignals(
        account,
        fresh,
        refreshed?.company_name ?? '',
        { ...account, registry_items: registryRows.map(registryRowToItem) },
        { ...(refreshed ?? account), registry_items: registryRows.map(registryRowToItem) },
      )
    }

    return 'refreshed'
  }

  /**
   * #3916.a — la lecture quotidienne de BODACC pour UN SIREN suivi. Aucun appel
   * payant (ni Claude ni recherche web) : seule la source publique est lue.
   * Une panne fait échouer le job — visible dans la file, jamais un succès muet
   * — et laisse le curseur en place pour le passage de demain.
   */
  /**
   * LUD.1 — les domaines NON-IT des espaces qui suivent ce compte (`esn_it` ou illisible = rien : la lecture
   * IT d'avant couvre). Un profil illisible n'arrête jamais la veille.
   */
  private async followerPacks(followers: readonly { user_id?: string | null }[]): Promise<string[]> {
    if (!this.esnProfile) return []
    const packs = new Set<string>()
    for (const userId of new Set(followers.map(f => f.user_id).filter((u): u is string => !!u))) {
      try {
        const domain = (await this.esnProfile.resolveProfileData(userId)).offerDomain
        if (domain && domain !== 'esn_it') packs.add(domain)
      } catch {
        // profil illisible : tri IT d'avant
      }
    }
    return [...packs]
  }

  private async processRegistry(job: Job<RegistryWatchJobData>): Promise<'collected' | 'skipped'> {
    if (!this.registry) return 'skipped'
    const { siren } = job.data
    // #3920.a — les comptes SUIVIS qui portent ce SIREN, et l'AVANT de leurs
    // annonces : la comparaison décide seule de ce qui est neuf.
    const followers = await this.accounts
      .createQueryBuilder('account')
      .where('account.siren = :siren', { siren })
      .andWhere('account.status = :completed', { completed: 'completed' })
      // #4267.1 — suivis EXPLICITEMENT, jamais déduits du statut commercial.
      .andWhere(activeFollowExists('account'))
      .getMany()
    const rowsBefore = followers.length > 0 ? await this.registry.rowsFor(siren) : []
    const outcome = await this.registry.collectBodacc(siren, new Date())
    // #3921.a — le relevé Sirene du jour (ouvertures + effectif), lu même si
    // BODACC est tombé : deux sources indépendantes, une panne n'en prive pas
    // l'autre. Sans clé INSEE, no-op strict (`configured: false`).
    const sirene = await this.registry.collectSirene(siren, new Date())
    // #3920.8 — les marchés publics ATTRIBUÉS : lus tous les jours pour le compte suivi, même si
    // BODACC est tombé. Une panne n'arrête rien (la source libre peut se rattraper demain).
    const awardsName = followers.find(f => f.company_name?.trim())?.company_name?.trim()
    let awards: Awaited<ReturnType<PublicRegistryWatch['collectAwards']>> | null = null
    if (awardsName) {
      try {
        // LUD.1 — espace IT : l'appel d'avant, sans quatrième argument.
        const packs = await this.followerPacks(followers)
        awards =
          packs.length > 0
            ? await this.registry.collectAwards(siren, awardsName, new Date(), packs)
            : await this.registry.collectAwards(siren, awardsName, new Date())
      } catch (err) {
        this.logger.warn('Marchés attribués en échec (non fatal)', {
          siren,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    // #3921.9 — les événements du registre national (dirigeant, ouverture / fermeture d'établissement) :
    // même veille, même cache commun côté IA. Sans identifiants = no-op ; une panne n'arrête rien.
    let rne: Awaited<ReturnType<PublicRegistryWatch['collectRne']>> | null = null
    try {
      rne = await this.registry.collectRne(siren, new Date())
    } catch (err) {
      this.logger.warn('Événements du registre national en échec (non fatal)', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (outcome.failed) throw new Error(`Public registry watch failed (BODACC unreachable) for SIREN ${siren}`)
    this.logger.log('Public registry watch collected', {
      siren,
      written: outcome.written,
      firstPass: outcome.firstPass,
    })
    // #3916.b — une procédure collective arme le risque de l'ESN au référentiel
    // (S12, PAR-04). Best-effort : la collecte est déjà écrite.
    try {
      await this.registry.syncEsnRisk(siren, new Date())
    } catch (err) {
      this.logger.warn('ESN directory risk sync failed (non-fatal)', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // #3920.a — ce que la veille vient d'écrire et qui n'était dans AUCUNE
    // source du compte sonne, par la même porte que la re-analyse. Premier
    // passage BODACC : l'historique de 24 mois lu ne fait RIEN sonner.
    if (followers.length > 0 && !outcome.firstPass) {
      // Premier passage des marchés attribués : 24 mois d'historique, rien ne sonne (comme BODACC).
      const rowsAfter = (await this.registry.rowsFor(siren)).filter(
        row =>
          !(row.source === 'decp' && (!awards || awards.firstPass)) &&
          // Premier passage du registre national : l'historique lu ne sonne pas (comme les marchés attribués).
          !(row.source === 'rne' && (!rne || rne.firstPass)),
      )
      for (const follower of followers) {
        const sources = { recentSignals: follower.recent_signals, rawAnalysis: follower.raw_analysis }
        const fresh = newSignalItems(
          signalItemsAcrossSources({ ...sources, registry: rowsBefore }),
          signalItemsAcrossSources({ ...sources, registry: rowsAfter }),
        )
        if (fresh.length > 0) {
          await this.announceNewSignals(
            follower,
            fresh,
            follower.company_name ?? '',
            { ...follower, registry_items: rowsBefore.map(registryRowToItem) },
            { ...follower, registry_items: rowsAfter.map(registryRowToItem) },
          )
        }
      }
    }
    if (sirene.failed) throw new Error(`Public registry watch failed (Sirene unreachable) for SIREN ${siren}`)
    return 'collected'
  }

  /** Les annonces de registre connues pour un SIREN — `[]` sans collecteur ni SIREN. */
  /** #4267.1 — un suivi EXPLICITE actif existe-t-il sur ce compte ? La même définition que le scheduler. */
  /**
   * #4267.5 — relance l'analyse d'un compte suivi. L'éligibilité est relue AU PASSAGE (le suivi a pu être
   * retiré, l'analyse refaite à la main entre le tick et ce job). Le lancement est l'ordinaire : crédits
   * débités comme une analyse normale, un échec (crédits épuisés…) est dit au journal, jamais masqué.
   */
  private async processReanalysis(job: Job<ReanalysisJobData>): Promise<'refreshed' | 'skipped'> {
    const { accountId, userId } = job.data
    const account = await this.accounts.findOne({ where: { id: accountId } })
    const followed = account ? await this.isFollowed(accountId) : false
    if (!account || account.status !== 'completed' || !followed || !this.analysis) {
      this.logger.log('Watchlist re-analysis skipped — account no longer eligible', { accountId, followed })
      return 'skipped'
    }
    const rows: Array<{ last: Date | null }> = await this.accounts.query(
      "SELECT MAX(completed_at) AS last FROM analysis_runs WHERE account_id = $1 AND status = 'completed'",
      [accountId],
    )
    const last = rows[0]?.last ? new Date(rows[0].last) : null
    if (!isReanalysisDue({ followed, lastAnalysisAt: last, now: new Date() })) return 'skipped'

    const started = await this.analysis.start(
      { company_name: account.company_name, ...(account.siren ? { siren: account.siren } : {}) } as Parameters<
        AnalysisService['start']
      >[0],
      userId,
    )
    if (isFailure(started)) {
      this.logger.warn('Watchlist re-analysis not launched', { accountId, code: started.problem.code })
      return 'skipped'
    }
    return 'refreshed'
  }

  private async isFollowed(accountId: string): Promise<boolean> {
    const rows: Array<{ followed: boolean }> = await this.accounts.query(
      `SELECT ${activeFollowExists('account')} AS followed FROM accounts account WHERE account.id = $1`,
      [accountId],
    )
    return rows[0]?.followed === true
  }

  private async registryRowsFor(siren: string | null): Promise<RegistrySignalRow[]> {
    if (!this.registry || !siren) return []
    try {
      return await this.registry.rowsFor(siren)
    } catch {
      return []
    }
  }

  /**
   * #3920.a — UNE porte pour annoncer un signal neuf, quelle que soit la source
   * qui l'a fait apparaître (re-analyse ou registres) : l'événement Découvrir,
   * le déclencheur canonique, puis la cloche — elle seule soumise au plafond
   * d'alertes. Le plus récent des faits neufs est celui que la cloche nomme.
   */
  private async announceNewSignals(
    account: AccountEntity,
    fresh: WatchSignalItem[],
    label: string,
    beforeSnapshot: SignalSnapshot,
    afterSnapshot: SignalSnapshot,
  ): Promise<void> {
    // #3920.k — « nouveau » se décide ICI, par l'identité de TOUTES les sources
    // (`signalIdentityKeys`) : un signal sans date, périmé ou déjà vu n'est
    // jamais nouveau — ni événement, ni cloche. Le corps NOMME le fait le plus
    // récent (`buildNewSignalBody`), jamais « N signaux détectés ».
    const seen = signalIdentityKeys(beforeSnapshot)
    const novel = selectNewSignals(collectSignals(afterSnapshot), seen, new Date(), null)
    const body = buildNewSignalBody(novel)
    const top = novel[0]
    if (!top || !body) {
      this.logger.log('Signal not new (undated, expired or already seen) — no alert', { accountId: account.id })
      return
    }
    // #2151.16 / #2166.66 — l'événement « nouveau signal actuel », consigné
    // au seul endroit qui a comparé l'AVANT et l'APRÈS.
    await this.recordDiscoverEvent('new_signal', account, label)
    // #2875 (#2402.1, #2402.3, lot R03) — le MÊME constat construit AUSSI un
    // `TriggerEvent` canonique — jamais un second calcul, best-effort.
    this.recordSignalNouveauTrigger(account)
    const fact = {
      label: top.label,
      source: top.source ?? '',
      date: top.date ? top.date.toISOString().slice(0, 10) : null,
      url: top.url,
      body,
    }
    if (fresh.length === 0 || !(await this.mayAlert(account.user_id))) {
      this.logger.log('New signal kept silent (alert cap reached or off)', { accountId: account.id })
      return
    }
    // Existing buy-signal flow: pref gate, in-app notification, outbound
    // integrations (Slack/Teams/webhooks…) — it now NAMES the new fact.
    // Best-effort — it never fails a refresh that already persisted.
    try {
      await this.notifications.notifyBuySignalForAccount(account.id, fact)
    } catch (err) {
      this.logger.warn('Watchlist refresh buy-signal notification failed (non-fatal)', {
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** #3920.a — le plafond d'alertes : `0` = aucune alerte système ; sinon le compteur décide. */
  private async mayAlert(userId: string): Promise<boolean> {
    if (maxSignalAlertsPerDay() <= 0) return false
    if (!this.alertCap) return true
    try {
      return await this.alertCap.allows(userId, new Date())
    } catch {
      // Un compteur en panne ne fait pas taire un signal : il ne prévient
      // simplement pas qu'on approche du plafond.
      return true
    }
  }

  /**
   * Consigne un événement de Découvrir — best-effort, jamais fatal.
   *
   * Un compte SANS espace ne consigne rien : `workspace_id` est la barrière de
   * cloisonnement de la table (arrêt §10), et écrire une ligne sans elle la
   * rendrait lisible par personne — ou, pire, par tout le monde le jour où
   * quelqu'un relâche la lecture.
   */
  private async recordDiscoverEvent(
    kind: 'new_signal' | 'analysis_refreshed',
    account: AccountEntity,
    label: string,
  ): Promise<void> {
    if (!this.discoverEvents || !account.workspace_id) return
    try {
      await this.discoverEvents.record({
        workspaceId: account.workspace_id,
        kind,
        subjectId: account.id,
        subjectLabel: label || account.company_name || '',
        occurredAt: new Date(),
      })
    } catch (err) {
      this.logger.warn('Consignation d’un événement de Découvrir en échec (non fatal)', {
        accountId: account.id,
        kind,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #2875 (#2402.1, #2402.3, lot R03) — persiste AUSSI un `TriggerEvent`
   * canonique `signal_nouveau`, au registre unique (#2402.9). `buildTriggerEvent`
   * reste l'UNIQUE point de construction (#2402.2) : rien n'est recalculé, ce
   * n'est qu'une seconde écriture du même constat que {@link recordDiscoverEvent}
   * vient de faire. Best-effort, jamais sur le chemin critique du rafraîchissement.
   */
  private recordSignalNouveauTrigger(account: AccountEntity): void {
    if (!this.triggers || !account.workspace_id) return
    try {
      const now = new Date()
      const event = buildTriggerEvent({
        type: 'signal_nouveau',
        source: 'watchlist-refresh',
        subjectType: 'account',
        subjectId: account.id,
        workspaceId: account.workspace_id,
        ownerId: account.user_id ?? null,
        evidence: `Nouveau signal de veille sur ${account.company_name || account.id}`,
        confidence: 'mesuree',
        now,
        // #2875 — une ligne par jour et par compte, pas une par rafraîchissement.
        dedupeQualifier: triggerPeriodQualifier(now, 'day'),
      })
      void this.triggers.recordOnceByDedupeKey(event, 'watchlist-refresh/watchlist-refresh.worker')
    } catch (err) {
      this.logger.warn('Événement canonique « signal_nouveau » en échec (non fatal)', {
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WatchlistRefreshJobData | RegistryWatchJobData> | undefined, err: Error): void {
    this.logger.error('Watchlist refresh job failed', {
      jobId: job?.id,
      accountId: job && 'accountId' in job.data ? job.data.accountId : undefined,
      siren: job && 'siren' in job.data ? job.data.siren : undefined,
      message: err.message,
    })
  }
}
