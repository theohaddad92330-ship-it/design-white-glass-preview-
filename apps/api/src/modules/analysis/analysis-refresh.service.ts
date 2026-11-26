import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import {
  buildRefreshDiff,
  buildRefreshFailureReport,
  contactScopeFromSelection,
  refreshedTooRecently,
  CONFIDENCE_RECALCULATING_DIMENSIONS,
  REFRESH_DIMENSION_CREDIT_COST,
  REFRESH_DIMENSION_PHASE,
  readReferenceArchive,
  REFRESH_MIN_INTERVAL_MS,
  SCORE_RECALCULATING_DIMENSIONS,
  strategyScopeFromSelection,
} from '@bellum/contracts'
import type {
  FieldSource,
  RefreshDiff,
  RefreshDiffItem,
  RefreshDimension,
  RefreshPhase,
  AnalysisScopeSelection,
} from '@bellum/contracts'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { AccountEntity } from '../../database/entities/account.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { ACCOUNT_FIELD_COLUMNS } from '../crm-core/record-fields'
import { CreditsService } from '../credits/credits.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { PAID_VERIFICATION_TELEMETRY, type PaidVerificationTelemetry } from './paid-verification-telemetry.port'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

type RefreshFailureCode =
  | 'not_found'
  | 'ia_failed'
  | 'precondition_failed'
  | 'insufficient_credits'
  /** Cette dimension vient d'être rafraîchie — rejouer ne rapporterait rien. */
  | 'refreshed_recently'

export type RefreshFailure = {
  code: RefreshFailureCode
  message: string
}

/** Outcome of a successful dimension refresh — the dimension that was refreshed
 *  plus the enrichment-credit balance left after the debit. */
type RefreshResult = {
  dimension: RefreshDimension
  remaining: number
  /** #2452.6 — ce que CE rafraîchissement a changé (le même objet que
   *  `raw_analysis.last_refresh.diff`, qui ne garde que le dernier axe rejoué). */
  diff: RefreshDiff
}

/**
 * "Rerun partiel par dimension" (Théo P1) — refresh ONE facet of a completed
 * dossier (signals / contacts / entities / strategy) without re-running the full
 * 4-phase pipeline.
 *
 * Each dimension maps to exactly one single-phase re-run already implemented by
 * {@link AnalysisOnDemandService} — which reuses the account's STORED outputs for
 * every other phase, so only the targeted phase re-pays its providers:
 *   - `signals`  → `refreshResearch`   (Phase 1)
 *   - `contacts` → `enrichContacts`    (Phase 2)
 *   - `entities` → `enrichOrganigram`  (Phase 3)
 *   - `strategy` → `replan`            (Phase 4)
 *
 * Billing (Théo « coût/crédits ») : a partial refresh is a fraction of a full
 * analysis, so it spends the cheap **enrichment credits** rather than an analysis
 * SLOT. Same pattern as single-contact enrichment: pre-check to fail fast, then
 * debit ONLY after the refresh actually succeeded (a failed IA call never burns a
 * credit). The atomic decrement stays the source of truth — a race that sneaks
 * past the pre-check is caught there.
 */
@Injectable()
export class AnalysisRefreshService {
  private readonly logger = new Logger(AnalysisRefreshService.name)

  /**
   * #2125.50-.56 — les axes dont l'instantané SAIT lire la sortie.
   *
   * L'instantané compare les FAITS DE LA FICHE (`ACCOUNT_FIELD_COLUMNS`), ceux
   * que la recherche et l'organigramme écrivent. Le plan et les contacts vivent
   * dans d'autres tables : après un rerun de stratégie, un diff vide ne veut
   * pas dire « rien n'a changé », il veut dire « on n'a pas regardé » — et les
   * deux phrases ne se disent pas pareil (GA-18).
   */
  // #2318.2 — les alias produit lisent la MÊME phase que l'alias qu'ils
  // recouvrent : `identity_group`/`ecosystem`/`projects` relisent la recherche
  // (comme `signals`), `subsidiaries`/`positions` relisent l'organigramme
  // (comme `entities`). `buying_path` recouvre `strategy`, déjà hors liste.
  private static readonly DIMENSIONS_THE_SNAPSHOT_READS: readonly RefreshDimension[] = [
    'signals',
    'entities',
    'identity_group',
    'ecosystem',
    'projects',
    'subsidiaries',
    'positions',
  ]

