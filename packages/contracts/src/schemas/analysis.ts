import { z } from 'zod'
import {
  ANALYSIS_DEPTH_COST_MULTIPLIERS,
  CREDIT_WEIGHTS,
  creditCostOf,
  DEFAULT_ANALYSIS_DEPTH,
} from '../billing/credit-weights.js'
import { analysisContextSchema } from './analysis-context.js'
import { placesProfilesForClients } from './onboarding/answers-recrutement.js'
import { lauraContextModeSchema } from './laura-context-mode.js'
import { applicationSectorNamesFr } from './application-sectors.js'
import { discoverOriginCriteriaSchema } from './discover-origin.js'
import { GROUP_PERIMETER_MAX_ENTITIES, contactEntitySchema } from './group-perimeter.js'
import { consultingDomainNamesFr, dominantOfferDomain } from './consulting-domains.js'
import type { OfferPortfolio } from './offer-portfolio.js'
import type { BusinessUnitKind } from './business-unit.js'
import type { EsnAnswers, EsnObjective, OfferDomain } from './onboarding.js'
import type { EntryStrategy } from './profile-context.js'
import { baseProspectingHolds, recommendContentInvestment } from './profile-questionnaire.js'
import { workspaceMarketSchema } from './workspace.js'

/**
 * Périmètre d'analyse (Théo restitution p.10/21 : « Ajouter un sélecteur groupe
 * / France / filiales / IT-digital / startups / custom, visible avant lancement
 * et persisté dans le run »). Distinct du verrou d'entité SIREN (qui choisit
 * QUELLE société) : le scopeMode choisit QUEL PÉRIMÈTRE de cette société on
 * analyse. Le contexte libre (`user_context`) le COMPLÈTE, ne le remplace pas.
 *
 *  - `groupe`        → tout le groupe (défaut)
 *  - `france`        → périmètre France uniquement (force le filtre géo)
 *  - `filiales`      → focalise sur les filiales / entités opérationnelles
 *  - `it_digital`    → focalise sur les entités IT / digitales du groupe
 *  - `startups`      → segment jeunes pousses / entités récentes
 *  - `business_unit` → une business unit précise (#2163.4)
 *  - `direction`      → une direction précise (#2163.5)
 *  - `programme`      → un programme précis, transverse à plusieurs entités (#2163.6)
 *  - `site`           → un site / implantation précis (#2163.7)
 *  - `custom`         → neutre, piloté par le contexte libre
 */
export const analysisScopeModeSchema = z.enum([
  'groupe',
  'france',
  'filiales',
  'it_digital',
  'startups',
  'business_unit',
  'direction',
  'programme',
  'site',
  'custom',
])
export type AnalysisScopeMode = z.infer<typeof analysisScopeModeSchema>

export const ANALYSIS_SCOPE_MODE_LABELS: Record<AnalysisScopeMode, string> = {
  groupe: 'Groupe entier',
  france: 'France',
  filiales: 'Filiales',
  it_digital: 'IT & Digital',
  startups: 'Startups',
  business_unit: 'Business unit',
  direction: 'Direction',
  programme: 'Programme',
  site: 'Site',
  custom: 'Personnalisé',
}

/**
 * Niveau de contact visé (#2163.25-30 — Terrain / Manager / Direction locale /
 * Achats / Direction groupe). Porté par `hierarchy_levels` ci-dessous, un
 * TABLEAU dont l'ordre EST la priorisation demandée par #2163.30 : sélectionner
 * plusieurs niveaux dans l'ordre voulu couvre « Tous, avec priorisation » sans
 * ajouter une sixième valeur qui dirait la même chose autrement (GA-26).
 */
export const analysisHierarchyLevelSchema = z.enum(['c_level', 'n1', 'n2', 'operational', 'purchasing'])
export type AnalysisHierarchyLevel = z.infer<typeof analysisHierarchyLevelSchema>

export const ANALYSIS_HIERARCHY_LEVEL_LABELS: Record<AnalysisHierarchyLevel, string> = {
  c_level: 'Direction groupe',
  n1: 'Direction locale',
  n2: 'Manager',
  operational: 'Terrain',
  purchasing: 'Achats',
}

/**
 * Périmètre géographique du cadrage (#2163.9, #2163.11). `world` (#2163.9)
 * rejoint les quatre valeurs déjà déclarées côté contrat — `region` (#2163.11)
 * existait déjà mais sans appelant web (registre
 * `.claude/notes/registre-2026-09-16-ecrans-secondaires.md`, ligne 2163.11).
 *
 * `city` (#2163.12, « Ville / site ») — `matches_geo`
 * (apps/ia/app/services/scope_filter.py) porte maintenant la granularité
 * ville : un nom saisi dans `geo_areas` (même champ générique que `region`),
 * comparé au libellé (titre/entité/localisation) — comportement réel, testé
 * (`test_scope_filter.py::TestLeCadrageVille`), pas le code mort que ce dépôt
 * demande de chercher avant d'écrire (chantiers-livres.md).
 *
 * `country` (#2163.10, « Pays ») RÉUTILISE le sélecteur de pays déjà câblé à
 * côté du champ entreprise (`SearchCountrySelector.tsx`) — décision Louis
 * 17/09 (registre `.claude/notes/registre-2026-09-16-ecrans-secondaires.md`,
 * ligne 2163.10) : « réutiliser le sélecteur de pays existant comme axe de
 * périmètre » plutôt que dupliquer un second sélecteur pays à l'écran (GA-26).
 * Le code choisi vit dans `geo_areas[0]`, le même champ générique qui porte
 * déjà les noms de région pour `region` — pas un troisième champ.
 */
export const analysisGeoPerimeterSchema = z.enum([
  'world',
  'international',
  'europe',
  'france',
  'region',
  'country',
  'city',
])
export type AnalysisGeoPerimeter = z.infer<typeof analysisGeoPerimeterSchema>

export const ANALYSIS_GEO_PERIMETER_LABELS: Record<AnalysisGeoPerimeter, string> = {
  world: 'Monde',
  international: 'International',
  europe: 'Europe',
  france: 'France',
  region: 'Région',
  country: 'Pays',
  city: 'Ville / site',
}

/**
 * Cadrage de la collecte AVANT le débit (Théo TF1 P0-02, étape 3 « Priorités :
 * thèmes, personas, régions, exclusions »). L'écran de confirmation portait
 * jusqu'ici l'objet résolu et le périmètre ; il ne portait NI priorité NI
 * exclusion, donc le commercial payait une collecte qu'il ne pouvait pas cadrer.
 *
 * Les quatre listes sont du texte libre saisi par le commercial — on ne lui
 * propose AUCUNE liste d'entités inventée avant le run (les filiales ne sont
 * connues qu'après la phase 1). Ce qu'il exclut est réellement exclu du dossier :
 * les entités écartées ne sont ni persistées dans la recherche, ni gardées comme
 * employeur d'un contact (voir `analysis-scope.ts` côté API).
 *
 * Toutes les clés sont optionnelles et un objet vide vaut absence : un run lancé
 * sans cadrage est byte-identique à ce qu'il était avant la feature.
 */
const scopeLabelSchema = z.string().trim().min(1).max(200)

/**
 * #3288 — PROFONDEUR D'ANALYSE, choisie PAR RUN avant le débit.
 *
 * `verified` était l'analyse d'AVANT (12 pages, poids plein) : absent ou
 * `verified`, rien ne change, byte pour byte. `quick` lit moitié moins de pages
 * pour la moitié du prix ; `deep` en lit plus, pour 10 crédits.
 *
 * ⚠️ #3944 (retour bêta Louis 08/10/2026) — « que deux choix, pas trois » :
 * `verified` n'est PLUS un palier qu'on peut choisir au lancement (voir
 * {@link SELECTABLE_ANALYSIS_RUN_DEPTHS}), mais reste une valeur VALIDE du
 * type — une analyse déjà lancée dans ce palier avant ce lot reste lisible
 * (`runDepthLabel`, `apps/web/src/features/accounts/lib/analysisRuns.ts`) :
 * on archive, on ne supprime pas. Le coût de `deep` change dans le même
 * geste : 10 crédits exactement (`costMultiplier: 1.25`), pas 16 — l'ancien
 * doublé du poids plein n'était plus le prix demandé. Le coût ANNONCÉ reste
 * celui DÉBITÉ : UNE seule grille (`ANALYSIS_DEPTH_PRESETS`), lue à l'écran
 * (`estimateAnalysisCredits`) et au débit (`resolveAnalysisCost`,
 * `apps/api/credits.service.ts`) — jamais une copie qui pourrait diverger.
 *
 * Les pages sont le levier de collecte réel (`MAX_PAGES_PER_RUN`, apps/ia) ;
 * douze restent le défaut en dur pour `verified`. 15 pages pour `deep` = trois
 * vagues de cinq, le budget de phase de 180 s tient — inchangé par ce lot.
 */
export const ANALYSIS_RUN_DEPTHS = ['quick', 'verified', 'deep'] as const
export const analysisRunDepthSchema = z.enum(ANALYSIS_RUN_DEPTHS)
export type AnalysisRunDepth = z.infer<typeof analysisRunDepthSchema>

/**
 * #3944 — les SEULS paliers qu'un lancement peut choisir aujourd'hui. `verified`
 * reste dans {@link ANALYSIS_RUN_DEPTHS} (lecture d'un run passé) mais sort de
 * cette liste (aucun nouveau run ne peut plus le demander) — c'est elle que le
 * sélecteur de `/search` (`ScopeConfirmPanel`) et le devis serveur
 * (`AnalysisService.depthOptions`) parcourent, jamais `ANALYSIS_RUN_DEPTHS`
 * entier.
 */
export const SELECTABLE_ANALYSIS_RUN_DEPTHS = ['quick', 'deep'] as const

export const ANALYSIS_DEPTH_PRESETS: Record<AnalysisRunDepth, { pages: number; costMultiplier: number }> = {
  // Louis 10/10 — « approfondi devient la norme à 10 crédits et le rapide en
  // coûte 5 » : Rapide 8 × 0.625 = 5 (avant : 4), Approfondie 8 × 1.25 = 10. Les
  // multiplicateurs vivent dans `ANALYSIS_DEPTH_COST_MULTIPLIERS` (credit-weights),
  // lus aussi par `creditCostOf('account_analysis')`. Une analyse déjà facturée
  // garde son prix : le registre de crédits, pas cette grille, fait foi.
  quick: { pages: 6, costMultiplier: ANALYSIS_DEPTH_COST_MULTIPLIERS.quick },
  verified: { pages: 12, costMultiplier: ANALYSIS_DEPTH_COST_MULTIPLIERS.verified },
  // #3944 — 10 crédits exactement (poids plein × 1), pas 16 : le prix
  // demandé par le retour bêta, pas l'ancien double du poids plein.
  deep: { pages: 15, costMultiplier: ANALYSIS_DEPTH_COST_MULTIPLIERS.deep },
}

