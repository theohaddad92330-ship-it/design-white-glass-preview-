import { accessFreshness, type AccessLockState } from './access.js'

/**
 * #4016.L4 (décision Louis 11/10, `c95_estimation_badgee` ; lot V10-E 17/10) — « COÛT D'ACCÈS ESTIMÉ ».
 *
 * ⚠️ Renverse EN PARTIE `c47_cout_acces` (« déclaré, jamais estimé ») : quand aucun coût n'est déclaré sur
 * CE compte, l'onglet Accès peut montrer une estimation, badgée « estimé », jamais à la place d'une
 * déclaration. Ce qui NE bouge PAS, et ne se négocie pas : l'estimation ne lit QUE ce que l'espace
 * lui-même a déclaré sur ses autres comptes — jamais un coût d'un autre espace (entente, art. 101 TFUE),
 * jamais une moyenne (« c'est sur ce chiffre qu'on négocie » : on montre UNE déclaration, datée, nommée).
 *
 * La base : le compte de l'espace au MÊME verrou (fait de verrou frais) dont le coût déclaré est le plus
 * récent et encore frais. Verrou inconnu, aucun compte comparable, déclaration périmée : aucune estimation.
 */
export type AccessCostCandidate = {
  accountId: string
  companyName: string
  cost: string
  costObservedAt: string | null
  /** L'état de verrou RETENU sur ce compte (un fait frais), `inconnu` sinon. */
  lock: AccessLockState
}

export type AccessCostEstimate = {
  value: string
  basis: { companyName: string; observedAt: string; lock: AccessLockState }
}

export function estimateAccessCost(input: {
  lock: AccessLockState
  candidates: readonly AccessCostCandidate[]
  now: Date
}): AccessCostEstimate | null {
  if (input.lock === 'inconnu') return null
  const comparable = input.candidates
    .filter(
      candidate =>
        candidate.lock === input.lock &&
        candidate.cost.trim() !== '' &&
        candidate.costObservedAt !== null &&
        accessFreshness({ kind: 'cost', observed_at: candidate.costObservedAt }, input.now) === 'fresh',
    )
    .sort((a, b) => Date.parse(b.costObservedAt ?? '') - Date.parse(a.costObservedAt ?? ''))
  const best = comparable[0]
  if (!best?.costObservedAt) return null
  return {
    value: best.cost.trim(),
    basis: { companyName: best.companyName, observedAt: best.costObservedAt, lock: best.lock },
  }
}