  /** La colonne de fraîcheur de chaque dimension. Écrite ici, lue par l'écran.
   *
   * #2318.2 — un alias produit partage la colonne de la phase qu'il recouvre :
   * rejouer `identity_group` re-rafraîchit RÉELLEMENT `signals_refreshed_at`
   * (même appel on-demand), donc c'est la fraîcheur honnête à lire pour lui —
   * lui inventer sa propre colonne créerait deux fraîcheurs pour un seul geste.
   */
  //
  // #2650.2 — indexée par PHASE, jamais par axe : le groupement axe → phase
  // vit dans `REFRESH_DIMENSION_PHASE` (`@bellum/contracts`), que lit aussi le
  // remboursement des rafraîchissements déjà payés (GA-26).
  private static readonly FRESHNESS_COLUMN = {
    signals: 'signals_refreshed_at',
    contacts: 'contacts_refreshed_at',
    entities: 'entities_refreshed_at',
    strategy: 'strategy_refreshed_at',
  } as const satisfies Record<RefreshPhase, keyof AccountEntity>

  /**
   * #2650.1 (18/09/2026) — le verrou de rafraîchissement PAR AXE, DÉDIÉ. Même
   * groupement que {@link FRESHNESS_COLUMN} (un alias produit partage le
   * verrou de la phase qu'il recouvre), mais une colonne DIFFÉRENTE : celle-ci
   * n'est JAMAIS lue par l'écran (contrairement à `*_refreshed_at`, affichée
   * comme « dernier rafraîchissement » — `AccountFreshness.tsx`,
   * `RefreshOutcomeCard.tsx`, `Search.tsx`). La poser AU DÉBUT de la phase sur
   * la colonne de fraîcheur aurait annoncé un rafraîchissement terminé pendant
   * qu'il tourne encore. Migration `1789756084245`.
   */
  private static readonly REFRESH_LOCK_COLUMN = {
    signals: 'signals_refresh_lock_at',
    contacts: 'contacts_refresh_lock_at',
    entities: 'entities_refresh_lock_at',
    strategy: 'strategy_refresh_lock_at',
  } as const satisfies Record<RefreshPhase, keyof AccountEntity>

  /**
   * #2650.1 — fenêtre au-delà de laquelle un verrou est traité comme ABANDONNÉ
   * (un process qui a planté en plein milieu de la phase, sans jamais appeler
   * `releaseDimension`) plutôt que de bloquer l'axe indéfiniment. Mesuré en
   * production : une phase dure environ une minute ; cinq minutes laisse une
   * marge large sans laisser un crash geler un axe pour de bon.
   */
  private static readonly REFRESH_LOCK_TIMEOUT_MS = 5 * 60 * 1000

  constructor(
    private readonly onDemand: AnalysisOnDemandService,
    private readonly credits: CreditsService,
    // La fraîcheur PAR DIMENSION. `@Optional()` serait ici une mauvaise idée :
    // sans ce repository, la règle de non-rerun ne s'appliquerait NULLE PART en
    // silence, et un double clic continuerait de débiter deux crédits (GA-20).
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    /**
     * #1639 — le compteur de « vérifier aujourd'hui ». Un PORT, pas le service
     * d'analytics : GA-07 est au plafond et ce fichier est exactement le cas
     * qu'il compte (voir `paid-verification-telemetry.port.ts`).
     *
     * ⚠️ `@Optional()` et en DERNIÈRE position. Ce service se construit
     * positionnellement dans plusieurs specs : un optionnel inséré au milieu
     * décalerait `accounts` d'un cran, la règle de non-rerun cesserait de
     * s'appliquer, et RIEN ne jetterait — un double clic recommencerait à
     * débiter deux crédits, en silence. Le dépôt a déjà payé cette faute
     * exacte sur `accounts.controller.ts`.
     */
    @Optional()
    @Inject(PAID_VERIFICATION_TELEMETRY)
    private readonly telemetry?: PaidVerificationTelemetry,
    /**
     * #2125.54 — QUI a écrit chaque champ de la fiche, pour que le diff sache
     * distinguer « le run a modifié ce fait » de « le run a relu ce fait et ta
     * correction a gagné ».
     *
     * ⚠️ `@Optional()` et en DERNIÈRE position, pour la même raison que la
     * télémétrie juste au-dessus : un optionnel inséré au milieu décalerait
     * `accounts` d'un cran dans les specs qui construisent ce service
     * positionnellement, et la règle de non-rerun cesserait de s'appliquer en
     * SILENCE. Absent, le diff ne perd pas la protection — `decideFieldWrite`
     * retombe sur `UNKNOWN_PROVENANCE_SOURCE` — il perd seulement la capacité
     * de NOMMER la correction conservée.
     */
    @Optional()
    @InjectRepository(FieldProvenanceEntity)
    private readonly fieldProvenance?: Repository<FieldProvenanceEntity>,
  ) {}