/** Sous ce nombre de runs terminés, la durée d'un palier n'est PAS mesurée. */
const MIN_RUNS_FOR_MEASURED_DURATION = 3

/** Médiane en secondes, ou `null` (« non mesurée ») sous trois échantillons. */
export function medianDurationSeconds(durations: readonly number[]): number | null {
  const sorted = durations.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length < MIN_RUNS_FOR_MEASURED_DURATION) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * Théo B r1-recherche.N1 (Louis 22/10) — les OBJECTIFS d'une analyse, au choix MULTIPLE (« Plusieurs choix possibles »).
 * Table fermée : le libellé affiché vit côté web (`search.json › objectives`), jamais une chaîne libre envoyée au
 * prompt. ⚠️ Renverse la note d'`objectiveMapping.ts` (« pas de nouvelle clé sur le cadrage », 17/09) : le preset de
 * contexte ne porte qu'UN objectif, la liste en porte plusieurs et reste lisible après coup (« cadrage conservé »).
 */
export const ANALYSIS_OBJECTIVES = [
  'open_account',
  'prepare_meeting',
  'find_decision_makers',
  'understand_group',
  'verify_signal',
  'prepare_listing',
  'map_partners_competitors',
  'other',
] as const
export const analysisObjectiveSchema = z.enum(ANALYSIS_OBJECTIVES)
export type AnalysisObjective = z.infer<typeof analysisObjectiveSchema>

export const analysisScopeSelectionSchema = z.object({
  /** Théo B r1-recherche.N1 — ce que le commercial veut obtenir (plusieurs choix possibles), sans doublon. */
  objectives: z
    .array(analysisObjectiveSchema)
    .max(ANALYSIS_OBJECTIVES.length)
    .refine(list => new Set(list).size === list.length, { message: 'objectives_duplicated' })
    .optional(),
  /** Théo B r1-recherche.R5 — « Ton angle, en une phrase » (facultatif) : lu par la consigne de collecte. */
  angle: z.string().trim().min(1).max(300).optional(),
  /** Filiales / BU explicitement retenues — le reste passe au second plan. */
  included_entities: z.array(scopeLabelSchema).max(30).optional(),
  /** Filiales / BU explicitement écartées — jamais dans le dossier livré. */
  excluded_entities: z.array(scopeLabelSchema).max(30).optional(),
  /** Thèmes / angles prioritaires (« cybersécurité », « data »…). */
  selected_angles: z.array(scopeLabelSchema).max(20).optional(),
  /** Thèmes / angles à ne pas traiter. */
  excluded_angles: z.array(scopeLabelSchema).max(20).optional(),

  // ── Les cinq dimensions du cadrage structuré (recette finale §18) ──────────
  //
  // Le champ de contexte libre est utile, mais il ne remplace pas un cadrage :
  // « décrivez le contexte commercial » laisse le modèle deviner le périmètre
  // juridique, la zone, les familles métier et le niveau visé. Le run part alors
  // chercher un C-level en Chine pour une ESN française de trente personnes,
  // et c'est exactement ce que le rapport montre au §34.
  //
  // Toutes optionnelles : absentes, la requête et les prompts sont identiques à
  // avant. Un cadrage vide ne coûte rien et ne change rien.

  /**
   * Périmètre juridique : jusqu'où on remonte et redescend dans le groupe.
   * `entity` = cette entité seule ; `group` = tout le graphe légal.
   */
  legal_perimeter: z.enum(['entity', 'subsidiary', 'parent', 'group']).optional(),
  /**
   * Périmètre géographique. `france` par défaut côté produit — l'écrire ici
   * permet d'exclure explicitement les entités étrangères d'un grand groupe.
   *
   * `world` (#2163.9 « Monde ») rejoint les quatre valeurs initiales.
   */
  geo_perimeter: analysisGeoPerimeterSchema.optional(),
  /**
   * Régions ou départements quand `geo_perimeter = 'region'` (#2163.11) ; un
   * seul code pays (`geo_areas[0]`) quand `geo_perimeter = 'country'`
   * (#2163.10) — le même champ générique, pas un second.
   */
  geo_areas: z.array(scopeLabelSchema).max(20).optional(),
  /**
   * Familles métier à prioriser (« Data », « Infra », « Cyber », « DSI »…).
   * Vide = toutes, comme avant.
   */
  business_families: z.array(scopeLabelSchema).max(20).optional(),
  /**
   * Jusqu'où viser dans la hiérarchie. Le rapport insiste : « limiter les
   * C-levels intouchables, chercher les décideurs BU ». Une ESN de trente
   * personnes qui attaque un groupe bancaire n'a pas d'entrée par le comité
   * exécutif, et lui en proposer une lui fait perdre son premier message.
   *
   * `purchasing` (#2163.28, la fonction Achats) rejoint les quatre valeurs
   * initiales. L'ORDRE du tableau porte la priorisation (#2163.30 « Tous, avec
   * priorisation ») : le premier niveau choisi est le plus prioritaire — ce
   * n'est pas une sixième valeur d'énum, c'est ce que l'écran fait déjà en
   * sélectionnant plusieurs niveaux dans l'ordre voulu.
   */
  hierarchy_levels: z.array(analysisHierarchyLevelSchema).max(5).optional(),
  /**
   * Ce que le run doit faire. `full` = le dossier complet (le défaut) ;
   * `refresh` = réutiliser le dossier et ne relancer que les sources datées ;
   * `contacts` / `signals` = une dimension seule. Le coût suit le mode.
   */
  run_mode: z.enum(['full', 'refresh', 'contacts', 'signals']).optional(),
  /**
   * #2624.1 — critère d'effectif du périmètre visé. Absent nulle part avant ce
   * point (ni web, ni API, ni IA) : le commercial ne pouvait pas dire « je vise
   * les filiales de 50 à 250 personnes ». Même borne que `companies.ts`
   * (`employeeMin`/`employeeMax`) et que la colonne `signal.headcount_min` /
   * `headcount_max` de la mémoire marché — un même concept, un même nom.
   * Les deux sont indépendantes : `headcount_max` seul cadre « jusqu'à N »,
   * `headcount_min` seul cadre « à partir de N ».
   */
  headcount_min: z.number().int().min(0).max(5_000_000).optional(),
  headcount_max: z.number().int().min(0).max(5_000_000).optional(),
  /** #3288 — profondeur du run. Absente = `verified`, l'analyse d'avant. */
  depth: analysisRunDepthSchema.optional(),
  /**
   * #4142.6 — écarter les entités du SECTEUR PUBLIC : catégorie juridique INSEE 7xxx ou section NAF O, lue sur
   * le registre. Une entité sans donnée n'est ni retenue ni écartée (« non mesuré »).
   */
  exclude_public_sector: z.boolean().optional(),
  /**
   * #4142.6 — écarter les comptes DÉJÀ TRAVAILLÉS : au moins une affaire gagnée ou une relation client dans le
   * CRM de l'espace. Lu par SIREN ; une entité sans SIREN connu n'est ni retenue ni écartée.
   */
  exclude_worked_accounts: z.boolean().optional(),
  /**
   * Lot 757 (arbitrage Louis 31/10) — les entités du groupe COCHÉES dans le sélecteur de périmètre : les contacts
   * sont cherchés sur l'entité analysée ET sur chacune d'elles. Absent = la seule entité analysée, comme avant.
   */
  contact_entities: z.array(contactEntitySchema).max(GROUP_PERIMETER_MAX_ENTITIES).optional(),
})
export type AnalysisScopeSelection = z.infer<typeof analysisScopeSelectionSchema>

/**
 * Traduit un cadrage d'analyse en cadrage de CONTACTS, ou `undefined`.
 *
 * ⚠️ Le champ `scope` était déclaré au contrat, transmis par le contrôleur, reçu
 * par le service — et `runDimension` n'avait pas de paramètre pour lui. Un
 * refresh était donc TOUJOURS pleine dimension, alors que le contrat promet un
 * « rerun partiel par entité, famille, niveau, techno et pays ». Sur un groupe
 * de la taille de Société Générale, actualiser les contacts re-balayait
 * quatre-vingt-dix-huit entités pour en corriger une.
 *
 * Une seule entité retenue devient l'ancre : au-delà, il n'y a pas d'ancre
 * unique à donner à la recherche, et en choisir une au hasard cadrerait sur la
 * mauvaise. Le cadrage rendu est alors vide — pleine dimension, comme avant.
 */
export function contactScopeFromSelection(
  selection: AnalysisScopeSelection | undefined | null,
): { entity?: string; theme?: string } | undefined {
  if (!selection) return undefined
  const entities = selection.included_entities ?? []
  const angles = selection.selected_angles ?? []
  const scope: { entity?: string; theme?: string } = {}
  if (entities.length === 1 && entities[0]) scope.entity = entities[0]
  if (angles.length === 1 && angles[0]) scope.theme = angles[0]
  return Object.keys(scope).length > 0 ? scope : undefined
}

/**
 * Traduit un cadrage d'analyse en cadrage de STRATÉGIE, ou `undefined`.
 *
 * Même règle d'ancre unique, et même raison : le plan se construit AUTOUR d'un
 * angle, pas autour de trois.
 */
export function strategyScopeFromSelection(
  selection: AnalysisScopeSelection | undefined | null,
): { angle?: string; focusEntity?: string } | undefined {
  if (!selection) return undefined
  const entities = selection.included_entities ?? []
  const angles = selection.selected_angles ?? []
  const scope: { angle?: string; focusEntity?: string } = {}
  if (angles.length === 1 && angles[0]) scope.angle = angles[0]
  if (entities.length === 1 && entities[0]) scope.focusEntity = entities[0]
  return Object.keys(scope).length > 0 ? scope : undefined
}

/** Un cadrage sans aucune entrée ne vaut pas la peine d'être transmis ni stocké. */
export function isScopeSelectionEmpty(selection: AnalysisScopeSelection | undefined | null): boolean {
  if (!selection) return true
  return (
    (selection.included_entities?.length ?? 0) === 0 &&
    (selection.excluded_entities?.length ?? 0) === 0 &&
    (selection.selected_angles?.length ?? 0) === 0 &&
    (selection.excluded_angles?.length ?? 0) === 0 &&
    // Les cinq dimensions structurées comptent AUSSI : un cadrage qui ne
    // contient qu'un périmètre géographique est un cadrage. L'oublier ici le
    // ferait silencieusement jeter avant d'atteindre le run — le pire mode de
    // défaillance pour une option d'interface, parce que l'utilisateur voit son
    // choix accepté et ne le retrouve nulle part dans le résultat.
    selection.legal_perimeter === undefined &&
    selection.geo_perimeter === undefined &&
    (selection.geo_areas?.length ?? 0) === 0 &&
    (selection.business_families?.length ?? 0) === 0 &&
    (selection.hierarchy_levels?.length ?? 0) === 0 &&
    (selection.objectives?.length ?? 0) === 0 &&
    selection.angle === undefined &&
    selection.run_mode === undefined &&
    selection.headcount_min === undefined &&
    selection.headcount_max === undefined &&
    // #3288 — un palier choisi est un cadrage : le jeter avant le run ferait
    // facturer ou collecter autre chose que ce que l'écran a annoncé.
    selection.depth === undefined
  )
}

