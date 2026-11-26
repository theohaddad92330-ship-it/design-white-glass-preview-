import { z } from 'zod'
import { OBSERVED_CERTAINTIES } from './market-memory.js'

/**
 * #1622, plus la télémétrie de #1639.3 — L'OUTILLAGE DE VÉRITÉ TERRAIN DE LA
 * MÉMOIRE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION, ET CE QU'ELLE ASSUME
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis a tranché de construire cet outillage MÊME SI le corpus jugé restera
 * vide tant qu'un opérateur n'aura pas jugé de cas à la main — c'est le défaut
 * n°1 de ce dépôt (« du code juste que personne n'appelle »), accepté en
 * connaissance de cause. Ce fichier ne fabrique donc AUCUN jugement : il pose
 * le vocabulaire fermé des labels, et la règle qui empêche une métrique
 * calculée sur un corpus trop petit de se lire comme une mesure fiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN JUGEMENT N'EST PAS L'ABSENCE DE JUGEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `unknown` EST un label — « je ne sais pas trancher » est un avis humain, pas
 * un silence. Un cas jamais jugé n'a PAS de ligne dans la table des jugements ;
 * un cas jugé `unknown` EN a une. Les deux ne se confondent jamais : c'est la
 * règle « non mesuré n'est jamais zéro », appliquée à un avis humain plutôt
 * qu'à une mesure automatique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune PROBABILITÉ (doctrine, refusé six fois) : `precision_at_3` etc. sont
 * des mesures de NOTRE outil sur un échantillon jugé par un humain, jamais une
 * chance qu'une lecture future soit correcte. Et `MARKET_MEMORY_SCORING_ENABLED`
 * (`market-memory-scoring.ts`, GA-257) n'est touché nulle part ici : ce jeu de
 * vérité MESURE la mémoire marché, il ne décide rien à sa place.
 */

/**
 * LES SIX LABELS DE LA QUESTION ESN ↔ COMPTE — vocabulaire FERMÉ, dans l'ordre
 * exact du retour #1622. Un enum qui voyage vers une contrainte SQL n'insère
 * jamais une valeur au milieu et n'en perd jamais (GA-08) : cet ordre est celui
 * de la contrainte `CHECK` posée par la migration
 * `1791950000000-MarketMemoryGroundTruth.ts`, et toute addition future se fait
 * en BOUT de liste, des deux côtés à la fois.
 */
export const MARKET_MEMORY_GROUND_TRUTH_LABELS = [
  /** La lecture de la mémoire marché est correcte ET utile à un commercial. */
  'useful_and_correct',
  /** Plausible, mais non confirmée — ni fausse, ni établie. */
  'plausible',
  /** La lecture induit en erreur : présentée avec assurance, et fausse. */
  'misleading',
  /** La mémoire a rapproché la MAUVAISE entreprise (échec de résolution). */
  'wrong_entity',
  /** Vraie ou plausible, mais sans valeur pour l'usage commercial visé. */
  'irrelevant',
  /** Un jugement HUMAIN : « je ne sais pas trancher » — pas une case vide. */
  'unknown',
] as const

export type MarketMemoryGroundTruthLabel = (typeof MARKET_MEMORY_GROUND_TRUTH_LABELS)[number]

export const marketMemoryGroundTruthLabelSchema = z.enum(MARKET_MEMORY_GROUND_TRUTH_LABELS)

/**
 * LE SEUIL — sous ce nombre de jugements COURANTS (un par cas, le plus récent),
 * aucune des six métriques ne rend un pourcentage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI 20, ET PAS UN AUTRE NOMBRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Sous 20 jugements, UN SEUL jugement de plus ou de moins déplace n'importe
 * laquelle des six métriques d'au moins 5 points — un taux qui bouge de 5 points
 * à chaque clic d'opérateur ne mesure rien, il RACONTE le dernier cas jugé. La
 * doctrine pose déjà ce principe pour l'analytique produit (« aucune métrique
 * sous 5 sessions distinctes ») ; 20 est ici plus haut parce qu'un jugement
 * humain sur ce jeu de vérité pèse plus lourd qu'une session anonyme — le corpus
 * cible (20 comptes connus) donne un ordre de grandeur cohérent avec ce plancher,
 * mais LE PLANCHER porte sur les JUGEMENTS, jamais sur les comptes : un compte
 * peut porter plusieurs jugements (plusieurs ESN candidates), un jugement ne
 * porte jamais plusieurs comptes.
 *
 * ⚠️ Ce nombre vit ICI et nulle part ailleurs (un réglage vit à un seul
 * endroit, GA-26) : ni l'écran, ni le service qui calcule les métriques ne le
 * retapent.
 */
