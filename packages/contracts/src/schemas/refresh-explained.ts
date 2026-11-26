import { z } from 'zod'
import { REFRESH_DIMENSION_CREDIT_COST, refreshDimensionSchema, type RefreshDimension } from './analysis.js'
import { dispatchFailureOutcome, type DispatchFailureOutcome } from './dispatch-failure.js'
import { decideFieldWrite, UNKNOWN_PROVENANCE_SOURCE, type FieldSource } from './provenance.js'

/**
 * #2125.35-.67 — « Actualiser l'analyse » dit ce qu'il VA faire avant, et ce
 * qu'il A changé après.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton partait sans mini-plan et revenait sans diff. L'utilisateur payait
 * des crédits et ne savait pas ce qui avait bougé : ni ce qui était devenu
 * vieux, ni ce qui allait être relu, ni ce qui serait conservé, ni — au retour —
 * quel fait était neuf, lequel avait changé, lequel n'était plus observé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER N'INVENTE AUCUNE RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il applique au rafraîchissement quatre règles déjà tranchées du dépôt, et
 * réutilise le code qui les tient plutôt que d'en écrire un second (GA-26) :
 *  · **le coût s'annonce avant le clic crédité** — le prix vient de la grille
 *    (`REFRESH_DIMENSION_CREDIT_COST`) ou du serveur, jamais d'un chiffre écrit
 *    ici ; et un coût qu'on n'a pas pu lire se dit « non mesuré », jamais « 0 »
 *    (GA-18 / GA-19) ;
 *  · **une correction humaine gagne toujours** — c'est `decideFieldWrite` qui
 *    tranche, celui-là même que les writers du pipeline appellent ;
 *  · **on archive, on ne supprime pas** — un fait qui n'est plus observé
 *    redevient INCONNU AVEC SA DATE (`lastSeenAt`), il ne disparaît pas ;
 *  · **un timeout n'est pas un échec** — `dispatchFailureOutcome` répond à la
 *    seule question qui compte (« la requête a-t-elle pu PARTIR ? »), et un
 *    `unknown` ne se rejoue jamais sans le dire.
 *
 * Pur, sans dépendance à une base : le calcul qui décide de ce qu'on annonce à
 * l'utilisateur doit être testable sans pipeline.
 */

/** Les deux façons d'actualiser un dossier. `organisation` est le geste bon
 *  marché de #2125.42 : « ne relire que l'organigramme et les contacts ». */
export const refreshScopeModeSchema = z.enum(['full', 'organisation'])
export type RefreshScopeMode = z.infer<typeof refreshScopeModeSchema>

/**
 * Ce que chaque mode relit. `full` DÉRIVE des dimensions déclarées — écrire les
 * quatre à la main ferait diverger le mode complet au premier axe ajouté.
 */
export const REFRESH_MODE_DIMENSIONS: Readonly<Record<RefreshScopeMode, readonly RefreshDimension[]>> = {
  full: refreshDimensionSchema.options,
  /** L'organigramme (`entities`) et les gens (`contacts`) — rien d'autre. */
  organisation: ['entities', 'contacts'],
}

/**
 * Ce qu'un coût annoncé peut être : mesuré, ou pas. Pas de troisième forme, et
 * surtout pas un `0` de repli — « 8 crédits annoncés, 8 débités » est la règle,
 * « 0 crédit annoncé parce qu'on n'a pas su lire » est le défaut du 04/08.
 */
export type RefreshCost = { measured: true; credits: number } | { measured: false }

/**
 * Le prix d'un mode, en crédits.
 *
 * · `organisation` : la SOMME de la grille de ses axes — le même tableau que le
 *   menu « Rafraîchir » affiche et que `AnalysisRefreshService` débite.
 * · `full` : le chiffre que le serveur annonce (`GET /analysis/launch-plan`,
 *   dérivé de `resolveAnalysisCost`). Absent ou illisible ⇒ non mesuré.
 */
export function refreshModeCost(mode: RefreshScopeMode, input: { fullAnalysisCredits: number | null }): RefreshCost {
  if (mode === 'organisation') {
    const credits = REFRESH_MODE_DIMENSIONS.organisation.reduce(
      (total, dimension) => total + REFRESH_DIMENSION_CREDIT_COST[dimension],
      0,
    )
    return { measured: true, credits }
  }
  const { fullAnalysisCredits } = input
  if (typeof fullAnalysisCredits !== 'number' || !Number.isFinite(fullAnalysisCredits)) return { measured: false }
  return { measured: true, credits: fullAnalysisCredits }
}