  async refresh(
    accountId: string,
    userId: string,
    dimension: RefreshDimension,
    /**
     * Cadrage du refresh (§58, P1-04). Absent ⇒ la dimension entière est
     * rejouée, comme avant.
     *
     * Sur un groupe de la taille de Société Générale, actualiser les contacts
     * re-balayait quatre-vingt-dix-huit entités pour en corriger une : cher,
     * lent, et la correction attendue se noyait dans du bruit inchangé.
     */
    scope?: AnalysisScopeSelection,
    /** Paramètre pour que la règle de non-rerun se teste sans horloge réelle. */
    now: Date = new Date(),
  ): Promise<Result<RefreshResult, RefreshFailure>> {
    // Pre-check: surface "insufficient_credits" before paying for the phase's IA
    // call. The decrement below is the atomic source of truth — a race that
    // slips past this guard is still caught there.
    if (!(await this.credits.hasEnrichmentCredit(userId))) {
      return failure({
        code: 'insufficient_credits',
        message: SOFT_BRAKE_MESSAGE,
      })
    }

    // La dimension vient-elle d'être rafraîchie ? Cliquer deux fois de suite
    // débitait deux crédits pour rejouer exactement la même phase, sur des
    // sources qui n'ont pas bougé entre les deux clics. La date manquante ne
    // bloque rien — on ne refuse pas un geste sur une donnée qu'on n'a pas.
    const phase = REFRESH_DIMENSION_PHASE[dimension]
    const freshnessColumn = AnalysisRefreshService.FRESHNESS_COLUMN[phase]
    const lockColumn = AnalysisRefreshService.REFRESH_LOCK_COLUMN[phase]
    const account = await this.accounts.findOne({
      where: { id: accountId },
      select: ['id', 'raw_analysis', ...new Set<keyof AccountEntity>([freshnessColumn, lockColumn])],
    })
    // Théo A comptes-fiche-reference.A2 — une archive figée n'est JAMAIS réécrite :
    // aucune phase rejouée, aucun crédit débité. Le geste est la copie de travail.
    if (readReferenceArchive(account?.raw_analysis)) {
      return failure({
        code: 'precondition_failed',
        message: "Ce dossier est une archive figée : crée une copie de travail pour l'actualiser.",
      })
    }
    const lastRefresh = account?.[freshnessColumn] ?? null
    if (refreshedTooRecently(lastRefresh, now)) {
      return failure({
        code: 'refreshed_recently',
        message: `Cet axe vient d'être actualisé. Les sources n'ont pas eu le temps de bouger — réessaie dans ${Math.round(REFRESH_MIN_INTERVAL_MS / 3_600_000)} h.`,
      })
    }

    // #2650.1 — la fenêtre ci-dessus ne s'écrit qu'APRÈS la phase (plus bas,
    // après le succès). Pendant qu'elle tourne (≈1 min, mesuré en production
    // le 18/09/2026 — deux clics à 50 s d'écart, deux débits), un second appel
    // la traversait sans obstacle. Cette réservation ferme ce trou : verrou
    // par jeton (CAS Postgres), pas une Map en mémoire — le multi-instance
    // compte. Un verrou plus vieux que `REFRESH_LOCK_TIMEOUT_MS` est traité
    // comme ABANDONNÉ (process planté en plein milieu de la phase) plutôt que
    // de bloquer l'axe indéfiniment.
    const currentLock = (account?.[lockColumn] as Date | null | undefined) ?? null
    const lockIsAbandoned =
      !currentLock || now.getTime() - currentLock.getTime() >= AnalysisRefreshService.REFRESH_LOCK_TIMEOUT_MS
    if (!lockIsAbandoned || !(await this.reserveDimension(accountId, lockColumn, currentLock, now))) {
      return failure({
        code: 'refreshed_recently',
        message: 'Cet axe est déjà en cours de rafraîchissement. Réessaie dans quelques secondes.',
      })
    }

    try {
      this.logger.log('Dimension refresh', { accountId, userId, dimension })

      // #2125.50-.56 — l'instantané AVANT, pris pendant qu'on a encore l'ancien
      // état. Sans lui, le diff du retour n'aurait rien à comparer.
      const before = await this.snapshot(accountId, await this.fieldSources(accountId))

      const outcome = await this.runDimension(accountId, userId, dimension, scope)
      if (isFailure(outcome)) {
        // #2125.64-.67 — la phase a échoué : AUCUN crédit n'a été débité (le
        // `consume` est plus bas), les autres axes du dossier sont intacts, et
        // l'écran doit pouvoir le dire plutôt que d'afficher « une erreur est
        // survenue ». Le rapport se range à côté du diff, au même endroit.
        await this.writeLastRefresh(accountId, before?.raw ?? null, {
          at: now.toISOString(),
          phase: dimension,
          failure: buildRefreshFailureReport({
            mode: 'full',
            phase: dimension,
            // Le problème PORTE le motif : `dispatchFailureOutcome` y lit la seule
            // question qui compte — la requête a-t-elle pu PARTIR ?
            error: outcome.problem,
            // Zéro VRAI, pas un zéro de repli : le débit vient après cette ligne.
            creditsDebited: 0,
            refunded: false,
          }),
        })
        // Underlying phase failed — propagate its code untouched, no credit spent.
        return failure(outcome.problem)
      }

      // Charge only on success (Théo §7 billing). If the atomic decrement loses a
      // race (concurrent refresh drained the pool first), the work is already done
      // but we still surface the depletion so the UI shows the real balance.
      //
      // ⚠️ Le `cost` est EXPLICITE, et c'est le cœur du correctif. Sans lui,
      // `consumeEnrichmentCredit` retombait sur `resolveEnrichmentCost(undefined)`
      // — le poids d'un ENRICHISSEMENT DE CONTACT — pendant que le menu
      // « Rafraîchir » annonce `REFRESH_DIMENSION_CREDIT_COST`, dérivé de
      // `targeted_refresh`. Deux grandeurs distinctes, égales à 1 par coïncidence :
      // le prix affiché et le prix débité venaient de deux sources différentes, et
      // le jour où l'une bouge seule, l'écart se découvre au relevé. On lit
      // désormais LA table que l'écran lit (GA-26 — une dérivation vit à un seul
      // endroit). Garde : « le débit vient de la grille annoncée » dans le spec.
      const consume = await this.credits.consumeEnrichmentCredit(userId, {
        reason: `refresh:${dimension}`,
        accountId,
        cost: REFRESH_DIMENSION_CREDIT_COST[dimension],
      })
      if (!consume.ok) {
        this.logger.warn('Dimension refresh race lost — credit decrement returned 0 affected', {
          accountId,
          userId,
          dimension,
        })
        return failure({ code: 'insufficient_credits', message: SOFT_BRAKE_MESSAGE })
      }

      // #1639 — LA MOITIÉ PAYANTE DE LA PAIRE QUE L'ÉCRAN ANNONCE.
      //
      // Lire la mémoire marché ne débite rien : la donnée est déjà en base, la
      // collecte a été payée une fois. Ce geste-ci va demander au web ce qui est
      // vrai AUJOURD'HUI — du travail nouveau, un coût fournisseur réel à chaque
      // appel — et c'est ce que le crédit achète. Compter les deux côtés est
      // toute la démonstration économique du corpus.
      //
      // ⚠️ Le compteur suit le DÉBIT, jamais l'intention : il est posé APRÈS le
      // `consume.ok`, donc après le refus faute de crédits, après l'échec de
      // phase, et après une course perdue sur le décrément atomique. Compter
      // l'intention gonflerait la mesure du côté flatteur — exactement le biais
      // pour lequel `paid_calls_avoided` a été refusé.
      //
      // Best-effort et enveloppé : perdre une ligne de journal est acceptable,
      // défaire un rafraîchissement déjà payé ne l'est pas.
      try {
        this.telemetry?.paidVerificationTriggered({
          userId,
          accountId,
          gesture: `refresh:${dimension}`,
          creditsDebited: REFRESH_DIMENSION_CREDIT_COST[dimension],
        })
      } catch (error) {
        this.logger.warn('Compteur de vérification payante non émis', { accountId, dimension, error })
      }

      // La fraîcheur de CETTE dimension, écrite après le succès. Best-effort : une
      // écriture ratée ici ne doit pas annuler un refresh déjà payé et déjà fait —
      // le pire cas est un refresh de trop, jamais une perte de travail.
      try {
        await this.accounts.update({ id: accountId }, { [freshnessColumn]: now })
      } catch (error) {
        this.logger.warn('Fraîcheur de dimension non enregistrée', { accountId, dimension, error })
      }

      // #2125.50-.56 — CE QUI A CHANGÉ, écrit là où l'écran le lira. Best-effort,
      // comme la fraîcheur : perdre le diff est regrettable, annuler un
      // rafraîchissement déjà payé ne l'est pas.
      //
      // ⚠️ L'instantané d'APRÈS ne porte aucune provenance : ce que la phase vient
      // de produire vient du pipeline, par construction. C'est ce qui permet à
      // `decideFieldWrite` de rendre le bon verdict face à une correction humaine.
      const after = await this.snapshot(accountId, {})
      const readsThisDimension = AnalysisRefreshService.DIMENSIONS_THE_SNAPSHOT_READS.includes(dimension)
      const diff = buildRefreshDiff({
        before: before?.items ?? [],
        after: after?.items ?? [],
        // Une mesure qu'on n'a pas pu faire se NOMME. Deux cas : l'instantané n'a
        // pas pu être relu, ou cet axe écrit ailleurs que dans les faits de fiche.
        unmeasured: !after || !before || !readsThisDimension ? [dimension] : [],
        // #2591.1 — un score jamais recalculé par CETTE dimension se NOMME,
        // jamais confondu avec un score vérifié stable. Un seul endroit décide
        // quelles dimensions écrivent vraiment `priority_score` (GA-26).
        scoreRecalculated: SCORE_RECALCULATING_DIMENSIONS.includes(dimension),
        // #2591.6 — même arbitrage pour la CONFIANCE : un seul endroit décide
        // quelles dimensions écrivent vraiment `raw_analysis.confidence` (GA-26).
        confidenceRecalculated: CONFIDENCE_RECALCULATING_DIMENSIONS.includes(dimension),
        // #2318.8 — « Elle ne doit pas modifier silencieusement la mémoire
        // partagée ». Un CONSTAT, pas un arbitrage : voir le docblock de
        // `measureOverwrittenCorrections` juste en dessous.
        overwrittenCorrections: AnalysisRefreshService.measureOverwrittenCorrections(
          before?.items ?? [],
          after?.items ?? [],
          dimension,
        ),
      })
      await this.writeLastRefresh(accountId, after?.raw ?? before?.raw ?? null, {
        at: now.toISOString(),
        phase: dimension,
        diff,
      })

      // #2452.6 — le diff voyage aussi dans la réponse : l'approfondissement
      // depuis /chat enchaîne plusieurs axes et résume l'ensemble.
      return success({ dimension, remaining: consume.remaining, diff })
    } finally {
      // #2650.1 — relâché dans TOUS les cas (succès, échec de phase, course de
      // crédit perdue) : le pire cas redevient un refresh de trop après
      // expiration du verrou, jamais un axe bloqué par une réservation qui
      // traîne. CAS sur le jeton — voir `releaseDimension`.
      await this.releaseDimension(accountId, lockColumn, now)
    }
  }

