/**
 * #3278.r42 (recette prod R42, Thales) — ce qui FONDE la route du plan, semé pour la démonstration :
 * le signal qui la motive, la preuve citée (source + jour) et l'historique de canal. Même forme que le
 * plan réel (`recommended_route_for_plan`, apps/ia) : trois chaînes sous `plan.recommendedRoute`.
 * Les jours sont relatifs au semis (jamais figés) ; les comptes sans entrée ne portent rien.
 */
type RouteEvidence = { motivating_signal?: string; proof_cited?: string; channel_history?: string }

const DAY_MS = 86_400_000

function dayAgo(today: Date, days: number): string {
  return new Date(today.getTime() - days * DAY_MS).toISOString().slice(0, 10)
}

export function demoRouteEvidenceOf(company: string, today: Date = new Date()): RouteEvidence {
  if (company !== 'Thales') return {}
  return {
    motivating_signal: `Thales va ouvrir au Japon une première base de maintenance · fr.finance.yahoo.com · ${dayAgo(today, 5)}`,
    proof_cited: `2 références client publiables dans le secteur Aéronautique et défense — source : références client de l’espace · ${dayAgo(today, 0)}`,
    channel_history: 'email ×2, linkedin ×1 (messages préparés sur ce compte)',
  }
}
