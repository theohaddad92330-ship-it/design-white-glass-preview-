/**
 * LA SANTÉ D'UN ESPACE CLIENT — pur, sans base, sans horloge (#1652).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **Un axe sans donnée SORT DU DÉNOMINATEUR.** Il ne vaut pas zéro. Sinon le
 *    score mesurerait la complétude de NOS données et non la santé du client :
 *    l'espace le mieux instrumenté serait le plus mal noté.
 *  - **Sous trois axes mesurés, il n'y a pas de score.** Un score n'est jamais
 *    nu (doctrine du dépôt) ; sur un ou deux axes il ne dit rien qu'un seul
 *    chiffre ne dirait mieux, et il se lirait pourtant comme un verdict.
 *  - **Un espace de moins de quatorze jours n'a pas de score** — il a « trop
 *    récent ». Toutes ses fenêtres sont plus courtes que la fenêtre de mesure,
 *    donc un score y noterait la jeunesse.
 *  - **Aucun score n'est jamais rendu nu** : `axes` accompagne TOUJOURS le
 *    résultat, y compris quand il n'y a pas de score, et chaque axe non évalué
 *    porte la RAISON pour laquelle il ne l'a pas été.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN CRITÈRE PROTÉGÉ N'ENTRE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * On note un ESPACE, pas une personne, et le contrat d'entrée le tient par
 * construction : il ne porte QUE des comptes, des dates et des ratios. Aucun
 * nom, aucune adresse, aucun identifiant nominatif ne traverse ce fichier —
 * il n'y a donc rien à filtrer plus loin dans la chaîne.
 *
 * ⚠️ `today` EST UN PARAMÈTRE, jamais `new Date()`. Un test qui lit l'horloge
 * passe à Paris et échoue dans une CI en UTC.
 */

/**
 * Les cinq axes de #1652, dans l'ordre où l'issue les écrit.
 *
 * Local : aucun autre fichier ne nomme un axe. Le contrat exporté est
 * `ClientHealth`, qui les porte tous — « ne JAMAIS exporter un type uniquement
 * consommé dans son fichier » (knip, `lint:exports:types`).
 */
type ClientHealthAxisKey = 'activite' | 'adoption' | 'credits' | 'sieges' | 'incidents'

/**
 * Les poids, tels que #1652 les fixe. Ils totalisent 100 — mais le
 * dénominateur RÉEL est la somme des poids des axes MESURÉS, jamais 100.
 */
export const AXIS_WEIGHTS: Readonly<Record<ClientHealthAxisKey, number>> = {
  activite: 30,
  adoption: 25,
  credits: 20,
  sieges: 15,
  incidents: 10,
}

/** Ce que chaque axe s'appelle à l'écran. Un axe sans nom ne s'explique pas. */
export const AXIS_LABELS: Readonly<Record<ClientHealthAxisKey, string>> = {
  activite: 'Activité',
  adoption: 'Adoption',
  credits: 'Usage des crédits',
  sieges: 'Membres actifs / sièges',
  incidents: 'Retours et incidents',
}

/** L'ordre d'affichage — celui de l'issue, du poids le plus fort au plus faible. */
export const AXIS_ORDER: readonly ClientHealthAxisKey[] = ['activite', 'adoption', 'credits', 'sieges', 'incidents']

/** Sous ce nombre d'axes mesurés, il n'y a pas de score (doctrine). */
export const MIN_MEASURED_AXES = 3

/**
 * Un espace plus jeune que ça n'a pas de score, jamais un zéro (#1652).
 *
 * #1946.21 — le back-office l'écrit « en amorçage »
 * (`apps/dashboard-manager/src/app/revenus/clients/clients.logic.ts`,
 * `libelleSante`) et non « trop récent », comme ce commentaire l'a dit
 * jusqu'au 14/09/2026 : le verdict n'est pas un reproche au client, c'est nos
 * fenêtres de mesure qui sont plus longues que la vie de l'espace. Le MOT vit
 * à l'écran, jamais ici — un libellé d'affichage écrit côté serveur serait
 * français pour toujours.
 */
export const TOO_RECENT_DAYS = 14

/** Sous ce score, l'espace remonte en alerte de churn (#1652). */
export const CHURN_ALERT_SCORE = 25

