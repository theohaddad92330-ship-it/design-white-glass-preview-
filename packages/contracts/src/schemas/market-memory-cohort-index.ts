import type {
  AccountCohortIndex,
  CohortIndexExclusionReason,
  MarketMemoryCohortIndexAxis,
} from './market-memory-cohort-index-axes.js'
import { MARKET_MEMORY_MIN_PATHS } from './market-memory.js'

/**
 * #1613 / #1640 — L'INDEX D'EXTERNALISATION NORMALISÉ PAR COHORTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux retours (#1613, #1640) demandent une gradation « Appétence aux
 * externes : Forte / Moyenne / Faible ». Elle a été refusée depuis des
 * semaines pour une bonne raison, écrite par l'auteur des retours lui-même :
 * `market_company_signal.externalization_score` (0-100, fourni par le corpus)
 * est mécaniquement corrélé à la TAILLE de l'entreprise et à la complétude de
 * NOTRE corpus — pas à une pratique d'achat. Un grand groupe cite plus de
 * technologies qu'une PME parce qu'il a plus de monde, pas parce qu'il achète
 * plus PROPORTIONNELLEMENT. `market-memory-score-single-reader.test.ts`
 * (GA-257, web) et `market-memory-single-source-of-truth.spec.ts` (GA-258,
 * api) tiennent déjà ce refus ; ce fichier construit ce qui manquait pour en
 * sortir un jour : la normalisation elle-même.
 *
 * Ce module calcule l'INDEX. Il n'affiche rien : `MARKET_MEMORY_SCORING_ENABLED`
 * (`market-memory-scoring.ts`) reste `false` tant que la calibration n'est pas
 * validée sur données réelles — voir
 * `apps/api/src/scripts/measure-market-memory-cohort-index.ts`, le seul moyen
 * de LIRE ce que ce fichier produit avant que le drapeau ne s'allume.
 *
 * ⚠️ **Le jour où `MARKET_MEMORY_SCORING_ENABLED` passe à `true`**, la phrase
 * de `apps/web/src/i18n/locales/fr/marketMemory.json:41` (clé `fit.noGrade`,
 * lue par `MarketStructuralFitCard.tsx:76`) devient FAUSSE et doit changer
 * DANS LE MÊME LOT — elle dit aujourd'hui, à raison, qu'on ne sait pas encore
 * comparer un compte à des entreprises de taille voisine. (Sa jumelle
 * anglaise vit dans `marketMemory.json` du dossier `en`, même clé.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COHORTE, ET POURQUOI ELLE EST LA SEULE QU'ON PEUT CONSTRUIRE AUJOURD'HUI
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_signal` ne porte AUCUNE colonne de secteur ou d'activité —
 * vérifié sur l'entité (`market-company-signal.entity.ts`) et sur le contrat
 * (`market-memory.ts`) : `grep -i "sector|naics|industry"` n'y rend rien. La
 * cohorte de ce lot est donc la TRANCHE D'EFFECTIF seule
 * (`headcountBracket`, texte libre du corpus, ex. « 11-50 ») — pas le secteur,
 * faute de la colonne pour le porter. Une cohorte secteur × effectif
 * demanderait d'abord une colonne que le corpus n'a pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS AXES — jamais un score nu (doctrine c26_probabilite)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `cohortRelativePosition` — le rang PERCENTILE du score brut de
 *    l'entreprise DANS SA COHORTE (même tranche d'effectif). C'est l'axe qui
 *    décorrèle : un score brut de 20 en tête d'une cohorte de PME dit « fort »
 *    quand un score brut de 90 au milieu d'une cohorte de grands groupes dit
 *    « moyen » — voir le test « LE POINT DU LOT » dans le fichier de test.
 * 2. `cohortCoverage` — combien de PAIRS mesurés compte la cohorte. Un
 *    percentile calculé sur 3 pairs ne veut rien dire ; celui-ci le dit,
 *    gradué (`cohortCoverageSaturation`), jamais binaire.
 * 3. `ownObservations` — la confiance dans le score PROPRE de l'entreprise,
 *    au-delà du plancher produit ({@link MARKET_MEMORY_MIN_PATHS}) qui ne
 *    garantit que la VISIBILITÉ, pas la fiabilité d'un index gradué.
 *
 * Sous {@link MARKET_MEMORY_COHORT_INDEX_MIN_AXES} axes évaluables, `index`
 * est `null` — jamais une moyenne sur un dénominateur inventé (`indexFromAxes`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Il ne choisit PAS les seuils Forte/Moyenne/Faible — {@link
 *   MARKET_MEMORY_COHORT_INDEX_BUCKETS} les NOMME, provisoires, en attendant
 *   la distribution réelle (voir le script de mesure).
 * · Il ne lit ni n'écrit la base — les entités de la mémoire marché restent
 *   derrière `MarketMemoryService` / le script d'audit, jamais importées ici.
 * · Il ne rend jamais « X % externalise » (GA-259) : `cohortRelativePosition`
 *   est un RANG dans un échantillon, pas un fait de marché.
 */