/**
 * Les QUATRE choses qu'un rafraîchissement n'écrase jamais (#2125.58-.61).
 *
 * Ce ne sont pas des champs de fiche — ceux-là sont déjà protégés par la
 * provenance (`decideFieldWrite`) : ce sont des objets que l'utilisateur a
 * créés lui-même, et qu'aucune collecte ne peut prétendre avoir « mieux » su.
 */
export const REFRESH_NEVER_OVERWRITES = [
  /** Une note privée : elle n'a jamais eu d'autre auteur que lui. */
  'private_note',
  /** Une action qu'il a validée : la revalider serait décider à sa place. */
  'validated_action',
  /** Une preuve versée au dossier : une collecte ne réfute pas une pièce. */
  'evidence',
  /** Une relation déclarée (« je connais ce DSI ») : elle n'est pas observable. */
  'declared_relation',
] as const
export type RefreshPreservedKind = (typeof REFRESH_NEVER_OVERWRITES)[number]

/** Le patch d'un rafraîchissement a-t-il le droit de toucher cet objet ? */
export function refreshMayOverwrite(kind: string): boolean {
  return !(REFRESH_NEVER_OVERWRITES as readonly string[]).includes(kind)
}

/** Ce qu'un axe relu peut faire bouger à l'écran. Un seul endroit, pour que le
 *  mini-plan ne promette jamais un changement que l'axe ne produit pas. */
// #2318.2 — les six alias produit de LAU-FINAL-059 relisent la MÊME sortie que
// la phase qu'ils recouvrent (voir `refreshDimensionSchema` dans analysis.ts) :
// leur nommer une sortie distincte promettrait un changement que le pipeline
// ne produit pas réellement pour eux.
const DIMENSION_OUTPUTS = {
  signals: ['facts', 'signals'],
  contacts: ['contacts'],
  entities: ['org_chart', 'contacts'],
  strategy: ['recommendations', 'actions'],
  identity_group: ['facts', 'signals'],
  ecosystem: ['facts', 'signals'],
  projects: ['facts', 'signals'],
  subsidiaries: ['org_chart', 'contacts'],
  positions: ['org_chart', 'contacts'],
  buying_path: ['recommendations', 'actions'],
} as const satisfies Record<RefreshDimension, readonly string[]>

export type RefreshChangeableOutput = (typeof DIMENSION_OUTPUTS)[RefreshDimension][number]

/**
 * #2318.3 — la NATURE des sources qu'un axe consulte, jamais le FOURNISSEUR
 * (GA-44 : « on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert » —
 * les fournisseurs ne se nomment jamais). Cinq natures, pas onze : un
 * commercial lit « registre officiel », jamais « Pappers ».
 */
export const REFRESH_SOURCE_NATURES = [
  'official_registry',
  'company_website',
  'job_postings',
  'public_news',
  'professional_network',
] as const
export type RefreshSourceNature = (typeof REFRESH_SOURCE_NATURES)[number]

/** Quelles natures un axe consulte. Même principe que `DIMENSION_OUTPUTS` :
 *  un seul endroit, pour que le mini-plan ne nomme jamais une nature qu'un
 *  axe ne regarde pas réellement (GA-26). */
const DIMENSION_SOURCE_NATURES = {
  signals: ['public_news', 'job_postings'],
  contacts: ['professional_network', 'company_website'],
  entities: ['official_registry', 'company_website'],
  strategy: ['public_news', 'professional_network'],
  identity_group: ['official_registry', 'public_news'],
  ecosystem: ['public_news', 'professional_network'],
  projects: ['public_news', 'job_postings'],
  subsidiaries: ['official_registry', 'company_website'],
  positions: ['professional_network', 'company_website'],
  buying_path: ['public_news', 'professional_network'],
} as const satisfies Record<RefreshDimension, readonly RefreshSourceNature[]>

/**
 * #2318.3 — la DURÉE annoncée avant lancement. Deux bornes, jamais un chiffre
 * unique qui se lirait comme une promesse exacte. `full` reprend la fourchette
 * déjà documentée du pipeline (CLAUDE.md — « jobs async 3-6 min ») plutôt que
 * d'en inventer une seconde ; `organisation` ne relit que deux axes, donc une
 * fraction de ce temps.
 */
export const REFRESH_MODE_DURATION_MINUTES: Readonly<Record<RefreshScopeMode, { min: number; max: number }>> = {
  full: { min: 3, max: 6 },
  organisation: { min: 1, max: 2 },
}

/**
 * À partir de quand un axe est « ancien ». Trente jours : au-delà, un signal
 * commercial (levée, recrutement, nomination) a eu le temps de se produire sans
 * qu'on l'ait vu. Le nombre vit ICI et nulle part ailleurs (GA-26).
 */