  /**
   * #2318.8 — « Elle ne doit pas modifier silencieusement la mémoire partagée »
   * (LAU-FINAL-059, section PROPAGATION).
   *
   * Ce que cette fonction mesure, et pourquoi elle ne pouvait pas vivre dans
   * `buildRefreshDiff` : l'instantané d'APRÈS est relu DANS LA BASE, une fois la
   * phase écrite (`this.snapshot(accountId, {})`). Ce n'est donc PAS une
   * proposition de la collecte, c'est l'état persisté. Or `buildRefreshDiff`
   * rejoue `decideFieldWrite` dessus comme s'il s'agissait d'une proposition :
   * face à un `before` marqué `human`, il répond « la correction gagne » et
   * range le champ en `preservedCorrections` — « conservée : Lyon » — alors que
   * la base contient Paris. L'arbitre a raison sur le DROIT et tort sur le FAIT.
   *
   * Ici on ne rejoue aucun arbitrage : on CONSTATE. Un champ dont la provenance
   * d'avant était `human` et dont la valeur persistée a changé pendant la phase
   * a été écrasé, point — quel qu'en soit le chemin (un writer qui contourne
   * `applyFieldUpdates`, une migration, un `UPDATE` direct). C'est le filet
   * d'exécution derrière la garde statique GA-131 : elle interdit le
   * contournement à la lecture du code, celle-ci le voit quand il arrive.
   *
   * ⚠️ Elle se TAIT plutôt que de deviner : sans provenance lisible (dépôt
   * absent, ligne sans source), aucun champ n'est accusé. « Non mesuré » n'est
   * pas « aucun écrasement », et une accusation devinée vaudrait moins que rien.
   * Elle ne regarde que les FAITS de fiche — un score ou un signal n'a pas
   * d'auteur humain, donc rien à écraser.
   */
  private static measureOverwrittenCorrections(
    before: readonly RefreshDiffItem[],
    after: readonly RefreshDiffItem[],
    dimension: RefreshDimension,
  ): RefreshDiff['overwrittenCorrections'] {
    const persisted = new Map(after.filter(item => item.kind === 'fact').map(item => [item.key, item]))
    const overwritten: RefreshDiff['overwrittenCorrections'] = []
    for (const item of before) {
      if (item.kind !== 'fact' || item.source !== 'human') continue
      const now = persisted.get(item.key)
      // Absent de l'instantané d'après : la collecte ne l'a pas revu. Ce n'est
      // pas un écrasement — `buildRefreshDiff` le dit déjà « conservé ».
      if (!now || now.value === item.value) continue
      overwritten.push({
        key: item.key,
        label: item.label,
        correctedValue: item.value,
        overwrittenWith: now.value,
        // Le COUPABLE, nommé : l'axe qu'on venait de rejouer.
        byPhase: dimension,
        correctedAt: item.measuredAt ?? null,
      })
    }
    return overwritten
  }