/**
 * Le coût d'un run selon son MODE (§9 + §18).
 *
 * Le périmètre change ce qu'on collecte ; le mode change ce qu'on produit. Un
 * dossier complet vaut 8 crédits, une actualisation 4, une dimension seule 1 à
 * 3. C'est cette valeur que l'écran de confirmation annonce, et c'est la même
 * qui est débitée.
 */
export function estimateRunCredits(selection?: AnalysisScopeSelection | null): number {
  switch (selection?.run_mode) {
    case 'refresh':
      return CREDIT_WEIGHTS.account_refresh
    case 'contacts':
    case 'signals':
      return CREDIT_WEIGHTS.targeted_refresh
    default:
      return creditCostOf('account_analysis')
  }
}

/**
 * Coût d'un run en créneaux d'analyse, par périmètre. **Source de vérité unique**
 * partagée : l'API débite avec cette grille (`CREDIT_COSTS.analysis.byScope`) et
 * l'écran de confirmation annonce le même chiffre — impossible d'annoncer un
 * coût qui ne serait pas celui débité. Tout est à 1 aujourd'hui ; un périmètre
 * plus lourd n'a qu'à changer de valeur ici.
 */
export const ANALYSIS_SCOPE_CREDIT_COST: Record<AnalysisScopeMode, number> = {
  france: CREDIT_WEIGHTS.account_analysis,
  groupe: CREDIT_WEIGHTS.account_analysis,
  filiales: CREDIT_WEIGHTS.account_analysis,
  it_digital: CREDIT_WEIGHTS.account_analysis,
  startups: CREDIT_WEIGHTS.account_analysis,
  business_unit: CREDIT_WEIGHTS.account_analysis,
  direction: CREDIT_WEIGHTS.account_analysis,
  programme: CREDIT_WEIGHTS.account_analysis,
  site: CREDIT_WEIGHTS.account_analysis,
  custom: CREDIT_WEIGHTS.account_analysis,
}

/**
 * Crédits que coûtera CE run. Périmètre absent/inconnu ⇒ le prix d'une analyse
 * complète — jamais 1, qui sous-annoncerait le débit de 8 crédits d'un facteur 8
 * et ferait mentir l'écran de confirmation.
 *
 * #2163.76 — `excludedCount` (le nombre d'entités écartées, #2163.38-43 compris
 * — `AnalysisScopeSelection.excluded_entities.length`) réduit le prix : **le
 * même grain qu'un crédit par unité déjà posé** pour le sens inverse
 * (`UNITS_PER_EXTRA_CREDIT`, `packages/contracts/src/billing/credit-weights.ts:117`,
 * qui AJOUTE un crédit par unité de périmètre supplémentaire sur les actions
 * qui montent) — appliqué ici en retrait plutôt qu'en ajout, jamais un chiffre
 * inventé pour l'occasion. Plancher à 1 : aucune analyse n'est jamais gratuite,
 * même à exclusion maximale. `excludedCount` absent/0 ⇒ comportement byte-
 * identique à avant (tous les appelants existants).
 */
export function estimateAnalysisCredits(
  scopeMode?: AnalysisScopeMode | null,
  excludedCount = 0,
  depth?: AnalysisRunDepth | null,
): number {
  const cost = scopeMode ? ANALYSIS_SCOPE_CREDIT_COST[scopeMode] : undefined
  const scoped = Number.isFinite(cost) ? Math.max(1, Math.floor(cost as number)) : CREDIT_WEIGHTS.account_analysis
  // #3288 — le palier multiplie le poids du périmètre ; `verified`/absent = ×1.
  const base = Math.max(1, Math.round(scoped * ANALYSIS_DEPTH_PRESETS[depth ?? DEFAULT_ANALYSIS_DEPTH].costMultiplier))
  const excluded = Number.isFinite(excludedCount) ? Math.max(0, Math.floor(excludedCount)) : 0
  return Math.max(1, base - excluded)
}

/**
 * Ce qui disqualifie une saisie comme NOM D'ENTREPRISE, avant tout débit.
 *
 * Le champ acceptait n'importe quelle chaîne. En production, une analyse
 * complète a tourné sur « Que penses-tu de Saint-Gobain ? » : huit crédits
 * dépensés, aucun fait sourcé, un dossier que personne ne peut utiliser. Le
 * commercial, lui, croit que le produit ne marche pas.
 *
 * Les trois signaux ci-dessous sont volontairement GROSSIERS. Refuser à tort un
 * nom légitime est le pire résultat possible — pire qu'un run raté — donc on ne
 * refuse que ce qu'aucune raison sociale ne fait : porter un point
 * d'interrogation, dépasser douze mots, ou dépasser 120 caractères. « Compagnie
 * Générale des Établissements Michelin » passe, « peux-tu me parler de X »
 * non.
 *
 * Rend `null` quand la saisie est plausible, sinon la phrase à AFFICHER — elle
 * dit quoi faire, pas seulement que c'est refusé.
 */
/**
 * #2149.17 — CIBLE ADMISSIBLE : reconnaît une URL/un domaine collé dans la
 * barre et le réduit au nom cherchable qu'il porte, AVANT tout débit.
 *
 * Volontairement GROSSIER, même esprit que {@link companyNameRejection} :
 * dernier segment (le TLD) écarté, `www.` écarté, séparateurs `-`/`_`
 * transformés en espaces. Une saisie qui ne ressemble pas à une URL traverse
 * intacte — ce n'est PAS un résolveur, seulement la même requête texte que le
 * champ acceptait déjà, nettoyée du bruit d'URL qui la faisait échouer contre
 * le registre.
 */
const URL_LIKE_TARGET = /^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i

/**
 * #2149.17 — l'AUTRE cible admissible du point : un FICHIER déposé (le nom
 * d'un devis, d'un cahier des charges, d'une fiche entreprise reçue par
 * mail). Même geste que l'URL juste au-dessus, jamais un parseur de
 * CONTENU : le contrat d'un contenu non vérifiable ne se devine pas
 * (doctrine), et ce champ n'a ni upload ni stockage à faire confiance.
 * Seul le NOM du fichier — ce que l'utilisateur a lui-même écrit en
 * l'enregistrant — est une donnée directe, jamais inventée.
 *
 * Volontairement GROSSIER, même esprit que l'URL : extension écartée,
 * séparateurs `-`/`_` transformés en espaces. Sans espace, « capgemini.pdf »
 * traverse déjà `URL_LIKE_TARGET` par accident (un nom + une extension
 * ressemble à un domaine) ; celui-ci couvre le cas réel — un nom de fichier
 * PORTE des espaces, que l'URL ne reconnaît jamais comme cible.
 */
const FILE_LIKE_TARGET = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|odt|csv)$/i

function normalizeFileNameTarget(value: string): string {
  const withoutExtension = value.replace(FILE_LIKE_TARGET, '')
  const normalized = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized || value
}

export function normalizeCompanyTarget(raw: string): string {
  const value = raw.trim()
  if (FILE_LIKE_TARGET.test(value)) return normalizeFileNameTarget(value)
  if (!URL_LIKE_TARGET.test(value)) return value
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    const host = url.hostname.replace(/^www\./i, '')
    const segments = host.split('.')
    const label = (segments.length > 1 ? segments.slice(0, -1) : segments).join(' ')
    const normalized = label.replace(/[-_]+/g, ' ').trim()
    return normalized || value
  } catch {
    return value
  }
}

export function companyNameRejection(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return 'Saisis le nom de l’entreprise à analyser.'
  if (value.includes('?')) {
    return 'On dirait une question. Saisis seulement le nom de l’entreprise — le copilote répond aux questions.'
  }
  if (value.length > COMPANY_NAME_MAX_CHARS) {
    return `Ce nom fait ${value.length} caractères. Saisis seulement la raison sociale.`
  }
  if (value.split(/\s+/).length > COMPANY_NAME_MAX_WORDS) {
    return 'On dirait une phrase. Saisis seulement le nom de l’entreprise — le copilote répond aux questions.'
  }
  return null
}

/** Bornes du nom d'entreprise. Hautes à dessein : elles attrapent une phrase,
 *  jamais une raison sociale, fût-elle interminable. */
export const COMPANY_NAME_MAX_CHARS = 120
export const COMPANY_NAME_MAX_WORDS = 12

export const startAnalysisSchema = z.object({
  company_name: z
    .string()
    // #2149.17 — une URL collée ici est une cible admissible : réduite à son
    // nom cherchable AVANT le garde-fou, pour qu'elle passe par le même
    // registre qu'un nom tapé, jamais par un débit sur une requête que
    // Pappers ne résoudra jamais telle quelle.
    .transform(value => normalizeCompanyTarget(value.trim()))
    .superRefine((value, ctx) => {
      const rejection = companyNameRejection(value)
      if (rejection) ctx.addIssue({ code: z.ZodIssueCode.custom, message: rejection })
    }),
  user_context: analysisContextSchema.optional(),
  profile_data: z.record(z.string(), z.unknown()).optional(),
  // #3623 — les documents que l'auteur a joints à CETTE analyse (ingérés en `personal` avant le
  // lancement). Le serveur les rattache au compte AVANT la mise en file : aucune fenêtre où une autre
  // analyse de l'auteur les lirait. Absent ⇒ lancement inchangé.
  attachment_document_ids: z.array(z.string().guid()).max(50).optional(),
  // Scope lock (Théo p.10) : SIREN de l'entité choisie dans le sélecteur de
  // périmètre. Ancre la recherche sur cette entité au lieu de re-résoudre le nom.
  siren: z
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  // Périmètre d'analyse (Théo p.10/21). Défaut `groupe` côté serveur si absent.
  scope_mode: analysisScopeModeSchema.optional(),
  // Cadrage de la collecte (Théo P0-02 étape 3) : priorités + exclusions saisies
  // à l'écran de confirmation, AVANT le débit. Absent ⇒ run inchangé.
  scope_selection: analysisScopeSelectionSchema.optional(),
  // Marché cible (pays) de CE run — override par analyse du marché workspace
  // (recherche multi-pays #494). ADDITIF : absent ⇒ le serveur retombe sur le
  // marché du workspace (comportement inchangé). Présent ⇒ pilote le run :
  // `FR` = chemin français strictement inchangé (aucun `country` propagé à
  // l'IA), un code non-FR active le country pack correspondant pour CE run —
  // c'est ce qui permet à un workspace FR de lancer une analyse « Apple Inc »
  // (US) depuis la barre de recherche.
  country: workspaceMarketSchema.optional(),
  // Origine « suggestion » (Théo P0 §5 — « une suggestion accélère, elle ne
  // verrouille jamais »). Quand le run démarre depuis un clic sur une suggestion
  // de première analyse, on propage l'ID + la raison de la suggestion UNIQUEMENT
  // pour tracer l'origine du run (télémétrie / debug : « d'où vient ce run ? »).
  // Ils n'influencent NI la société analysée (portée par `company_name`) NI le
  // périmètre : le brouillon reste éditable jusqu'au submit.
  //
  // NB profileSnapshot : on ne transmet DÉLIBÉRÉMENT PAS de snapshot de profil
  // ESN côté client. Le serveur résout le profil ESN server-side (source de
  // vérité unique — voir `esnAnswersToProfileData` / `profile_data`). Envoyer un
  // profil client dupliquerait cette source et risquerait de la désynchroniser ;
  // `suggestion_id` suffit à relier le run à la suggestion qui l'a déclenché.
  suggestion_id: z.string().min(1).max(200).optional(),
  suggestion_reason: z.string().min(1).max(2000).optional(),
  // #3819 (lot RBB) — les critères de Découvrir posés ET satisfaits par la
  // cible : persistés sur le compte, transmis au cadrage du run.
  suggestion_criteria: discoverOriginCriteriaSchema.optional(),
  // Relance EXPLICITE d'un dossier DÉJÀ analysé (compte canonique unique par
  // entreprise). Sans ce drapeau, re-chercher une entreprise déjà `completed`
  // sert le cache résultat (« ouvrir » — ré-affichage rapide, aucun run, aucun
  // crédit). Avec `relaunch: true`, l'utilisateur demande un RAFRAÎCHISSEMENT :
  // le pipeline se ré-exécute EN PLACE sur le MÊME accountId (nouveau
  // AnalysisRun append-only, un crédit consommé) — JAMAIS une 2ᵉ ligne. C'est
  // ce qui distingue « ouvrir » de « relancer » et empêche les comptes
  // parasites. Absent/false = comportement inchangé (cache-hit).
  relaunch: z.boolean().optional(),
  // #2451.1 — le MODE DE CONTEXTE de ce run (Mon activité / Mission ponctuelle /
  // Neutre, `LAURA_CONTEXT_MODES`). ADDITIF : absent ⇒ le serveur applique le
  // défaut de l'espace (`workspaces.default_context_mode`). Un mode qui exclut
  // le profil fait partir le run SANS le lire — jamais « prié de l'ignorer ».
  context_mode: lauraContextModeSchema.optional(),
})