export const REFRESH_AGED_AFTER_MS = 30 * 24 * 60 * 60 * 1000

/** Un axe du plan, avec la date à laquelle il a été relu pour la dernière fois.
 *  `null` = JAMAIS relu séparément : une date inconnue, pas une date de zéro. */
export type RefreshPlanAgeEntry = { dimension: RefreshDimension; measuredAt: string | null }

export type RefreshPlan = {
  mode: RefreshScopeMode
  cost: RefreshCost
  /** #2318.3 — la DERNIÈRE ANALYSE de ce périmètre : la plus récente des dates
   *  de fraîcheur parmi les axes de `reread`. `null` = aucun des axes de ce
   *  mode n'a jamais été mesuré séparément — INCONNU, jamais une date de zéro. */
  lastAnalyzedAt: string | null
  /** Ce qui est ANCIEN, avec sa date (#2125.35). */
  aged: RefreshPlanAgeEntry[]
  /** #2318.3 — ce qui est encore FRAIS : les axes de `reread` absents de
   *  `aged`. Sans ce champ, un axe relu il y a deux heures ne se distinguait
   *  pas d'un axe jamais mesuré — les deux étaient simplement absents de la
   *  liste des vieux. */
  fresh: readonly RefreshDimension[]
  /** Ce qui sera RELU (#2125.36) — sert aussi de « résultat attendu » : les
   *  axes que CE rafraîchissement va effectivement régénérer. */
  reread: readonly RefreshDimension[]
  /** Ce qui sera CONSERVÉ quoi qu'il arrive (#2125.37). */
  preserved: readonly RefreshPreservedKind[]
  /** Ce qui POURRAIT CHANGER (#2125.38). Jamais une chance estimée — des
   *  CHAMPS, pas une probabilité (doctrine « aucune probabilité »). */
  mayChange: RefreshChangeableOutput[]
  /** #2318.3 — les NATURES de source que ce mode consulte (jamais un nom de
   *  fournisseur, GA-44). */
  sources: RefreshSourceNature[]
  /** #2318.3 — la durée annoncée, en minutes, deux bornes. */
  durationMinutes: { min: number; max: number }
  /** La règle de remboursement (#2125.49) — une seule valeur, donc un littéral
   *  nommé plutôt qu'un booléen qui se lirait à l'envers. */
  refund: 'refunded_if_failed'
}

/**
 * Le mini-plan affiché AVANT la confirmation.
 *
 * `now` est un paramètre : le plan se teste sans horloge réelle.
 */
export function buildRefreshPlan(input: {
  mode: RefreshScopeMode
  fullAnalysisCredits: number | null
  now: Date
  /** La fraîcheur par axe, telle que la base la porte (`*_refreshed_at`). */
  freshness: Partial<Record<RefreshDimension, string | null>>
  agedAfterMs?: number
}): RefreshPlan {
  const dimensions = REFRESH_MODE_DIMENSIONS[input.mode]
  const agedAfterMs = input.agedAfterMs ?? REFRESH_AGED_AFTER_MS

  const aged: RefreshPlanAgeEntry[] = []
  for (const dimension of dimensions) {
    const measuredAt = input.freshness[dimension] ?? null
    if (measuredAt === null) {
      // Jamais relu : la date est INCONNUE. On l'annonce quand même comme à
      // relire — le contraire ferait passer « je ne sais pas » pour « c'est
      // frais », ce qui est la version de « 0 » qui se ment le mieux.
      aged.push({ dimension, measuredAt: null })
      continue
    }
    const at = Date.parse(measuredAt)
    if (!Number.isFinite(at)) {
      aged.push({ dimension, measuredAt: null })
      continue
    }
    if (input.now.getTime() - at >= agedAfterMs) aged.push({ dimension, measuredAt })
  }

  // #2318.3 — encore FRAIS : dans `dimensions`, mais pas dans `aged`.
  const agedDimensions = new Set(aged.map(entry => entry.dimension))
  const fresh = dimensions.filter(dimension => !agedDimensions.has(dimension))

  // #2318.3 — dernière analyse de ce périmètre : la plus récente des dates
  // lisibles parmi `dimensions`. Une date illisible ou absente ne compte pas ;
  // aucune date lisible ⇒ INCONNU (`null`), jamais une date de zéro.
  let lastAnalyzedAt: string | null = null
  let lastAnalyzedAtMs = -Infinity
  for (const dimension of dimensions) {
    const measuredAt = input.freshness[dimension] ?? null
    if (measuredAt === null) continue
    const at = Date.parse(measuredAt)
    if (!Number.isFinite(at)) continue
    if (at > lastAnalyzedAtMs) {
      lastAnalyzedAtMs = at
      lastAnalyzedAt = measuredAt
    }
  }

  const mayChange: RefreshChangeableOutput[] = []
  const sources: RefreshSourceNature[] = []
  for (const dimension of dimensions) {
    for (const output of DIMENSION_OUTPUTS[dimension]) {
      if (!mayChange.includes(output)) mayChange.push(output)
    }
    for (const nature of DIMENSION_SOURCE_NATURES[dimension]) {
      if (!sources.includes(nature)) sources.push(nature)
    }
  }

  return {
    mode: input.mode,
    cost: refreshModeCost(input.mode, { fullAnalysisCredits: input.fullAnalysisCredits }),
    lastAnalyzedAt,
    aged,
    fresh,
    reread: dimensions,
    preserved: REFRESH_NEVER_OVERWRITES,
    mayChange,
    sources,
    durationMinutes: REFRESH_MODE_DURATION_MINUTES[input.mode],
    refund: 'refunded_if_failed',
  }
}

