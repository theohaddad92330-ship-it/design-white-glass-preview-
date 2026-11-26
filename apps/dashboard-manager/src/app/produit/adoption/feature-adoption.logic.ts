import {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_LABELS,
  isPlanFeatureKey,
  normalizePlanFeatures,
  type PlanFeatureKey,
} from '@bellum/contracts'

/**
 * issue 1657.2 / issue 1685 — QUELLES FONCTIONS DU PALIER NE SONT JAMAIS
 * UTILISÉES, PAYÉES QUAND MÊME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CADRAGE TRANCHÉ PAR LOUIS — UNE « FONCTION » = UNE FONCTION GATÉE PAR
 * L'OFFRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux autres cadrages ont été écartés : « les actions principales de chaque
 * écran » (catalogue à construire, frontière floue) et « les 85 écrans du
 * produit » (le catalogue existe déjà, mais répond à QUEL ÉCRAN, jamais à
 * QUELLE FONCTION DU PALIER). Le catalogue qui répond à la vraie question —
 * commerciale : « paie-t-on une fonction dont on ne se sert pas ? » — est celui
 * du gating par offre, `PLAN_FEATURE_KEYS` (`@bellum/contracts`,
 * `schemas/plan-features.ts:26-41`) : 14 clés au 10/09/2026, chacune tenue par
 * `@RequireFeature` côté API sur un contrôleur réel (`ia-proxy`, `watchlist-
 * rules`, `rag`, `crm-core`, `consultants`, `pilotage`, `mcp-api`, `api-keys`,
 * `attio`/`crm`/`odoo`/`pipedrive`/`salesforce`, `team-comments`…). Ce fichier
 * ne recopie pas cette liste : il l'IMPORTE, comme `/produit/page.tsx` importe
 * déjà `PRODUCT_SCREENS` du même paquet — une recopie dériverait en silence
 * (voir au contraire `facturation/_components/plans-editor.tsx`, qui recopie
 * PARCE QUE c'est un Client Component qui évite d'alourdir le bundle
 * navigateur ; ce fichier-ci est de la logique pure, consommée par un Server
 * Component, donc sans cette contrainte).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉNOMINATEUR — NOMMÉ, JAMAIS « TOUS LES ESPACES »
 * ─────────────────────────────────────────────────────────────────────────────
 * 60 % de QUOI ? Des espaces qui ont le DROIT à la fonction, jamais de tous les
 * espaces — une fonction Entreprise adoptée par 100 % des espaces Entreprise
 * n'est pas « confidentielle » parce que les Growth ne l'ont pas.
 * `entitlementPourFonction` somme, pour les SEULS paliers du catalogue LIVE qui
 * ouvrent la fonction, le compte d'ABONNEMENTS sur ce palier
 * (`AdminOverview.plans`, déjà exposé par `GET /internal/admin/overview`) — un
 * abonnement est celui du PROPRIÉTAIRE d'un espace (`plan-features.service.ts`
 * API : « le plan est celui de l'OWNER du workspace actif »), jamais celui
 * d'un membre invité, qui n'a pas de ligne d'abonnement à lui. C'est un proxy
 * pour « nombre d'espaces », pas une garantie 1:1 (rien n'empêche un
 * propriétaire de posséder plusieurs espaces) — l'écran le nomme ainsi, jamais
 * comme un compte d'espaces qu'il n'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MESURE D'USAGE — #1685, LA ROUTE QUI MANQUAIT EST ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le traceur produit (`VITE_PRODUCT_TRACKER_ENABLED`) reste éteint (relecture
 * RGPD en attente) — mais CE fichier n'en a jamais dépendu : il ne lit ni
 * `@/lib/product-analytics` ni aucune des neuf natures d'événement.
 *
 * La recherche du lot précédent avait trouvé les signaux d'usage RÉELS, hors
 * traceur (`crm_connections.last_used_at`, `api_keys.last_used_at`, un outil
 * MCP appelé, une règle de veille créée, un document versé…) mais constatait
 * qu'aucune route interne ne les agrégeait PAR FONCTION à travers tous les
 * espaces — les routes existantes répondaient un espace à la fois. #1685
 * construit cette route : `GET /internal/analytics/feature-adoption`
 * (`apps/api/src/modules/analytics/feature-adoption-usage.ts`), consommée ici
 * via `@/lib/feature-adoption-usage` et {@link usageParFonctionDepuisSignaux}.
 *
 * Douze des 14 fonctions sont désormais mesurées. Deux restent honnêtement
 * `non_mesurable` — `exports` et `discover` — parce qu'aucune trace persistée
 * par espace n'existe pour elles aujourd'hui (voir le docblock de tête de
 * `feature-adoption-usage.ts`, côté API, pour le détail et la raison de
 * chacune). Le paramètre `usageParFonction` de {@link construireRapportAdoption}
 * porte donc, pour ces deux-là, `null` — jamais un taux à 0 % qui prétendrait
 * une mesure — et pour les douze autres, la vraie mesure quand la route a pu
 * être lue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « MORTE » CONTRE « IGNORÉE » — CE QUI LES SÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue ne nomme qu'un critère pour « ignorée » (< 10 %, à plus de 60 jours).
 * Appliqué tel quel, « morte » n'aurait aucun critère propre — ce serait le
 * hasard qui déciderait laquelle des deux étiquettes une fonction reçoit.
 * Le fait qui les sépare ici : ZÉRO usage jamais observé (morte) contre un
 * usage NON NUL mais sous le seuil (ignorée) — les deux exigeant la même
 * fenêtre mûre de 60 jours, sinon la question n'a pas encore de réponse
 * (`observation_insuffisante`). Un vrai zéro est l'énoncé le plus sûr qui
 * existe (« personne, jamais » contre « presque personne ») — ce n'est pas
 * une distinction inventée pour l'occasion.
 */