/** Un geste de moins de trois jours vaut une activité pleine. */
export const ACTIVITY_FRESH_DAYS = 3

/** Au-delà d'un mois sans le moindre geste, l'axe activité vaut zéro — mesuré. */
export const ACTIVITY_STALE_DAYS = 30

/**
 * Les faits BRUTS d'un espace. Tout ce qui vaut `null` n'a pas pu être mesuré,
 * et se distingue donc d'un zéro mesuré.
 */
export interface ClientHealthInput {
  /** Création de l'espace — ce qui décide de « trop récent ». */
  createdAt: string | Date
  /** Dernier geste connu, tous membres confondus. `null` = aucune trace. */
  lastActivityAt: string | Date | null
  /** Fonctions distinctes exercées par l'espace. `null` = rien d'instrumenté. */
  featuresUsed: number | null
  /** Le catalogue OBSERVÉ des fonctions, mesuré et non inventé. */
  featuresAvailable: number | null
  /** Crédits consommés sur le cycle courant. */
  creditsUsed: number | null
  /** Crédits alloués sur le cycle courant (quota + recharges + report). */
  creditsAllowance: number | null
  /** Membres vus récemment. */
  activeMembers: number | null
  /** Sièges payés (sièges du palier + sièges supplémentaires). */
  seats: number | null
  /** Incidents de la fenêtre : analyses en erreur + signalements de bug. */
  incidents: number | null
  /** Analyses lancées sur la même fenêtre — le dénominateur des incidents. */
  runs: number | null
}

/** Un axe, tel qu'il se lit dans le détail d'une ligne. Local : il voyage
 *  dans `ClientHealth`, jamais seul. */
interface ClientHealthAxis {
  key: ClientHealthAxisKey
  label: string
  weight: number
  /** 0 → 1 quand l'axe est mesuré, `null` sinon. JAMAIS 0 pour « inconnu ». */
  ratio: number | null
  /** Ce que l'axe a réellement lu. `null` quand il n'a rien lu. */
  detail: string | null
  /** Pourquoi il n'a pas pu être évalué. `null` quand il l'a été. */
  unmeasured: string | null
}

/**
 * Le verdict. Trois formes, jamais deux — et aucune ne rend un nombre seul.
 *
 * `too_recent` et `not_enough_axes` ne sont PAS des scores de zéro : à l'écran
 * comme au tri, ils se rangent à part.
 */
export type ClientHealth =
  | { kind: 'score'; score: number; measured: number; churnRisk: boolean; axes: ClientHealthAxis[] }
  | { kind: 'too_recent'; ageDays: number; measured: number; axes: ClientHealthAxis[] }
  | { kind: 'not_enough_axes'; measured: number; axes: ClientHealthAxis[] }

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Jours pleins écoulés entre deux instants. Négatif ramené à zéro. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** `3` → « 3 », `2.5` → « 2,5 ». Les détails se lisent en français. */
function nombre(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}

/**
 * L'axe ACTIVITÉ : plein jusqu'à {@link ACTIVITY_FRESH_DAYS}, nul à partir de
 * {@link ACTIVITY_STALE_DAYS}, linéaire entre les deux.
 *
 * ⚠️ « Aucune trace » n'est PAS « trente jours sans rien faire ». Un espace dont
 * aucun geste n'a jamais été enregistré peut simplement ne pas être instrumenté,
 * et lui coller un zéro inventerait un fait.
 */
function axeActivite(input: ClientHealthInput, today: Date): ClientHealthAxis {
  const base = {
    key: 'activite' as const,
    label: AXIS_LABELS.activite,
    weight: AXIS_WEIGHTS.activite,
  }
  const last = toDate(input.lastActivityAt)
  if (!last) {
    return { ...base, ratio: null, detail: null, unmeasured: 'aucun geste enregistré pour cet espace' }
  }
  const days = daysBetween(last, today)
  const ratio =
    days <= ACTIVITY_FRESH_DAYS
      ? 1
      : clamp01((ACTIVITY_STALE_DAYS - days) / (ACTIVITY_STALE_DAYS - ACTIVITY_FRESH_DAYS))
  return {
    ...base,
    ratio,
    detail: days === 0 ? 'dernier geste aujourd’hui' : `dernier geste il y a ${nombre(days)} j`,
    unmeasured: null,
  }
}