  /**
   * #2650.1 — réserve l'axe AU DÉBUT de la phase, atomiquement (CAS Postgres
   * sur `lockColumn`, jamais une Map en mémoire — le multi-instance compte).
   * Rend `true` si CET appel tient désormais le verrou.
   *
   * ⚠️ Best-effort côté ERREUR de requête (pas côté refus légitime) : une
   * panne sur l'écriture du verrou ne doit pas bloquer un geste payant que la
   * fenêtre de fraîcheur a déjà laissé passer — le pire cas reste un refresh
   * de trop, jamais un blocage.
   */
  private async reserveDimension(
    accountId: string,
    lockColumn: keyof AccountEntity,
    currentLock: Date | null,
    now: Date,
  ): Promise<boolean> {
    try {
      const qb = this.accounts
        .createQueryBuilder()
        .update()
        .set({ [lockColumn]: now } as QueryDeepPartialEntity<AccountEntity>)
      const result = await (
        currentLock
          ? qb.where(`id = :id AND ${String(lockColumn)} = :currentLock`, { id: accountId, currentLock })
          : qb.where(`id = :id AND ${String(lockColumn)} IS NULL`, { id: accountId })
      ).execute()
      return (result.affected ?? 0) > 0
    } catch (error) {
      this.logger.warn('Réservation de verrou de rafraîchissement non écrite — on procède sans verrou', {
        accountId,
        lockColumn,
        error,
      })
      return true
    }
  }

