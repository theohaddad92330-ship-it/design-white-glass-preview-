import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron } from '@nestjs/schedule'
import { MoreThanOrEqual, Repository } from 'typeorm'
import {
  CREDIT_COST_SPREAD_ALERT_RATIO,
  FIXED_COST_FAMILIES_UNMEASURED,
  UNCREDITED_COST_SHARE_ALERT,
  measureCreditCost,
  type CreditDebitRow,
  type MeasuredCostRow,
} from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { ReasoningJudgeSamplingService } from './reasoning-judge-sampling.service'
import { floorNote, overThreshold, readThresholdUsd, summariseCosts, type CostRow } from './cost-alert'
import { ObservabilityAlertsService } from './observability-alerts.service'

/** Fenêtre observée : la journée écoulée. */
const WINDOW_MS = 24 * 60 * 60 * 1000
/** Borne de lecture — une alerte ne doit pas devenir elle-même un coût. */
const MAX_ROWS = 20_000
/**
 * L'environnement que cette alerte mesure — jamais dev + prod additionnés
 * (Défaut B, n6). Même littéral que `ProviderCostService#overview(days,
 * 'production')` : une égalité STRICTE sur la colonne, qui exclut NATURELLEMENT
 * les lignes `environment IS NULL` (écrites avant la colonne, « environnement
 * inconnu ») — jamais un `COALESCE(environment, 'production')`, qui leur ferait
 * porter un coût de production qu'elles n'ont pas.
 */
const PRODUCTION_ENVIRONMENT = 'production'

/**
 * L'alerte de coûts fournisseurs.
 *
 * Le registre existe depuis le 03/08 et personne n'en est prévenu : il faut
 * ouvrir le back-office pour voir qu'un espace a dérapé. Un dépassement se
 * découvre donc sur la facture, un mois trop tard.
 *
 * **Sans seuil, ce service ne fait RIEN** (`COST_ALERT_DAILY_USD` absent ⇒ aucune
 * lecture, aucun log) : même discipline que les connecteurs sans clé. Avec un
 * seuil, le dépassement part en `logger.error` — donc dans Sentry, donc sur un
 * écran que quelqu'un regarde. C'est la leçon du bloc agenda resté « vide »
 * pendant des jours parce que son échec ne sortait qu'en `warn`.
 *
 * Il n'envoie ni e-mail ni notification à l'utilisateur : la marge par client
 * est une donnée de back-office et ne sort jamais côté application.
 *
 * ## Le passage du matin porte les CINQ alertes, plus DEUX mesures de coût
 *
 * `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md:30` en exige cinq — coût, latence,
 * erreur, hallucination, no-outcome. Le coût est calculé ici ; les quatre autres
 * vivent dans {@link ObservabilityAlertsService}, et ce tick les appelle SOUS LE
 * MÊME VERROU. Un second `@Cron` quinze minutes plus tard aurait demandé un
 * second verrou Redis pour lire exactement la même fenêtre — plus de pièces, pas
 * plus de garanties. Chaque famille garde son calcul et ses seuils : rien n'est
 * recopié d'un fichier à l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET DEUX MESURES DE PLUS SUR LA FAMILLE « COÛT » (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes deux dans {@link check}, donc sous le MÊME seuil et sur les MÊMES
 * lignes déjà lues — une seconde lecture de la même fenêtre finirait par ne plus
 * voir la même chose :
 *
 *  - **l'écart entre le poids d'un crédit et son coût réel** — « un
 *    enrichissement coûte 0,41 € du crédit contre 0,06 € pour un export : la
 *    grille de crédits ne reflète pas le coût réel, et c'est exploitable par les
 *    gros consommateurs » (modèle d'unit-economics du 18/08, `Coûts unitaires`
 *    r20). Un écart de ce genre ne fait aucun bruit : il se creuse, et il se
 *    découvre sur une facture ;
 *  - **la part du coût qui ne débite AUCUN crédit** — l'audit du 24/07 la
 *    chiffrait à ~87 % : au-delà de la moitié, le prix d'un crédit ne dit plus
 *    rien du coût du service.
 *
 * Les deux sont **globales à l'exploitant**, jamais comparées entre espaces :
 * les espaces sont des ESN, donc des concurrents, et le coût d'accès ne franchit
 * pas leur frontière (`COMMUNITY_FORBIDDEN_KINDS.cost`, GA-43). La question
 * posée est « un crédit vaut-il partout la même chose ? », jamais « quel client
 * coûte plus cher que quel autre ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉFAUT B, n6 (30/08/2026) — L'ALERTE NE MÉLANGE PLUS PROD ET DEV
 * ─────────────────────────────────────────────────────────────────────────────
 * `provider_costs.environment` existe depuis le 29/08 et `ProviderCostService
 * #overview` sait déjà le filtrer pour le back-office — mais cette alerte-ci
 * lisait encore le repository À LA MAIN, sans ce filtre : elle additionnait un
 * poste de développement resté allumé à la nuit et la vraie dépense de
 * production, et pouvait donc sonner sur une dépense qui n'était pas celle du
 * produit. Voir {@link check}.
 */