/* ⚠️ `MARKET_MEMORY_COHORT_INDEX_AXES` et `COHORT_INDEX_EXCLUSION_REASONS` ont
 * DÉMÉNAGÉ dans `market-memory-cohort-index-axes.ts` (#1640.2) — une feuille
 * sans dépendance, pour que `market-memory.ts` puisse porter le champ de
 * transport sans créer un cycle d'imports avec ce fichier. Ils ne sont pas
 * réexportés ici : deux `export *` sur le même nom s'annulent en ESM. */

/** Sous ce nombre d'axes évaluables, aucun index n'est produit (doctrine c26_probabilite, même
 *  règle que `MIN_AXES_FOR_SCORE` de `mission-scores.ts` et `OVERFLOW_MIN_AXES` — trois familles de
 *  scores, trois constantes locales : les axes sont spécifiques au domaine, la RÈGLE ne l'est pas). */
export const MARKET_MEMORY_COHORT_INDEX_MIN_AXES = 3

/**
 * Les réglages qui gouvernent la normalisation — à cet unique endroit (GA-26).
 *
 * ⚠️ PROVISOIRES, TOUS LES QUATRE. Personne n'a encore lu la distribution
 * réelle de `market_company_signal` en production (~60 067 lignes, mesure
 * jamais faite — voir le brief du lot). Ils encodent une intuition
 * raisonnable, pas une calibration : `apps/api/src/scripts/
 * measure-market-memory-cohort-index.ts`, lancé contre une base réelle, est
 * ce qui doit les faire bouger — jamais un chiffre deviné une seconde fois.
 */
export const MARKET_MEMORY_COHORT_INDEX_SETTINGS = {
  /**
   * Pairs mesurés minimum dans la cohorte pour que `cohortRelativePosition`
   * soit évaluable. Sous ce nombre, un percentile est un artefact du hasard —
   * même esprit que {@link MARKET_MEMORY_MIN_PATHS}, à une autre échelle
   * (l'ENTREPRISE, pas la cohorte).
   */
  minCohortSize: 20,
  /**
   * Parcours PROPRES minimum pour que `ownObservations` soit évaluable.
   * DISTINCT de {@link MARKET_MEMORY_MIN_PATHS} : celui-ci gouverne la
   * VISIBILITÉ produit (un compte sous 3 parcours n'apparaît nulle part),
   * celui-ci gouverne la CONFIANCE dans un index GRADUÉ — plus exigeant,
   * jamais moins (vérifié par un test).
   */
  minOwnPathsForIndex: 5,
  /** Parcours propres au-delà desquels l'axe de confiance individuelle est saturé à 100. */
  ownObservationsSaturation: 20,
  /** Pairs mesurés au-delà desquels l'axe de couverture cohorte est saturé à 100. */
  cohortCoverageSaturation: 60,
} as const

/**
 * Les bornes Forte/Moyenne — NOMMÉES, pas choisies. #1613 et #1640 les
 * demandent ; personne n'a mesuré où tombent les seuils naturels de la
 * distribution réelle. Elles ne sont lues par AUCUN écran : {@link
 * MARKET_MEMORY_COHORT_INDEX_BUCKETS} existe pour que la question ait un
 * endroit unique le jour où la calibration répond, pas pour trancher ce
 * soir. `MARKET_MEMORY_SCORING_ENABLED` reste `false` tant qu'elles n'ont pas
 * été confrontées à la distribution que rend le script de mesure.
 */