/** Un palier du catalogue LIVE, réduit à ce que ce fichier lit — jamais un
 *  import du type complet `AdminPlan` (`@/lib/admin`) pour trois champs, et
 *  surtout jamais `AdminWorkspace` : ce fichier n'a besoin d'aucun nom
 *  d'espace (voir la garde `src/architecture/adoption-ne-nomme-jamais-un-
 *  espace.test.ts`). */
export type AdoptionPlanCatalogue = { key: string; label: string; features?: string[] }

/** Ce qu'un dénominateur DOIT dire à l'écran, tel quel — jamais recalculé
 *  ailleurs (GA-26). */
// Non exporté : consommé seulement dans CE fichier (via `LigneAdoption.entitlement`,
// qui l'infère sans le nommer) — un type exporté sans second lecteur est le
// bruit que `pnpm lint:exports:types` (knip) refuse (même règle que
// `LigneVerdictEcran`, `screen-verdict.logic.ts`).
type EntitlementReport = {
  feature: PlanFeatureKey
  /** Les paliers du catalogue LIVE qui ouvrent cette fonction aujourd'hui. */
  grantingPlanLabels: string[]
  /** Le DÉNOMINATEUR : abonnements (propriétaire d'un espace) sur un de ces
   *  paliers. */
  entitledSubscriptions: number
  /** Le total d'abonnements, tous paliers confondus — pour situer le chiffre
   *  ci-dessus (ex. « 12 sur 340 abonnements »). */
  totalSubscriptions: number
}

/** Somme les abonnements des SEULS paliers qui ouvrent `feature` — jamais tous
 *  les espaces. `normalizePlanFeatures` filtre une valeur illisible (absente,
 *  mal formée) vers `[]` plutôt que de faire planter le calcul. */
export function entitlementPourFonction(
  feature: PlanFeatureKey,
  plans: readonly AdoptionPlanCatalogue[],
  subscriptionsByPlan: Readonly<Record<string, number>>,
): EntitlementReport {
  const ouvrants = plans.filter(plan => normalizePlanFeatures(plan.features).includes(feature))
  const entitledSubscriptions = ouvrants.reduce((sum, plan) => sum + (subscriptionsByPlan[plan.key] ?? 0), 0)
  const totalSubscriptions = Object.values(subscriptionsByPlan).reduce((a, b) => a + b, 0)
  return { feature, grantingPlanLabels: ouvrants.map(plan => plan.label), entitledSubscriptions, totalSubscriptions }
}

