import type { DiscoverFamily } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'

/**
 * #3408.2 (reste de la recette 30/09) — TROIS DES QUATRE EXPLICATIONS QUI
 * MANQUAIENT PAR COMPTE PROPOSÉ : le périmètre conseillé, le risque explicite
 * et la première action. La quatrième (l'effort) est `EffortSuggestionBadge`.
 *
 * ⚠️ Rien n'est GÉNÉRÉ : chaque ligne relit un fait déjà posé sur le candidat
 * (sa famille, sa barrière d'accès, ses rôles suggérés, les technologies NOMMÉES
 * par ses signaux) et n'existe que s'il y en a un. Une ligne sans fait ne se
 * rend pas — une absence ne fait aucune ligne (doctrine, Louis 20/09/2026).
 */
type CandidateAdvice = {
  /** Technologies nommées par les signaux du compte, trois au plus. */
  scope: string[]
  /** Clé i18n `advice.risk.*` (sans préfixe) et, pour `barrier`, le libellé de classe. */
  risk: { key: 'barrier' | 'viaIntermediary' | 'investigate' | 'deliveryIncompatible'; label?: string } | null
  /** Clé i18n `advice.first.*` (sans préfixe) et, le cas échéant, le rôle à ouvrir. */
  firstAction: { key: 'viaIntermediary' | 'reachableRole' | 'reachable' | 'investigate'; role?: string } | null
}

const SCOPE_MAX = 3

export function candidateAdvice(candidate: DiscoverCandidate, family: DiscoverFamily): CandidateAdvice {
  // Les technologies NOMMÉES par les offres d'abord ; à défaut, la pile OBSERVÉE par la mémoire marché
  // (#3408 — sans quoi le périmètre restait vide sur les comptes sans offre qui nomme une techno).
  const named = candidate.signals.flatMap(signal => signal.technologies ?? [])
  const scope = [...new Set(named.length > 0 ? named : (candidate.technologiesObserved ?? []))].slice(0, SCOPE_MAX)
  const signals = candidate.signals.some(signal => signal.deliveryFit === 'incompatible')

  let risk: CandidateAdvice['risk'] = null
  if (family === 'out_of_reach') risk = { key: 'barrier', label: candidate.barrier?.label ?? undefined }
  else if (family === 'via_intermediary') risk = { key: 'viaIntermediary' }
  else if (family === 'investigate') risk = { key: 'investigate' }
  else if (signals) risk = { key: 'deliveryIncompatible' }

  let firstAction: CandidateAdvice['firstAction'] = null
  if (family === 'via_intermediary') firstAction = { key: 'viaIntermediary' }
  else if (family === 'investigate') firstAction = { key: 'investigate' }
  else if (family === 'reachable') {
    const role = candidate.suggestedRoles[0]?.title
    firstAction = role ? { key: 'reachableRole', role } : { key: 'reachable' }
  }
  return { scope, risk, firstAction }
}
