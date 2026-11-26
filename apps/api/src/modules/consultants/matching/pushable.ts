/**
 * Le score POUSSABLE (PDF 4 §3.3) — « ce profil peut-il partir chez ce client ? »
 *
 * C'est la distinction structurante du module. La correspondance répond à « ce
 * profil correspond-il au besoin ? » ; le poussable répond à une autre question,
 * et les deux réponses divergent tout le temps : « 92 / 31 » veut dire « profil
 * parfait, indisponible jusqu'en novembre », « 68 / 84 » veut dire « profil
 * moyen, libre demain, TJM confortable, déjà apprécié ici ». Les fondre en un
 * chiffre unique de 61 détruirait l'information la plus utile au recruteur — et
 * c'est ce chiffre unique qu'il regarderait.
 *
 * Un terme qu'on ne peut pas mesurer sort du calcul et son poids est
 * redistribué. Pas de zéro par défaut : un profil qui n'est jamais passé chez ce
 * client n'a pas un « mauvais historique », il n'en a pas.
 */

export type PushableTerms = {
  /** 0-100. Le seul terme obligatoire : sans correspondance, il n'y a rien à pousser. */
  correspondence: number
  /** 0-100, `null` = disponibilité inconnue. */
  availability: number | null
  /** 0-100, `null` = TJM ou cible absents. */
  rateFit: number | null
  /** 0-100, `null` = jamais passé chez ce client. */
  clientHistory: number | null
  /** 0-100, `null` = aucune compétence retenue. */
  evidenceQuality: number | null
}

export type PushablePenalties = {
  /** Annule le profil : un consentement expiré interdit de le proposer, pas de le noter. */
  consentExpired: boolean
  /** −40. Un refus antérieur chez CE client est le risque le plus coûteux. */
  previouslyRejected: boolean
  /** −15. Le débauchage interne se propose, en le disant. */
  alreadyOnMissionAtClient: boolean
  /** −10. Une disponibilité annoncée il y a plus de 60 jours n'est plus une disponibilité. */
  availabilityStale: boolean
}

const WEIGHTS = {
  correspondence: 0.5,
  availability: 0.2,
  rateFit: 0.1,
  clientHistory: 0.1,
  evidenceQuality: 0.1,
} as const

export const PENALTY_PREVIOUSLY_REJECTED = 40
export const PENALTY_ALREADY_ON_MISSION = 15
export const PENALTY_AVAILABILITY_STALE = 10

/** Au-delà de ce silence, une disponibilité déclarée n'engage plus personne (§3.3). */
export const AVAILABILITY_REVALIDATION_DAYS = 60

export function pushableScore(terms: PushableTerms, penalties: PushablePenalties): number {
  // Le consentement expiré n'est pas une pénalité de plus : c'est un refus.
  // Le noter à 12 laisserait croire qu'il suffirait de mieux le classer.
  if (penalties.consentExpired) return 0

  const entries: [number, number][] = [[clamp(terms.correspondence), WEIGHTS.correspondence]]
  if (terms.availability !== null) entries.push([clamp(terms.availability), WEIGHTS.availability])
  if (terms.rateFit !== null) entries.push([clamp(terms.rateFit), WEIGHTS.rateFit])
  if (terms.clientHistory !== null) entries.push([clamp(terms.clientHistory), WEIGHTS.clientHistory])
  if (terms.evidenceQuality !== null) entries.push([clamp(terms.evidenceQuality), WEIGHTS.evidenceQuality])

  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0)
  const weighted = entries.reduce((sum, [value, weight]) => sum + value * weight, 0)
  const base = weighted / totalWeight

  let malus = 0
  if (penalties.previouslyRejected) malus += PENALTY_PREVIOUSLY_REJECTED
  if (penalties.alreadyOnMissionAtClient) malus += PENALTY_ALREADY_ON_MISSION
  if (penalties.availabilityStale) malus += PENALTY_AVAILABILITY_STALE

  return Math.max(0, Math.min(100, Math.round(base - malus)))
}

/**
 * Ce que vaut un passage antérieur chez ce client.
 *
 * `null` quand il n'y en a pas — le cas le plus fréquent. Le compter zéro
 * pénaliserait tout le vivier pour n'avoir jamais été proposé.
 */
export function clientHistoryScore(flag: string | null, recoverable: boolean): number | null {
  switch (flag) {
    case 'accepted':
      return 100
    case 'submitted':
      return 60
    case 'no_feedback':
      // Un silence n'est pas une décision. Il ne vaut ni un refus, ni un accord.
      return 50
    case 'rejected':
      // Un refus sur le prix ou le calendrier se rejoue ; sur les compétences, non.
      return recoverable ? 30 : 0
    default:
      return null
  }
}

/** Une disponibilité revalidée il y a plus de {@link AVAILABILITY_REVALIDATION_DAYS} jours. */
export function availabilityIsStale(checkedAt: string | null, now: Date): boolean {
  if (!checkedAt) return false
  const at = Date.parse(checkedAt)
  if (Number.isNaN(at)) return false
  return now.getTime() - at > AVAILABILITY_REVALIDATION_DAYS * 24 * 60 * 60 * 1000
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}