export const MARKET_MEMORY_COHORT_INDEX_BUCKETS = {
  /** Index ≥ cette valeur ⇒ candidat à « Forte ». PROVISOIRE. */
  forteMin: 70,
  /** Index ≥ cette valeur (et < forteMin) ⇒ candidat à « Moyenne ». PROVISOIRE. */
  moyenneMin: 40,
} as const

/** Ce que le script de mesure lit par ligne — projection minimale de `market_company_signal`. */
export interface CohortIndexSignal {
  readonly companyKey: string
  /** Texte libre du corpus (ex. « 11-50 »). `null` = tranche inconnue. */
  readonly headcountBracket: string | null
  readonly pathsTotal: number
  /** 0-100, fourni par le corpus. `null` sous le seuil du corpus (jamais 0 inventé). */
  readonly externalizationScore: number | null
}

export interface CohortIndexAxisEvaluation {
  readonly axis: MarketMemoryCohortIndexAxis
  readonly value: number
}

export interface MarketMemoryCohortIndexResult {
  readonly companyKey: string
  /** Moyenne des axes évaluables, 0-100, ou `null` sous {@link MARKET_MEMORY_COHORT_INDEX_MIN_AXES}. */
  readonly index: number | null
  readonly evaluated: readonly CohortIndexAxisEvaluation[]
  /** Les axes qui n'ont pas pu être évalués, NOMMÉS — jamais silencieusement absents. */
  readonly notEvaluable: readonly MarketMemoryCohortIndexAxis[]
  readonly cohort: { readonly bracket: string; readonly measuredPeers: number }
}

export type CohortIndexClassification =
  | { readonly kind: 'excluded'; readonly companyKey: string; readonly reason: CohortIndexExclusionReason }
  | { readonly kind: 'calculable'; readonly result: MarketMemoryCohortIndexResult }

export interface CohortIndexBracketDistribution {
  readonly bracket: string
  readonly measuredPeers: number
  readonly median: number | null
  readonly p25: number | null
  readonly p75: number | null
}

export interface CohortIndexReport {
  readonly counts: {
    readonly read: number
    readonly calculable: number
    /** S'ADDITIONNE avec `calculable` jusqu'à `read` — jamais déduit par soustraction. */
    readonly excluded: Readonly<Record<CohortIndexExclusionReason, number>>
  }
  readonly byBracket: readonly CohortIndexBracketDistribution[]
  readonly classifications: readonly CohortIndexClassification[]
}

/**
 * Moyenne des axes évaluables, ou `null` sous {@link MARKET_MEMORY_COHORT_INDEX_MIN_AXES}.
 *
 * Même principe que `scoreFromAxes` (`mission-scores.ts`) : le dénominateur
 * est le nombre d'axes RÉELLEMENT évalués, jamais le total nominal — diviser
 * par trois quand un seul a répondu ferait mesurer la complétude de nos
 * données plutôt que l'entreprise.
 */
export function indexFromAxes(evaluated: readonly CohortIndexAxisEvaluation[]): number | null {
  if (evaluated.length < MARKET_MEMORY_COHORT_INDEX_MIN_AXES) return null
  const total = evaluated.reduce((sum, entry) => sum + entry.value, 0)
  return Math.round(total / evaluated.length)
}

/**
 * Quantile linéaire (méthode R-7, la même que la plupart des tableurs) sur un
 * tableau TRIÉ. `null` si vide.
 *
 * Exporté pour `apps/api/src/scripts/measure-market-memory-cohort-index.ts` :
 * le script de mesure (b) en a besoin pour afficher la distribution des INDEX
 * calculés eux-mêmes (pas seulement celle des scores bruts par cohorte, que
 * {@link buildCohortIndexReport} rend déjà via `byBracket`) — c'est cette
 * distribution-là qui montre où tombent les seuils naturels de
 * {@link MARKET_MEMORY_COHORT_INDEX_BUCKETS}.
 */