  /**
   * Relâche le verrou EN FIN de phase — CAS sur le jeton posé par CET appel :
   * si un autre appel a repris l'axe entre-temps (verrou jugé abandonné,
   * `REFRESH_LOCK_TIMEOUT_MS` dépassé pendant que celui-ci tournait encore),
   * sa réservation ne doit JAMAIS être écrasée.
   */
  private async releaseDimension(accountId: string, lockColumn: keyof AccountEntity, token: Date): Promise<void> {
    try {
      await this.accounts
        .createQueryBuilder()
        .update()
        .set({ [lockColumn]: null } as QueryDeepPartialEntity<AccountEntity>)
        .where(`id = :id AND ${String(lockColumn)} = :token`, { id: accountId, token })
        .execute()
    } catch (error) {
      this.logger.warn('Verrou de rafraîchissement non relâché — se dénouera après expiration', {
        accountId,
        lockColumn,
        error,
      })
    }
  }

  /**
   * QUI a écrit chaque champ de la fiche, avec la date. Vide quand la table de
   * provenance n'est pas branchée — jamais une source inventée.
   */
  private async fieldSources(accountId: string): Promise<Record<string, { source: FieldSource; at: string | null }>> {
    if (!this.fieldProvenance) return {}
    try {
      const rows = await this.fieldProvenance.find({ where: { entity_type: 'account', entity_id: accountId } })
      const sources: Record<string, { source: FieldSource; at: string | null }> = {}
      for (const row of rows) {
        sources[row.field] = {
          source: row.source,
          at: row.observed_at instanceof Date ? row.observed_at.toISOString() : (row.observed_at ?? null),
        }
      }
      return sources
    } catch (error) {
      // Une provenance illisible ne doit pas empêcher un rafraîchissement : le
      // diff perdra la mention « correction conservée », rien d'autre.
      this.logger.warn('Provenance de fiche illisible — diff sans corrections nommées', { accountId, error })
      return {}
    }
  }