/**
 * #2591.1 — les SEULES dimensions dont le rerun écrit `priority_score`.
 *
 * `applyPlan` (Phase 4, appelée par 'strategy'/'buying_path') écrit la
 * colonne — le score /25 réconcilié. Toute autre dimension, y compris
 * 'signals' (`AccountsService.refreshResearch`, `writePriority: false`,
 * DÉLIBÉRÉMENT — réécrire depuis la phase 1 réintroduirait la divergence
 * /10 vs /25), laisse la colonne intacte. Un seul endroit décide, l'appelant
 * ne le devine pas (GA-26).
 */
export const SCORE_RECALCULATING_DIMENSIONS: readonly RefreshDimension[] = ['strategy', 'buying_path']

/**
 * #2591.6 — les SEULES dimensions dont le rerun écrit `raw_analysis.confidence`.
 *
 * `AccountsService.mergeRawAnalysis` (appelée par `applyResearch`, elle-même
 * appelée par `refreshResearch` — Phase 1) réémet le blob de recherche
 * COMPLET, `confidence` compris. `AnalysisRefreshService.runDimension` route
 * 'signals' ET ses trois alias produit ('identity_group'/'ecosystem'/
 * 'projects') sur ce même appel (`this.onDemand.refreshResearch`) — vérifié
 * par le `switch` de `runDimension`, pas recopié d'ailleurs. Toute autre
 * dimension ('contacts' → Phase 2, 'entities'/'subsidiaries'/'positions' →
 * Phase 3, 'strategy'/'buying_path' → Phase 4) ne touche jamais cette clé.
 * Un seul endroit décide, l'appelant ne le devine pas (GA-26).
 */
export const CONFIDENCE_RECALCULATING_DIMENSIONS: readonly RefreshDimension[] = [
  'signals',
  'identity_group',
  'ecosystem',
  'projects',
]

/** Une ligne du dossier, avant ou après le rafraîchissement. Volontairement
 *  plate : le diff compare des LIBELLÉS et des VALEURS, pas des structures. */
export type RefreshDiffItem = {
  // #2318.4 — 'signal' | 'score' | 'confidence' : trois natures de plus pour
  // arriver aux onze catégories nommées par LAU-FINAL-059. Chacune suit le
  // même motif que 'action' : SEULE sa DISPARITION (signal) ou sa VALEUR
  // (score/confidence) est nommée séparément — apparition/inchangé retombent
  // sur les faits génériques, exactement comme 'action' ne connaît pas de
  // "nouvelle action".
  kind: 'fact' | 'recommendation' | 'action' | 'signal' | 'score' | 'confidence'
  key: string
  label: string
  value: string | null
  /** La provenance de la valeur. Absente ⇒ {@link UNKNOWN_PROVENANCE_SOURCE}. */
  source?: FieldSource
  /** Quand cette valeur a été observée. Une date absente reste absente. */
  measuredAt?: string | null
}

