import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, In, LessThan, Not, Repository } from 'typeorm'
import {
  INTERACTION_ACTIVITY_KINDS,
  SYNC_RUN_TERMINAL_STATUSES,
  type SyncRunStatus,
  type SyncSummaryLine,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { IntegrationSyncRunEntity } from '../../database/entities/integration-sync-run.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { countNameAmbiguities } from './ambiguity-detection'
import {
  accountsSummaryLine,
  actionsSummaryLine,
  ambiguitiesSummaryLine,
  contactsSummaryLine,
  exchangesSummaryLine,
  meetingsSummaryLine,
  meetingsToPrepareSummaryLine,
  pagesSummaryLine,
} from './sync-summary-labels'

/**
 * #2207.29 — un ÉCHANGE avec le compte, jamais une activité au sens large
 * (une note, une analyse — voir la doctrine `INTERACTION_ACTIVITY_KINDS` dans
 * `activity.ts`, un seul endroit pour cette liste, GA-26). Moins `meeting` :
 * déjà sa propre ligne (#2207.28), pour ne jamais compter un rendez-vous deux
 * fois sous deux noms.
 */
const EXCHANGE_KINDS = INTERACTION_ACTIVITY_KINDS.filter(kind => kind !== 'meeting')

/**
 * #2110.21 — au-delà de cette durée, un run non terminal est considéré
 * INTERROMPU (redémarrage de l'API), jamais repris silencieusement. 30
 * minutes : largement au-delà de la durée observée d'un
 * `CrmSyncService.syncWorkspace` réel, jamais si court qu'un run
 * légitimement long se ferait couper en plein travail.
 */
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 1000

/**
 * #4591 — le worker écrit `reading_sources` dès qu'il prend un job : un run encore `pending` après ce délai n'a
 * JAMAIS été pris en charge (job perdu, file arrêtée). Il se termine en erreur nommée à la lecture, au lieu de
 * rester « En attente… » : le web qui le sonde reçoit un état terminal, et la garde anti-double-lancement se rouvre.
 */
const UNCLAIMED_RUN_THRESHOLD_MS = 2 * 60 * 1000

/**
 * L'amorçage de la première synchronisation (#3014, #2207.19 à #2207.32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN RUN, ET PAS UN APPEL SYNCHRONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le clic doit répondre tout de suite (l'écran passe en attente), et le
 * résumé demande d'agréger sept domaines — certains provenant d'un
 * fournisseur tiers. `startRun` écrit la ligne et rend la main immédiatement ;
 * le CONTRÔLEUR orchestre ensuite ce qui referme le run (`finishRun` /
 * `failRun`) en tâche de fond. Le web POLL
 * `GET /tools/:provider/sync-runs/:id` jusqu'à `completed`/`failed`.
 *
 * ⚠️ Ce service n'appelle JAMAIS `CrmSyncService` (ou tout autre module
 * fournisseur) directement — GA-07 (`architecture/module-boundaries.spec.ts`)
 * fige le nombre d'imports service→service, et cette orchestration croise
 * délibérément un module qu'un geste utilisateur déclenche : elle vit dans
 * `IntegrationSyncController`, comme `ConnectorTestController` le fait déjà
 * pour « Tester »/« Réparer ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `summarize()` NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Construire une ligne à zéro. La doctrine « on n'affiche pas ce qu'on n'a
 * pas » vaut ici au pied de la lettre : chaque domaine ajouté (#2207.26 à
 * #2207.32) est un appel à une fonction de `sync-summary-labels.ts` qui rend
 * `null` sous la borne, jamais un texte du genre « 0 rendez-vous ».
 */
@Injectable()
export class IntegrationSyncService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationSyncService.name)

  constructor(
    @InjectRepository(IntegrationSyncRunEntity)
    private readonly runs: Repository<IntegrationSyncRunEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    @InjectRepository(RagDocumentEntity)
    private readonly ragDocuments: Repository<RagDocumentEntity>,
  ) {}

  /** #2110.21 — reconcilie les runs orphelins une fois, au démarrage du
   *  process : un redémarrage pendant un run ne doit plus jamais bloquer la
   *  garde anti-double-lancement pour toujours. */
  async onModuleInit(): Promise<void> {
    await this.reconcileStaleRuns()
  }

  /**
   * #2110.21 — la reprise après crash HONNÊTE : aucun curseur de phase
   * persistant n'existe (voir le docblock de `IntegrationSyncWorker`), donc
   * aucune progression n'est reconstruite ni inventée. Ce qui EST fait :
   * refermer en `failed`, avec un motif DISTINCT du motif générique, tout run
   * non terminal plus vieux que `STALE_RUN_THRESHOLD_MS` — pour que la garde
   * anti-double-lancement (#2110.81) redevienne franchissable et que
   * l'utilisateur puisse relancer, au lieu de rester bloqué sur une phase
   * intermédiaire qui ne bougera plus jamais.
   */
  async reconcileStaleRuns(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_RUN_THRESHOLD_MS)
    const stale = await this.runs.find({
      where: { status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])), started_at: LessThan(cutoff) },
    })
    for (const run of stale) {
      await this.runs.update(
        { id: run.id, status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])) },
        {
          status: 'failed',
          finished_at: now,
          error_fr: 'La synchronisation a été interrompue (redémarrage du serveur). Relancez-la.',
          error_en: 'The sync was interrupted (server restart). Please relaunch it.',
        },
      )
    }
    if (stale.length > 0) {
      this.logger.warn('Reconciled stale integration sync runs after restart', { count: stale.length })
    }
    return stale.length
  }

  /** Écrit le run en `pending` et rend la main — rien d'autre. Le worker
   *  BullMQ le fait avancer ensuite, un état à la fois (#2980). */
  async startRun(workspaceId: string, userId: string, provider: string): Promise<IntegrationSyncRunEntity> {
    return this.runs.save(
      this.runs.create({
        workspace_id: workspaceId,
        started_by: userId,
        provider,
        status: 'pending',
        started_at: new Date(),
      }),
    )
  }

  /**
   * La garde anti-double-lancement (#2110.81) : un run NON terminal pour ce
   * (espace, connecteur), s'il existe. `null` = le contrôleur peut lancer.
   *
   * Première ligne de défense seulement — deux requêtes concurrentes peuvent
   * toutes les deux lire `null` avant que l'une n'écrive : l'index unique
   * partiel `integration_sync_runs_active_job_idx` (migration `1796321364100`)
   * referme cette fenêtre en base, où la course se joue réellement.
   */
  async getActiveRun(workspaceId: string, provider: string): Promise<IntegrationSyncRunEntity | null> {
    return this.runs.findOne({
      where: { workspace_id: workspaceId, provider, status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])) },
      order: { started_at: 'DESC' },
    })
  }

  /** Lu par le polling web. `null` = run inconnu ou d'un AUTRE espace — jamais
   *  distingué à l'écran, les deux valent « introuvable ». */
  async getRun(workspaceId: string, id: string): Promise<IntegrationSyncRunEntity | null> {
    return this.expireIfUnclaimed(await this.runs.findOne({ where: { id, workspace_id: workspaceId } }))
  }

  /** #4591 — un run `pending` que le worker n'a jamais pris finit en `failed`, motif nommé (jamais un faux succès). */
  private async expireIfUnclaimed(run: IntegrationSyncRunEntity | null): Promise<IntegrationSyncRunEntity | null> {
    if (!run || run.status !== 'pending') return run
    if (Date.now() - new Date(run.started_at).getTime() < UNCLAIMED_RUN_THRESHOLD_MS) return run
    const patch = {
      status: 'failed' as const,
      finished_at: new Date(),
      error_fr: "La synchronisation n'a jamais été prise en charge par le serveur. Relancez-la.",
      error_en: 'The sync was never picked up by the server. Please relaunch it.',
    }
    await this.runs.update({ id: run.id, status: 'pending' }, patch)
    this.logger.warn('Integration sync run never picked up', { runId: run.id, provider: run.provider })
    return (await this.runs.findOne({ where: { id: run.id, workspace_id: run.workspace_id } })) ?? { ...run, ...patch }
  }

  /**
   * Le dernier run de ce connecteur pour cet espace — pour retrouver le
   * résumé d'une synchronisation déjà lancée sans garder son identifiant en
   * mémoire côté client (un rechargement de page, un onglet fermé). `null` =
   * aucun run n'a jamais été lancé pour ce connecteur.
   */
  async getLatestRun(workspaceId: string, provider: string): Promise<IntegrationSyncRunEntity | null> {
    return this.expireIfUnclaimed(
      await this.runs.findOne({ where: { workspace_id: workspaceId, provider }, order: { started_at: 'DESC' } }),
    )
  }

  /**
   * Fait avancer un run VIVANT d'une phase à la suivante (#2110.22 à .31) —
   * la progression RÉELLE que la page de suivi lit en pollant. Le `where`
   * exclut les statuts terminaux : un run déjà `canceled` par l'utilisateur
   * (course avec le worker) ne repart jamais en arrière vers une phase
   * intermédiaire — l'annulation gagne toujours.
   */
  async advance(runId: string, status: Exclude<SyncRunStatus, 'running'>): Promise<void> {
    await this.runs.update({ id: runId, status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])) }, { status })
  }

  /** `true` si l'utilisateur a annulé ce run (#2110.39) — le worker s'arrête
   *  à la phase en cours, sans perdre ce qu'il a déjà écrit. */
  async isCanceled(runId: string): Promise<boolean> {
    const run = await this.runs.findOne({ where: { id: runId } })
    return run?.status === 'canceled'
  }

  /**
   * Le geste « Annuler » (#2110.39). Un run déjà terminal ne bouge plus —
   * annuler un run `completed` n'a aucun sens et écraserait un résultat réel.
   */
  async cancelRun(workspaceId: string, id: string): Promise<void> {
    const now = new Date()
    await this.runs.update(
      { id, workspace_id: workspaceId, status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])) },
      { status: 'canceled', canceled_at: now, finished_at: now },
    )
  }

  /**
   * Referme un run en succès : calcule le résumé et l'écrit avec `completed`.
   *
   * `meetingsToPrepare` (#2388.42) est calculé par l'APPELANT (le worker,
   * seul endroit autorisé à traverser vers `AgendaService` depuis que
   * l'orchestration a déménagé hors du contrôleur — voir le docblock de
   * `IntegrationSyncWorker`, GA-07) : `undefined` quand l'agenda n'a pas
   * répondu, jamais un compte deviné ici.
   */
  async finishRun(runId: string, workspaceId: string, meetingsToPrepare?: number): Promise<void> {
    const finishedAt = new Date()
    const run = await this.runs.findOneOrFail({ where: { id: runId } })
    if (run.status === 'canceled') return
    const summary = await this.summarize(workspaceId, run.started_at, finishedAt, meetingsToPrepare)
    await this.runs.update({ id: runId }, { status: 'completed', finished_at: finishedAt, summary })
  }

  /** Referme un run en échec — un motif FR+EN clair, jamais un texte technique. */
  async failRun(runId: string, provider: string, error: unknown): Promise<void> {
    this.logger.error('Integration sync run failed', {
      runId,
      provider,
      error: error instanceof Error ? error.message : String(error),
    })
    await this.runs.update(
      { id: runId, status: Not(In([...SYNC_RUN_TERMINAL_STATUSES])) },
      {
        status: 'failed',
        finished_at: new Date(),
        error_fr: 'La synchronisation a échoué. Réessayez dans quelques minutes.',
        error_en: 'The sync failed. Try again in a few minutes.',
      },
    )
  }

  /**
   * Le résumé cross-domaine (#2207.26 à #2207.32) — chaque domaine s'ajoute
   * ici, un à la fois, chacun avec sa propre fonction dans
   * `sync-summary-labels.ts` et son propre test.
   *
   * #2207.26 — les comptes dont `updated_at` tombe dans la fenêtre du run.
   * Une approximation ASSUMÉE et documentée : aucune table ne rattache
   * aujourd'hui un compte à la synchronisation précise qui l'a touché, donc
   * la fenêtre temporelle (`[started_at, finished_at]`, quelques secondes à
   * quelques minutes) est le signal le plus honnête disponible — jamais un
   * nombre inventé, toujours une lecture réelle de `updated_at`.
   */
  private async summarize(
    workspaceId: string,
    startedAt: Date,
    finishedAt: Date,
    meetingsToPrepare?: number,
  ): Promise<SyncSummaryLine[]> {
    const lines: SyncSummaryLine[] = []

    const accountsTouched = await this.accounts.count({
      where: { workspace_id: workspaceId, updated_at: Between(startedAt, finishedAt) },
    })
    const accountsLine = accountsSummaryLine(accountsTouched)
    if (accountsLine) lines.push(accountsLine)

    // #2207.27 — même fenêtre, même honnêteté : `crm_synced_at` marque
    // précisément le passage `CrmSyncService`, mais `updated_at` couvre
    // aussi les connecteurs qui écrivent directement la fiche (aucun
    // provider ne le fait à ce jour ; la colonne reste le signal le plus
    // large sans jamais inventer un nombre).
    //
    // #2207.31 — LES MÊMES lignes servent à détecter les ambiguïtés : une
    // fiche touchée pendant CETTE synchronisation qui partage un nom plié
    // avec une autre fiche du MÊME compte (`countNameAmbiguities`).
    const touchedContacts = await this.contacts.find({
      where: { workspace_id: workspaceId, updated_at: Between(startedAt, finishedAt) },
      select: ['account_id', 'full_name'],
    })
    const contactsLine = contactsSummaryLine(touchedContacts.length)
    if (contactsLine) lines.push(contactsLine)

    // #2207.28 — les activités sont journalisées une fois pour toutes
    // (aucune colonne `updated_at`) : `created_at` est donc la SEULE horloge
    // honnête pour dire « apparu pendant cette synchronisation ».
    const meetingsFound = await this.activities.count({
      where: { workspace_id: workspaceId, kind: 'meeting', created_at: Between(startedAt, finishedAt) },
    })
    const meetingsLine = meetingsSummaryLine(meetingsFound)
    if (meetingsLine) lines.push(meetingsLine)

    // #2388.42 — précalculé par le contrôleur (lecture agenda live, GA-07) ;
    // `undefined` (agenda absent ou muet) ne produit aucune ligne, jamais un 0.
    if (meetingsToPrepare !== undefined) {
      const meetingsToPrepareLine = meetingsToPrepareSummaryLine(meetingsToPrepare)
      if (meetingsToPrepareLine) lines.push(meetingsToPrepareLine)
    }

    // #2207.29 — même horloge que les rendez-vous (`created_at`), un domaine
    // disjoint (jamais `meeting`, voir `EXCHANGE_KINDS`).
    const exchangesFound = await this.activities.count({
      where: { workspace_id: workspaceId, kind: In(EXCHANGE_KINDS), created_at: Between(startedAt, finishedAt) },
    })
    const exchangesLine = exchangesSummaryLine(exchangesFound)
    if (exchangesLine) lines.push(exchangesLine)

    // #2207.30 — les actions enregistrées (`user_actions`, journal générique
    // d'un geste — préparé un message, journalisé un appel…), apparues
    // pendant la fenêtre du run.
    const actionsLogged = await this.userActions.count({
      where: { workspace_id: workspaceId, created_at: Between(startedAt, finishedAt) },
    })
    const actionsLine = actionsSummaryLine(actionsLogged)
    if (actionsLine) lines.push(actionsLine)

    // #2207.31 — les ambiguïtés se cherchent dans les comptes des fiches
    // TOUCHÉES par cette synchronisation, contre TOUTES leurs fiches (une
    // fiche touchée peut entrer en collision avec une fiche plus ancienne,
    // jamais visible par la seule fenêtre du run).
    const touchedAccountIds = [...new Set(touchedContacts.map(c => c.account_id).filter((id): id is string => !!id))]
    const ambiguityCandidates =
      touchedAccountIds.length > 0
        ? await this.contacts.find({
            where: { workspace_id: workspaceId, account_id: In(touchedAccountIds) },
            select: ['account_id', 'full_name'],
          })
        : []
    const ambiguitiesLine = ambiguitiesSummaryLine(countNameAmbiguities(ambiguityCandidates))
    if (ambiguitiesLine) lines.push(ambiguitiesLine)

    // #2207.32 — les pages ajoutées à la base de connaissance pendant la
    // fenêtre du run. Jamais le mot « RAG » ni un nom de fournisseur : voir
    // `pagesSummaryLine`.
    const pagesAdded = await this.ragDocuments.count({
      where: { workspace_id: workspaceId, created_at: Between(startedAt, finishedAt) },
    })
    const pagesLine = pagesSummaryLine(pagesAdded)
    if (pagesLine) lines.push(pagesLine)

    return lines
  }
}