export type StartAnalysis = z.infer<typeof startAnalysisSchema>

/**
 * The dimensions of a completed dossier that can be refreshed on their own
 * (Théo P1 : « Rafraîchir signaux / contacts / entités / stratégie séparément,
 * avec coût/crédits »). Each maps to ONE re-run of a single analysis phase,
 * reusing the STORED outputs of the others — far cheaper than re-running the
 * whole 4-phase pipeline (which re-pays every provider). The first four are the
 * technical PHASES:
 *   - `signals`  → Phase 1 research (buy signals, news, legal, revenue…)
 *   - `contacts` → Phase 2 contact discovery (Apollo)
 *   - `entities` → Phase 3 organigramme / decision chain
 *   - `strategy` → Phase 4 plan (attack angles, action plan, messages)
 *
 * #2318.2 — LAU-FINAL-059 nomme le refresh en vocabulaire PRODUIT plutôt qu'en
 * phase technique (« identité et groupe », « filiales et sites », « postes »,
 * « écosystème », « voie d'achat », « projets »). GA-08 interdit de retirer une
 * valeur d'enum, donc les quatre phases restent : les six noms produit
 * s'AJOUTENT à la fin, chacun aliasant la phase qui produit RÉELLEMENT ce
 * contenu aujourd'hui (voir `AnalysisRefreshService.runDimension`) — un nom
 * plus précis que la phase, jamais une capacité inventée :
 *   - `identity_group` → Phase 1 research (identité/groupe font partie du profil)
 *   - `subsidiaries`   → Phase 3 organigramme (structure filiales/groupe)
 *   - `positions`      → Phase 3 organigramme (postes = decision chain)
 *   - `ecosystem`       → Phase 1 research (écosystème concurrentiel)
 *   - `buying_path`    → Phase 4 plan (voie d'achat = chemin vers la décision)
 *   - `projects`       → Phase 1 research (projets/initiatives en cours)
 *
 * « analyse complète » (le 9ᵉ nom demandé) n'entre PAS dans cet enum : c'est un
 * mécanisme distinct (`relaunch: true`, pipeline entier, crédit d'ANALYSE, pas
 * `targeted_refresh`) — le fusionner ici ferait passer un tarif et une file
 * d'attente différents pour un simple refresh de dimension.
 */
export const refreshDimensionSchema = z.enum([
  'signals',
  'contacts',
  'entities',
  'strategy',
  'identity_group',
  'subsidiaries',
  'positions',
  'ecosystem',
  'buying_path',
  'projects',
])
export type RefreshDimension = z.infer<typeof refreshDimensionSchema>

/** Les quatre phases du pipeline qu'un rafraîchissement d'axe rejoue réellement. */
export type RefreshPhase = 'signals' | 'contacts' | 'entities' | 'strategy'

/**
 * La PHASE que rejoue chaque axe — les six noms produit (#2318.2) sont des
 * alias des quatre phases : même appel on-demand, même fraîcheur, même coût
 * fournisseur.
 *
 * #2650.2 (19/09/2026) — UNE seule source (GA-26) pour les deux lecteurs qui
 * doivent grouper les axes à l'identique : le verrou et la fenêtre de 6 h de
 * `AnalysisRefreshService` (#2650.1 — colonnes `<phase>_refreshed_at` et
 * `<phase>_refresh_lock_at`) et le remboursement des rafraîchissements déjà
 * payés (`selectUndueRefreshDebits`). Un `refresh:ecosystem` pris moins de
 * 6 h après un `refresh:signals` rejoue la MÊME phase déjà payée : le clic
 * le refuse, le remboursement le rend.
 */
export const REFRESH_DIMENSION_PHASE = {
  signals: 'signals',
  contacts: 'contacts',
  entities: 'entities',
  strategy: 'strategy',
  identity_group: 'signals',
  ecosystem: 'signals',
  projects: 'signals',
  subsidiaries: 'entities',
  positions: 'entities',
  buying_path: 'strategy',
} as const satisfies Record<RefreshDimension, RefreshPhase>

/** UI labels for the refresh menu — one per dimension. */
export const REFRESH_DIMENSION_LABELS: Record<RefreshDimension, string> = {
  signals: 'Signaux',
  contacts: 'Contacts',
  entities: 'Entités',
  strategy: 'Stratégie',
  identity_group: 'Identité et groupe',
  subsidiaries: 'Filiales et sites',
  positions: 'Postes',
  ecosystem: 'Écosystème',
  buying_path: "Voie d'achat",
  projects: 'Projets',
}

/**
 * Coût, en crédits, du rafraîchissement d'UNE dimension. Un refresh partiel vaut
 * une FRACTION d'une analyse complète : le pipeline entier réclame un créneau
 * d'analyse, une dimension seule est facturée `targeted_refresh`. La table reste
 * par dimension (et non un scalaire) pour qu'une phase plus lourde — la
 * recherche déploie Brave + Firecrawl + Pappers + Claude — puisse être tarifée
 * au-dessus d'une phase légère SANS toucher aux appelants.
 *
 * ⚠️ **Chaque valeur est DÉRIVÉE, jamais recopiée.** Cette table portait quatre
 * littéraux `1` pendant que le débit côté API retombait, lui, sur le poids de
 * l'ENRICHISSEMENT DE CONTACT (`consumeEnrichmentCredit` sans `cost` explicite).
 * Deux grandeurs distinctes, égales à 1 par coïncidence, et deux chemins pour un
 * seul prix : le jour où l'une bouge, l'écran annonce un chiffre et la caisse en
 * prélève un autre. C'est précisément ce qu'interdit GA-26 — une dérivation vit
 * à un seul endroit. Garde : GA-51 (`analysis.test.ts`), qui LIT cette source et
 * refuse tout prix écrit en dur ici.
 *
 * La fourchette (`creditCostRange('targeted_refresh')` — 1 à 3) n'est pas
 * exploitée : personne n'envoie de `scope` à `POST /analysis/:id/refresh`
 * aujourd'hui, et surtout aucune définition d'« unité de périmètre » n'a été
 * arbitrée pour un refresh. En inventer une ferait soit surfacturer un refresh
 * cadré, soit tripler le prix du refresh courant — une décision de tarif, pas
 * une correction de défaut.
 */
export const REFRESH_DIMENSION_CREDIT_COST: Record<RefreshDimension, number> = {
  signals: creditCostOf('targeted_refresh'),
  contacts: creditCostOf('targeted_refresh'),
  entities: creditCostOf('targeted_refresh'),
  strategy: creditCostOf('targeted_refresh'),
  identity_group: creditCostOf('targeted_refresh'),
  subsidiaries: creditCostOf('targeted_refresh'),
  positions: creditCostOf('targeted_refresh'),
  ecosystem: creditCostOf('targeted_refresh'),
  buying_path: creditCostOf('targeted_refresh'),
  projects: creditCostOf('targeted_refresh'),
}

/**
 * La fenêtre en dessous de laquelle rejouer une dimension ne sert à rien.
 *
 * Six heures, et pas trente jours : le seuil de trente jours protège le
 * LANCEMENT d'une analyse complète, qui repaie tous les fournisseurs. Un refresh
 * de dimension est un geste courant — on rafraîchit les signaux le matin d'un
 * rendez-vous — et le borner à trente jours reviendrait à l'interdire.
 *
 * Ce qu'on empêche est précis : le DOUBLE CLIC. Cliquer « Rafraîchir → Signaux »
 * deux fois de suite débitait deux crédits et rejouait deux fois exactement la
 * même phase, sur des sources qui n'ont pas bougé entre les deux.
 */
export const REFRESH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Cette dimension a-t-elle été rafraîchie trop récemment pour que la rejouer
 * apporte quoi que ce soit ?
 *
 * Pure, et `now` est un paramètre — elle se teste sans horloge.
 *
 * ⚠️ `null` rend `false` : une dimension jamais rafraîchie séparément n'est pas
 * « fraîche », elle est INCONNUE, et refuser un geste sur une date qu'on n'a pas
 * bloquerait tous les dossiers antérieurs à la colonne. Une date illisible fait
 * de même — un refus sur une donnée abîmée est pire qu'un refresh de trop.
 */
export function refreshedTooRecently(
  refreshedAt: Date | string | null | undefined,
  now: Date,
  windowMs: number = REFRESH_MIN_INTERVAL_MS,
): boolean {
  if (!refreshedAt) return false
  const at = refreshedAt instanceof Date ? refreshedAt.getTime() : Date.parse(refreshedAt)
  if (!Number.isFinite(at)) return false
  const elapsed = now.getTime() - at
  // Une date dans le FUTUR (horloge décalée, import) ne bloque pas non plus :
  // elle ne prouve pas une fraîcheur, elle prouve une horloge.
  if (elapsed < 0) return false
  return elapsed < windowMs
}