export function quantile(sortedValues: readonly number[], q: number): number | null {
  if (sortedValues.length === 0) return null
  if (sortedValues.length === 1) return sortedValues[0]
  const position = (sortedValues.length - 1) * q
  const base = Math.floor(position)
  const rest = position - base
  const next = sortedValues[base + 1]
  return next === undefined ? sortedValues[base] : sortedValues[base] + rest * (next - sortedValues[base])
}

/**
 * Rang percentile de `value` dans `sortedPeers` (TRIÉ croissant), 0-100.
 *
 * Une égalité compte pour une DEMI-place (méthode du rang moyen) : sans ça,
 * une cohorte où plusieurs entreprises partagent le score maximum verrait
 * l'une d'elles artificiellement en dessous des autres selon l'ordre de tri —
 * un artefact de l'implémentation, pas une différence réelle.
 */
function percentileRank(value: number, sortedPeers: readonly number[]): number {
  let below = 0
  let equal = 0
  for (const peer of sortedPeers) {
    if (peer < value) below += 1
    else if (peer === value) equal += 1
  }
  const rank = (below + equal / 2) / sortedPeers.length
  return Math.round(rank * 100)
}

function ownObservationsAxisValue(pathsTotal: number): number {
  return Math.min(100, Math.round((pathsTotal / MARKET_MEMORY_COHORT_INDEX_SETTINGS.ownObservationsSaturation) * 100))
}

function cohortCoverageAxisValue(measuredPeers: number): number {
  return Math.min(100, Math.round((measuredPeers / MARKET_MEMORY_COHORT_INDEX_SETTINGS.cohortCoverageSaturation) * 100))
}

/**
 * #1640.10 — LA GARDE DU DOUBLE COMPTAGE, à la source plutôt qu'à la relecture.
 *
 * Chaque axe déclare ici les champs bruts qui PÈSENT dans sa valeur — jamais
 * les champs qu'il utilise seulement pour trouver SA cohorte (`headcountBracket`
 * n'y figure pour aucun axe : c'est une clé de groupement, elle ne pèse rien).
 * `overlappingAxisWeightField` prouve qu'aucun champ ne pèse deux fois.
 */
export const COHORT_INDEX_AXIS_WEIGHT_FIELDS: Readonly<Record<MarketMemoryCohortIndexAxis, readonly string[]>> = {
  cohortRelativePosition: ['externalizationScore'],
  cohortCoverage: ['cohortPeerCount'],
  ownObservations: ['pathsTotal'],
}

