/**
 * #1660 — ce qu'on peut DIRE d'une dépendance à partir de ses sondes, et rien
 * de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE N°1 DE CET ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * « Cassé » et « non mesurable » se ressemblent, et un silence n'est pas un
 * verdict. Une dépendance dont la dernière sonde date de trois heures n'est ni
 * verte ni rouge : on ne sait pas. Le dire coûte une phrase ; ne pas le dire
 * coûte une panne qu'on découvre par un client.
 *
 * D'où la RÈGLE DE FRAÎCHEUR, qui est la première chose que fait ce module :
 * au-delà de {@link DEFAULT_FRESHNESS_MS}, l'état devient `unknown` QUEL QUE
 * SOIT le contenu de la dernière sonde. Une sonde verte d'il y a deux heures ne
 * prouve rien sur maintenant — c'est exactement le `200 {"status":"degraded"}`
 * compté `operational` que ce dépôt a déjà payé.
 *
 * ⚠️ ET LA DEUXIÈME : une dépendance ÉTEINTE À DESSEIN n'est pas en panne. Sans
 * clé, le dépôt fait un no-op strict ; une tuile rouge sur une capacité qu'on a
 * choisi de ne pas brancher apprend à l'opérateur à ignorer les tuiles rouges.
 * `off` est donc un état à part entière, et il ne compte pas dans les pannes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `now` EST UN PARAMÈTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun `new Date()` ici. Une dérivation qui lit l'horloge passe à Paris et
 * échoue sur un exécuteur CI en UTC ; et surtout, un test ne peut pas la
 * conduire. C'est la même discipline que `analyses-heatmap.logic.ts`.
 */

/** Une sonde, telle qu'elle a été enregistrée. */
export type DependencySample = {
  /** Instant de la sonde, en millisecondes depuis l'époque. */
  at: number
  /** La dépendance a-t-elle répondu correctement ? */
  ok: boolean
  /** Aller-retour mesuré. `null` quand la sonde n'en produit pas — un registre
   *  en mémoire n'a pas de latence réseau, et inventer 0 ms serait un mensonge. */
  latencyMs: number | null
}

/**
 * L'état d'une dépendance. Cinq valeurs, et aucune n'est un repli de commodité.
 *
 *  - `up`       — la dernière sonde fraîche a réussi.
 *  - `degraded` — elle a réussi, mais des sondes fraîches ont échoué autour.
 *  - `down`     — la dernière sonde fraîche a échoué.
 *  - `unknown`  — aucune sonde assez récente. NI vert NI rouge.
 *  - `off`      — pas configurée, donc pas sondée. Une décision, pas une panne.
 */
type DependencyState = 'up' | 'degraded' | 'down' | 'unknown' | 'off'

/**
 * La latence médiane sur 24 h — une UNION, jamais un `number | null`.
 *
 * ⚠️ Le champ nullable obligerait l'écran à écrire `latence ?? 0`, c'est-à-dire
 * « 0 ms » sur une dépendance qu'on n'a pas mesurée : la lecture la plus
 * flatteuse possible d'une absence de mesure (GA-19). L'union retire le MOYEN
 * de l'écrire, et chaque branche porte de quoi faire une phrase vraie.
 */
type MedianLatency =
  | { kind: 'measured'; ms: number; samples: number }
  /** La sonde de cette dépendance ne produit pas de latence, par construction. */
  | { kind: 'not_applicable' }
  /** Aucune sonde chiffrée sur la fenêtre — on ne sait pas. */
  | { kind: 'no_sample' }

/**
 * Un point de la série de disponibilité — un jour.
 *
 * `null` = aucune sonde ce jour-là. `Sparkline` en fait un TROU visible, jamais
 * une barre à zéro qui se lirait « indisponible toute la journée ».
 */
type AvailabilityPoint = { day: string; ratio: number | null }

/** Le dernier incident observé, ou l'absence NOMMÉE d'incident. */
type LastIncident =
  | { kind: 'observed'; at: number; resolvedAt: number | null }
  /** Aucune sonde en échec sur la fenêtre observée. */
  | { kind: 'none_in_window'; windowDays: number }
  /** Rien à dire : on n'a aucune sonde du tout. */
  | { kind: 'unknown' }

export type DependencyHealth = {
  state: DependencyState
  /** Instant de la DERNIÈRE sonde, quelle qu'elle soit. `null` = jamais sondée. */
  lastMeasuredAt: number | null
  medianLatency24h: MedianLatency
  availability7d: AvailabilityPoint[]
  lastIncident: LastIncident
}

/**
 * Au-delà de quel âge une sonde cesse de prouver quoi que ce soit.
 *
 * Une heure, et le nombre vient de l'issue : « dépendance non testée depuis
 * 1 h → état inconnu, pas sain ». La passe tourne toutes les cinq minutes, donc
 * une heure laisse douze occasions de rater son tour avant qu'on ne bascule —
 * assez pour absorber un redéploiement, trop court pour qu'une panne de la
 * passe elle-même passe pour de la santé.
 */
export const DEFAULT_FRESHNESS_MS = 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** La fenêtre de la série de disponibilité, en jours. Sept, comme l'issue. */
export const AVAILABILITY_WINDOW_DAYS = 7

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type DeriveOptions = {
  samples: readonly DependencySample[]
  now: number
  /** `false` = clé absente : la dépendance n'est pas sondée, à dessein. */
  configured: boolean
  /** La sonde produit-elle une latence ? Faux pour un contrôle en mémoire. */
  producesLatency: boolean
  freshnessMs?: number
}

