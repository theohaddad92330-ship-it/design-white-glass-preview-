import { z } from 'zod'

/**
 * LE SCORE DE SANTÉ D'ESPACE — §5.6 du PDF 10, décision D50.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES REPRISES DU RESTE DU DÉPÔT, ET UNE QUATRIÈME
 * ─────────────────────────────────────────────────────────────────────────
 * Ce score répond à une question que le produit ne savait pas poser : « ce siège
 * va-t-il devenir inactif ? ». Il est construit exactement comme les deux scores
 * de matching et les deux scores de mission, parce que les mêmes erreurs y
 * seraient les mêmes :
 *
 *  1. **Un axe non évaluable SORT du dénominateur** au lieu de valoir zéro.
 *     Sinon le score mesure la complétude de nos données et pas la santé de
 *     l'espace, et un espace créé hier s'affiche « critique ».
 *  2. **Sous trois axes évaluables, il n'y a pas de score** — `null`, avec le
 *     nombre d'axes qui manquent. Un chiffre calculé sur un seul axe est un
 *     chiffre faux qui a l'air d'un chiffre.
 *  3. **`null` n'est pas zéro.** « Non mesurable » et « à l'agonie » demandent
 *     deux gestes opposés, et les confondre fait chercher une panne là où il n'y
 *     a qu'un espace neuf.
 *
 * La quatrième est propre à ce score et vient du §5.6 : **il est INTERNE, jamais
 * montré tel quel à l'utilisateur**. Personne n'a envie d'apprendre que son
 * espace vaut 38/100. Ce qui sort côté application, c'est la CAUSE — « ton CRM
 * est en erreur depuis mardi » — et rien d'autre.
 *
 * ⚠️ **`< 25` alerte l'équipe BellumAI, PAS l'utilisateur** (D50). C'est un
 * signal commercial, il vit au back-office comme les indicateurs du §12 et les
 * coûts fournisseurs. Le dire à l'utilisateur reviendrait à lui annoncer qu'on
 * le croit sur le départ.
 */

export const HEALTH_AXES = [
  'activation',
  'connectors',
  'dataDensity',
  'teamAdoption',
  'depth',
  'consumption',
  'quality',
  // Les deux axes qui manquaient aux NEUF dimensions de #2406/#2977 — les sept
  // ci-dessus couvrent déjà ACTIVATION, CONNECTEURS, DENSITÉ DE DONNÉES,
  // QUALITÉ, ADOPTION (`teamAdoption`) et COÛT (`consumption`) ; `depth`
  // (familles de fonctionnalités utilisées) reste une mesure du dépôt sans
  // équivalent exact dans les neuf noms. `actionability` et `value` sont
  // ajoutés EN QUEUE, comme `depth`/`consumption`/`quality` l'avaient été :
  // un retrait de queue plutôt qu'une renumérotation qui déplacerait les poids
  // de tout le monde.
  'actionability',
  'value',
] as const
export const healthAxisSchema = z.enum(HEALTH_AXES)
export type HealthAxis = (typeof HEALTH_AXES)[number]

/** Les poids — NEUF depuis #2977, ils somment toujours à 100, vérifié par un
 *  test, pas par une addition mentale. `activation` et `quality` gardent leur
 *  valeur d'origine (20 et 10) : la « cause principale » d'un espace en
 *  difficulté ne doit pas changer de nom simplement parce que deux axes de
 *  plus existent maintenant. */
export const HEALTH_WEIGHTS: Readonly<Record<HealthAxis, number>> = {
  activation: 20,
  connectors: 10,
  dataDensity: 10,
  teamAdoption: 10,
  depth: 10,
  consumption: 5,
  quality: 10,
  actionability: 15,
  value: 10,
}

/** Ce qu'on sait mesurer d'un axe : un ratio de 0 à 1, ou `null` — « je n'ai
 *  pas de quoi le dire ». Jamais 0 par défaut. */