  /**
   * Les FAITS de la fiche, tels qu'ils sont à cet instant.
   *
   * Un champ vide n'entre pas : il n'est pas « à zéro », il est absent, et le
   * faire entrer transformerait un trou en fait observé.
   */
  private async snapshot(
    accountId: string,
    sources: Record<string, { source: FieldSource; at: string | null }>,
  ): Promise<{ items: RefreshDiffItem[]; raw: Record<string, unknown> | null } | null> {
    let row: AccountEntity | null = null
    try {
      row = await this.accounts.findOne({
        where: { id: accountId },
        select: [
          'id',
          'raw_analysis',
          'priority_score',
          'recent_signals',
          ...Object.values(ACCOUNT_FIELD_COLUMNS),
        ] as (keyof AccountEntity)[],
      })
    } catch (error) {
      this.logger.warn('Instantané de fiche illisible — le diff dira « non mesuré »', { accountId, error })
      return null
    }
    if (!row) return null

    const values = row as unknown as Record<string, unknown>
    const items: RefreshDiffItem[] = []
    for (const [field, column] of Object.entries(ACCOUNT_FIELD_COLUMNS)) {
      const value = values[column]
      if (value === null || value === undefined || value === '') continue
      const provenance = sources[field]
      items.push({
        kind: 'fact',
        key: field,
        label: field,
        value: String(value),
        ...(provenance ? { source: provenance.source, measuredAt: provenance.at } : {}),
      })
    }

    const raw = (values.raw_analysis as Record<string, unknown> | null) ?? null

    // #2318.4 — « score modifié » / « confiance modifiée » : deux valeurs de
    // plus dans l'instantané, pour que `buildRefreshDiff` puisse les comparer.
    // `priority_score` est une colonne ; la confiance vit dans
    // `raw_analysis.confidence.score` (même lecture que le KPI de grounding,
    // `analysis-telemetry.service.ts` — GA-26, on ne réinvente pas la lecture).
    if (typeof values.priority_score === 'number') {
      items.push({
        kind: 'score',
        key: 'priority_score',
        label: 'priority_score',
        value: String(values.priority_score),
      })
    }
    const confidence = raw && typeof raw.confidence === 'object' && raw.confidence !== null ? raw.confidence : null
    const confidenceScore = confidence ? (confidence as { score?: unknown }).score : undefined
    if (typeof confidenceScore === 'number' && Number.isFinite(confidenceScore)) {
      items.push({ kind: 'confidence', key: 'confidence', label: 'confidence', value: String(confidenceScore) })
    }

    // #2318.4 — « signaux expirés » : chaque signal récent devient un item
    // `kind: 'signal'`, clé sur son libellé (le relevé n'a pas d'identifiant
    // stable). Un signal absent d'un instantané par ailleurs présent
    // redeviendra INCONNU AVEC SA DATE plutôt que de disparaître.
    const recentSignals = Array.isArray(values.recent_signals) ? values.recent_signals : []
    for (const entry of recentSignals) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const label = typeof record.signal === 'string' ? record.signal : null
      if (!label) continue
      items.push({
        kind: 'signal',
        key: label,
        label,
        value: typeof record.sales_implication === 'string' ? record.sales_implication : label,
        measuredAt: typeof record.date === 'string' ? record.date : null,
      })
    }