/**
 * L'état d'une dépendance, de ses sondes.
 *
 * L'ordre des décisions est l'ordre des vérités : ce qu'on a décidé d'éteindre
 * passe avant ce qu'on n'a pas mesuré, qui passe avant ce qu'on a mesuré. Le
 * renverser ferait annoncer « en panne » une capacité volontairement absente.
 */
export function deriveDependencyHealth(options: DeriveOptions): DependencyHealth {
  const { samples, now, configured, producesLatency } = options
  const freshnessMs = options.freshnessMs ?? DEFAULT_FRESHNESS_MS

  const ordered = [...samples].filter(sample => Number.isFinite(sample.at)).sort((a, b) => a.at - b.at)
  const last = ordered.at(-1) ?? null
  const lastMeasuredAt = last ? last.at : null

  const availability7d = buildAvailability(ordered, now)
  const medianLatency24h = producesLatency ? medianLatency(ordered, now) : { kind: 'not_applicable' as const }
  const lastIncident = readLastIncident(ordered)

  if (!configured) {
    // ⚠️ Éteinte à dessein. On ne prétend ni qu'elle va bien, ni qu'elle est
    // cassée : on dit qu'elle n'est pas branchée, et l'écran écrit la phrase.
    return { state: 'off', lastMeasuredAt, medianLatency24h, availability7d, lastIncident }
  }

  if (!last || now - last.at > freshnessMs) {
    // ⚠️ LE TEST DE L'ISSUE. Une sonde trop vieille ne prouve rien, même verte.
    return { state: 'unknown', lastMeasuredAt, medianLatency24h, availability7d, lastIncident }
  }

  const fresh = ordered.filter(sample => now - sample.at <= freshnessMs)
  if (!last.ok) return { state: 'down', lastMeasuredAt, medianLatency24h, availability7d, lastIncident }

  const failedRecently = fresh.some(sample => !sample.ok)
  return {
    state: failedRecently ? 'degraded' : 'up',
    lastMeasuredAt,
    medianLatency24h,
    availability7d,
    lastIncident,
  }
}

/**
 * La médiane des latences des 24 dernières heures.
 *
 * ⚠️ Une MÉDIANE et non une moyenne, et ce n'est pas un détail de statistique :
 * une seule sonde à 2 000 ms (le budget dur d'une sonde) tirerait la moyenne de
 * 288 mesures vers le haut et ferait crier au ralentissement là où il y a eu un
 * hoquet. La médiane décrit ce que l'on vit la plupart du temps.
 *
 * Une sonde en ÉCHEC n'a pas de latence et n'entre donc pas dans le calcul :
 * compter son délai d'expiration comme une latence ferait d'une panne une
 * lenteur.
 */
function medianLatency(ordered: readonly DependencySample[], now: number): MedianLatency {
  const values = ordered
    .filter(sample => now - sample.at <= DAY_MS && sample.ok)
    .map(sample => sample.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b)

  if (values.length === 0) return { kind: 'no_sample' }
  const middle = Math.floor(values.length / 2)
  const ms =
    values.length % 2 === 1
      ? (values[middle] as number)
      : ((values[middle - 1] as number) + (values[middle] as number)) / 2
  return { kind: 'measured', ms, samples: values.length }
}

/**
 * Sept points, un par jour, du plus ancien au plus récent.
 *
 * ⚠️ Le jour se calcule en UTC. Un « jour » est une case de graphique, pas un
 * instant ; lui donner un fuseau le ferait basculer d'une case à l'autre selon
 * la machine qui rend — et cette dérivation tourne sur l'API, à Railway, pas
 * sur l'écran de l'opérateur.
 *
 * Un jour SANS sonde vaut `null`, jamais 0 : « aucune mesure ce jour-là » et
 * « indisponible toute la journée » sont les deux lectures les plus opposées
 * possibles.
 */
function buildAvailability(ordered: readonly DependencySample[], now: number): AvailabilityPoint[] {
  const points: AvailabilityPoint[] = []
  for (let offset = AVAILABILITY_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const dayStart = startOfUtcDay(now - offset * DAY_MS)
    const dayEnd = dayStart + DAY_MS
    const ofDay = ordered.filter(sample => sample.at >= dayStart && sample.at < dayEnd)
    points.push({
      day: new Date(dayStart).toISOString().slice(0, 10),
      ratio: ofDay.length === 0 ? null : ofDay.filter(sample => sample.ok).length / ofDay.length,
    })
  }
  return points
}

function startOfUtcDay(at: number): number {
  return Math.floor(at / DAY_MS) * DAY_MS
}

/**
 * Le dernier incident : la plus récente sonde en échec, et le moment où ça a
 * cessé.
 *
 * `resolvedAt` est la première sonde RÉUSSIE qui la suit — `null` quand il n'y
 * en a pas, c'est-à-dire quand l'incident est toujours en cours. Écrire une
 * date de résolution qu'on n'a pas observée serait inventer la fin d'une panne.
 */
function readLastIncident(ordered: readonly DependencySample[]): LastIncident {
  if (ordered.length === 0) return { kind: 'unknown' }

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const sample = ordered[index] as DependencySample
    if (sample.ok) continue
    const after = ordered.slice(index + 1).find(next => next.ok)
    return { kind: 'observed', at: sample.at, resolvedAt: after ? after.at : null }
  }
  return { kind: 'none_in_window', windowDays: AVAILABILITY_WINDOW_DAYS }
}