/** Les seuils de l'issue — déclarés UNE fois (GA-26), lus par `classerAdoption`
 *  et par rien d'autre. */
export const ADOPTION_THRESHOLDS = {
  /** Au-dessus (inclus), une fonction est « adoptée ». */
  adoptee: 0.6,
  /** Au-dessus (inclus) et sous le seuil ci-dessus, « confidentielle ». */
  confidentielle: 0.1,
  /** Sous ce nombre de jours d'observation, un taux bas ne tranche ni
   *  « ignorée » ni « morte » — c'est juste trop tôt. */
  fenetreMinimaleJours: 60,
} as const

/** Une mesure d'usage — `null` quand aucune source ne l'alimente encore (voir
 *  le docblock de tête : c'est TOUJOURS le cas aujourd'hui). Non exporté :
 *  consommé seulement ici et dans `feature-adoption.logic.test.ts`, qui le
 *  construit par un littéral plutôt que de nommer le type. */
type MesureUsage = { actifs: number; joursObserves: number } | null

/** Les sept états qu'une fonction peut recevoir — les quatre de l'issue, plus
 *  les trois qui disent honnêtement pourquoi aucun des quatre ne s'applique
 *  encore. Jamais un nombre nu à leur place. Non exporté : `LigneAdoption.etat`
 *  et `AdoptionTable` (`_components/adoption-table.tsx`) l'infèrent via
 *  `LigneAdoption['etat']['kind']`, jamais en nommant `EtatAdoption`. */
type EtatAdoption =
  | { kind: 'sans_titulaire' }
  | { kind: 'non_mesurable' }
  | { kind: 'observation_insuffisante'; joursObserves: number }
  | { kind: 'adoptee'; taux: number }
  | { kind: 'confidentielle'; taux: number }
  | { kind: 'ignoree'; taux: number; joursObserves: number }
  | { kind: 'morte'; joursObserves: number }

/**
 * Classe une fonction dans l'un des sept états, à partir de son DÉNOMINATEUR
 * (`entitled`, jamais 0 comptes espaces) et d'une mesure d'usage optionnelle.
 *
 * Priorité, dans cet ordre :
 *  1. `entitled === 0` → `sans_titulaire` (un taux ne se calcule pas sur un
 *     dénominateur vide, quelle que soit la mesure fournie).
 *  2. `usage === null` → `non_mesurable`.
 *  3. `taux >= 60 %` → `adoptee`, `taux >= 10 %` → `confidentielle` — ces deux
 *     se lisent dès la première mesure, sans attendre 60 jours : un usage haut
 *     n'a pas besoin de temps pour être vrai.
 *  4. Sous 10 %, la fenêtre doit être MÛRE (≥ 60 j) pour trancher — sinon
 *     `observation_insuffisante`.
 *  5. Fenêtre mûre : `actifs === 0` → `morte` (zéro, jamais) ; sinon
 *     `ignoree` (peu, mais pas zéro).
 */
export function classerAdoption(entitled: number, usage: MesureUsage): EtatAdoption {
  if (entitled === 0) return { kind: 'sans_titulaire' }
  if (usage === null) return { kind: 'non_mesurable' }

  const taux = usage.actifs / entitled
  if (taux >= ADOPTION_THRESHOLDS.adoptee) return { kind: 'adoptee', taux }
  if (taux >= ADOPTION_THRESHOLDS.confidentielle) return { kind: 'confidentielle', taux }
  if (usage.joursObserves < ADOPTION_THRESHOLDS.fenetreMinimaleJours) {
    return { kind: 'observation_insuffisante', joursObserves: usage.joursObserves }
  }
  if (usage.actifs === 0) return { kind: 'morte', joursObserves: usage.joursObserves }
  return { kind: 'ignoree', taux, joursObserves: usage.joursObserves }
}

/** Une ligne complète : la fonction, son dénominateur, son état. */
export type LigneAdoption = {
  feature: PlanFeatureKey
  labelFr: string
  pitchFr: string
  entitlement: EntitlementReport
  etat: EtatAdoption
}

