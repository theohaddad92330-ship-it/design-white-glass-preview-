import { measurability, type Measurability } from '@bellum/contracts'

/**
 * LES CINQ KPI DE MATCHING QUI ATTENDAIENT UN HISTORIQUE (PDF 4 §16.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le chantier du PDF 4 les avait différés avec une raison juste : « ils
 * demandent un historique qui n'existera qu'après plusieurs semaines d'usage ».
 * C'était vrai du CHIFFRE, pas du mécanisme.
 *
 * `measurability` (décision D52) permet de les livrer maintenant : sous le
 * seuil, l'écran dit « non mesurable — 3 positionnements sur les 10
 * nécessaires », et le chiffre s'allume tout seul le jour où l'historique
 * suffit. Personne n'a à revenir les brancher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX REFUS PORTÉS PAR LE CALCUL
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucun de ces chiffres n'est une probabilité.** Un taux de transformation
 *    observé dit ce qui S'EST passé ; le présenter comme une chance de réussir
 *    le prochain positionnement serait le score que l'arbitrage n°4 interdit —
 *    et ce serait la cinquième fois qu'on le refuse.
 * 2. **Un délai se mesure en MÉDIANE.** Un besoin repris trois mois plus tard
 *    déplacerait une moyenne de plusieurs semaines et ferait conclure que
 *    l'équipe est lente, alors qu'un seul dossier a traîné.
 */

export const MATCHING_KPI_KEYS = [
  /** Part des positionnements qui aboutissent à une acceptation. */
  'submission_win_rate',
  /** Délai médian entre l'ouverture d'un besoin et sa première shortlist. */
  'time_to_shortlist_days',
  /** Délai médian entre la shortlist et le premier positionnement. */
  'time_to_submission_days',
  /** Nombre médian de profils poussés par besoin. */
  'profiles_per_need',
  /** Part des profils repositionnés ailleurs après un refus. */
  'reuse_after_rejection',
] as const
type MatchingKpiKey = (typeof MATCHING_KPI_KEYS)[number]

export type MatchingKpi = {
  key: MatchingKpiKey
  value: number | null
  unit: 'rate' | 'days' | 'count'
  measurability: Measurability
}

export type MatchingKpiInput = {
  submissions: number
  submissionsWon: number
  /** Délais besoin → shortlist, en jours. */
  needToShortlistDays: readonly number[]
  /** Délais shortlist → positionnement, en jours. */
  shortlistToSubmissionDays: readonly number[]
  /** Nombre de profils poussés, un nombre par besoin. */
  profilesPerNeed: readonly number[]
  rejectedProfiles: number
  rejectedProfilesRepositioned: number
}

/** Les seuils. Bas, pour écarter le bruit des premiers jours, pas pour attendre
 *  une significativité statistique qu'un outil commercial n'atteindra jamais. */
const THRESHOLDS: Record<MatchingKpiKey, number> = {
  submission_win_rate: 10,
  time_to_shortlist_days: 5,
  time_to_submission_days: 5,
  profiles_per_need: 5,
  reuse_after_rejection: 5,
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!
}

/**
 * Un indicateur mesuré, ou ce qu'il manque pour le mesurer.
 *
 * `value` reste `null` tant que le seuil n'est pas atteint — même si le calcul
 * aurait rendu un nombre. Un taux de transformation sur deux positionnements
 * vaut 0 % ou 100 %, et les deux sont faux.
 */
function withThreshold(
  key: MatchingKpiKey,
  observed: number,
  compute: () => number | null,
  unit: MatchingKpi['unit'],
): MatchingKpi {
  const state = measurability(observed, THRESHOLDS[key])
  return { key, value: state.measurable ? compute() : null, unit, measurability: state }
}

export function computeMatchingKpis(input: MatchingKpiInput): MatchingKpi[] {
  return [
    withThreshold(
      'submission_win_rate',
      input.submissions,
      () => (input.submissions > 0 ? input.submissionsWon / input.submissions : null),
      'rate',
    ),
    withThreshold(
      'time_to_shortlist_days',
      input.needToShortlistDays.length,
      () => median(input.needToShortlistDays),
      'days',
    ),
    withThreshold(
      'time_to_submission_days',
      input.shortlistToSubmissionDays.length,
      () => median(input.shortlistToSubmissionDays),
      'days',
    ),
    withThreshold('profiles_per_need', input.profilesPerNeed.length, () => median(input.profilesPerNeed), 'count'),
    withThreshold(
      'reuse_after_rejection',
      input.rejectedProfiles,
      () => (input.rejectedProfiles > 0 ? input.rejectedProfilesRepositioned / input.rejectedProfiles : null),
      'rate',
    ),
  ]
}
