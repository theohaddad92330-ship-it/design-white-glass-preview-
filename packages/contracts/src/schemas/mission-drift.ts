/**
 * LE DÉTECTEUR DE DÉRIVE DE MISSION — PDF 5 (Delivery) §7.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, TEL QUE LA SOURCE LE POSE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une mission ne se casse pas d'un coup. L'écart entre jours prévus et
 * déclarés se creuse mois après mois, et on s'en aperçoit au troisième. »
 *
 * Le dépôt sait déjà voir le RENOUVELLEMENT en danger (`renewal_at_risk`, à
 * T-30) : c'est la fin de la mission, pas sa dégradation. Une mission qui dérape
 * depuis mars est toujours « active » et n'apparaît nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CINQ SIGNAUX, RECOPIÉS DE LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 *   Signal                                   Seuil
 *   ─────────────────────────────────────    ──────────────────────────────────
 *   Écart de jours croissant                 3 mois consécutifs d'écart négatif
 *   CRA de plus en plus tardif               délai de remise en hausse sur 3 mois
 *   Validation client de plus en plus lente  idem
 *   Satisfaction en baisse                   2 mesures consécutives
 *   Contestation de jours                    une seule suffit
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE D'HONNÊTETÉ — ELLE PASSE AVANT LES SIGNAUX
 * ─────────────────────────────────────────────────────────────────────────────
 * « Deux signaux minimum, sur trois mois minimum. Un mois d'écart n'est pas une
 * dérive — c'est un mois. **Alerter sur un point unique détruit la crédibilité
 * de l'alerte.** »
 *
 * C'est la partie qu'on est tenté de retirer parce qu'elle empêche d'alerter, et
 * c'est celle qui décide si quelqu'un lira la deuxième alerte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « NON MESURÉ » N'EST JAMAIS « PAS DE DÉRIVE »
 * ─────────────────────────────────────────────────────────────────────────────
 * « Cassé » et « rien à signaler » se ressemblent trop. Un signal qu'on n'a pas
 * pu évaluer est NOMMÉ dans `unmeasurable` ; il ne disparaît pas dans un verdict
 * rassurant. Et quand il reste moins de signaux mesurables que le minimum exigé,
 * le verdict entier devient `unmeasurable` — conclure « steady » sur une mission
 * illisible la ferait passer pour saine.
 */

/** Les cinq, dans l'ordre du §7.2. Un enum n'insère jamais au milieu (GA-08). */
export const MISSION_DRIFT_SIGNAL_IDS = [
  'growing_day_gap',
  'late_timesheet',
  'slow_client_validation',
  'satisfaction_drop',
  'disputed_days',
] as const
export type MissionDriftSignalId = (typeof MISSION_DRIFT_SIGNAL_IDS)[number]

/**
 * LES SEUILS — un réglage vit à un seul endroit (GA-26).
 *
 * Aucun n'est deviné : chacun est la colonne « Seuil » du tableau du §7.2, et
 * les deux derniers sont sa « règle d'honnêteté ». Ils sont des constantes de
 * code et non des variables d'environnement, comme `INTERVENTION_THRESHOLDS`
 * et `RENEWAL_J60_DAYS` — une valeur qui traîne en production sans qu'aucun log
 * ne le dise redevient une loterie.
 *
 * ⚠️ Chacun est LU par `detectMissionDrift` ci-dessous, et le test le vérifie
 * seuil par seuil : un seuil que rien ne lit est du code mort qui donne
 * l'illusion d'un réglage.
 */
export const MISSION_DRIFT_THRESHOLDS = {
  /** « 3 mois consécutifs d'écart négatif ». */
  negativeGapMonths: 3,
  /** « délai de remise en hausse sur 3 mois ». */
  submitDelayTrendMonths: 3,
  /** « idem » — la source renvoie explicitement au seuil du CRA. */
  clientValidationTrendMonths: 3,
  /** « 2 mesures consécutives ». */
  satisfactionDropMeasures: 2,
  /** « une seule suffit ». */
  disputedPeriods: 1,
  /** « Deux signaux minimum ». */
  minimumSignals: 2,
  /** « sur trois mois minimum ». */
  minimumMonths: 3,
} as const

/**
 * Un mois de mission, normalisé.
 *
 * ⚠️ Chaque champ est `number | null`, et le `null` est une INFORMATION : « le
 * relevé n'est pas arrivé » n'est pas « zéro jour déclaré ». Le confondre ferait
 * crier à la dérive sur une mission dont le CRA est simplement en retard —
 * l'écart le plus négatif possible, produit par une absence.
 */
export interface MissionMonth {
  /** « YYYY-MM ». Sert au tri : l'ordre d'arrivée ne fait pas foi. */
  period: string
  /** Jours prévus (charge attendue, bornée par les dates de mission). */
  expectedDays: number | null
  /** Jours déclarés. `null` = aucun relevé reçu. */
  declaredDays: number | null
  /** Jours entre la clôture du mois et la remise du relevé. */
  daysToSubmit: number | null
  /** Jours entre la clôture du mois et la validation client. */
  daysToClientValidation: number | null
  /** Satisfaction mesurée ce mois-là. */
  satisfaction: number | null
  /** Le client conteste des jours sur ce mois. */
  disputed: boolean
}