@Injectable()
export class CostAlertService {
  private readonly logger = new Logger(CostAlertService.name)

  constructor(
    @InjectRepository(ProviderCostEntity) private readonly costs: Repository<ProviderCostEntity>,
    @Optional() private readonly locks?: SingletonLockService,
    // `@Optional()` et EN DERNIER, comme les autres greffons : les specs qui
    // construisent le service à la main (`new CostAlertService(repo)`) ne
    // changent pas, et son absence dégrade le passage à l'alerte de coût seule
    // plutôt que de le casser.
    @Optional() private readonly observability?: ObservabilityAlertsService,
    // Lecture seule : le DÉNOMINATEUR du coût d'un crédit. Le module credits
    // possède la table et l'écrit ; ici on ne fait que la lire, comme
    // `ContactEntity` pour la couverture d'enrichissement. Ajouté EN DERNIER et
    // `@Optional()` pour la même raison que ci-dessus — un paramètre inséré au
    // milieu décalerait silencieusement `locks` et `observability` dans chaque
    // construction manuelle, et un `undefined` passé pour un verrou ne lève pas.
    @Optional() @InjectRepository(CreditLedgerEntity) private readonly ledger?: Repository<CreditLedgerEntity>,
    // #3223 (intégration G 11/10) — l'échantillon du juge « recommandation
    // générique » est tiré SOUS LE MÊME VERROU, AVANT les alertes qui le lisent
    // (même raison que les quatre familles ci-dessus : un second `@Cron` aurait
    // demandé un second verrou, et un import de service inter-modules, GA-07).
    // EN DERNIER et `@Optional()` pour la même raison que `ledger`.
    @Optional() private readonly judge?: ReasoningJudgeSamplingService,
  ) {}

  /** 07:05 Europe/Paris : la nuit est passée, la journée n'a pas commencé. */
  @Cron('5 7 * * *', { name: 'cost-alert', timeZone: 'Europe/Paris' })
  @Correlated('cron:cost-alert.runDailyCheck')
  async runDailyCheck(now: Date = new Date()): Promise<void> {
    // `@Cron` se déclenche sur chaque réplique : sans verrou, trois répliques
    // enverraient trois fois la même alerte, et une alerte en triple s'ignore
    // aussi vite qu'une alerte fausse.
    await withSingletonLock(this.locks, 'cost-alert', async () => {
      await this.judge?.runNightly(now)
      await this.runMorningAlerts(now)
    })
  }

  /**
   * Les cinq alertes, dans l'ordre des exigences. Déjà sous verrou.
   *
   * L'alerte de coût reste conditionnée à son seuil (sans `COST_ALERT_DAILY_USD`,
   * aucune lecture, aucun log) ; les quatre autres ont un défaut et tournent.
   * Une famille qui n'a rien à dire n'empêche jamais l'autre de parler.
   */
  private async runMorningAlerts(now: Date): Promise<void> {
    const threshold = readThresholdUsd(process.env['COST_ALERT_DAILY_USD'])
    if (threshold != null) await this.check(threshold, now)
    await this.observability?.runDailyCheck(now)
  }

  /**
   * Le passage lui-même — exposé pour être déclenché à la main en recette.
   *
   * ⚠️ Défaut B (n6) : cette lecture DOIT rester bornée à `environment:
   * PRODUCTION_ENVIRONMENT`. `ProviderCostService#overview` sait déjà filtrer
   * ainsi pour le back-office, mais son SQL agrège par fournisseur / feature /
   * opération / espace — une forme incompatible avec ce dont `check` a besoin
   * ici : les lignes BRUTES, groupées par ESPACE avec le détail par
   * FOURNISSEUR (`summariseCosts`), et rejouées telles quelles pour le second
   * calcul (`checkCreditWeighting`, qui a besoin de `feature` ligne à ligne).
   * Réécrire cette forme en SQL agrégé serait UNE SECONDE DÉFINITION du même
   * calcul (GA-26) ; le filtre lui-même, en revanche, est la MÊME dérivation
   * qu'`overview()` — même colonne, même littéral, même égalité stricte — posée
   * ici sur le repository déjà injecté plutôt que dupliquée en SQL brut.
   */
  async check(thresholdUsd: number, now: Date = new Date()): Promise<void> {
    const since = new Date(now.getTime() - WINDOW_MS)
    const rows = await this.costs.find({
      where: { created_at: MoreThanOrEqual(since), environment: PRODUCTION_ENVIRONMENT },
      // `feature` sert au SECOND calcul (le coût d'un crédit par famille) : le
      // lire ici évite une deuxième lecture de la même fenêtre — et deux
      // lectures de la même table finiraient par ne plus voir la même chose.
      select: ['workspace_id', 'cost_usd', 'provider', 'feature'],
      take: MAX_ROWS,
    })

    const summaries = summariseCosts(
      rows.map<CostRow>(row => ({
        workspaceId: row.workspace_id,
        // `numeric` revient en texte via le driver pg : le convertir ici évite
        // une concaténation silencieuse au lieu d'une addition.
        costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
        provider: row.provider,
      })),
    )

    for (const entry of overThreshold(summaries, thresholdUsd)) {
      this.logger.error(
        `Coût fournisseurs au-dessus du seuil sur 24 h : ${entry.totalUsd} $ (seuil ${thresholdUsd} $)` +
          // Le contexte portait déjà `unpricedLines` ; le MESSAGE, lui, annonçait
          // un total comme un fait. C'est le message qu'un humain lit dans
          // Sentry, et un total partiel lu comme un total complet fait décider
          // sur un chiffre optimiste.
          floorNote(entry.unpricedLines),
        {
          tags: { 'cost.workspace': entry.workspaceId ?? 'hors-espace' },
          contexts: {
            cost: {
              workspaceId: entry.workspaceId,
              totalUsd: entry.totalUsd,
              thresholdUsd,
              // Une ligne non tarifée n'est pas gratuite : le total la laisse de
              // côté, l'alerte dit combien il y en a pour qu'on sache que le
              // chiffre est un PLANCHER.
              unpricedLines: entry.unpricedLines,
              // Et ce plancher-ci en est un pour une seconde raison, structurelle :
              // le registre ne connaît que les fournisseurs facturés À L'APPEL.
              // Aucun coût FIXE n'est mesuré nulle part dans le dépôt.
              fixedCostFamiliesNotMeasured: FIXED_COST_FAMILIES_UNMEASURED,
              providers: entry.providers.slice(0, 5),
            },
          },
        },
      )
    }

    await this.checkCreditWeighting(rows, since)
  }

