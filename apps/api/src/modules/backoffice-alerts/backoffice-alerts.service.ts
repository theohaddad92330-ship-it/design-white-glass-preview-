import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { Cron } from '@nestjs/schedule'
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm'
import { localDayKey } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { asDay } from '../../common/day'
import { killSwitchCut } from '../../common/kill-switches'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ManualBillingInvoiceEntity } from '../../database/entities/manual-billing-invoice.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
// #1676.1 — `JOB_TIMEOUT_MS` : voir le docblock de tête d'`operational-alerts.ts`
// pour pourquoi cet import (nom sans « service ») ne compte pas pour GA-07.
import { JOB_TIMEOUT_MS } from '../analysis/analysis.constants'
// #1676.1 — 10/09/2026 : `billingHealth`, LA dérivation unique de « engagement
// échu, rien facturé depuis » (déjà utilisée par `ManualBillingSweepService`
// et l'écran `/revenus/clients`). Fichier de fonctions PURES sans suffixe
// « service » — même exemption GA-07 que `JOB_TIMEOUT_MS` juste au-dessus. Voir
// `backoffice-alerts.module.ts` pour pourquoi `ManualProvisioningService`
// lui-même n'est PAS importé.
import { billingHealth, type BillingTermsForSchedule, type InvoiceForSchedule } from '../admin/manual-billing-schedule'
import { BackofficeAlertDispatchService } from './backoffice-alert-dispatch.service'
import { providerCreditsExhaustedAlert, providerSilentAlert, providerUnusedAlert } from './backoffice-alert-dispatch'
import {
  isCancelledStripeSubscription,
  isNewSubscriptionGrant,
  parsePlanFromCheckoutReason,
  RECENT_FACT_WINDOW_MS,
} from './client-lifecycle-alerts'
import {
  CLIENT_HEALTH_READER,
  SECURITY_JOURNAL,
  SINGLETON_LOCK,
  type ClientHealthReader,
  type SecurityJournalReader,
  type UnderSingletonLock,
} from './module-tokens'
import {
  analysisFailureRateExceeds,
  apiUnavailable,
  costExceedsMedian,
  stuckAnalysisJobsExceed,
} from './operational-alerts'
import { workspaceRiskAlert } from './workspace-risk-alert'

const PRODUCTION_ENVIRONMENT = 'production' // même littéral que `CostAlertService` — voir son docblock (Défaut B, n6).
const COST_HISTORY_DAYS = 14
const MS_PAR_JOUR = 24 * 60 * 60 * 1000
/** Combien de runs bloqués une seule lecture ramène au plus — un balayage,
 *  pas une pagination : voir `checkJobBloque`. */
const STUCK_ANALYSIS_SAMPLE_CAP = 1_000
/** Combien de faits récents (`grant_plan` / résiliations) un passage ramène au
 *  plus — un balayage sur `RECENT_FACT_WINDOW_MS`, jamais une pagination : voir
 *  `checkNouveauClient` / `checkStripeChurn`. Un passage de 5 minutes qui en
 *  verrait plus que ça sur une fenêtre de 15 minutes serait un tout autre
 *  problème que celui que ce lot couvre. */
const CLIENT_LIFECYCLE_SAMPLE_CAP = 200