export const MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS = 20

/** Les six métriques nommées par #1622 — l'ordre n'a pas de sens fonctionnel,
 *  seule l'appartenance à l'ensemble compte. */
export const MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES = [
  'precision_at_3',
  'precision_at_10',
  'false_positive_rate',
  'coverage',
  'entity_resolution_failure',
  'human_usefulness',
] as const

export type MarketMemoryGroundTruthMetricName = (typeof MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES)[number]

/**
 * Les comptes bruts d'UNE métrique, avant résolution.
 *
 * ⚠️ `qualifying` et `total` sont deux COMPTES qui s'additionnent jusqu'au
 * dénominateur — jamais `total - autreChose`. Chaque appelant construit
 * `qualifying` en comptant directement les jugements qui qualifient (jamais en
 * soustrayant les jugements qui ne qualifient pas d'un total par ailleurs
 * recalculé différemment), pour que rien ne diverge entre deux lectures.
 */
export interface MarketMemoryGroundTruthMetricCounts {
  readonly qualifying: number
  readonly total: number
}

/**
 * Le rendu d'UNE métrique — jamais un nombre nu.
 *
 * `insufficient_data` porte son PROPRE dénominateur (`judgmentsCount`), pas le
 * total de jugements du corpus entier : `precision_at_3` peut manquer de
 * données quand `human_usefulness` en a assez, parce que peu de jugements
 * portent un rang ≤ 3. Confondre les deux dénominateurs ferait dire « mesuré »
 * à une métrique qui ne l'est pas.
 */
export type MarketMemoryGroundTruthMetricResult =
  | { readonly status: 'insufficient_data'; readonly judgmentsCount: number; readonly required: number }
  | { readonly status: 'measured'; readonly value: number; readonly judgmentsCount: number }

/**
 * LA SEULE FONCTION AUTORISÉE À DIVISER `qualifying` PAR `total` POUR UNE
 * MÉTRIQUE DE VÉRITÉ TERRAIN — voir la garde GA-285
 * (`apps/api/src/architecture/market-memory-ground-truth-metric-floor.spec.ts`),
 * qui vérifie qu'aucun autre fichier ne refait ce calcul à côté.
 *
 * ⚠️ Une mesure impossible ne dit JAMAIS « tout va bien » : sous
 * {@link MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS}, `0 / total` ET
 * `total / total` seraient également des mensonges — l'un dit « aucun défaut »,
 * l'autre « tout est parfait », et les deux sont des affirmations que
 * personne n'a mesurées. La seule réponse honnête est `insufficient_data`.
 */
export function resolveMarketMemoryGroundTruthMetric(
  counts: MarketMemoryGroundTruthMetricCounts,
): MarketMemoryGroundTruthMetricResult {
  if (counts.total < 0 || counts.qualifying < 0) {
    throw new Error('un compte de jugements ne peut pas être négatif')
  }
  if (counts.qualifying > counts.total) {
    throw new Error(
      "le compte qualifiant dépasse le total — les comptes s'additionnent jusqu'au dénominateur, ils ne se déduisent jamais d'un total recalculé ailleurs",
    )
  }
  if (counts.total < MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS) {
    return {
      status: 'insufficient_data',
      judgmentsCount: counts.total,
      required: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
    }
  }
  return { status: 'measured', value: counts.qualifying / counts.total, judgmentsCount: counts.total }
}

/** Les six métriques, chacune déjà résolue — jamais des comptes bruts que
 *  l'écran devrait diviser lui-même. */
