import type { AccountRow } from './types'

/**
 * Refonte Théo (comptes-liste) — LA DÉCISION D'ÉQUIPE d'un compte, écrite EN MOTS, sans aucun nombre.
 *
 * Quatre états : À trancher · Priorisé · Écarté · En observation. Les trois premiers SONT la porte de
 * priorité (`priority_gate` : pending / prioritised / parked) — rien n'est recalculé (GA-26) ; le
 * quatrième est le statut commercial « En observation » (`watching`) d'un compte dont la porte n'est
 * pas encore tranchée : l'équipe a décidé d'attendre, ce qui n'est ni prioriser ni écarter.
 *
 * Une porte ABSENTE (projection antérieure au lot) ne dit rien : `null`, jamais un « À trancher » deviné.
 */
type TeamDecision = 'pending' | 'prioritised' | 'parked' | 'watching'

export function teamDecisionOf(row: Pick<AccountRow, 'priority_gate' | 'commercial_status'>): TeamDecision | null {
  if (row.priority_gate === 'prioritised') return 'prioritised'
  if (row.priority_gate === 'parked') return 'parked'
  if (row.priority_gate === 'pending') return row.commercial_status === 'watching' ? 'watching' : 'pending'
  return null
}

/** La clé de libellé de chaque état : les trois portes réutilisent `gate.state.*` (un seul endroit, GA-26). */
export const TEAM_DECISION_LABEL_KEY: Record<TeamDecision, string> = {
  pending: 'gate.state.pending',
  prioritised: 'gate.state.prioritised',
  parked: 'gate.state.parked',
  watching: 'commercialStatus.watching',
}

/**
 * La teinte de chaque état : un jeton doux (fond + texte AA des deux thèmes) — la couleur dit l'état,
 * jamais une nuance brute. « À trancher » appelle une action (ambre), « Priorisé » est acquis (vert),
 * « Écarté » s'efface (neutre), « En observation » est l'accent.
 */
export const TEAM_DECISION_TONE: Record<TeamDecision, string> = {
  pending: 'bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)] text-[var(--warning-soft-text)]',
  prioritised: 'bg-[color-mix(in_srgb,var(--success-soft-text)_14%,transparent)] text-[var(--success-soft-text)]',
  parked: 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
  watching: 'bg-[color-mix(in_srgb,var(--bellum-text-accent)_14%,transparent)] text-[var(--bellum-text-accent)]',
}