/**
 * #1676.1 — LE PASSAGE PÉRIODIQUE, ET CE QU'IL COMPOSE.
 *
 * ⚠️⚠️ POURQUOI UN PROVIDER, ET POURQUOI DEUX JETONS. GA-07 est AU PLAFOND
 * (253/254 imports service→service, 124/124 fichiers) : ce fichier ne peut
 * PAS importer `BackofficeAccessJournalService` (module `admin`) ni
 * `SingletonLockService` (module `locks`) sans faire échouer la CI. GA-77
 * (`scheduled-jobs-locked-or-reasoned.spec.ts`) exige, à l'inverse, qu'un hôte
 * de `@Cron` soit déclaré `provider` d'un module — pas seulement `controller`,
 * ce qui écarte l'option « composer dans le contrôleur, comme
 * `manager-dependencies.controller.ts` ». Les deux jetons de
 * `module-tokens.ts` sont la sortie déjà choisie par ce dépôt pour EXACTEMENT
 * cette tension — voir `business-metrics/module-tokens.ts` (#1645), qui
 * documente le même arbitrage pour le même conflit de gardes. Ce fichier ne
 * connaît que la FORME de ce qu'il reçoit ; la composition réelle vit dans
 * `backoffice-alerts.module.ts`, la couche que GA-07 exempte.
 *
 * Sept des huit déclencheurs de #1676 sont câblés ici : `connexion_anormale`
 * (#1671.3, la ligne que le docblock d'`etatSecurite()` appelait « le
 * déclencheur reste à trancher par Louis »), `cout_quotidien`,
 * `taux_echec_analyse`, `api_indisponible` / `job_bloque`, et depuis le
 * 10/09/2026 `nouveau_client` / `churn_client` — voir `operational-alerts.ts`
 * et `client-lifecycle-alerts.ts` pour ce que chacun mesure RÉELLEMENT. Seul
 * `rapport_hebdomadaire` n'a AUCUN appelant dans CE fichier ; la fonction EST
 * livrée ailleurs — voir `ALERT_KIND_LABEL` dans `backoffice-alert-dispatch.ts`
 * et `ops-weekly-report.service.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1676.1 — 10/09/2026 : `nouveau_client` / `churn_client`, LA DÉCISION ENFIN
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-274 vérifiait jusqu'ici que ces deux noms n'avaient AUCUN appelant — la
 * décision produit manquait : « à partir de quand un client est-il nouveau ?
 * qu'est-ce qui fait un churn ? ». Louis a tranché le fait CONTRACTUEL, pas le
 * fait d'usage (voir le docblock de tête de `client-lifecycle-alerts.ts` pour
 * ce que ce choix laisse volontairement passer) :
 *  - `nouveau_client` — le PREMIER PAIEMENT ENCAISSÉ (`checkNouveauClient`) ;
 *  - `churn_client` — l'ANNULATION d'un abonnement Stripe
 *    (`checkStripeChurn`), OU un ENGAGEMENT ÉCHU NON RENOUVELÉ pour un client
 *    sur facture (`checkManualEngagementChurn`, qui réutilise `billingHealth`,
 *    LA dérivation déjà partagée par `ManualBillingSweepService` et l'écran
 *    `/revenus/clients` — GA-26).
 * GA-274 a été mise à jour pour dire la NOUVELLE vérité (les huit ont un
 * appelant), pas contournée : elle garde sa preuve qu'elle sait dire NON, sur
 * un neuvième nom fictif non câblé.
 *
 * ⚠️ `DataSource` (pour `api_indisponible`) est injecté via `@InjectDataSource()`
 * sans AUCUN changement à `backoffice-alerts.module.ts` : `DatabaseModule` est
 * `@Global()` (`apps/api/src/database/database.module.ts`), donc son
 * `TypeOrmCoreModule` rend `DataSource` disponible partout, la même règle qui
 * permet à `StatusService`/`DependencyProbeService` (module `health`) de
 * l'injecter sans `forFeature`. `job_bloque` réutilise le repository
 * `AnalysisRunEntity` déjà présent ci-dessous — zéro dépendance neuve.
 */
@Injectable()
export class BackofficeAlertsService {
  constructor(
    private readonly dispatch: BackofficeAlertDispatchService,
    @Inject(SECURITY_JOURNAL) private readonly securityJournal: SecurityJournalReader,
    @Inject(SINGLETON_LOCK) private readonly underLock: UnderSingletonLock,
    @InjectRepository(AnalysisRunEntity) private readonly runs: Repository<AnalysisRunEntity>,
    @InjectRepository(ProviderCostEntity) private readonly costs: Repository<ProviderCostEntity>,
    @InjectRepository(CreditLedgerEntity) private readonly ledger: Repository<CreditLedgerEntity>,
    @InjectRepository(SubscriptionEntity) private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(ManualBillingTermsEntity) private readonly manualTerms: Repository<ManualBillingTermsEntity>,
    @InjectRepository(ManualBillingInvoiceEntity)
    private readonly manualInvoices: Repository<ManualBillingInvoiceEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    // #1946.22 — EN DERNIER : les specs construisent ce service par position.
    @Inject(CLIENT_HEALTH_READER) private readonly readClientHealth: ClientHealthReader,
  ) {}