    return { items, raw }
  }

  /**
   * Range le compte rendu du rafraîchissement DANS `raw_analysis`.
   *
   * Pas une table ni une colonne de plus : le blob voyage déjà avec le compte
   * jusqu'au front, et il porte déjà ce que le run produit. Le reste du blob est
   * recopié tel quel — écraser le voisin d'un diff serait pire que pas de diff.
   */
  private async writeLastRefresh(
    accountId: string,
    raw: Record<string, unknown> | null,
    lastRefresh: Record<string, unknown>,
  ): Promise<void> {
    try {
      const next = { ...(raw ?? {}), last_refresh: lastRefresh }
      await this.accounts.update({ id: accountId }, { raw_analysis: next } as QueryDeepPartialEntity<AccountEntity>)
    } catch (error) {
      this.logger.warn('Compte rendu de rafraîchissement non enregistré', { accountId, error })
    }
  }

  /** Route a dimension to its single-phase on-demand re-run. Each returns a
   *  {@link Result} with the same `OnDemandFailure` codes, which map 1:1 onto
   *  {@link RefreshFailure} (minus `insufficient_credits`, added by this layer). */
  private async runDimension(
    accountId: string,
    userId: string,
    dimension: RefreshDimension,
    /**
     * ⚠️ Ce paramètre n'existait pas. `scope` était déclaré au contrat, transmis
     * par le contrôleur, reçu par `refresh` — et jeté ici : un refresh était
     * TOUJOURS pleine dimension, alors que le contrat promet un rerun partiel.
     *
     * Deux dimensions savent le lire, deux ne le savent pas. On le DIT plutôt
     * que de le laisser tomber en silence : une promesse de cadrage non tenue
     * se paie en jetons et en attente, sans que personne comprenne pourquoi.
     */
    scope?: AnalysisScopeSelection,
  ): Promise<Result<unknown, RefreshFailure>> {
    const contactScope = contactScopeFromSelection(scope)
    const strategyScope = strategyScopeFromSelection(scope)
    // #2318.2 — les alias produit ignorent le cadrage exactement comme la phase
    // qu'ils recouvrent (`identity_group`/`ecosystem`/`projects` → `signals` ;
    // `subsidiaries`/`positions` → `entities`) : même appel on-demand, même
    // limite.
    if (
      scope &&
      (dimension === 'signals' ||
        dimension === 'entities' ||
        dimension === 'identity_group' ||
        dimension === 'ecosystem' ||
        dimension === 'projects' ||
        dimension === 'subsidiaries' ||
        dimension === 'positions')
    ) {
      this.logger.log('Cadrage ignoré — cette dimension se rejoue entière', { accountId, dimension })
    }
    switch (dimension) {
      case 'signals':
      case 'identity_group':
      case 'ecosystem':
      case 'projects':
        return this.onDemand.refreshResearch(accountId, userId)
      case 'contacts':
        return this.onDemand.enrichContacts(accountId, userId, contactScope)
      case 'entities':
      case 'subsidiaries':
      case 'positions':
        return this.onDemand.enrichOrganigram(accountId, userId)
      case 'strategy':
      case 'buying_path':
        return this.onDemand.replan(accountId, userId, strategyScope)
      default: {
        const _exhaustive: never = dimension
        return failure({ code: 'precondition_failed', message: `Unknown dimension: ${String(_exhaustive)}` })
      }
    }
  }
}