export const healthInputSchema = z.object({
  /** Actions validées sur les 14 derniers jours, rapportées à ce qu'on attend. */
  activation: z.number().min(0).max(1).nullable(),
  /** Capacités saines / capacités utiles au palier. */
  connectors: z.number().min(0).max(1).nullable(),
  /** Comptes suivis, talents qualifiés, missions actives. */
  dataDensity: z.number().min(0).max(1).nullable(),
  /** Sièges actifs / sièges payés. */
  teamAdoption: z.number().min(0).max(1).nullable(),
  /** Familles de fonctionnalités utilisées / disponibles. */
  depth: z.number().min(0).max(1).nullable(),
  /** Crédits utilisés / alloués. */
  consumption: z.number().min(0).max(1).nullable(),
  /** Taux de champs critiques renseignés. */
  quality: z.number().min(0).max(1).nullable(),
  /** ACTIONABILITY (#2406) — part des comptes qui ont une suite prévue (une
   *  tâche ouverte), sur le total des comptes de l'espace. */
  actionability: z.number().min(0).max(1).nullable(),
  /** VALEUR (#2406) — décisions produites, risques évités, dossiers avancés,
   *  temps estimé avec méthode transparente. Aucune source mesurable dans le
   *  dépôt aujourd'hui : l'appelant rend `null` tant qu'elle n'existe pas. */
  value: z.number().min(0).max(1).nullable(),
})
export type HealthInput = z.infer<typeof healthInputSchema>

/** Le minimum d'axes évaluables pour qu'un score veuille dire quelque chose.
 *  Même seuil que les scores de mission — trois axes, pas moins. */
export const MIN_AXES_FOR_HEALTH = 3

/** Ce que chaque axe s'appelle à l'écran — un axe sans nom ne s'explique pas
 *  (même règle que `client-health.ts` §1652). Aucun de ces libellés ne sort
 *  vers l'utilisateur final : ce score reste interne (§5.6), seule sa vue
 *  admin/pilotage les affiche. */
export const HEALTH_AXIS_LABELS: Readonly<Record<HealthAxis, string>> = {
  activation: 'Activation',
  connectors: 'Connecteurs',
  dataDensity: 'Densité de données',
  teamAdoption: 'Adoption',
  depth: 'Profondeur d’usage',
  consumption: 'Coût',
  quality: 'Qualité',
  actionability: 'Actionability',
  value: 'Valeur',
}

/** Pourquoi un axe revient `null`, dans les termes de son PROPRE dénominateur —
 *  ce que la sonde (`LauraProbeService`) ne mesure pas se lit ici plutôt que de
 *  se deviner à l'écran. « Non évalué » nomme la RAISON, jamais un « 0 » tu. */
export const HEALTH_AXIS_UNMEASURED_REASON: Readonly<Record<HealthAxis, string>> = {
  activation: 'aucune action mesurée sur les 14 derniers jours',
  connectors: 'aucune capacité connectée à évaluer',
  dataDensity: 'aucun compte suivi dans l’espace',
  teamAdoption: 'aucun siège payé connu',
  depth: 'aucune fonctionnalité utilisée mesurée',
  consumption: 'aucune allocation de crédits connue',
  quality: 'aucun compte à évaluer pour la qualité',
  actionability: 'aucun compte à évaluer pour l’actionability',
  value: 'aucune mesure de valeur produite dans le dépôt aujourd’hui',
}

/** Une dimension du score, telle qu'une vue admin/pilotage la montre — jamais
 *  le ratio brut. `value` est sur 100 comme le score global, jamais 0 pour un
 *  axe non évaluable : c'est `nonEvaluable` + `reason` qui portent ce cas. */
export type HealthDimensionView = {
  axis: HealthAxis
  label: string
  /** Sur 100. `null` uniquement quand `nonEvaluable` est vrai. */
  value: number | null
  nonEvaluable: boolean
  /** NOMMÉE quand `nonEvaluable` est vrai, `null` sinon — jamais les deux à la fois. */
  reason: string | null
}

/**
 * Les NEUF dimensions, dans l'ordre de {@link HEALTH_AXES}, prêtes pour une
 * vue admin/pilotage (#2977) : jamais un score nu, chaque axe non évaluable
 * nommé avec sa raison plutôt que tu ou compté zéro.
 */
export function healthDimensions(input: HealthInput): HealthDimensionView[] {
  return HEALTH_AXES.map(axis => {
    const ratio = input[axis]
    if (ratio === null || ratio === undefined || Number.isNaN(ratio)) {
      return {
        axis,
        label: HEALTH_AXIS_LABELS[axis],
        value: null,
        nonEvaluable: true,
        reason: HEALTH_AXIS_UNMEASURED_REASON[axis],
      }
    }
    return { axis, label: HEALTH_AXIS_LABELS[axis], value: Math.round(ratio * 100), nonEvaluable: false, reason: null }
  })
}