  /**
   * Toutes les 5 minutes : la sécurité (réactive — une rafale d'échecs se
   * joue en minutes) et les deux mesures opérationnelles. La dé-duplication
   * d'1 h de `dispatch()` absorbe le bruit d'un passage plus fréquent que la
   * nature des deux mesures ne l'exigerait seule.
   */
  @Cron('*/5 * * * *', { name: 'backoffice-alerts' })
  @Correlated('cron:backoffice-alerts.run')
  async run(): Promise<void> {
    await this.underLock('backoffice-alerts', () => this.runNow())
  }

  /** Exposé pour la recette — même geste que `CostAlertService#check`. */
  async runNow(): Promise<void> {
    await Promise.allSettled([
      this.checkSecurityAnomalies(),
      this.checkOperationalAlerts(),
      this.checkClientLifecycle(),
    ])
  }

  /**
   * #2528.3 — décision Louis 17/09 : une source à court de crédits (402 / 429
   * quota, moteur IA comme API) devient un e-mail URGENT aux owners, pas une
   * ligne de log. Événementiel (pas de `@Cron` : le passage n'a rien à
   * SCRUTER, l'appelant — `BackofficeAlertsController` — sait déjà qu'une
   * source vient de rendre un 402). `subject = source` : chaque source a son
   * PROPRE sujet, sa propre dé-duplication de 6 h (`antiRepeatMsFor`), et une
   * source qui revient puis retombe ré-alerte (`resolved: true` intercalé
   * réinitialise l'état — voir `decideAlertAction`).
   */
  async reportProviderCreditsExhausted(input: {
    source: string
    sinceIso: string
    degraded: string
    resolved?: boolean
  }): Promise<void> {
    const { title, detail } = providerCreditsExhaustedAlert(input.source, input.sinceIso, input.degraded)
    await this.dispatch.dispatch({
      kind: 'provider_credits_exhausted',
      subject: input.source,
      title,
      detail,
      resolved: input.resolved ?? false,
    })
  }

  /**
   * SIG-C (11/10) — « source muette » : l'IA compte les erreurs CONSÉCUTIVES de
   * chaque fournisseur (Redis, remis à zéro au premier succès) et appelle ici au
   * N-ième, puis `resolved: true` au premier succès qui suit. `subject = source` :
   * une dé-duplication de 6 h par fournisseur (`antiRepeatMsFor`).
   */
  async reportProviderSilent(input: {
    source: string
    sinceIso: string
    consecutiveErrors: number
    lastReason: string
    degraded: string
    resolved?: boolean
  }): Promise<void> {
    const { title, detail } = providerSilentAlert(
      input.source,
      input.sinceIso,
      input.consecutiveErrors,
      input.lastReason,
      input.degraded,
      input.resolved ?? false,
    )
    await this.dispatch.dispatch({
      kind: 'source_muette',
      subject: input.source,
      title,
      detail,
      resolved: input.resolved ?? false,
    })
  }

  /**
   * ALERTES-402 (30/10/2026) — une source CONFIGURÉE qu'on n'appelle plus. Même canal opérateur et
   * même étiquette (« Source muette » : c'est bien un silence), autre question — donc autre texte,
   * et pas de `resolved` : le retour d'une source se dit par son premier appel, jamais par une
   * absence d'absence. L'IA tient le débit (une fois par jour et par fournisseur).
   */
  async reportProviderUnused(input: {
    source: string
    lastCallIso: string
    days: number
    degraded: string
  }): Promise<void> {
    const { title, detail } = providerUnusedAlert(input.source, input.lastCallIso, input.days, input.degraded)
    await this.dispatch.dispatch({
      kind: 'source_muette',
      subject: input.source,
      title,
      detail,
      resolved: false,
    })
  }