export type RefreshDiff = {
  newFacts: { key: string; label: string; value: string | null; measuredAt: string | null }[]
  changedFacts: { key: string; label: string; before: string | null; after: string | null }[]
  /** Un fait qui n'est plus observé : il REDEVIENT INCONNU AVEC SA DATE. */
  obsoleteFacts: { key: string; label: string; lastKnownValue: string | null; lastSeenAt: string | null }[]
  /** Les corrections utilisateur que le run a voulu écraser, et qu'on a gardées. */
  preservedCorrections: { key: string; label: string; keptValue: string | null; discardedValue: string | null }[]
  /**
   * #2318.8 — les corrections humaines que le run a RÉELLEMENT écrasées, telles
   * que l'APPELANT les a mesurées en relisant l'état persisté.
   *
   * ⚠ La distinction avec `preservedCorrections` est la raison d'être du champ,
   * pas un détail de nommage. `preservedCorrections` est le verdict d'un
   * arbitrage — `decideFieldWrite` dit « la correction gagne ». Ce champ-ci est
   * un CONSTAT — « la base ne contient plus la valeur corrigée ». Les deux
   * divergent exactement dans le cas que le NO-GO de LAU-FINAL-059 vise : un
   * writer aveugle a écrasé la correction, et l'arbitrage rejoué après coup sur
   * l'état déjà écrit répond sereinement « on l'a gardée ».
   *
   * Vide (`[]`) quand l'appelant n'a rien mesuré : ce n'est PAS la preuve qu'il
   * n'y a eu aucun écrasement, seulement l'absence d'accusation. Un appelant
   * qui sait mesurer le fait (voir `AnalysisRefreshService.measureOverwrittenCorrections`).
   */
  overwrittenCorrections: {
    key: string
    label: string
    /** Ce que l'humain avait écrit. */
    correctedValue: string | null
    /** Ce que la base contient à la place, après le run. */
    overwrittenWith: string | null
    /** La phase pendant laquelle l'écrasement s'est produit — le COUPABLE, nommé. */
    byPhase: string
    /** Quand la correction avait été faite. `null` = non mesuré. */
    correctedAt: string | null
  }[]
  changedRecommendations: { key: string; label: string; before: string | null; after: string | null }[]
  obsoleteActions: { key: string; label: string; lastSeenAt: string | null }[]
  /** #2318.4 — un signal qui n'est plus dans le relevé : il REDEVIENT INCONNU
   *  AVEC SA DATE, comme un fait obsolète (« on archive, on ne supprime pas »). */
  expiredSignals: { key: string; label: string; lastKnownValue: string | null; lastSeenAt: string | null }[]
  /** #2318.4 — le score a changé de valeur entre les deux instantanés. `null`
   *  = pas de changement mesuré (jamais un score « à zéro »). */
  scoreChanged: { key: string; label: string; before: string | null; after: string | null } | null
  /** #2318.4 — la confiance a changé de valeur. Même forme que `scoreChanged`. */
  confidenceChanged: { key: string; label: string; before: string | null; after: string | null } | null
  /** #2591.1 — CE rafraîchissement n'a PAS recalculé le score.
   *
   * Avant ce champ, `scoreChanged: null` recouvrait deux états opposés :
   * « recalculé et vérifié stable » (rassurant) et « jamais recalculé » (le
   * score peut être périmé, et rien ne le disait). Rempli UNIQUEMENT quand
   * l'appelant sait que la dimension rejouée n'écrit jamais `priority_score`
   * (`scoreRecalculated: false` — seules 'strategy'/'buying_path' l'écrivent,
   * via `applyPlan`) ET que `scoreChanged` est resté `null` — un score
   * réellement changé prime toujours, il ne double jamais ce champ. `null`
   * par défaut (compte rendu ancien, ou dimension qui recalcule vraiment) :
   * le silence d'avant reste un arbitrage d'écran légitime, pas une régression. */
  scoreNotRecalculated: { lastKnownValue: string | null } | null
  /** #2591.6 — même motif que `scoreNotRecalculated`, pour la CONFIANCE.
   *
   * Rempli UNIQUEMENT quand l'appelant sait que la dimension rejouée n'écrit
   * jamais `raw_analysis.confidence` (`confidenceRecalculated: false` — seules
   * 'signals'/'identity_group'/'ecosystem'/'projects' l'écrivent, via
   * `applyResearch`) ET que `confidenceChanged` est resté `null`.
   *
   * ⚠️ Contrairement à `scoreNotRecalculated`, ce champ reste `null` quand
   * AUCUNE confiance n'a jamais été mesurée sur ce dossier (ni avant ni après
   * — pas d'item `confidence:confidence` dans l'instantané) : « non mesuré »
   * n'est jamais « 0 », et une confiance qui n'existe pas ne devient pas une
   * confiance « à zéro non recalculée ». */
  confidenceNotRecalculated: { lastKnownValue: string | null } | null
  /** Les axes dont la phase n'a RIEN rendu. Une mesure qui n'a pas eu lieu ne
   *  se rend jamais « aucun changement » (#2125.50, « aucune donnée fictive »). */
  unmeasured: readonly RefreshDimension[]
  /**
   * #2555.2 — un fait relu à l'IDENTIQUE (`decideFieldWrite` répond
   * `{ write: false, reason: 'unchanged' }`) depuis une source NON humaine.
   *
   * Avant ce compteur, ce cas ne finissait NULLE PART : ni dans
   * `changedFacts` (la valeur n'a pas bougé), ni dans `preservedCorrections`
   * (réservé aux corrections HUMAINES conservées face à un run qui voulait les
   * écraser). Le fait disparaissait du diff sans un mot — exactement ce que la
   * doctrine interdit (« rien ne s'efface entre deux étapes sans être nommé »,
   * appliqué ici au diff plutôt qu'à un funnel de couverture).
   *
   * Un COMPTE, pas une liste : lister chaque fait reconfirmé noierait les
   * vraies nouveautés du dossier sous du bruit qui n'a, par définition, rien à
   * dire.
   */
  unchangedFacts: number
}