export type MarketMemoryGroundTruthMetrics = Readonly<
  Record<MarketMemoryGroundTruthMetricName, MarketMemoryGroundTruthMetricResult>
>

/**
 * LA LECTURE QUE LA MÉMOIRE MARCHÉ FAIT D'UN CAS, au moment du jugement.
 *
 * Capturée en interrogeant `MarketMemoryService.coverageFor` (le SEUL point
 * d'entrée, GA-258) au moment où l'opérateur juge — jamais recalculée après
 * coup, sinon un cas jugé aujourd'hui et relu demain pourrait changer de
 * lecture sans qu'aucun nouveau jugement n'ait été posé.
 *
 * `hadReading: false` dit « cette ESN n'apparaît pas dans ce que la mémoire
 * observe pour ce compte » — jamais « la mémoire est en panne » (ça, c'est
 * `unavailable` au niveau du lecteur, pas un `reading`).
 */
export interface MarketMemoryGroundTruthReading {
  readonly hadReading: boolean
  /** Rang 1-indexé dans la liste des ESN observées pour ce compte (triée par
   *  nombre de personnes décroissant, comme `MarketMemoryCoverage.esnObserved`).
   *  `null` quand `hadReading` est faux. */
  readonly rank: number | null
  readonly persons: number | null
  readonly certainty: (typeof OBSERVED_CERTAINTIES)[number] | null
}

/** Le cas jugé — l'identité par laquelle un opérateur DÉSIGNE la question
 *  ESN ↔ compte, jamais un identifiant interne qu'il faudrait deviner. */
export interface MarketMemoryGroundTruthCase {
  readonly accountName: string
  readonly accountWebsite: string | null
  readonly accountCountry: string | null
  readonly esnName: string
}

/** Un jugement, tel qu'il ressort de l'API — le cas, la lecture snapshotée au
 *  moment du jugement, le verdict humain, et SON auteur (donnée d'AUDIT
 *  légitime : on doit savoir QUI a jugé QUOI — mais aucune métrique ne
 *  s'agrège par juge, « ce cas est mal résolu » se dit, « ce juge se trompe »
 *  ne se dit pas). */
export interface MarketMemoryGroundTruthJudgment {
  readonly id: string
  readonly case: MarketMemoryGroundTruthCase
  readonly reading: MarketMemoryGroundTruthReading
  readonly label: MarketMemoryGroundTruthLabel
  readonly judgedBy: string
  readonly judgedAt: string
}

/**
 * LA REQUÊTE DE LECTURE — ce qu'un opérateur tape pour voir « ce que la
 * mémoire marché dit » avant de trancher. Ne crée rien : c'est un aperçu.
 */
export const marketMemoryGroundTruthLookupQuerySchema = z
  .object({
    accountName: z.string().trim().min(1).max(200),
    accountWebsite: z.string().trim().min(1).max(300).optional(),
    accountCountry: z.string().trim().min(1).max(100).optional(),
    esnName: z.string().trim().min(1).max(200),
  })
  .strict()

export type MarketMemoryGroundTruthLookupQuery = z.infer<typeof marketMemoryGroundTruthLookupQuerySchema>

/**
 * LA SOUMISSION D'UN JUGEMENT — les six boutons de l'écran postent ce corps,
 * `label` seul changeant d'un bouton à l'autre. `judgedBy` est renseigné par le
 * serveur (l'e-mail de session de l'opérateur), jamais tapé à la main — sans
 * quoi rien n'empêcherait un opérateur de se faire passer pour un autre.
 */
export const marketMemoryGroundTruthJudgmentInputSchema = z
  .object({
    accountName: z.string().trim().min(1).max(200),
    accountWebsite: z.string().trim().min(1).max(300).nullable().optional(),
    accountCountry: z.string().trim().min(1).max(100).nullable().optional(),
    esnName: z.string().trim().min(1).max(200),
    label: marketMemoryGroundTruthLabelSchema,
  })
  .strict()

export type MarketMemoryGroundTruthJudgmentInput = z.infer<typeof marketMemoryGroundTruthJudgmentInputSchema>