/** Request body of `POST /analysis/:accountId/refresh` — refresh ONE dimension.
 *  Consumed as the `RefreshAnalysisDto` (nestjs-zod) on the API side; the web
 *  client sends `{ dimension }` directly, so no inferred type is exported. */
export const refreshAnalysisSchema = z.object({
  dimension: refreshDimensionSchema,
  /**
   * Cadrage du refresh (recette finale §58, P1-04 : « rerun partiel par entité,
   * famille, niveau, techno et pays »).
   *
   * Le refresh rejouait toujours la dimension ENTIÈRE. Sur un groupe de la
   * taille de Société Générale, actualiser les contacts revenait à re-balayer
   * quatre-vingt-dix-huit entités pour en corriger une — cher, lent, et le
   * résultat noyait la correction attendue dans du bruit inchangé.
   *
   * Réutilise le cadrage du lancement plutôt que d'inventer un second
   * vocabulaire : « périmètre France, famille Data, niveau N-2 » veut dire la
   * même chose au lancement et au refresh, et deux formes divergeraient.
   * Absent ⇒ refresh complet de la dimension, comme avant.
   */
  scope: analysisScopeSelectionSchema.optional(),
})

/**
 * The ESN profile the IA prompts (`bellum_strategy`, `bellum_plan`,
 * `bellum_organigramme`) read to tailor strategy to the seller — offers,
 * target sectors, size, geo. It is the `profile_data` payload the analysis
 * pipeline forwards untouched to the IA service. A type alias (not an
 * interface) so it stays assignable to `Record<string, unknown>` at the
 * BullMQ job / IA boundary.
 *
 * `personas`, `avgTJM`, `salesCycle`, `references` and `noGoSectors` were long
 * absent — the prompts read them but nothing collected them, so they rendered
 * as `N/A`. They now come from the Temps-2 complement
 * ({@link TEMPS2_ANSWER_KEYS}), asked once the seller has seen a first dossier.
 * Unanswered stays absent (the historical `N/A` fallback), never invented.
 */
/**
 * #2118.9 — une BU / agence portée par le commercial, telle que le moteur la
 * lit : son nom, son échelle, et ce qu'elle déclare (territoire, spécialités).
 * Un champ non déclaré est ABSENT, jamais une chaîne vide.
 */
export type AnalysisBusinessUnit = {
  name: string
  kind: BusinessUnitKind
  territory?: string
  specialties?: string[]
}