function indexByKey(items: readonly RefreshDiffItem[]): Map<string, RefreshDiffItem> {
  const index = new Map<string, RefreshDiffItem>()
  for (const item of items) index.set(`${item.kind}:${item.key}`, item)
  return index
}

/**
 * Le diff présenté au retour (#2125.50-.56).
 *
 * ⚠ Ce qui décide si une valeur entrante remplace l'ancienne n'est PAS écrit
 * ici : c'est `decideFieldWrite`, l'arbitre que les writers du pipeline
 * appellent. Un second arbitre divergerait, et le jour où il divergerait, le
 * diff annoncerait « modifié » une valeur que la base a refusé d'écrire.
 */
export function buildRefreshDiff(input: {
  before: readonly RefreshDiffItem[]
  after: readonly RefreshDiffItem[]
  unmeasured?: readonly RefreshDimension[]
  /** #2591.1 — la dimension rejouée écrit-elle vraiment `priority_score` ?
   *  Omis (compte rendu ancien, ou appelant qui ne sait pas) : le comportement
   *  d'avant ce chantier, `scoreNotRecalculated` reste `null`. */
  scoreRecalculated?: boolean
  /** #2591.6 — même rôle que `scoreRecalculated`, pour la CONFIANCE. Omis :
   *  `confidenceNotRecalculated` reste `null`. */
  confidenceRecalculated?: boolean
  /**
   * #2318.8 — les corrections que l'appelant a MESURÉES écrasées dans l'état
   * persisté. Omis : rien n'est accusé, et `preservedCorrections` garde le
   * comportement d'avant ce chantier.
   */
  overwrittenCorrections?: readonly RefreshDiff['overwrittenCorrections'][number][]
}): RefreshDiff {
  const before = indexByKey(input.before)
  const after = indexByKey(input.after)

  const diff: RefreshDiff = {
    newFacts: [],
    changedFacts: [],
    obsoleteFacts: [],
    preservedCorrections: [],
    // #2318.8 — recopié tel quel : ce champ est un CONSTAT de l'appelant, jamais
    // une déduction d'ici. Ce fichier n'a pas accès à l'état persisté.
    overwrittenCorrections: [...(input.overwrittenCorrections ?? [])],
    changedRecommendations: [],
    obsoleteActions: [],
    expiredSignals: [],
    scoreChanged: null,
    confidenceChanged: null,
    scoreNotRecalculated: null,
    confidenceNotRecalculated: null,
    unmeasured: input.unmeasured ?? [],
    unchangedFacts: 0,
  }

  for (const [id, incoming] of after) {
    const current = before.get(id)
    if (!current) {
      // #2318.4 — un signal NOUVEAU retombe sur les faits génériques (voir la
      // boucle de changement ci-dessous pour la raison).
      if (incoming.kind === 'fact' || incoming.kind === 'signal') {
        diff.newFacts.push({
          key: incoming.key,
          label: incoming.label,
          value: incoming.value,
          measuredAt: incoming.measuredAt ?? null,
        })
      } else if (incoming.kind === 'recommendation') {
        diff.changedRecommendations.push({
          key: incoming.key,
          label: incoming.label,
          before: null,
          after: incoming.value,
        })
      }
      continue
    }

    const decision = decideFieldWrite({
      incomingValue: incoming.value,
      incomingSource: incoming.source ?? UNKNOWN_PROVENANCE_SOURCE,
      currentValue: current.value,
      currentSource: current.source ?? null,
    })

    if (!decision.write) {
      // Refusée parce que l'existant a plus d'autorité : c'est une correction
      // utilisateur conservée, et elle se dit — sinon l'utilisateur croit que le
      // run n'a rien trouvé, alors qu'on a écarté ce qu'il a trouvé.
      if (decision.reason !== 'unchanged') {
        diff.preservedCorrections.push({
          key: current.key,
          label: current.label,
          keptValue: current.value,
          discardedValue: incoming.value,
        })
      } else if ((current.source ?? UNKNOWN_PROVENANCE_SOURCE) === 'human') {
        // Relue, et rendue IDENTIQUE : rien n'a été écarté, mais la correction a
        // quand même traversé le run. Le taire laisserait croire que le
        // rafraîchissement ne l'a pas regardée — et c'est cette incertitude-là
        // que #2125 vient supprimer.
        diff.preservedCorrections.push({
          key: current.key,
          label: current.label,
          keptValue: current.value,
          discardedValue: null,
        })
      } else {
        // #2555.2 — même valeur, source NON humaine : ni une correction à
        // conserver (personne n'a rien écrit à protéger), ni un changement. Un
        // fait RECONFIRMÉ, compté comme tel plutôt que réduit au silence.
        diff.unchangedFacts += 1
      }
      continue
    }

    if (incoming.kind === 'recommendation') {
      diff.changedRecommendations.push({
        key: current.key,
        label: current.label,
        before: current.value,
        after: incoming.value,
      })
    } else if (incoming.kind === 'score') {
      // #2318.4 — un score, pas une liste : la dernière valeur écrase la
      // précédente dans `scoreChanged`, comme il n'existe qu'un score par compte.
      diff.scoreChanged = { key: current.key, label: current.label, before: current.value, after: incoming.value }
    } else if (incoming.kind === 'confidence') {
      diff.confidenceChanged = { key: current.key, label: current.label, before: current.value, after: incoming.value }
    } else if (incoming.kind === 'fact' || incoming.kind === 'signal') {
      // #2318.4 — un signal MODIFIÉ ou NOUVEAU retombe sur les faits
      // génériques : seule sa disparition a une catégorie nommée
      // (`expiredSignals`, boucle ci-dessous), comme 'action' ne connaît pas
      // de "nouvelle action".
      diff.changedFacts.push({
        key: current.key,
        label: current.label,
        before: current.value,
        after: incoming.value,
      })
    }
  }

  for (const [id, current] of before) {
    if (after.has(id)) continue
    // Une correction utilisateur que la collecte ne revoit plus n'est pas
    // « devenue obsolète » : c'est l'utilisateur qui l'a écrite, pas la
    // collecte, et rien de ce que la collecte n'a pas vu ne la périme.
    if ((current.source ?? UNKNOWN_PROVENANCE_SOURCE) === 'human') {
      diff.preservedCorrections.push({
        key: current.key,
        label: current.label,
        keptValue: current.value,
        discardedValue: null,
      })
      continue
    }
    if (current.kind === 'fact') {
      diff.obsoleteFacts.push({
        key: current.key,
        label: current.label,
        lastKnownValue: current.value,
        lastSeenAt: current.measuredAt ?? null,
      })
    } else if (current.kind === 'action') {
      diff.obsoleteActions.push({ key: current.key, label: current.label, lastSeenAt: current.measuredAt ?? null })
    } else if (current.kind === 'signal') {
      // #2318.4 — « signaux expirés » : le signal redevient INCONNU AVEC SA
      // DATE, il ne disparaît pas (« on archive, on ne supprime pas »).
      diff.expiredSignals.push({
        key: current.key,
        label: current.label,
        lastKnownValue: current.value,
        lastSeenAt: current.measuredAt ?? null,
      })
    }
  }

  // #2591.1 — `scoreChanged` prime toujours : un score réellement modifié
  // n'est jamais redit « non recalculé ». Le champ ne se remplit que quand
  // l'appelant SAIT que cette dimension n'écrit jamais `priority_score` — un
  // fait constaté ailleurs (`applyPlan`), jamais deviné ici.
  if (input.scoreRecalculated === false && diff.scoreChanged === null) {
    const scoreItem = after.get('score:priority_score') ?? before.get('score:priority_score')
    diff.scoreNotRecalculated = { lastKnownValue: scoreItem ? scoreItem.value : null }
  }

  // #2591.6 — même arbitrage pour la CONFIANCE, avec une nuance : sans AUCUNE
  // confiance mesurée sur ce dossier (ni avant ni après), il n'y a rien à
  // nommer « non recalculé » — « non mesuré » n'est jamais « 0 » (contrairement
  // à `scoreNotRecalculated`, qui rend `{ lastKnownValue: null }` même sans
  // item : ce champ-ci reste `null` tant qu'aucune confiance n'existe).
  if (input.confidenceRecalculated === false && diff.confidenceChanged === null) {
    const confidenceItem = after.get('confidence:confidence') ?? before.get('confidence:confidence')
    if (confidenceItem) {
      diff.confidenceNotRecalculated = { lastKnownValue: confidenceItem.value }
    }
  }

  // #2318.8 — un CONSTAT bat un arbitrage. Une correction que l'appelant a
  // mesurée écrasée en base ne peut pas, en plus, être annoncée « conservée » :
  // c'est précisément la phrase qui a menti. L'arbitrage ci-dessus l'y avait
  // rangée de bonne foi — il raisonnait sur un `after` qu'il croyait être une
  // proposition, alors que l'appelant lui a passé l'état déjà écrit.
  if (diff.overwrittenCorrections.length > 0) {
    const overwritten = new Set(diff.overwrittenCorrections.map(entry => entry.key))
    diff.preservedCorrections = diff.preservedCorrections.filter(entry => !overwritten.has(entry.key))
  }

  return diff
}