export type MissionDriftVerdict = {
  /**
   * `drifting` — au moins `minimumSignals` signaux allumés sur assez de mois.
   * `steady`   — assez de matière pour conclure, et rien d'assez grave.
   * `unmeasurable` — on ne SAIT pas. Jamais confondu avec `steady`.
   */
  kind: 'drifting' | 'steady' | 'unmeasurable'
  /** Mois d'historique réellement lus. */
  months: number
  /** Les signaux qu'on n'a pas pu évaluer, NOMMÉS. */
  unmeasurable: MissionDriftSignalId[]
} & (
  | { kind: 'drifting'; signals: MissionDriftSignalId[] }
  /** Les signaux allumés MAIS insuffisants pour alerter — un seul point. */
  | { kind: 'steady'; firing: MissionDriftSignalId[] }
  | { kind: 'unmeasurable' }
)

/**
 * Ce que l'API rend pour UNE mission : le verdict, plus de quoi la reconnaître.
 *
 * Le verdict seul est inutilisable à l'écran — « dérive sur 3 mois » sans nom de
 * mission ni de client n'ouvre aucune conversation.
 */
export interface MissionDriftReport {
  missionId: string
  missionLabel: string
  /** `null` quand la mission n'est rattachée à aucun compte lisible. */
  accountName: string | null
  /** Fin PRÉVUE, pour situer la dérive dans le temps restant. */
  endsOn: string | null
  verdict: MissionDriftVerdict
}

/** Une série de valeurs mesurées, dans l'ordre du temps, trous retirés. */
function measuredSeries(months: readonly MissionMonth[], pick: (m: MissionMonth) => number | null): number[] {
  const series: number[] = []
  for (const month of months) {
    const value = pick(month)
    if (value !== null && Number.isFinite(value)) series.push(value)
  }
  return series
}

/** Les `count` DERNIERS mois portent-ils tous un écart négatif consécutif ? */
function hasConsecutiveNegativeGap(months: readonly MissionMonth[], count: number): boolean | null {
  const tail = months.slice(-count)
  if (tail.length < count) return null
  let readable = 0
  for (const month of tail) {
    if (month.declaredDays === null || month.expectedDays === null) continue
    readable += 1
    // Un écart POSITIF (heures supplémentaires) n'est pas ce signal-là : il pose
    // une autre question, celle de l'accord contractuel.
    if (month.declaredDays >= month.expectedDays) return false
  }
  // Un seul mois illisible casse la consécutivité : on ne comble pas un trou.
  return readable === count ? true : null
}

/** Une suite STRICTEMENT croissante sur `count` mesures consécutives. */
function risesOver(series: readonly number[], count: number): boolean | null {
  if (series.length < count) return null
  const tail = series.slice(-count)
  for (let i = 1; i < tail.length; i += 1) {
    // Un délai STABLE, même long, n'est pas une dérive : c'est une habitude, et
    // c'est un autre problème que celui-ci.
    if (tail[i] <= tail[i - 1]) return false
  }
  return true
}

/** Une suite strictement décroissante sur `count` mesures consécutives. */
function fallsOver(series: readonly number[], count: number): boolean | null {
  if (series.length < count) return null
  const tail = series.slice(-count)
  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i] >= tail[i - 1]) return false
  }
  return true
}

/**
 * Le verdict. Pur : mêmes mois → même réponse, sans base de données.
 *
 * `null` d'un sous-détecteur veut dire « je n'ai pas pu regarder », et il
 * remonte tel quel dans `unmeasurable`. `false` veut dire « j'ai regardé, il n'y
 * a rien » — les écrire pareil est exactement le défaut que ce module refuse.
 */
export function detectMissionDrift(input: readonly MissionMonth[]): MissionDriftVerdict {
  const months = [...input].sort((a, b) => a.period.localeCompare(b.period))
  const T = MISSION_DRIFT_THRESHOLDS

  const results: Record<MissionDriftSignalId, boolean | null> = {
    growing_day_gap: hasConsecutiveNegativeGap(months, T.negativeGapMonths),
    late_timesheet: risesOver(
      measuredSeries(months, m => m.daysToSubmit),
      T.submitDelayTrendMonths,
    ),
    slow_client_validation: risesOver(
      measuredSeries(months, m => m.daysToClientValidation),
      T.clientValidationTrendMonths,
    ),
    satisfaction_drop: fallsOver(
      measuredSeries(months, m => m.satisfaction),
      T.satisfactionDropMeasures,
    ),
    // « Une seule suffit » : le seuil se lit, il ne se suppose pas à 1.
    disputed_days: months.filter(m => m.disputed).length >= T.disputedPeriods,
  }

  const unmeasurable = MISSION_DRIFT_SIGNAL_IDS.filter(id => results[id] === null)
  const firing = MISSION_DRIFT_SIGNAL_IDS.filter(id => results[id] === true)
  const measurableCount = MISSION_DRIFT_SIGNAL_IDS.length - unmeasurable.length

  // Trois refus, et ils ne disent pas la même chose. Aucun ne rend « steady ».
  //  1. pas assez d'historique — une mission neuve n'est pas une mission saine ;
  //  2. moins de signaux mesurables que le minimum exigé — même si tout ce qui
  //     reste criait, le verdict ne pourrait jamais s'appuyer sur deux signaux.
  if (months.length < T.minimumMonths) return { kind: 'unmeasurable', months: months.length, unmeasurable }
  if (measurableCount < T.minimumSignals) return { kind: 'unmeasurable', months: months.length, unmeasurable }

  if (firing.length >= T.minimumSignals) {
    return { kind: 'drifting', months: months.length, signals: firing, unmeasurable }
  }
  // Un seul signal est REMONTÉ quand même : il n'alerte pas, mais le cacher
  // ferait dire « rien à signaler » à une mission qui a déjà un pied dehors.
  return { kind: 'steady', months: months.length, firing, unmeasurable }
}