export type AnalysisProfileData = {
  companyName?: string
  size?: string
  salesTeamSize?: string
  offers?: string[]
  sectors?: string[]
  geoZone?: string
  mainChallenge?: string
  // Fuller ESN positioning the strategy/plan prompts now condition on, so the
  // dossier reflects "le profil complet, pas seulement expertises/secteurs".
  positioning?: string
  targetCompanyTypes?: string[]
  staffingModel?: string
  // Domaine d'offre (PDF6 §1) — drives the IA offer-domain pack lens. Absent
  // or `esn_it` = the historical prompts, byte-identical (IA goldens).
  offerDomain?: OfferDomain
  /**
   * L'ESN place aussi des profils EN CDI chez ses clients (#1124).
   *
   * Émis SEULEMENT quand la réponse vaut `true` : absent = comportement
   * d'avant, à l'octet près. Conséquence unique côté IA — les offres d'emploi
   * d'un compte cessent d'être filtrées aux rôles IT, parce que pour un
   * placeur toute ouverture de poste est une piste.
   */
  recruitsForClients?: true
  /**
   * #3901 — les métiers que l'espace place réellement (`esn_profiles.placed_roles`,
   * #3923.a), tels que déclarés. Côté IA, ils jugent avec le domaine d'offre la
   * pertinence des offres d'emploi d'un compte (`offer_relevant_to_profile`).
   * Absent quand rien n'est déclaré — jamais une liste inventée.
   */
  placedRoles?: string[]
  /**
   * Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026,
   * `placed-roles-inference.ts`) — présents SEULEMENT quand rien n'est déclaré
   * (`placedRoles` absent) : le déclaré gagne toujours. Côté IA, ils ÉLARGISSENT
   * ce qui remonte et passent en tête, ils ne retirent jamais une offre.
   */
  inferredPlacedRoles?: { role: string; terms: string[] }[]
  // Portefeuille de domaines (DATAFORGE V10) — les codes des 66 domaines de
  // conseil. Quand il est non vide, `offerDomain` porte le pack DOMINANT
  // (déterministe, `dominantOfferDomain`) et `offerPortfolioNames` les libellés
  // FRANÇAIS que le prisme énumère. Vide/absent = comportement historique.
  offerPortfolio?: string[]
  offerPortfolioNames?: string[]
  /**
   * Ce que le PORTEFEUILLE d'offre ajoute au prisme (addendum Stelya §17.1) :
   * les secteurs d'application visés, la politique de site et le lexique de
   * l'espace. Absent quand aucun portefeuille n'est enregistré — et c'est le
   * cas de tous les espaces existants, dont les prompts restent alors
   * byte-identiques.
   *
   * Un seul objet plutôt que six clés à plat : il est construit UNE fois
   * (`portfolioContextFor`) et injecté tel quel, pour que huit prompts ne
   * dérivent pas chacun leur version de la même vérité.
   */
  offerPortfolioContext?: {
    /** Libellés FR des secteurs d'application — vide = aucun ciblage déclaré. */
    applicationSectors?: string[]
    /** Types de site visés, dans le vocabulaire que l'IA produit déjà. */
    siteTypes?: string[]
    /** Effectif minimum SUR SITE. Absent = aucun seuil, jamais `0`. */
    siteMinHeadcount?: number
    /** Zones de chasse déclarées. */
    geographies?: string[]
    /** Le lexique de l'espace, appliqué aux textes GÉNÉRÉS. */
    preferredTerms?: string[]
    forbiddenTerms?: string[]
  }
  // Temps-2 complement. Each one is printed by at least one prompt; see
  // `TEMPS2_ANSWER_KEYS` for the exact consumer list.
  personas?: string[]
  salesCycle?: string
  avgTJM?: string
  references?: string[]
  noGoSectors?: string[]
  /* ---------------------------------------------------------------------- */
  /*  Profil progressif (§21-30). Chacun est LU quelque part — sinon on ne   */
  /*  poserait pas la question :                                            */
  /*   · `sellerRole` / `sellerGoal` / `proactivity` → ton et niveau de      */
  /*     conseil du copilote et du plan (§12 « le profil modifie ses         */
  /*     conseils et son ton ») ;                                           */
  /*   · `dealSize` / `targetMargin` / `rampUpCapacity` → qualification      */
  /*     économique (un compte hors panier n'est pas une opportunité) ;      */
  /*   · `accountsRelationshipStatus` → cadence et registre des messages ;   */
  /*   · `goToMarketChannels` → portes d'entrée (direct vs rang 2) ;         */
  /*   · `salesBlockers` → ce que le plan doit lever en priorité.            */
  /* ---------------------------------------------------------------------- */
  sellerRole?: string
  /**
   * #2032.10 — les fonctions réellement EXERCÉES sur le parcours, en plus du
   * rôle actuel (`sellerRole`). Adapte le VOCABULAIRE et le niveau
   * d'explication du copilote (§12), exactement comme `sellerRole`.
   * ⚠️ #2032.15 : ne devient JAMAIS un poids dans un calcul — vérifié par
   * `apps/api/src/architecture/declarative-fields-do-not-score.spec.ts`
   * (GA-338), qui interdit ce champ à tout moteur de notation.
   */
  sellerFunctionsPracticed?: string[]
  /**
   * #1920.12 — l'ancienneté DANS LE POSTE, jamais celle dans l'espace : une
   * date d'entrée dans l'espace ferait passer un fondateur qui vient d'ouvrir
   * Bellum pour un « nouvel arrivant » le jour même. Déclarative, comme le
   * reste de ce bloc — jamais dérivée d'une date système.
   */
  roleTenure?: string
  sellerGoal?: string
  monthlyTarget?: string
  /**
   * #2052 — les objectifs commerciaux NOMMÉS (`esn_objectives`), en
   * remplacement du champ unique `monthlyTarget` (conservé ci-dessus,
   * add-only). `build_analysis_user_prompt` (`apps/ia/app/prompts/bellum_rfp.py`)
   * sérialise TOUT `profile_data` : cette clé y arrive donc sans code Python
   * supplémentaire, dès qu'`esnAnswersToProfileData` la peuple plus bas.
   */
  objectives?: EsnObjective[]
  proactivity?: string
  rampUpCapacity?: string
  /**
   * #2118.15 — la capacité DISPONIBLE, pas l'effectif : consultants réellement
   * en mission et vivier actif. `size` dit combien l'ESN compte de consultants,
   * rien de ce qui est libre. Une tranche déclarée `'0'` est une réponse VRAIE
   * (aucun vivier) et reste émise ; une question passée ne produit aucune clé.
   */
  consultantsOnMission?: string
  consultantsInPipe?: string
  /** #2015.7 — la filiation déclarée (groupe / filiale / indépendante) :
   *  `establishment_count` (prefill) ne le dit pas. */
  companyGroupStructure?: string
  dealSize?: string
  /**
   * #2053.3 — le coût MENSUEL de l'intercontrat, DISTINCT de
   * `availableConsultantsBand` (un effectif, jamais un coût — voir le
   * commentaire de ce champ plus bas). Un montant, jamais un pourcentage :
   * un pourcentage exigerait un dénominateur (coût du banc) qu'on n'a pas —
   * l'extrapolation que #2053.8 interdit.
   */
  intercontratCost?: string
  targetMargin?: string
  /**
   * #2053.4 — la visibilité DÉCLARÉE sur le délai d'encaissement (le suit-il,
   * et où). Nomme l'écran EXISTANT (`/missions/encaissements`,
   * `modules/factoring`) plutôt que d'en ouvrir un second (GA-26).
   */
  paymentDelayVisibility?: string
  /**
   * #2053.4 — le délai d'encaissement moyen DÉCLARÉ, en bande. N'existe QUE
   * quand `paymentDelayVisibility` dit qu'il est suivi quelque part
   * (`tracksPaymentDelay`, `profile-questionnaire.ts`) : jamais une bande
   * chiffrée forcée sur une absence (#2027, #2053.8).
   */
  paymentDelayBand?: string
  portfolioSize?: string
  accountsRelationshipStatus?: string
  goToMarketChannels?: string[]
  salesBlockers?: string[]
  /**
   * #2035.5 — l'intercontrat déclaré. Colonne et lecteur IA
   * (`sales_context.py::_bench_band`, bandes bas/moyen/haut) déjà en place
   * depuis la migration 1780000000000 ; seule la question manquait (lot L15).
   */
  availableConsultantsBand?: string
  /* ---------------------------------------------------------------------- */
  /*  #2034 / #2035 — maturité, santé d'activité, effectif réel.             */
  /*                                                                        */
  /*  Les six réponses que le questionnaire posait, écrivait et relisait     */
  /*  sans qu'AUCUN dossier ne les voie : le mapping canonique s'arrêtait à  */
  /*  `availableConsultantsBand`. Elles entrent ici, donc dans le profil ESN */
  /*  que l'analyse d'appel d'offres lit intégralement (`bellum_rfp.py` —    */
  /*  `build_analysis_user_prompt` sérialise tout `profile_data`), appelé    */
  /*  par `apps/api/src/modules/rfp/rfp.service.ts:102`.                     */
  /*                                                                        */
  /*  ⚠️ Ce qu'elles n'atteignent PAS encore : les blocs de profil À LISTE   */
  /*  FERMÉE des autres prompts — `_COMPLEMENT_SECTIONS`                     */
  /*  (`apps/ia/app/prompts/bellum_profiler.py:78-123`), `_PROFILE_FIELDS`   */
  /*  (`bellum_discover.py:39-49`) et le bloc « le commercial à qui tu       */
  /*  parles » (`bellum_advisor.py:1031-1040`) énumèrent leurs clés une par  */
  /*  une. Les y ajouter est une ligne par liste — hors du périmètre du lot  */
  /*  qui a posé ce mapping (les fichiers de prompt appartiennent à un autre */
  /*  lot, et changent les empreintes de prompt). Tant que ce n'est pas      */
  /*  fait, les textes de conséquence du questionnaire                       */
  /*  (`question-consequences.ts`) restent modestes : ils DISENT « situe /   */
  /*  note / enregistre », et c'est exactement ce que le code tient.         */
  /* ---------------------------------------------------------------------- */
  esnMaturitySituation?: string
  companyGrowthGoal?: string
  activeClientsBand?: string
  revenueRecurrence?: string
  clientConcentrationRisk?: string
  consultantsManagedByUserBand?: string
  /**
   * D9 (décision Louis 14/09/2026, valider le contexte commercial) — l'ISO du
   * moment où l'utilisateur a validé son contexte de profil
   * (`POST /profile-context/validate`). Absent tant que rien n'a été validé,
   * ou dès qu'une réédition des réponses a retiré la validation
   * (`ProfileContextService.triggerGeneration`) : ce n'est PAS lu tel quel
   * depuis la colonne, c'est gaté sur `profile_context_status === 'validated'`
   * côté résolveur — un horodatage fantôme mentirait sur ce qui vient de se
   * passer. Seul consommateur à ce jour : `bellum_advisor.py` (le commercial
   * à qui Laura parle), pour qu'elle cite le contexte comme validé.
   */
  profileContextValidatedAt?: string
  /**
   * #2118.16 — la stratégie d'entrée qui fait foi, résolue UNE fois par
   * `effectiveEntryStrategy` (la choisie à l'audit, sinon la calculée par le
   * profileur). Absente = aucune stratégie connue : aucune clé, jamais une
   * stratégie par défaut. Lue par la section `evaluation` de la phase 4
   * (`bellum_plan.py::seller_scope_directive_block`) : le verdict la CITE.
   * ⚠️ Déclarative — jamais un poids dans une note (GA-338).
   */
  entryStrategy?: EntryStrategy
  /**
   * #2118.9 — les BU / agences que le commercial PORTE dans son espace actif
   * (`business_unit_members` × `business_units`, statut actif). La dimension
   * existe depuis #2005.3 ; elle n'atteignait aucun prompt. Absente = aucun
   * périmètre porté, jamais un périmètre deviné. Même lecteur, même règle que
   * {@link entryStrategy}.
   */
  businessUnits?: AnalysisBusinessUnit[]
  /* ---------------------------------------------------------------------- */
  /*  Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,    */
  /*  secteurs référencés, crédibilité et modes de réponse au besoin.        */
  /* ---------------------------------------------------------------------- */
  /** Types de prestation DISPONIBLES (#2038.2-.11) — axe neuf, à côté de
   *  `positioning` qu'il ne remplace pas. */
  serviceTypes?: string[]
  /** Sous-ensemble PROUVÉ de `serviceTypes` — déjà vendu (#2038.12/.14). */
  serviceTypesProven?: string[]
  /**
   * #2038.13/.14/.15 — l'AMBITION : des types PAS encore proposés. Un champ à
   * part, jamais fusionné avec `serviceTypesProven` : une ambition n'est
   * jamais une référence ni une preuve.
   */
  serviceTypesDesired?: string[]
  /** #2041.2 — parmi les secteurs visés (`sectors`), ceux où une référence
   *  RÉELLE existe (mission en cours ou passée). */
  referenceSectors?: string[]
  /** #3476 — les comptes de référence NOMMÉS (un nom par entrée), lus par le résolveur de territoire de Laura. */
  referenceAccounts?: string[]
  caseStudyResults?: string[]
  clientTestimonials?: string[]
  /** #2040.3-.6 — le pendant multi de `staffingModel` (mode dominant) : tous
   *  les modes réellement cumulés. */
  staffingModes?: string[]
  profileValidationMethods?: string[]
  contractualConstraints?: string[]
  /**
   * #2039.6 (épopée #2880, tranché sans Louis) — expertises déclarées SANS
   * encore de preuve concrète (« simple volonté de développement »). Projetée
   * ici, posée par le questionnaire — aucun prompt ne la relit encore
   * (`onboarding-question-consumers.ts`, `areas: []`).
   */
  expertiseWithoutConcreteProof?: string[]
  /**
   * #2039.2 (épopée #2880, tranché sans Louis) — expertises déclarées qui
   * reposent sur une référence client. Même règle que sa voisine ci-dessus :
   * projetée ici, posée par le questionnaire, aucun prompt ne la relit encore
   * (`onboarding-question-consumers.ts`, `areas: []`).
   */
  expertiseWithClientReference?: string[]
  /**
   * #2039.3 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur l'expérience personnelle. Même règle que ses voisines
   * ci-dessus : projetée ici, posée par le questionnaire, aucun prompt ne la
   * relit encore (`onboarding-question-consumers.ts`, `areas: []`).
   */
  expertiseWithPersonalExperience?: string[]
  /**
   * #2039.4 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur un partenaire. Même règle que ses voisines.
   */
  expertiseWithPartner?: string[]
  /**
   * #2039.5 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur un vivier disponible. Même règle que ses voisines.
   */
  expertiseWithTalentPool?: string[]
  /* ---------------------------------------------------------------------- */
  /*  #2056 — appels d'offres (bloc AO, `pursuesRfps`).                      */
  /* ---------------------------------------------------------------------- */
  rfpPlatformsUsed?: string[]
  rfpReferencingStatus?: string
  rfpLotAllocation?: string
  rfpResponseTemplates?: string
  rfpVolume?: string
  rfpVolumePeriod?: string
  rfpOutcomes?: string[]
  rfpGoNoGoProcess?: string
  /** #2056.13 — lu aussi par `RfpService` (`rfpDocumentationIsReady`) pour
   *  l'axe « capacité » de {@link RfpActionabilityAssessment}. */
  rfpDocumentReadiness?: string
  /** #2056.11 — un MONTANT nommé, jamais un taux. Lu aussi par `RfpService`
   *  pour l'axe « économie » de {@link RfpActionabilityAssessment}. */
  rfpDealValue?: string
  /** #2057.10 — existe-t-il un porteur nommé sur chaque dossier ? Lu aussi
   *  par `RfpService` pour l'axe « responsable » de
   *  {@link RfpActionabilityAssessment}. */
  rfpOwnerAssignment?: string
  /* ---------------------------------------------------------------------- */
  /*  #2057 — contenu (bloc contenu, `doesContentMarketing`).                */
  /* ---------------------------------------------------------------------- */
  contentActiveProfile?: string[]
  contentAudienceSize?: string
  contentVisibleExpertise?: string[]
  contentReactions?: string
  contentConversationsGenerated?: string
  contentFunnelStagesReached?: string[]
  /**
   * #2057.14 — la recommandation qui refuse : « pas de contenu si la
   * prospection de base ne tient pas ». Calculée par
   * `recommendContentInvestment`, jamais recopiée (GA-26) ; absente tant que
   * le bloc contenu n'a produit AUCUN signal (ni prospection déclarée, ni
   * étape de contenu cochée) — même règle de silence que le reste de ce type.
   */
  contentRecommendation?: string
  /* ---------------------------------------------------------------------- */
  /*  #2033.5-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité    */
  /*  DÉCLARÉ sur quatre axes. Lu par `laura_authority_scope.py`             */
  /*  (`build_authority_scope_block`) pour cadrer ce que Laura PROPOSE —      */
  /*  jamais par un guard : `workspace-permission.guard.ts` reste la SEULE   */
  /*  autorité sur ce qui est AUTORISÉ (GA-26). Chacune persiste l'une des   */
  /*  trois valeurs de `AUTHORITY_SCALE_CHOICES` (`authority-scope.ts`), ou  */
  /*  est absente — jamais devinée depuis `sellerRole`.                      */
  /* ---------------------------------------------------------------------- */
  recruitmentAccountsAuthority?: string
  staffingAuthority?: string
  marginBillingAuthority?: string
  inviteAuthority?: string
  /**
   * #2304.26 (épopée #2932, LAU-FINAL-045) — le temps hebdomadaire PROTÉGÉ pour
   * la prospection (`weekly_sales_time_protected`, #2050, existait déjà en
   * base et au contrat d'onboarding, mais n'atteignait jamais le profil que
   * lisent les prompts de plan/stratégie — branchement absent, pas une
   * colonne à créer). Bande déclarée (ex. « 2 à 5 heures par semaine »),
   * jamais un nombre dérivé ici.
   */
  weeklySalesTimeProtected?: string
  /**
   * #2304.23 (épopée #2932, LAU-FINAL-045) — le réseau personnel DÉCLARÉ de
   * l'ESN (#2045, `answers-reseau.ts`) : quatre bandes déjà en base et déjà
   * lues par `bellum_profiler.py`, jamais mappées vers CE profil — même
   * branchement absent que `weeklySalesTimeProtected` ci-dessus, aucune
   * nouvelle colonne.
   */
  formerClientsCountBand?: string
  formerColleaguesCountBand?: string
  partnersCountBand?: string
  referrersCountBand?: string
}

/**
 * Maps a stored ESN onboarding questionnaire ({@link EsnAnswers}) to the
 * {@link AnalysisProfileData} the analysis pipeline feeds the IA prompts.
 * This is the single canonical translation of the field-name mismatch
 * (`expertise_areas`→`offers`, `target_sectors`→`sectors`, `geo_zones`→`geoZone`,
 * `main_sales_pain`→`mainChallenge`, …).
 *
 * Empty strings and empty arrays are dropped, so an unanswered questionnaire
 * yields `{}` — a deliberate "profile-neutral" run rather than a wall of `N/A`.
 * `positioning`, `target_company_types` and `staffing_model` are mapped too
 * (→ `positioning`, `targetCompanyTypes`, `staffingModel`) and consumed by the
 * strategy/plan prompts so the dossier reflects the fuller ESN profile.
 */