/**
 * Le rapport complet : UNE ligne par fonction du catalogue de gating par
 * offre, jamais plus, jamais moins — `PLAN_FEATURE_KEYS.map` le garantit par
 * construction. `usageParFonction` est optionnel et partiel : une fonction
 * absente de la carte reçoit `null`, donc `non_mesurable` (ou `sans_titulaire`
 * si son dénominateur est nul).
 */
export function construireRapportAdoption(
  plans: readonly AdoptionPlanCatalogue[],
  subscriptionsByPlan: Readonly<Record<string, number>>,
  usageParFonction?: Partial<Record<PlanFeatureKey, MesureUsage>>,
): LigneAdoption[] {
  return PLAN_FEATURE_KEYS.map(feature => {
    const entitlement = entitlementPourFonction(feature, plans, subscriptionsByPlan)
    const usage = usageParFonction?.[feature] ?? null
    const etat = classerAdoption(entitlement.entitledSubscriptions, usage)
    return {
      feature,
      labelFr: PLAN_FEATURE_LABELS[feature].fr,
      pitchFr: PLAN_FEATURE_LABELS[feature].pitchFr,
      entitlement,
      etat,
    }
  })
}

/** Les sept seaux possibles, dans l'ordre où l'écran les affiche — le résidu
 *  (« sans_titulaire », « non_mesurable ») EN DERNIER, jamais en tête d'une
 *  barre triée par volume (règle du dépôt : un fourre-tout en tête mange la
 *  ligne). Jamais recalculé depuis les lignes : une clé absente d'ici serait
 *  un état que personne ne compterait. */
export const TOUS_LES_SEAUX: EtatAdoption['kind'][] = [
  'adoptee',
  'confidentielle',
  'ignoree',
  'morte',
  'observation_insuffisante',
  'sans_titulaire',
  'non_mesurable',
]

/**
 * Le compte de chaque état sur un ensemble de lignes — la preuve tenue en une
 * fonction que « les seaux s'additionnent jusqu'au nombre de fonctions » :
 * `Object.values(compterSeaux(lignes)).reduce((a,b)=>a+b,0) === lignes.length`
 * est vrai PAR CONSTRUCTION (chaque ligne incrémente exactement une clé), pas
 * par discipline de qui affiche le résumé — testé quand même (même idiome que
 * `compterVerdicts`, `screen-verdict.logic.ts`).
 */
export function compterSeaux(lignes: readonly LigneAdoption[]): Record<EtatAdoption['kind'], number> {
  const compte = Object.fromEntries(TOUS_LES_SEAUX.map(kind => [kind, 0])) as Record<EtatAdoption['kind'], number>
  for (const ligne of lignes) compte[ligne.etat.kind] += 1
  return compte
}

/** `0.667` → `"67 %"`. Jamais plus d'une décimale de précision utile à cette
 *  échelle : un opérateur lit un ordre de grandeur, pas un troisième chiffre. */
export function formaterTauxAdoption(taux: number): string {
  return `${Math.round(taux * 100)} %`
}

/** Le mot (ou la courte phrase) d'un état — jamais un chiffre nu à sa place. */
export function libelleEtatAdoption(etat: EtatAdoption): string {
  switch (etat.kind) {
    case 'sans_titulaire':
      return 'aucun espace éligible aujourd’hui'
    case 'non_mesurable':
      return 'pas encore mesurable'
    case 'observation_insuffisante':
      return `observation insuffisante (${etat.joursObserves} j sur ${ADOPTION_THRESHOLDS.fenetreMinimaleJours})`
    case 'adoptee':
      return `adoptée — ${formaterTauxAdoption(etat.taux)}`
    case 'confidentielle':
      return `confidentielle — ${formaterTauxAdoption(etat.taux)}`
    case 'ignoree':
      return `ignorée — ${formaterTauxAdoption(etat.taux)} depuis ${etat.joursObserves} j`
    case 'morte':
      return `morte — aucun usage en ${etat.joursObserves} j`
  }
}

/**
 * #1685 — la phrase honnête à afficher quand la route de mesure d'usage n'a
 * PAS pu être lue (panne, déploiement en cours) — distincte de l'ancien
 * constat « aucune route n'existe », qui serait désormais FAUX : la route
 * existe, elle n'a simplement pas répondu cette fois. Un seul endroit
 * (GA-26) : la page l'affiche une fois, chaque ligne se contente de
 * `libelleEtatAdoption`.
 */