  /**
   * #1946.22 — décision Louis 13/09 batch 12 : « espace à risque », UNE FOIS
   * PAR JOUR (07:40), jamais toutes les 5 minutes — la santé de 500 espaces se
   * calcule en SQL agrégé (`AdminClientHealthService#list`), et l'alerte ne
   * part qu'une fois par semaine au plus : un passage plus fréquent ne ferait
   * que relire la même réponse. Verrou propre, distinct de celui des 5 minutes.
   */
  @Cron('40 7 * * *', { name: 'backoffice-alerts-workspace-risk' })
  @Correlated('cron:backoffice-alerts.runWorkspaceRisk')
  async runWorkspaceRisk(): Promise<void> {
    await this.underLock('backoffice-alerts-workspace-risk', () => this.checkWorkspacesAtRisk())
  }

  /**
   * #1946.22 — décision Louis 13/09 batch 12, prise CONTRE la recommandation :
   * la SEULE alerte par espace nommé qui lise un signal d'usage (règle 5 de
   * `c64_analytique_produit` et refus du 10/09 levés pour CET usage, relecture
   * juridique RGPD toujours due). Ce qu'elle décide vit dans
   * `workspace-risk-alert.ts` ; GA-266 refuse qu'une seconde méthode de ce
   * module lise la santé d'un espace pour alerter.
   *
   * Une alerte OPÉRATEUR : vers l'équipe (`dispatch`, no-op strict sans
   * destinataire), jamais vers le client. JAMAIS résolue — un espace qui oscille
   * autour du seuil n'écrit pas « à risque / résolu / à risque » dans la semaine.
   */
  async checkWorkspacesAtRisk(now: Date = new Date()): Promise<void> {
    // #1946.22 — l'interrupteur d'incident : posé, zéro lecture et zéro envoi.
    if (killSwitchCut('backoffice.workspace_risk_alerts')) return
    const [report, demoRooms] = await Promise.all([
      this.readClientHealth(now),
      this.workspaces.find({ where: { is_demo: true }, select: ['id'] }),
    ])
    const demo = new Set(demoRooms.map(room => room.id))
    // Jamais une adresse devinée : absente, l'alerte NOMME l'écran.
    const backofficeUrl = process.env['BACKOFFICE_URL']?.trim() || null

    for (const row of report.rows) {
      const verdict = workspaceRiskAlert(
        { workspaceId: row.workspaceId, name: row.name, isDemo: demo.has(row.workspaceId), health: row.health },
        { backofficeUrl },
      )
      if (!verdict.alert) continue
      await this.dispatch.dispatch({
        kind: 'espace_a_risque',
        subject: verdict.subject,
        title: verdict.title,
        detail: verdict.detail,
        resolved: false,
      })
    }
  }

  /**
   * #1671.3 — « connexion manager anormale ». Fenêtre courte (1 jour) : les
   * trois signaux (rafale, pays, heure) sont des événements RÉCENTS — une
   * fenêtre de 30 jours (le défaut de l'écran `/securite`) redirait la même
   * anomalie vieille de trois semaines à chaque passage tant qu'elle reste
   * dans le journal.
   *
   * Sujet = `acteur:type` — le couple du docblock de #1671.3 (« anti-
   * répétition d'1h par (acteur, type d'anomalie) »).
   */
  private async checkSecurityAnomalies(): Promise<void> {
    const etat = await this.securityJournal(1)
    const subjectsNow = new Set<string>()

    for (const anomalie of etat.anomalies) {
      const subject = `${anomalie.actorEmail}:${anomalie.type}`
      subjectsNow.add(subject)
      await this.dispatch.dispatch({
        kind: 'connexion_anormale',
        subject,
        title: `${anomalie.actorEmail} — ${anomalie.type}`,
        detail: anomalie.detail,
        resolved: false,
      })
    }

    // Résolution : un sujet qui était en défaut et ne l'est plus.
    const firing = await this.dispatch.listFiringSubjects('connexion_anormale')
    for (const subject of firing) {
      if (subjectsNow.has(subject)) continue
      await this.dispatch.dispatch({
        kind: 'connexion_anormale',
        subject,
        title: subject,
        detail: 'Le signal ne réapparaît plus dans la fenêtre observée.',
        resolved: true,
      })
    }
  }