/**
 * Le diff peut-il honnêtement se rendre « aucun changement » ?
 *
 * Non dès qu'une phase n'a rien rendu : « rien n'a changé » et « on n'a pas pu
 * regarder » sont deux phrases différentes, et les confondre est exactement ce
 * que « non mesuré n'est pas 0 » interdit.
 */
export function refreshDiffSaysNothingChanged(diff: RefreshDiff): boolean {
  if (diff.unmeasured.length > 0) return false
  // ⚠ `preservedCorrections` ne compte PAS : une correction conservée n'est pas
  // un changement, c'est un NON-changement qu'on prend la peine de nommer. La
  // faire compter rendrait « des choses ont bougé » un dossier où rien n'a bougé.
  return (
    diff.newFacts.length === 0 &&
    diff.changedFacts.length === 0 &&
    diff.obsoleteFacts.length === 0 &&
    diff.changedRecommendations.length === 0 &&
    diff.obsoleteActions.length === 0 &&
    // #2318.4 — les trois nouvelles catégories comptent aussi comme un
    // changement : un score modifié en silence serait pire qu'un fait modifié
    // en silence.
    diff.expiredSignals.length === 0 &&
    diff.scoreChanged === null &&
    diff.confidenceChanged === null &&
    // #2591.1 — un score non recalculé n'est pas « rien n'a changé » : c'est
    // une chose qu'on ne sait PAS, pas une chose qui n'a pas bougé.
    diff.scoreNotRecalculated === null &&
    // #2591.6 — même règle pour la confiance non recalculée.
    diff.confidenceNotRecalculated === null &&
    // #2318.8 — une correction ÉCRASÉE est un changement, et le pire de tous :
    // du travail humain perdu. Contrairement à `preservedCorrections` (un
    // non-changement qu'on nomme), celle-ci ne peut jamais se taire.
    diff.overwrittenCorrections.length === 0
  )
}