/** Le premier champ qui pèse sur plus d'un axe à la fois, ou `null` si aucun. */
export function overlappingAxisWeightField(
  weightFields: Readonly<Record<string, readonly string[]>> = COHORT_INDEX_AXIS_WEIGHT_FIELDS,
): string | null {
  const ownerByField = new Map<string, string>()
  for (const [axis, fields] of Object.entries(weightFields)) {
    for (const field of fields) {
      const owner = ownerByField.get(field)
      if (owner !== undefined && owner !== axis) return field
      ownerByField.set(field, axis)
    }
  }
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
 * #1640.2 — L'INDEX D'UNE SEULE ENTREPRISE, ET POURQUOI IL EST LE MÊME CODE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `buildCohortIndexReport` répondait à « quelle est la distribution de TOUT le
 * corpus ? ». Aucune fonction ne répondait à « quel est l'index de CETTE
 * entreprise ? » — c'est-à-dire à la seule question qu'un dossier de compte
 * pose. Un module pur, juste, testé, que personne n'appelle : le défaut n°1 de
 * ce dépôt.
 *
 * Le remède n'est PAS une seconde implémentation de l'échelle d'exclusion pour
 * le cas unitaire — deux échelles recopiées divergent, et celle-ci décide d'un
 * chiffre affiché. `classifyCohortIndex` porte l'échelle ENTIÈRE, une fois, et
 * `buildCohortIndexReport` l'appelle ligne par ligne. Le rapport de corpus est
 * donc, littéralement, la boucle de la fonction unitaire — un test le prouve
 * en comparant les deux sorties sur le même corpus.
 */

/**
 * Ce qu'une cohorte apporte au calcul, et RIEN de plus : les scores bruts de
 * ses pairs mesurés, triés.
 *
 * ⚠️ **L'entreprise s'inclut dans sa propre cohorte.** `percentileRank` compte
 * une égalité pour une demi-place ; retirer l'entreprise de la liste avant de
 * la classer rendrait son rang dépendant du fait qu'elle est mesurée — deux
 * entreprises de même score n'auraient plus le même rang. C'est ce que fait
 * déjà le rapport de corpus, et la fonction unitaire ne peut pas en dévier
 * sans que le test de parité le dise.
 */
export interface CohortPeerScores {
  readonly bracket: string
  /** TRIÉ croissant. Ne contient QUE des pairs éligibles ({@link isCohortPeer}). */
  readonly sortedScores: readonly number[]
}

/**
 * La PREMIÈRE moitié de l'échelle : les trois raisons qui empêchent une ligne
 * d'être un PAIR de cohorte. `null` quand la ligne en est un.
 *
 * Écrite ici une seule fois, et lue par les deux moitiés de l'API publique
 * ({@link isCohortPeer} pour constituer la cohorte, {@link classifyCohortIndex}
 * pour classer) : c'est ce qui garantit qu'une ligne écartée du calcul est
 * exactement une ligne écartée de la cohorte.
 */
function peerExclusionReason(row: CohortIndexSignal): CohortIndexExclusionReason | null {
  if (row.headcountBracket === null) return 'noBracket'
  if (row.pathsTotal < MARKET_MEMORY_MIN_PATHS) return 'belowGlobalMinPaths'
  if (row.externalizationScore === null) return 'noScore'
  return null
}

/** Vrai quand la ligne peut servir de PAIR : tranche connue, seuil produit franchi, score lu. */
export function isCohortPeer(row: CohortIndexSignal): boolean {
  return peerExclusionReason(row) === null
}

/**
 * Les scores triés des pairs d'UNE tranche d'effectif.
 *
 * `rows` peut contenir n'importe quoi — d'autres tranches, des lignes sans
 * score : le filtre est ici, à un seul endroit. C'est ce qui autorise
 * l'appelant à lire sa cohorte en base sans y recopier les règles d'éligibilité
 * (une règle recopiée en SQL diverge en silence de celle du calcul).
 */
export function buildCohortPeerScores(bracket: string, rows: readonly CohortIndexSignal[]): CohortPeerScores {
  const sortedScores = rows
    .filter(row => row.headcountBracket === bracket && isCohortPeer(row))
    .map(row => row.externalizationScore as number)
    .sort((left, right) => left - right)
  return { bracket, sortedScores }
}

/**
 * L'échelle ENTIÈRE, pour UNE ligne : `calculable`, ou l'une des cinq raisons.
 *
 * Jette si `peers` ne décrit pas la cohorte de `row` — une erreur de
 * programmation, jamais un état des données. Le silence coûterait plus cher :
 * un rang calculé contre la mauvaise cohorte a l'air parfaitement normal.
 */
export function classifyCohortIndex(row: CohortIndexSignal, peers: CohortPeerScores): CohortIndexClassification {
  const reason = peerExclusionReason(row)
  if (reason !== null) return { kind: 'excluded', companyKey: row.companyKey, reason }

  const bracket = row.headcountBracket as string
  if (bracket !== peers.bracket) {
    throw new Error(
      `cohorte incohérente : l'entreprise est en « ${bracket} », les pairs fournis en « ${peers.bracket} »`,
    )
  }

  if (row.pathsTotal < MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex) {
    return { kind: 'excluded', companyKey: row.companyKey, reason: 'belowOwnPathsThreshold' }
  }
  const measuredPeers = peers.sortedScores.length
  if (measuredPeers < MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize) {
    return { kind: 'excluded', companyKey: row.companyKey, reason: 'cohortTooSmall' }
  }

  const evaluated: CohortIndexAxisEvaluation[] = [
    { axis: 'cohortRelativePosition', value: percentileRank(row.externalizationScore as number, peers.sortedScores) },
    { axis: 'cohortCoverage', value: cohortCoverageAxisValue(measuredPeers) },
    { axis: 'ownObservations', value: ownObservationsAxisValue(row.pathsTotal) },
  ]
  return {
    kind: 'calculable',
    result: {
      companyKey: row.companyKey,
      index: indexFromAxes(evaluated),
      evaluated,
      notEvaluable: [],
      cohort: { bracket, measuredPeers },
    },
  }
}

/**
 * Ce qui part vers l'écran — la classification MOINS la clé du corpus.
 *
 * `companyKey` est la jointure interne du corpus : elle n'apprend rien au
 * dossier de compte, qui sait déjà de quelle entreprise il parle. Ce qui n'est
 * pas envoyé ne peut pas fuiter.
 */
export function toAccountCohortIndex(classification: CohortIndexClassification): AccountCohortIndex {
  if (classification.kind === 'excluded') return { kind: 'excluded', reason: classification.reason }
  const { index, evaluated, notEvaluable, cohort } = classification.result
  return {
    kind: 'calculable',
    index,
    evaluated: evaluated.map(entry => ({ axis: entry.axis, value: entry.value })),
    notEvaluable: [...notEvaluable],
    cohort: { bracket: cohort.bracket, measuredPeers: cohort.measuredPeers },
  }
}

/**
 * L'INDEX, sur un corpus entier — deux passes, jamais une soustraction.
 *
 * PASSE 1 : qui peut être un PAIR de cohorte ({@link isCohortPeer} — tranche
 * connue, seuil produit franchi, score brut lu) → la table `bracket → scores
 * triés`.
 * PASSE 2 : {@link classifyCohortIndex}, ligne par ligne, contre la cohorte de
 * sa propre tranche. C'est la MÊME fonction que celle qu'appelle le dossier
 * d'un compte : le rapport de corpus ne peut donc pas diverger de l'index
 * affiché (#1640.2).
 *
 * Chaque ligne d'entrée tombe dans EXACTEMENT une case — `calculable` ou une
 * des cinq raisons de {@link COHORT_INDEX_EXCLUSION_REASONS} — jamais deux,
 * jamais aucune : c'est ce qui garantit que `read = calculable + Σ(excluded)`
 * sans jamais soustraire.
 */
export function buildCohortIndexReport(signals: readonly CohortIndexSignal[]): CohortIndexReport {
  const excluded: Record<CohortIndexExclusionReason, number> = {
    noBracket: 0,
    belowGlobalMinPaths: 0,
    noScore: 0,
    belowOwnPathsThreshold: 0,
    cohortTooSmall: 0,
  }

  // PASSE 1 — la cohorte de chaque tranche, faite des seules lignes éligibles.
  const rowsByBracket = new Map<string, CohortIndexSignal[]>()
  for (const row of signals) {
    if (!isCohortPeer(row)) continue
    const bracket = row.headcountBracket as string
    const bucket = rowsByBracket.get(bracket) ?? []
    bucket.push(row)
    rowsByBracket.set(bracket, bucket)
  }
  const peersByBracket = new Map<string, CohortPeerScores>()
  for (const [bracket, rows] of rowsByBracket) peersByBracket.set(bracket, buildCohortPeerScores(bracket, rows))

  // PASSE 2 — l'échelle entière, ligne par ligne, par la fonction unitaire.
  const classifications: CohortIndexClassification[] = []
  for (const row of signals) {
    // Une ligne écartée en passe 1 n'a pas de cohorte : `classifyCohortIndex`
    // rend sa raison AVANT de regarder les pairs, donc la coquille vide
    // ci-dessous n'est jamais lue pour elle.
    const bracket = row.headcountBracket ?? ''
    const peers = peersByBracket.get(bracket) ?? { bracket, sortedScores: [] }
    const entry = classifyCohortIndex(row, peers)
    if (entry.kind === 'excluded') excluded[entry.reason] += 1
    classifications.push(entry)
  }

  const calculable = classifications.filter(entry => entry.kind === 'calculable').length
  const byBracket: CohortIndexBracketDistribution[] = [...peersByBracket.values()].map(peers => ({
    bracket: peers.bracket,
    measuredPeers: peers.sortedScores.length,
    median: quantile(peers.sortedScores, 0.5),
    p25: quantile(peers.sortedScores, 0.25),
    p75: quantile(peers.sortedScores, 0.75),
  }))

  return { counts: { read: signals.length, calculable, excluded }, byBracket, classifications }
}