  /**
   * #1676 — « coût quotidien > 200 % de la médiane », « taux d'échec
   * d'analyse > 20 % sur 1 h », « API/base indisponible » et « job bloqué ».
   * Un seul sujet par mesure (`global`, `database`, `analysis_worker`) : le
   * dépôt n'a qu'un compte d'exploitation, pas un par client.
   */
  private async checkOperationalAlerts(): Promise<void> {
    await Promise.allSettled([
      this.checkDailyCost(),
      this.checkAnalysisFailureRate(),
      this.checkApiUnavailable(),
      this.checkJobBloque(),
    ])
  }

  private async checkDailyCost(): Promise<void> {
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setUTCHours(0, 0, 0, 0)
    const since = new Date(startOfToday.getTime() - COST_HISTORY_DAYS * MS_PAR_JOUR)

    const rows = await this.costs.find({
      where: { created_at: MoreThanOrEqual(since), environment: PRODUCTION_ENVIRONMENT },
      select: ['created_at', 'cost_usd'],
      take: 20_000,
    })

    const byDay = new Map<string, number>()
    for (const row of rows) {
      if (row.cost_usd == null) continue
      const day = row.created_at.toISOString().slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + Number(row.cost_usd))
    }
    const todayKey = startOfToday.toISOString().slice(0, 10)
    const todayUsd = byDay.get(todayKey) ?? 0
    const previousDays = [...byDay.entries()].filter(([day]) => day !== todayKey).map(([, total]) => total)