/** « X/9 axes évalués » — le nombre d'axes qui ont RÉELLEMENT servi au score,
 *  jamais un score affiché nu (doctrine, D50, #2977). */
export function healthCoverageLabel(health: WorkspaceHealth): string {
  return `${health.evaluated.length}/${HEALTH_AXES.length} axes évalués`
}

/**
 * Sous ce score (sur 100), une dimension évaluable propose une intervention —
 * #2977 (« une intervention par dimension sous un seuil »). Seuil nommé ici,
 * dans ce module, et nulle part ailleurs (GA-26).
 */
export const DIMENSION_INTERVENTION_THRESHOLD = 60

/**
 * Une intervention proposée par le PILOTAGE (admin), une par dimension au
 * plus — jamais le catalogue utilisateur de `laura-interventions.ts`, qui
 * reste la seule source d'interventions montrées au client (D48, #2406.16).
 * Celle-ci sert la vue admin/pilotage interne, jamais l'application.
 */
export type DimensionIntervention = {
  axis: HealthAxis
  /** Sur 100 — toujours sous {@link DIMENSION_INTERVENTION_THRESHOLD}. */
  value: number
  action: string
}

/** Un geste par dimension, écrit pour qu'on puisse le contredire en le lisant
 *  (même règle que `laura-interventions.ts` pour `condition`). */
export const DIMENSION_INTERVENTION_ACTIONS: Readonly<Record<HealthAxis, string>> = {
  activation: 'Relancer l’onboarding — proposer la prochaine action guidée',
  connectors: 'Réparer ou reconnecter les capacités en erreur',
  dataDensity: 'Importer ou enrichir des comptes pour étoffer le portefeuille',
  teamAdoption: 'Inviter l’équipe à activer ses sièges payés',
  depth: 'Faire découvrir une famille de fonctionnalités encore inutilisée',
  consumption: 'Vérifier l’allocation de crédits et son usage réel',
  quality: 'Compléter les champs critiques des comptes suivis',
  actionability: 'Programmer une suite sur les comptes qui n’en ont pas',
  value: 'Documenter une décision produite ou un risque évité récemment',
}

/**
 * Une dimension NON évaluable ne propose JAMAIS d'intervention — elle sort du
 * calcul comme elle sort du score (même règle, même raison : deviner une
 * cause sur une donnée absente inventerait un diagnostic).
 */
export function dimensionInterventions(input: HealthInput): DimensionIntervention[] {
  const interventions: DimensionIntervention[] = []
  for (const axis of HEALTH_AXES) {
    const ratio = input[axis]
    if (ratio === null || ratio === undefined || Number.isNaN(ratio)) continue
    const value = Math.round(ratio * 100)
    if (value < DIMENSION_INTERVENTION_THRESHOLD) {
      interventions.push({ axis, value, action: DIMENSION_INTERVENTION_ACTIONS[axis] })
    }
  }
  return interventions
}

/** Les CINQ lectures du §5.6 / #2406.13 (Amorçage/Actif/À renforcer/À risque/
 *  Critique) et ce que Laura en fait. `bootstrapping` (Amorçage) est la
 *  lecture NOMMÉE d'un espace sous {@link MIN_AXES_FOR_HEALTH} axes évaluables
 *  — même geste que `too_recent` dans `client-health.ts` (#1946.21) : un
 *  espace qui démarre n'est pas « mauvais », il manque de fenêtres de mesure,
 *  et le mot doit le dire plutôt que de laisser `reading` muet à `null`. */
export const HEALTH_READINGS = ['bootstrapping', 'healthy', 'watch', 'at_risk', 'critical'] as const
export type HealthReading = (typeof HEALTH_READINGS)[number]

export const HEALTHY_FROM = 75
export const WATCH_FROM = 50
export const AT_RISK_FROM = 25

export type WorkspaceHealth = {
  /** Sur 100, ou `null` quand il n'y a pas assez d'axes pour le dire. */
  score: number | null
  /** `null` quand le score l'est : une lecture sans score serait une opinion. */
  reading: HealthReading | null
  /** Les axes réellement évalués — le dénominateur qui a servi. */
  evaluated: HealthAxis[]
  /** Ceux qu'on n'a pas pu évaluer, NOMMÉS. « Il manque des données » n'apprend
   *  rien à qui doit aller les chercher. */
  notEvaluable: HealthAxis[]
  /** L'axe le plus faible parmi ceux qui pèsent — la seule chose que Laura
   *  utilise côté application. `null` si rien n'est mesurable. */
  mainCause: HealthAxis | null
  /** Combien d'axes manquent pour qu'un score existe. `0` quand il existe. */
  missingAxes: number
}

