import { z } from 'zod'

/**
 * #1640.2 — LE VOCABULAIRE DE L'INDEX PAR COHORTE, ET SA FORME DE TRANSPORT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES QUATRE DÉCLARATIONS VIVENT DANS UNE FEUILLE À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles étaient dans `market-memory-cohort-index.ts`, qui est le bon endroit
 * pour le CALCUL. Le champ de transport (`accountCohortIndexSchema`), lui, doit
 * être lu par `market-memory.ts` — c'est lui qui porte `accountMarketContext
 * Schema`, la réponse de `GET /accounts/:id/market-context`. Or
 * `market-memory-cohort-index.ts` importe DÉJÀ `MARKET_MEMORY_MIN_PATHS` de
 * `market-memory.ts` : les faire se lire l'un l'autre créerait un cycle
 * d'imports dont l'issue dépend de l'ORDRE de chargement du baril
 * (`src/index.ts`). Dans un sens tout marche ; dans l'autre,
 * `accountCohortIndexSchema` est encore dans sa zone morte temporelle au
 * moment où `z.object({...})` s'évalue, et le paquet entier échoue à
 * l'import — un défaut qui ne se voit pas en relecture et qu'un simple
 * réordonnancement du baril réveillerait des mois plus tard.
 *
 * Cette FEUILLE n'importe rien du domaine : le cycle ne peut pas exister.
 * `market-memory.ts` et `market-memory-cohort-index.ts` la lisent tous les
 * deux, et aucun des deux ne lit l'autre pour ça.
 *
 * ⚠️ Ces noms ne sont PAS réexportés par `market-memory-cohort-index.ts` :
 * deux `export *` qui exportent le MÊME nom depuis deux modules s'annulent en
 * ESM (le nom devient ambigu, donc absent) — la façade `@bellum/contracts`
 * perdrait silencieusement `COHORT_INDEX_EXCLUSION_REASONS`. Le baril exporte
 * les deux fichiers, chaque nom vient d'un seul.
 */

/** Les trois axes de l'index — la liste EXHAUSTIVE, dans l'ordre où on les nomme. */
export const MARKET_MEMORY_COHORT_INDEX_AXES = ['cohortRelativePosition', 'cohortCoverage', 'ownObservations'] as const
export type MarketMemoryCohortIndexAxis = (typeof MARKET_MEMORY_COHORT_INDEX_AXES)[number]

/** Les cinq raisons pour lesquelles une ligne n'obtient pas d'index — la liste EXHAUSTIVE. */
export const COHORT_INDEX_EXCLUSION_REASONS = [
  'noBracket',
  'belowGlobalMinPaths',
  'noScore',
  'belowOwnPathsThreshold',
  'cohortTooSmall',
] as const
export type CohortIndexExclusionReason = (typeof COHORT_INDEX_EXCLUSION_REASONS)[number]

/**
 * #1640.2 — CE QUI VOYAGE JUSQU'À L'ÉCRAN, et ce qui reste au serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX ÉTATS, JAMAIS UN NOMBRE NU
 * ─────────────────────────────────────────────────────────────────────────────
 * · `calculable` — l'index ET ses axes. `index` peut valoir `null` (sous
 *   {@link MARKET_MEMORY_COHORT_INDEX_MIN_AXES} axes évaluables) sans que la
 *   décomposition disparaisse : `ScoreWithAxes` a justement besoin des axes
 *   pour dire CE QUI a manqué, et « non mesuré » tout seul ne répond qu'à
 *   « combien ? ».
 * · `excluded` — pas d'index, et la raison est NOMMÉE. Les cinq raisons sont
 *   celles du calcul, jamais un « indisponible » fourre-tout : « la cohorte
 *   compte trop peu de pairs mesurés » et « cette entreprise n'a pas assez
 *   d'observations propres » appellent des gestes différents.
 *
 * ⚠️ `companyKey` (la clé du CORPUS) ne voyage PAS. Elle sert la jointure
 * interne du corpus et n'apprend rien à l'utilisateur — le dossier de compte
 * sait déjà de quelle entreprise il parle. Ce qui n'est pas envoyé ne peut pas
 * fuiter.
 *
 * ⚠️ `cohortRelativePosition` est un RANG DANS UN ÉCHANTILLON, jamais un fait
 * de marché : « 72 » ne veut pas dire « 72 % externalisent », et son
 * complément ne veut pas dire « 28 % n'externalisent pas » (doctrine
 * `c65_couverture_nest_pas_un_fait_de_marche`, garde GA-259). L'écran qui le
 * rend doit le NOMMER comme un rang, et c'est ce que fait sa clé i18n.
 */
export const accountCohortIndexSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('excluded'),
    reason: z.enum(COHORT_INDEX_EXCLUSION_REASONS),
  }),
  z.object({
    kind: z.literal('calculable'),
    /** 0-100, ou `null` sous le minimum d'axes — jamais `0` pour « non mesuré ». */
    index: z.number().int().min(0).max(100).nullable(),
    evaluated: z.array(
      z.object({
        axis: z.enum(MARKET_MEMORY_COHORT_INDEX_AXES),
        value: z.number().int().min(0).max(100),
      }),
    ),
    /** Les axes qui n'ont pas pu être évalués, NOMMÉS — jamais silencieusement absents. */
    notEvaluable: z.array(z.enum(MARKET_MEMORY_COHORT_INDEX_AXES)),
    cohort: z.object({
      bracket: z.string().min(1),
      measuredPeers: z.number().int().min(0),
    }),
  }),
])
export type AccountCohortIndex = z.infer<typeof accountCohortIndexSchema>

/**
 * #1640.2 — CE QUE `MarketMemoryService.cohortIndexFor` REND.
 *
 * Même union que `MarketMemoryRead` et `MarketEsnViewRead`, et pour la même
 * raison : « je n'ai pas pu lire » n'est pas « il n'y a rien à dire ». Un
 * `unavailable` rendu en « non mesuré » annoncerait une absence de données
 * là où il n'y a eu qu'une panne.
 *
 * `index: null` sur un `ok` couvre l'entreprise NON RAPPROCHÉE du corpus —
 * ni `unresolved` ni `ambiguous` n'entrent dans
 * {@link COHORT_INDEX_EXCLUSION_REASONS}, qui décrit une ligne DU corpus.
 * L'écran ne les distingue pas, comme partout ailleurs sur le dossier.
 */
export type MarketCohortIndexRead =
  | { readonly status: 'ok'; readonly index: AccountCohortIndex | null }
  | { readonly status: 'unavailable'; readonly reason: string }
