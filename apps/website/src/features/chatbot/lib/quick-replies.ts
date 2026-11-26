/**
 * Les réponses rapides du §4.3 — « contextuelles à chaque tour, 2 à 3 maximum ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DÉCISIONS
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Déterministes, pas générées.** Elles se déduisent de l'axe que Laura
 *    cherche à renseigner. Demander au modèle de proposer ses propres boutons
 *    coûterait des jetons à chaque tour pour un résultat qu'on ne pourrait ni
 *    tester, ni traduire.
 * 2. **Des CLÉS, jamais des phrases.** Le serveur ne connaît pas la langue
 *    d'affichage mieux que le navigateur — c'est déjà la règle du CTA et des
 *    messages d'erreur. Une phrase française renvoyée par l'API finit sous les
 *    yeux d'un visiteur néerlandais.
 *
 * Ce sont des RÉPONSES, pas des questions : le visiteur clique pour dire ce
 * qu'il est, pas pour relancer Laura. Quatre boutons figés au premier tour —
 * l'état précédent — n'aidaient personne passé la première phrase.
 */

import type { ScoringAxis } from './routing'

/** Le maximum du §4.3. Au-delà, ce n'est plus un raccourci, c'est un menu. */
export const MAX_QUICK_REPLIES = 3

const BY_AXIS: Readonly<Record<ScoringAxis, readonly string[]>> = {
  companyType: ['esn', 'consulting', 'recruitment', 'other'],
  teamSize: ['small', 'medium', 'large'],
  persona: ['founder', 'sales', 'recruiter'],
  painFit: ['sourcing', 'prospection', 'admin'],
  tooling: ['excel', 'crm', 'erp'],
  trigger: ['project', 'problem', 'watch'],
  decision: ['decider', 'prescriber', 'influencer'],
  horizon: ['quarter', 'semester', 'nodate'],
}

/** Ce qu'on propose quand il n'y a plus rien à demander : des gestes, pas des
 *  réponses. C'est le moment de recommander, le §4.13 le dit en toutes lettres. */
const CLOSING = ['seeDemo', 'talkToTeam', 'pricing'] as const

/**
 * Les clés de traduction à proposer sous la dernière réponse.
 *
 * `asked` retire ce qui a déjà servi : reproposer « ESN / Cabinet / Autre » au
 * quatrième tour à quelqu'un qui a répondu « ESN » au premier est exactement le
 * formulaire que le §4.5 cherche à éviter.
 */
export function quickRepliesFor(next: ScoringAxis | null): string[] {
  const pool = next ? BY_AXIS[next] : CLOSING
  return pool.slice(0, MAX_QUICK_REPLIES).map(key => (next ? `${next}.${key}` : `closing.${key}`))
}