export const RAISON_USAGE_INDISPONIBLE =
  'La route qui agrège l’usage réel de chaque fonction par espace n’a pas répondu — le catalogue et son ' +
  'dénominateur restent fiables ci-dessous, mais aucune ligne ne peut sortir de « pas encore mesurable » ' +
  'tant que cette mesure n’est pas relue avec succès.'

/** Un signal d'usage tel que renvoyé par `GET /internal/analytics/feature-adoption`
 *  (#1685, `@/lib/feature-adoption-usage`). Ce fichier ne l'importe pas :
 *  la forme suffit (typage structurel) — cette logique reste pure, testable
 *  sans réseau, et ne dépend jamais de `@/lib/*`. `activeWorkspaces: null` =
 *  aucun signal branché pour cette fonction (voir `notWiredReason`), JAMAIS 0. */
export type SignalUsageAPI = {
  feature: string
  activeWorkspaces: number | null
  windowDays: number
  notWiredReason: string | null
}

/**
 * Convertit les signaux bruts de la route #1685 en `usageParFonction`, la
 * forme attendue par {@link construireRapportAdoption}.
 *
 * Deux défenses, pour deux dérives déjà payées ailleurs dans ce dépôt :
 *  - une clé qui n'appartient plus au catalogue LIVE (déploiement asymétrique,
 *    front neuf sur API ancienne ou l'inverse) est IGNORÉE plutôt que de
 *    faire planter le rapport ;
 *  - une mesure d'usage illisible (négative, non entière, non finie) retombe
 *    sur `null` (non mesurable) — un compte cassé n'est pas un petit compte,
 *    même principe que `hasEnoughSessionsToPublish`
 *    (`product-analytics-privacy.ts`).
 */
export function usageParFonctionDepuisSignaux(
  signaux: readonly SignalUsageAPI[],
): Partial<Record<PlanFeatureKey, MesureUsage>> {
  const usage: Partial<Record<PlanFeatureKey, MesureUsage>> = {}
  for (const signal of signaux) {
    if (!isPlanFeatureKey(signal.feature)) continue
    const { activeWorkspaces, windowDays } = signal
    if (activeWorkspaces === null) {
      usage[signal.feature] = null
      continue
    }
    const mesureLisible =
      Number.isInteger(activeWorkspaces) && activeWorkspaces >= 0 && Number.isInteger(windowDays) && windowDays >= 0
    usage[signal.feature] = mesureLisible ? { actifs: activeWorkspaces, joursObserves: windowDays } : null
  }
  return usage
}

/** Le résumé de tête d'écran : combien de fonctions sont mesurées sur les 14
 *  du catalogue, et lesquelles ne le sont pas encore, avec leur raison —
 *  jamais une liste d'espaces, seulement des FONCTIONS. Non exporté :
 *  `page.tsx` consomme `resumerMesureUsage` sans jamais nommer ce type
 *  (`pnpm lint:exports:types`/knip refuse un type exporté sans second
 *  lecteur), même idiome que `EtatAdoption`/`MesureUsage` plus haut. */
type ResumeMesureUsage = {
  totalFonctions: number
  fonctionsMesurees: number
  windowDays: number | null
  fonctionsSansSignal: { feature: PlanFeatureKey; labelFr: string; raison: string }[]
}

export function resumerMesureUsage(signaux: readonly SignalUsageAPI[]): ResumeMesureUsage {
  const valides = signaux.filter((s): s is SignalUsageAPI & { feature: PlanFeatureKey } => isPlanFeatureKey(s.feature))
  const mesurees = valides.filter(s => s.activeWorkspaces !== null)
  const sansSignal = valides.filter(s => s.activeWorkspaces === null)
  return {
    totalFonctions: PLAN_FEATURE_KEYS.length,
    fonctionsMesurees: mesurees.length,
    windowDays: valides[0]?.windowDays ?? null,
    fonctionsSansSignal: sansSignal.map(s => ({
      feature: s.feature,
      labelFr: PLAN_FEATURE_LABELS[s.feature].fr,
      raison: s.notWiredReason ?? 'raison non fournie par la route',
    })),
  }
}