/**
 * Le score de santé d'un espace.
 *
 * Le dénominateur est la somme des poids des axes RÉELLEMENT évalués, jamais
 * 100 : un espace dont on ne sait mesurer que l'activation et l'adoption
 * afficherait sinon 35 % de santé alors qu'il est peut-être parfait sur les deux
 * seules choses qu'on sait voir.
 */
export function computeWorkspaceHealth(input: HealthInput): WorkspaceHealth {
  const evaluated: HealthAxis[] = []
  const notEvaluable: HealthAxis[] = []

  for (const axis of HEALTH_AXES) {
    const value = input[axis]
    if (value === null || value === undefined || Number.isNaN(value)) notEvaluable.push(axis)
    else evaluated.push(axis)
  }

  if (evaluated.length < MIN_AXES_FOR_HEALTH) {
    return {
      score: null,
      // #2406.13 — nommée « Amorçage », jamais muette : un score absent parce
      // qu'on n'a pas encore assez d'axes n'est pas la même chose qu'un score
      // absent pour une autre raison ; `null` tairait laquelle des deux.
      reading: 'bootstrapping',
      evaluated,
      notEvaluable,
      mainCause: null,
      missingAxes: MIN_AXES_FOR_HEALTH - evaluated.length,
    }
  }

  const totalWeight = evaluated.reduce((sum, axis) => sum + HEALTH_WEIGHTS[axis], 0)
  const earned = evaluated.reduce((sum, axis) => sum + HEALTH_WEIGHTS[axis] * (input[axis] as number), 0)
  const score = Math.round((earned / totalWeight) * 100)

  // La cause principale est l'axe qui coûte le plus de POINTS, pas celui dont
  // le ratio est le plus bas : un axe à 0 qui pèse 10 fait moins de mal qu'un
  // axe à 0,4 qui pèse 20, et c'est celui-là qu'il faut réparer d'abord.
  const mainCause =
    evaluated
      .map(axis => ({ axis, lost: HEALTH_WEIGHTS[axis] * (1 - (input[axis] as number)) }))
      .sort((a, b) => b.lost - a.lost || a.axis.localeCompare(b.axis))
      .filter(entry => entry.lost > 0)[0]?.axis ?? null

  return { score, reading: readingFor(score), evaluated, notEvaluable, mainCause, missingAxes: 0 }
}

export function readingFor(score: number): HealthReading {
  if (score >= HEALTHY_FROM) return 'healthy'
  if (score >= WATCH_FROM) return 'watch'
  if (score >= AT_RISK_FROM) return 'at_risk'
  return 'critical'
}

/**
 * Cet espace doit-il faire l'objet d'une alerte commerciale ? — D50.
 *
 * Un score absent n'alerte JAMAIS. Un espace créé hier ressemble à un espace
 * qu'on perd, et déclencher l'alerte commerciale dessus ferait appeler des
 * clients qui viennent d'arriver — après quoi plus personne ne regarderait
 * l'alerte.
 */
export function shouldAlertTeam(health: WorkspaceHealth): boolean {
  return health.score !== null && health.reading === 'critical'
}

/** Combien d'interventions d'adoption Laura s'autorise à cette lecture. Le
 *  §5.6 les donne : un espace sain se TAIT, sauf valeur métier réelle. */
export function adoptionBudgetFor(reading: HealthReading | null): number {
  switch (reading) {
    case 'bootstrapping':
      // Amorçage : on ne sait rien encore, donc on ne pousse rien — même
      // budget que « score inconnu », pour la même raison.
      return 0
    case 'healthy':
      return 0
    case 'watch':
      // « 1 intervention d'adoption par semaine » — le §5.6 est explicite.
      return 1
    case 'at_risk':
    case 'critical':
      return 3
    default:
      // Score inconnu : on ne pousse rien. On ne sait pas ce qui manque, donc
      // toute intervention serait un coup de sonde sur le dos de l'utilisateur.
      return 0
  }
}