/**
 * Ce que le portefeuille d'offre ajoute au prisme — construit UNE fois.
 *
 * Rien n'est rendu quand il n'y a rien à dire : un objet de listes vides
 * ferait apparaître dans huit prompts un bloc « secteurs visés : (aucun) », que
 * le modèle lirait comme une contrainte alors qu'il signifie l'absence de
 * contrainte.
 */
export function portfolioContextFor(
  portfolio: OfferPortfolio | null | undefined,
): AnalysisProfileData['offerPortfolioContext'] {
  if (!portfolio) return undefined
  const context: NonNullable<AnalysisProfileData['offerPortfolioContext']> = {}
  const sectors = applicationSectorNamesFr(portfolio.target_application_sectors)
  if (sectors.length) context.applicationSectors = sectors
  if (portfolio.target_site.types.length) context.siteTypes = [...portfolio.target_site.types]
  // `null` (aucun seuil) reste ABSENT : un `0` se lirait « sites de zéro personne ».
  if (portfolio.target_site.min_headcount !== null) context.siteMinHeadcount = portfolio.target_site.min_headcount
  if (portfolio.target_geographies.length) context.geographies = [...portfolio.target_geographies]
  if (portfolio.preferred_terms.length) context.preferredTerms = [...portfolio.preferred_terms]
  if (portfolio.forbidden_terms.length) context.forbiddenTerms = [...portfolio.forbidden_terms]
  return Object.keys(context).length ? context : undefined
}

export function esnAnswersToProfileData(
  answers: EsnAnswers,
  /** Le portefeuille d'offre de l'espace, quand il en a un. Paramètre à part et
   *  non champ de `answers` : c'est une CONFIGURATION, pas une réponse de
   *  questionnaire — et les mêler ferait porter au parcours d'onboarding des
   *  réglages qui s'éditent une fois par an. */
  portfolio?: OfferPortfolio | null,
): AnalysisProfileData {
  const out: AnalysisProfileData = {}
  const text = (v: string | null | undefined): string | undefined => {
    const t = v?.trim()
    return t ? t : undefined
  }

  const companyName = text(answers.esn_name)
  if (companyName) out.companyName = companyName

  const size = text(answers.consultant_size)
  if (size) out.size = size

  const salesTeamSize = text(answers.sales_team_size)
  if (salesTeamSize) out.salesTeamSize = salesTeamSize

  if (answers.expertise_areas.length > 0) out.offers = answers.expertise_areas
  if (answers.target_sectors.length > 0) out.sectors = answers.target_sectors
  if (answers.geo_zones.length > 0) out.geoZone = answers.geo_zones.join(', ')

  const mainChallenge = text(answers.main_sales_pain)
  if (mainChallenge) out.mainChallenge = mainChallenge

  const positioning = text(answers.positioning)
  if (positioning) out.positioning = positioning

  if (answers.target_company_types.length > 0) out.targetCompanyTypes = answers.target_company_types

  const staffingModel = text(answers.staffing_model)
  if (staffingModel) out.staffingModel = staffingModel

  // Faithful mapping (like every other field): an explicit `esn_it` flows
  // through and resolves IA-side to the byte-identical default lens; null is
  // dropped (profile-neutral run).
  if (answers.offer_domain) out.offerDomain = answers.offer_domain

  // Portefeuille de domaines (DATAFORGE V10) : quand il existe, il PRIME sur
  // l'ancien champ singulier — c'est la réponse la plus riche et la plus
  // récente. Le pack dominant est déterministe ; les libellés français sont ce
  // que le prisme de prompts énumère. Un portefeuille entièrement inconnu de ce
  // build (skew) ne rend AUCUN pack et laisse `offerDomain` tel quel.
  if (answers.offer_domains?.length) {
    out.offerPortfolio = [...answers.offer_domains]
    out.offerPortfolioNames = consultingDomainNamesFr(answers.offer_domains)
    const dominant = dominantOfferDomain(answers.offer_domains)
    if (dominant) out.offerDomain = dominant
  }

  // Temps-2 complement — same drop-if-empty rule, so a seller who never
  // answered it gets exactly the historical payload.
  // Le portefeuille d'offre, quand l'espace en a un. Absent = prompts
  // byte-identiques (tous les espaces existants sont dans ce cas).
  const portfolioContext = portfolioContextFor(portfolio)
  if (portfolioContext) out.offerPortfolioContext = portfolioContext

  // #1124 — le placement en CDI chez le client. Booléen déclaré, pas déduit :
  // aucune autre réponse ne dit ce mode de vente (`offer_domains` parle de
  // conseil, `positioning` de largeur de spécialisation). Seul `true` produit
  // une clé : `false` et `null` laissent le payload historique intact, et le
  // service IA ne peut donc pas distinguer `no` d'une absence de réponse — ce
  // qui est exactement la bonne lecture, les deux voulant dire « ne change
  // rien ».
  if (placesProfilesForClients(answers.recruits_for_clients)) out.recruitsForClients = true

  // #3901 — les métiers placés voyagent jusqu'à l'analyse ; liste vide ⇒ aucune clé.
  if (answers.placed_roles?.length) out.placedRoles = [...answers.placed_roles]

  if (answers.decision_maker_personas?.length) out.personas = answers.decision_maker_personas

  const salesCycle = text(answers.avg_sales_cycle)
  if (salesCycle) out.salesCycle = salesCycle

  const avgTjm = text(answers.avg_tjm)
  if (avgTjm) out.avgTJM = avgTjm

  if (answers.client_references?.length) out.references = answers.client_references
  if (answers.no_go_sectors?.length) out.noGoSectors = answers.no_go_sectors

  // Profil progressif — même règle de silence : un champ non répondu ne produit
  // AUCUNE clé, donc un vendeur qui n'a rien rempli obtient le payload
  // historique au byte près.
  const sellerRole = text(answers.user_role)
  if (sellerRole) out.sellerRole = sellerRole

  // #2032.10 — même règle de silence : absent, aucune clé.
  if (answers.role_functions_practiced?.length) out.sellerFunctionsPracticed = answers.role_functions_practiced

  // #1920.12 — l'ancienneté dans le poste : collectée (`profile-questionnaire.ts:102`),
  // écrite en base, jamais mappée vers le profil que lit le copilote.
  const roleTenure = text(answers.role_tenure)
  if (roleTenure) out.roleTenure = roleTenure

  const sellerGoal = text(answers.individual_goal)
  if (sellerGoal) out.sellerGoal = sellerGoal

  const monthlyTarget = text(answers.monthly_target)
  if (monthlyTarget) out.monthlyTarget = monthlyTarget

  // #2052 — les objectifs NOMMÉS. Même règle de silence que le reste : aucun
  // objectif déclaré ne produit aucune clé, plutôt qu'un tableau vide qui se
  // lirait « aucun objectif » côté prompt.
  if (answers.esn_objectives?.length) out.objectives = answers.esn_objectives

  const proactivity = text(answers.proactivity_level)
  if (proactivity) out.proactivity = proactivity

  const rampUp = text(answers.ramp_up_capacity)
  if (rampUp) out.rampUpCapacity = rampUp

  // #2118.15 — capacité disponible (voir le champ). `text` garde `'0'` : c'est
  // une tranche déclarée, pas une absence.
  const onMission = text(answers.consultants_on_mission)
  if (onMission) out.consultantsOnMission = onMission

  const inPipe = text(answers.consultants_in_pipe)
  if (inPipe) out.consultantsInPipe = inPipe

  // #2015.7 — même règle de silence : un champ non répondu ne produit AUCUNE
  // clé.
  const groupStructure = text(answers.company_group_structure)
  if (groupStructure) out.companyGroupStructure = groupStructure

  // #2035.5 — wire la colonne/lecteur IA déjà en place, voir le commentaire du champ.
  const availableConsultants = text(answers.available_consultants_band)
  if (availableConsultants) out.availableConsultantsBand = availableConsultants

  // #2034 / #2035 — les six autres réponses de maturité / santé d'activité /
  // effectif réel. Elles étaient posées, écrites et relues, et s'arrêtaient
  // ici : personne ne les faisait entrer dans un dossier. Même règle de
  // silence que tout le reste — une question passée ne produit aucune clé.
  const maturitySituation = text(answers.esn_maturity_situation)
  if (maturitySituation) out.esnMaturitySituation = maturitySituation

  const growthGoal = text(answers.company_growth_goal)
  if (growthGoal) out.companyGrowthGoal = growthGoal

  const activeClients = text(answers.active_clients_band)
  if (activeClients) out.activeClientsBand = activeClients

  const recurrence = text(answers.revenue_recurrence)
  if (recurrence) out.revenueRecurrence = recurrence

  const concentration = text(answers.client_concentration_risk)
  if (concentration) out.clientConcentrationRisk = concentration

  const managedConsultants = text(answers.consultants_managed_by_user_band)
  if (managedConsultants) out.consultantsManagedByUserBand = managedConsultants

  const dealSize = text(answers.avg_deal_size)
  if (dealSize) out.dealSize = dealSize

  // #2053.3 — même règle de silence que tout le reste : un coût d'intercontrat
  // non déclaré ne produit AUCUNE clé, jamais un `0` ni une moyenne inventée
  // (#2053.8, GA-18/GA-19).
  const intercontratCost = text(answers.intercontrat_cost)
  if (intercontratCost) out.intercontratCost = intercontratCost

  const margin = text(answers.target_margin)
  if (margin) out.targetMargin = margin

  // #2053.4 — la visibilité déclarée, puis le délai lui-même. Même règle de
  // silence : ni l'un ni l'autre ne produit de clé quand ils sont absents.
  const paymentDelayVisibility = text(answers.payment_delay_visibility)
  if (paymentDelayVisibility) out.paymentDelayVisibility = paymentDelayVisibility

  const paymentDelayBand = text(answers.payment_delay_band)
  if (paymentDelayBand) out.paymentDelayBand = paymentDelayBand

  const portfolioSize = text(answers.portfolio_size)
  if (portfolioSize) out.portfolioSize = portfolioSize

  const relationship = text(answers.accounts_relationship_status)
  if (relationship) out.accountsRelationshipStatus = relationship

  if (answers.go_to_market_channels?.length) out.goToMarketChannels = answers.go_to_market_channels
  if (answers.sales_blockers?.length) out.salesBlockers = answers.sales_blockers

  // Lot 26 (#2038, #2039, #2040, #2041) — même règle de silence : un champ
  // non répondu ne produit AUCUNE clé.
  if (answers.service_types?.length) out.serviceTypes = answers.service_types
  // #2038.15 — l'ambition n'est jamais une référence ni une preuve : deux
  // lignes séparées, jamais une seule qui les fusionnerait.
  if (answers.service_types_proven?.length) out.serviceTypesProven = answers.service_types_proven
  if (answers.service_types_desired?.length) out.serviceTypesDesired = answers.service_types_desired
  if (answers.reference_sectors?.length) out.referenceSectors = answers.reference_sectors
  if (answers.reference_accounts?.length) out.referenceAccounts = answers.reference_accounts
  if (answers.case_study_results?.length) out.caseStudyResults = answers.case_study_results
  if (answers.client_testimonials?.length) out.clientTestimonials = answers.client_testimonials
  if (answers.staffing_modes?.length) out.staffingModes = answers.staffing_modes
  if (answers.profile_validation_methods?.length) out.profileValidationMethods = answers.profile_validation_methods
  if (answers.contractual_constraints?.length) out.contractualConstraints = answers.contractual_constraints
  if (answers.expertise_no_concrete_proof?.length)
    out.expertiseWithoutConcreteProof = answers.expertise_no_concrete_proof
  if (answers.expertise_client_reference?.length) out.expertiseWithClientReference = answers.expertise_client_reference
  if (answers.expertise_personal_experience?.length)
    out.expertiseWithPersonalExperience = answers.expertise_personal_experience
  if (answers.expertise_partner?.length) out.expertiseWithPartner = answers.expertise_partner
  if (answers.expertise_talent_pool?.length) out.expertiseWithTalentPool = answers.expertise_talent_pool

  // #2056 — appels d'offres. Même règle de silence : un champ non répondu ne
  // produit AUCUNE clé.
  if (answers.rfp_platforms_used?.length) out.rfpPlatformsUsed = answers.rfp_platforms_used
  const rfpReferencingStatus = text(answers.rfp_referencing_status)
  if (rfpReferencingStatus) out.rfpReferencingStatus = rfpReferencingStatus
  const rfpLotAllocation = text(answers.rfp_lot_allocation)
  if (rfpLotAllocation) out.rfpLotAllocation = rfpLotAllocation
  const rfpResponseTemplates = text(answers.rfp_response_templates)
  if (rfpResponseTemplates) out.rfpResponseTemplates = rfpResponseTemplates
  const rfpVolume = text(answers.rfp_volume)
  if (rfpVolume) out.rfpVolume = rfpVolume
  const rfpVolumePeriod = text(answers.rfp_volume_period)
  if (rfpVolumePeriod) out.rfpVolumePeriod = rfpVolumePeriod
  if (answers.rfp_outcomes?.length) out.rfpOutcomes = answers.rfp_outcomes
  const rfpGoNoGoProcess = text(answers.rfp_go_no_go_process)
  if (rfpGoNoGoProcess) out.rfpGoNoGoProcess = rfpGoNoGoProcess
  const rfpDocumentReadiness = text(answers.rfp_document_readiness)
  if (rfpDocumentReadiness) out.rfpDocumentReadiness = rfpDocumentReadiness
  const rfpDealValue = text(answers.rfp_deal_value)
  if (rfpDealValue) out.rfpDealValue = rfpDealValue
  const rfpOwnerAssignment = text(answers.rfp_owner_assignment)
  if (rfpOwnerAssignment) out.rfpOwnerAssignment = rfpOwnerAssignment

  // #2057 — contenu.
  if (answers.content_active_profile?.length) out.contentActiveProfile = answers.content_active_profile
  const contentAudienceSize = text(answers.content_audience_size)
  if (contentAudienceSize) out.contentAudienceSize = contentAudienceSize
  if (answers.content_visible_expertise?.length) out.contentVisibleExpertise = answers.content_visible_expertise
  const contentReactions = text(answers.content_reactions)
  if (contentReactions) out.contentReactions = contentReactions
  const contentConversationsGenerated = text(answers.content_conversations_generated)
  if (contentConversationsGenerated) out.contentConversationsGenerated = contentConversationsGenerated
  if (answers.content_funnel_stages_reached?.length)
    out.contentFunnelStagesReached = answers.content_funnel_stages_reached
  // #2057.14 — le conseil qui refuse. Calculé seulement quand le bloc contenu
  // a produit un signal (prospection déclarée OU au moins une étape cochée) :
  // sinon, il n'y a rien à conseiller, et le silence est la réponse honnête.
  // ⚠️ `baseProspectingHolds` traite `null` ET `undefined` comme « pas de
  // réponse » — un profil projeté depuis la base (`mapRowToAnswers`) normalise
  // une colonne vide en `null`, jamais `undefined` ; comparer à `undefined`
  // seul aurait fait calculer ce conseil sur CHAQUE profil, même entièrement
  // vide (témoin : `esn-profile-workspace.resolver.spec.ts`).
  if (baseProspectingHolds(answers) !== null || answers.content_funnel_stages_reached?.length) {
    out.contentRecommendation = recommendContentInvestment(answers).recommendation
  }

  // #2033.5-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Même règle de silence : une échelle non répondue ne produit
  // AUCUNE clé, jamais une valeur devinée. Miroir Python à tenir :
  // `seller_context.py::esn_row_to_profile_data`.
  const recruitmentAccountsAuthority = text(answers.recruitment_accounts_authority)
  if (recruitmentAccountsAuthority) out.recruitmentAccountsAuthority = recruitmentAccountsAuthority
  const staffingAuthority = text(answers.staffing_authority)
  if (staffingAuthority) out.staffingAuthority = staffingAuthority
  const marginBillingAuthority = text(answers.margin_billing_authority)
  if (marginBillingAuthority) out.marginBillingAuthority = marginBillingAuthority
  const inviteAuthority = text(answers.invite_authority)
  if (inviteAuthority) out.inviteAuthority = inviteAuthority

  // #2304.26 — même règle de silence : une bande non déclarée ne produit
  // AUCUNE clé.
  const weeklySalesTimeProtected = text(answers.weekly_sales_time_protected)
  if (weeklySalesTimeProtected) out.weeklySalesTimeProtected = weeklySalesTimeProtected

  // #2304.23 — le réseau personnel déclaré (#2045). Même règle de silence.
  const formerClientsCountBand = text(answers.former_clients_count_band)
  if (formerClientsCountBand) out.formerClientsCountBand = formerClientsCountBand
  const formerColleaguesCountBand = text(answers.former_colleagues_count_band)
  if (formerColleaguesCountBand) out.formerColleaguesCountBand = formerColleaguesCountBand
  const partnersCountBand = text(answers.partners_count_band)
  if (partnersCountBand) out.partnersCountBand = partnersCountBand
  const referrersCountBand = text(answers.referrers_count_band)
  if (referrersCountBand) out.referrersCountBand = referrersCountBand

  return out
}