export type RefreshFailureReport = {
  /** La PHASE qui a échoué, nommée (#2125.64). */
  phase: RefreshDimension
  outcome: DispatchFailureOutcome
  /** Les axes que la panne n'a pas touchés : ils restent au dossier (#2125.65). */
  keptDimensions: readonly RefreshDimension[]
  /** Et les quatre objets qu'un rafraîchissement n'écrase jamais. */
  preservedKinds: readonly RefreshPreservedKind[]
  /** Le coût débité, et s'il a été remboursé (#2125.66). `null` = non mesuré. */
  credits: { debited: number | null; refunded: boolean }
  /** Relancer UNIQUEMENT la phase échouée (#2125.67). */
  retry: { dimension: RefreshDimension; allowed: boolean; needsConfirmation: boolean }
}

/**
 * L'écran d'erreur, en une structure.
 *
 * ⚠ `needsConfirmation` est la moitié qui compte. Une requête PARTIE sans
 * réponse (`unknown`) peut avoir été appliquée chez le fournisseur : la
 * rejouer d'un clic paierait deux fois et pourrait produire deux écritures. On
 * ne l'interdit pas — on refuse de la rejouer SANS LE DIRE. Une connexion
 * jamais établie (`failed`), elle, se rejoue sans risque : rien n'est parti.
 */
export function buildRefreshFailureReport(input: {
  mode: RefreshScopeMode
  phase: RefreshDimension
  error: unknown
  creditsDebited: number | null
  refunded: boolean
}): RefreshFailureReport {
  const outcome = dispatchFailureOutcome(input.error)
  return {
    phase: input.phase,
    outcome,
    keptDimensions: REFRESH_MODE_DIMENSIONS[input.mode].filter(dimension => dimension !== input.phase),
    preservedKinds: REFRESH_NEVER_OVERWRITES,
    credits: { debited: input.creditsDebited, refunded: input.refunded },
    retry: { dimension: input.phase, allowed: true, needsConfirmation: outcome === 'unknown' },
  }
}