    const measure = costExceedsMedian(previousDays, todayUsd)
    if (measure.state !== 'measured') return
    await this.dispatch.dispatch({
      kind: 'cout_quotidien',
      subject: 'global',
      title: 'Coût fournisseurs du jour',
      detail: measure.breached ? measure.detail : 'Retombé dans la médiane des jours précédents.',
      resolved: !measure.breached,
    })
  }

  private async checkAnalysisFailureRate(): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const rows = await this.runs.find({
      where: { created_at: MoreThanOrEqual(since) },
      select: ['status'],
      take: 20_000,
    })

    const measure = analysisFailureRateExceeds(rows.map(r => r.status))
    if (measure.state !== 'measured') return
    await this.dispatch.dispatch({
      kind: 'taux_echec_analyse',
      subject: 'global',
      title: "Taux d'échec des analyses",
      detail: measure.breached ? measure.detail : "Retombé sous le seuil d'échec sur la dernière heure.",
      resolved: !measure.breached,
    })
  }

  /**
   * #1676.1 — `api_indisponible`. Voir le docblock de tête d'`operational-
   * alerts.ts` pour ce que cette sonde couvre (SEULEMENT la base) et pourquoi
   * (GA-07 au plafond, `.module.ts` hors périmètre). `probeDatabase` ne lève
   * JAMAIS — un `SELECT 1` qui échoue devient un `Measure`, pas une exception
   * qui ferait taire ce check dans le `Promise.allSettled` du dessus (« sain
   * n'est jamais déclaré, il est dérivé d'un test réel »).
   *
   * ⚠️ `measure.state === 'unmeasured'` ARRIVE ICI (`apiUnavailable` le rend
   * quand la sonde a échoué SANS PREUVE que la base soit down — une requête
   * partie sans réponse, voir son docblock). Même geste que
   * `checkDailyCost`/`checkAnalysisFailureRate` juste au-dessus : on ne
   * dispatch RIEN, ni une résolution qu'on n'a pas observée, ni un défaut
   * qu'on n'a pas confirmé.
   */
  private async checkApiUnavailable(): Promise<void> {
    const probe = await this.probeDatabase()
    const measure = apiUnavailable(probe)
    if (measure.state !== 'measured') return
    await this.dispatch.dispatch({
      kind: 'api_indisponible',
      subject: 'database',
      title: 'Base de données',
      detail: measure.breached ? measure.detail : 'La base de données répond (SELECT 1).',
      resolved: !measure.breached,
    })
  }

  /**
   * Rend l'erreur BRUTE, jamais un résumé — la classification « échec
   * confirmé / on ne sait pas » vit dans `apiUnavailable` (fichier pur,
   * testable sans DB), pas ici. Voir son docblock pour le pourquoi.
   */
  private async probeDatabase(): Promise<{ ok: true } | { ok: false; error: unknown }> {
    try {
      await this.dataSource.query('SELECT 1')
      return { ok: true }
    } catch (error) {
      return { ok: false, error }
    }
  }

  /**
   * #1676.1 — `job_bloque`. Voir le docblock de tête d'`operational-alerts.ts`
   * pour ce que « l'ancienneté d'un job » désigne ici (des runs `analysis_runs`
   * encore `analyzing` au-delà du délai dur du worker, `JOB_TIMEOUT_MS` — pas
   * une connexion BullMQ/Redis directe, hors de portée sans toucher
   * `.module.ts`). Une seule requête, triée par ancienneté croissante : le
   * premier élément est le plus vieux, ce qui donne son âge sans requête séparée.
   *
   * ⚠️ MÊME POPULATION QUE LE FAUCHEUR (03/11/2026). Une alerte qui compte des
   * lignes que rien ne peut résoudre ne décrit plus une panne : elle apprend à
   * ignorer les mails. Les salles de démonstration portent un run `analyzing`
   * SEMÉ À DESSEIN (`active_analysis_by_colleague`) et le faucheur ne doit
   * jamais y toucher — il est donc exclu ici aussi, sinon l'alerte reste
   * allumée pour toujours sur une donnée parfaitement saine.
   */
  private async checkJobBloque(): Promise<void> {
    const cutoff = new Date(Date.now() - JOB_TIMEOUT_MS)
    const stale = await this.runs
      .createQueryBuilder('run')
      .select('run.created_at', 'created_at')
      .where('run.status = :status', { status: 'analyzing' })
      .andWhere('run.created_at < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM accounts a
             JOIN workspaces w ON w.id = a.workspace_id
            WHERE a.id = run.account_id AND w.is_demo = true)`,
      )
      .orderBy('run.created_at', 'ASC')
      .limit(STUCK_ANALYSIS_SAMPLE_CAP)
      .getRawMany<{ created_at: Date }>()
    const oldest = stale[0]
    const measure = stuckAnalysisJobsExceed({
      staleCount: stale.length,
      oldestAgeMinutes: oldest ? Math.round((Date.now() - oldest.created_at.getTime()) / 60_000) : null,
    })
    if (measure.state !== 'measured') return
    await this.dispatch.dispatch({
      kind: 'job_bloque',
      subject: 'analysis_worker',
      title: 'Analyses bloquées au-delà du délai worker',
      detail: measure.breached ? measure.detail : 'Aucune analyse bloquée au-delà du délai dur du worker.',
      resolved: !measure.breached,
    })
  }

  /**
   * #1676.1 — 10/09/2026 : `nouveau_client` / `churn_client`. Voir le docblock
   * de tête de `client-lifecycle-alerts.ts` pour la décision et son coût
   * assumé. Trois faits, trois sujets bien séparés (un `owner_user_id` pour le
   * premier paiement, un `user_id` pour une résiliation Stripe, un
   * `workspace_id` pour un engagement échu) : aucun des trois ne se recouvre,
   * donc aucun ne peut résoudre le sujet d'un autre par accident.
   */
  private async checkClientLifecycle(): Promise<void> {
    await Promise.allSettled([this.checkNouveauClient(), this.checkStripeChurn(), this.checkManualEngagementChurn()])
  }

  /**
   * `nouveau_client` — le PREMIER PAIEMENT ENCAISSÉ. Un `grant_plan` né d'un
   * CHECKOUT (`isNewSubscriptionGrant`), jamais d'un `subscription.updated`
   * (changement de palier sur un abonnement déjà actif — pas un nouveau
   * client). Fenêtre étroite plutôt que résolution : voir le docblock de
   * `client-lifecycle-alerts.ts`, section « pourquoi une fenêtre étroite ».
   */
  private async checkNouveauClient(): Promise<void> {
    const since = new Date(Date.now() - RECENT_FACT_WINDOW_MS)
    const rows = await this.ledger.find({
      where: { kind: 'grant_plan', created_at: MoreThanOrEqual(since) },
      select: ['owner_user_id', 'workspace_id', 'reason'],
      take: CLIENT_LIFECYCLE_SAMPLE_CAP,
    })

    for (const row of rows) {
      if (!isNewSubscriptionGrant(row.reason)) continue
      const title = await this.resolveWorkspaceName({ id: row.workspace_id })
      const plan = parsePlanFromCheckoutReason(row.reason)
      await this.dispatch.dispatch({
        kind: 'nouveau_client',
        subject: row.owner_user_id,
        title: title ?? '(espace non résolu)',
        detail: plan ? `Premier paiement encaissé — offre ${plan}.` : 'Premier paiement encaissé.',
        resolved: false,
      })
    }
  }

  /**
   * `churn_client`, branche Stripe — l'ANNULATION d'un abonnement. Signature
   * exacte de `isCancelledStripeSubscription` : voir son docblock dans
   * `client-lifecycle-alerts.ts` pour la preuve qu'elle ne confond pas une
   * résiliation avec un compte tout neuf (`plan: 'decouverte'`, mêmes zéros
   * depuis `NoFreeTrial`). Un client sur facture (`billing_mode: 'manual'`)
   * n'a pas d'abonnement Stripe à résilier — sa branche est
   * `checkManualEngagementChurn`.
   */
  private async checkStripeChurn(): Promise<void> {
    const since = new Date(Date.now() - RECENT_FACT_WINDOW_MS)
    const rows = await this.subscriptions.find({
      where: {
        billing_mode: 'stripe',
        plan: 'trial',
        accounts_limit: 0,
        enrichment_credits: 0,
        extra_seats: 0,
        topup_analyses: 0,
        updated_at: MoreThanOrEqual(since),
      },
      select: [
        'user_id',
        'billing_mode',
        'plan',
        'accounts_limit',
        'enrichment_credits',
        'extra_seats',
        'topup_analyses',
        'stripe_subscription_id',
      ],
      take: CLIENT_LIFECYCLE_SAMPLE_CAP,
    })

    for (const row of rows) {
      if (!isCancelledStripeSubscription(row)) continue
      const title = await this.resolveWorkspaceName({ owner_user_id: row.user_id })
      await this.dispatch.dispatch({
        kind: 'churn_client',
        subject: row.user_id,
        title: title ?? '(espace non résolu)',
        detail: 'Abonnement annulé.',
        resolved: false,
      })
    }
  }

  /**
   * `churn_client`, branche facture — un ENGAGEMENT ÉCHU NON RENOUVELÉ.
   * Réutilise `billingHealth` (`../admin/manual-billing-schedule`), LA
   * dérivation déjà partagée par `ManualBillingSweepService` (le balayage
   * quotidien de 07h10, Sentry seulement) et l'écran `/revenus/clients` —
   * GA-26 : une dérivation vit à un seul endroit, ce lot ajoute un second
   * APPELANT, jamais un second CALCUL.
   *
   * ⚠️ Contrairement aux deux checks ci-dessus, un engagement échu est un
   * véritable ÉTAT (il se résout quand une facture couvre enfin la période),
   * pas un fait ponctuel : ce check dispatch donc aussi une RÉSOLUTION, comme
   * `checkSecurityAnomalies`. Le sujet est le `workspace_id` — jamais confondu
   * avec un sujet Stripe (`user_id`) : la résolution ne touche QUE les sujets
   * qu'on vient de recalculer ici (`allTermsWorkspaceIds`), jamais un sujet
   * `churn_client` inconnu de cette branche.
   */
  private async checkManualEngagementChurn(): Promise<void> {
    const termsRows = await this.manualTerms.find({
      select: ['workspace_id', 'period', 'start_date', 'commitment_months'],
    })
    const allTermsWorkspaceIds = new Set(termsRows.map(t => t.workspace_id))
    if (termsRows.length === 0) return

    const workspaceIds = [...allTermsWorkspaceIds]
    const [workspaces, invoiceRows] = await Promise.all([
      this.workspaces.find({ where: { id: In(workspaceIds) }, select: ['id', 'name'] }),
      this.manualInvoices.find({
        where: { workspace_id: In(workspaceIds) },
        select: ['workspace_id', 'period_start', 'period_end', 'payment_status'],
      }),
    ])
    const nameById = new Map(workspaces.map(w => [w.id, w.name]))
    const invoicesByWorkspace = new Map<string, InvoiceForSchedule[]>()
    for (const invoice of invoiceRows) {
      const bucket = invoicesByWorkspace.get(invoice.workspace_id) ?? []
      bucket.push({
        reference: '',
        periodStart: asDay(invoice.period_start) ?? invoice.period_start,
        periodEnd: asDay(invoice.period_end) ?? invoice.period_end,
        paid: invoice.payment_status === 'paid',
      })
      invoicesByWorkspace.set(invoice.workspace_id, bucket)
    }

    // UN seul « aujourd'hui » pour tout le passage — même raison que
    // `ManualProvisioningService#listManualClients` : deux appels d'horloge
    // dans une boucle peuvent tomber de part et d'autre de minuit.
    const today = localDayKey(new Date())
    const firingNow = new Set<string>()

    for (const terms of termsRows) {
      const scheduleTerms: BillingTermsForSchedule = {
        period: terms.period,
        startDate: terms.start_date,
        commitmentMonths: terms.commitment_months,
      }
      const health = billingHealth(scheduleTerms, invoicesByWorkspace.get(terms.workspace_id) ?? [], today)
      const ended = health.alerts.some(a => a.kind === 'commitment_ended_unrenewed')
      if (!ended) continue
      firingNow.add(terms.workspace_id)
      await this.dispatch.dispatch({
        kind: 'churn_client',
        subject: terms.workspace_id,
        title: nameById.get(terms.workspace_id) ?? '(espace supprimé)',
        detail: 'Engagement échu, aucune facture émise depuis.',
        resolved: false,
      })
    }

    // Résolution : un espace sur facture qu'on suivait ici et qui n'est plus
    // en défaut — JAMAIS un sujet hors de `allTermsWorkspaceIds` (un sujet
    // Stripe de `checkStripeChurn` partage le même `kind` mais un autre espace
    // de sujets ; le filtre ci-dessous l'exclut par construction).
    const previouslyFiring = await this.dispatch.listFiringSubjects('churn_client')
    for (const subject of previouslyFiring) {
      if (!allTermsWorkspaceIds.has(subject)) continue
      if (firingNow.has(subject)) continue
      await this.dispatch.dispatch({
        kind: 'churn_client',
        subject,
        title: nameById.get(subject) ?? '(espace supprimé)',
        detail: "Une facture couvre de nouveau la période — l'engagement n'est plus considéré comme échu.",
        resolved: true,
      })
    }
  }

  /** Le nom de l'espace, jamais une adresse — voir le docblock de
   *  `checkClientLifecycle`. `null` quand l'espace ne peut pas être résolu : un
   *  champ illisible reste `null`, jamais un nom inventé. */
  private async resolveWorkspaceName(
    criteria: { id: string | null } | { owner_user_id: string },
  ): Promise<string | null> {
    if ('id' in criteria && !criteria.id) return null
    const workspace = await this.workspaces.findOne({
      where: criteria as { id: string } | { owner_user_id: string },
      select: ['name'],
    })
    return workspace?.name ?? null
  }
}