  /**
   * Ce qu'un crédit coûte, par famille d'action — et l'écart entre familles.
   *
   * La mesure lit DEUX registres sur la même fenêtre : `provider_costs` pour le
   * numérateur, `credit_ledger` pour le dénominateur. Tout ce qui n'est pas
   * mesurable est nommé plutôt que ramené à zéro — un crédit débité par un
   * chemin qui n'enregistre aucun coût SORT du dénominateur, sinon la mesure
   * dirait que l'enrichissement coûte deux fois moins qu'il ne coûte.
   */
  private async checkCreditWeighting(rows: readonly ProviderCostEntity[], since: Date): Promise<void> {
    // Sans registre de crédits, il n'y a pas de dénominateur : on se TAIT plutôt
    // que de rendre un coût par crédit calculé sur zéro crédit.
    if (!this.ledger) return

    const debits = await this.ledger.find({
      where: { created_at: MoreThanOrEqual(since) },
      select: ['resource', 'delta', 'reason'],
      take: MAX_ROWS,
    })

    const measure = measureCreditCost({
      costRows: rows.map<MeasuredCostRow>(row => ({
        feature: row.feature,
        costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      })),
      debitRows: debits.map<CreditDebitRow>(row => ({
        resource: row.resource,
        delta: Number(row.delta),
        reason: row.reason,
      })),
    })

    const context = {
      families: measure.families,
      uncreditedUsd: measure.uncredited.costUsd,
      uncreditedShare: measure.uncreditedShare,
      unmappedFeatures: measure.unmappedFeatures,
      unmappedCostUsd: measure.unmappedCostUsd,
      isFloor: measure.isFloor,
      fixedCostFamiliesNotMeasured: FIXED_COST_FAMILIES_UNMEASURED,
    }

    // Un écart NON MESURABLE ne déclenche rien : rendre « rapport 1 » quand une
    // seule famille est mesurable dirait « tout va bien » là où la bonne réponse
    // est « on ne sait pas ». Un verdict ne se conclut pas d'un silence.
    if (measure.spread && measure.spread.ratio > CREDIT_COST_SPREAD_ALERT_RATIO) {
      this.logger.error(
        `Le poids d’un crédit ne suit plus son coût : ×${measure.spread.ratio} entre « ${measure.spread.dearest} » ` +
          `et « ${measure.spread.cheapest} » sur 24 h (alerte au-delà de ×${CREDIT_COST_SPREAD_ALERT_RATIO})` +
          (measure.isFloor ? ' — mesure plancher : des lignes ou des crédits échappent au comptage' : ''),
        {
          tags: { 'cost.measure': 'credit-weighting' },
          contexts: { creditCost: { ...context, ...measure.spread } },
        },
      )
    }

    if (measure.uncreditedShare != null && measure.uncreditedShare > UNCREDITED_COST_SHARE_ALERT) {
      this.logger.error(
        `${Math.round(measure.uncreditedShare * 100)} % du coût mesuré sur 24 h ne débite aucun crédit ` +
          `(alerte au-delà de ${Math.round(UNCREDITED_COST_SHARE_ALERT * 100)} %)`,
        {
          tags: { 'cost.measure': 'uncredited-share' },
          contexts: { creditCost: context },
        },
      )
    }
  }
}