/** Un axe qui est un simple rapport `part / total`, avec sa raison d'absence. */
function axeRapport(
  key: Exclude<ClientHealthAxisKey, 'activite' | 'incidents'>,
  part: number | null,
  total: number | null,
  detail: (part: number, total: number) => string,
  absence: string,
): ClientHealthAxis {
  const base = { key, label: AXIS_LABELS[key], weight: AXIS_WEIGHTS[key] }
  if (part === null || total === null || total <= 0) {
    return { ...base, ratio: null, detail: null, unmeasured: absence }
  }
  return { ...base, ratio: clamp01(part / total), detail: detail(part, total), unmeasured: null }
}

/**
 * L'axe INCIDENTS : la part des analyses qui se sont MAL passées, plus les bugs
 * signalés par les membres, rapportée au volume d'analyses.
 *
 * Sans analyse sur la fenêtre, il n'y a pas de dénominateur — et un espace sans
 * incident PARCE QU'il ne fait rien n'est pas un espace en bonne santé. L'axe
 * sort donc du calcul, il ne vaut pas 1.
 */
function axeIncidents(input: ClientHealthInput): ClientHealthAxis {
  const base = { key: 'incidents' as const, label: AXIS_LABELS.incidents, weight: AXIS_WEIGHTS.incidents }
  const { incidents, runs } = input
  if (incidents === null || runs === null || runs <= 0) {
    return { ...base, ratio: null, detail: null, unmeasured: 'aucune analyse sur la fenêtre — pas de dénominateur' }
  }
  return {
    ...base,
    ratio: 1 - clamp01(incidents / runs),
    detail: `${nombre(incidents)} incident${incidents > 1 ? 's' : ''} sur ${nombre(runs)} analyse${runs > 1 ? 's' : ''}`,
    unmeasured: null,
  }
}

/** Les cinq axes, dans l'ordre de l'issue. Toujours cinq, mesurés ou non. */
export function computeAxes(input: ClientHealthInput, today: Date): ClientHealthAxis[] {
  return [
    axeActivite(input, today),
    axeRapport(
      'adoption',
      input.featuresUsed,
      input.featuresAvailable,
      (part, total) => `${nombre(part)} fonctions utilisées sur ${nombre(total)} observées`,
      'aucun geste instrumenté pour cet espace',
    ),
    axeRapport(
      'credits',
      input.creditsUsed,
      input.creditsAllowance,
      (part, total) => `${nombre(part)} crédits consommés sur ${nombre(total)} alloués`,
      'aucune allocation de crédits connue',
    ),
    axeRapport(
      'sieges',
      input.activeMembers,
      input.seats,
      (part, total) => `${nombre(part)} membres actifs sur ${nombre(total)} sièges payés`,
      'sièges payés inconnus (aucun abonnement lisible)',
    ),
    axeIncidents(input),
  ]
}

/**
 * Le verdict de santé d'un espace.
 *
 * L'ordre des refus compte : « trop récent » passe AVANT « pas assez d'axes »,
 * parce qu'un espace de trois jours peut très bien avoir cinq axes mesurables —
 * ils mesureraient sa jeunesse.
 */
export function computeClientHealth(input: ClientHealthInput, today: Date): ClientHealth {
  const axes = computeAxes(input, today)
  const mesures = axes.filter((axe): axe is ClientHealthAxis & { ratio: number } => axe.ratio !== null)
  const measured = mesures.length

  const created = toDate(input.createdAt)
  if (created) {
    const ageDays = daysBetween(created, today)
    if (ageDays < TOO_RECENT_DAYS) {
      return { kind: 'too_recent', ageDays, measured, axes }
    }
  }

  if (measured < MIN_MEASURED_AXES) {
    return { kind: 'not_enough_axes', measured, axes }
  }

  // ⚠️ Le dénominateur est la somme des poids MESURÉS, pas 100. C'est toute la
  // règle : un axe absent ne pèse rien, ni en faveur ni en défaveur.
  const poids = mesures.reduce((sum, axe) => sum + axe.weight, 0)
  const points = mesures.reduce((sum, axe) => sum + axe.weight * axe.ratio, 0)
  const score = Math.round((100 * points) / poids)

  return { kind: 'score', score, measured, churnRisk: score < CHURN_ALERT_SCORE, axes }
}