/**
 * The user-facing analysis steps the UI walks through, in display order.
 * Every ``phase:progress`` event the IA service emits carries one of these
 * keys in the ``step`` field — keep this list aligned with
 * ``apps/ia/app/routers/phase{1..4}_*.py`` and
 * ``apps/web/src/stores/analysisStore.ts``.
 *
 * #2164.10 / #2164.11 (GA-08 — une taxonomie ne peut que GRANDIR, et EN FIN) —
 * ``quality_check`` et ``save`` s'ajoutent à la fin : les 7 premiers restent
 * les phases du graphe (research → plan) ; ces deux-là sont le contrôle
 * qualité (le Judge, ``analysis.worker.ts`` case ``'judge_completed'``) et la
 * sauvegarde finale (même fichier, juste avant ``runs.completeLatest``) —
 * réels, backend, jusqu'ici invisibles à l'écran faute d'un ``StepKey``.
 */
export const ANALYSIS_STEPS = [
  'scope',
  'crosscheck',
  'account_sheet',
  'decision_makers',
  'orga_chain',
  'classification',
  'messages',
  'quality_check',
  'save',
  // #2164.4 / #2164.5 / #2164.6 — ajoutées EN FIN (GA-08) ; leur place à l'écran
  // est dite par `ANALYSIS_STEP_ORDER`, jamais par leur index d'enum.
  'reuse_existing',
  'current_research',
  'thematic_research',
] as const

/**
 * #2164.4 / #2164.5 / #2164.6 — L'ORDRE D'AFFICHAGE des étapes, découplé de l'index
 * d'enum : `ANALYSIS_STEPS` ne grandit qu'en fin, mais « réutilisation » vient en
 * premier à l'écran, « recherche actuelle » après le périmètre, « recherche
 * thématique » avant la fiche compte. L'avancement se lit ICI, jamais dans
 * `ANALYSIS_STEPS.indexOf`.
 */
export const ANALYSIS_STEP_ORDER = [
  'reuse_existing',
  'scope',
  'current_research',
  'crosscheck',
  'thematic_research',
  'account_sheet',
  'decision_makers',
  'orga_chain',
  'classification',
  'messages',
  'quality_check',
  'save',
] as const satisfies readonly (typeof ANALYSIS_STEPS)[number][]

/** Étapes émises seulement quand le run les exécute : non émise ⇒ ni cochée ni comptée. */
export const ANALYSIS_OPTIONAL_STEPS = ['reuse_existing', 'current_research', 'thematic_research'] as const

export const analysisStepSchema = z.enum(ANALYSIS_STEPS)
export type AnalysisStep = z.infer<typeof analysisStepSchema>

export const analysisProgressEventSchema = z.object({
  accountId: z.string().guid(),
  jobId: z.string().min(1),
  phase: z.string().min(1),
  step: analysisStepSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string().optional(),
})

export type AnalysisProgressEventInput = z.infer<typeof analysisProgressEventSchema>

/**
 * #2164.17 — CORRIGER UNE AMBIGUÏTÉ PENDANT LE JOB.
 *
 * Quand la recherche d'un run lancé sur un NOM seul (aucun SIREN verrouillé)
 * rend une identité `ambiguous`, le worker met le job en PAUSE (job BullMQ
 * différé, rien n'est écrit en base) et pose cette question. La réponse reprend
 * le run : même entité que l'hypothèse ⇒ la recherche déjà faite est gardée ;
 * autre entité ⇒ la recherche repart, verrouillée sur le SIREN choisi. Sans
 * réponse avant `expiresAt`, le run reprend sur l'hypothèse — exactement le
 * comportement d'avant (« Hypothèse retenue »), jamais un job bloqué.
 */
const analysisEntityCandidateSchema = z
  .object({
    name: z.string().trim().min(1),
    siren: z.string().regex(/^\d{9}$/),
    city: z.string().nullable(),
  })
  .strict()

export const analysisEntityQuestionSchema = z
  .object({
    /** Au moins deux entités nommées : une seule n'est pas une ambiguïté. */
    candidates: z.array(analysisEntityCandidateSchema).min(2),
    /** L'entité sur laquelle la recherche a tourné ; `null` = non nommée. */
    hypothesisSiren: z
      .string()
      .regex(/^\d{9}$/)
      .nullable(),
    askedAt: z.string().datetime(),
    /** Passé ce moment, le run reprend sur l'hypothèse. */
    expiresAt: z.string().datetime(),
  })
  .strict()
export type AnalysisEntityQuestion = z.infer<typeof analysisEntityQuestionSchema>

/** La réponse : un SIREN parmi les candidats, jamais un nom libre. */
export const analysisEntityAnswerSchema = z.object({ siren: z.string().regex(/^\d{9}$/) }).strict()
export type AnalysisEntityAnswer = z.infer<typeof analysisEntityAnswerSchema>
