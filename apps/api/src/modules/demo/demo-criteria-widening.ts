import {
  CRITERIA_WIDEN_MIN_RESULTS,
  type CriteriaWidening,
  type DiscoverCandidate,
  skillWideningTiers,
} from '@bellum/contracts'
import { demoSkillSignals } from './demo-discover-skill'

/**
 * #4433 (épopée, Louis 21/10/2026) — l'élargissement par paliers en salle de démonstration (craft rule n°9).
 *
 * Le vrai chemin (`apps/ia/app/routers/discover.py`, `criteria_widening.py`) élargit une recherche qui rend moins
 * de 10 comptes exacts au palier voisin du référentiel partagé. La salle rejoue cette FORME : après les comptes
 * exacts fictifs de `demoSkillSearchResponse`, deux comptes fictifs qui recrutent sur le PREMIER voisin de la
 * compétence tapée (« React » → JavaScript), étiquetés, et `query.widening` qui le dit. Tout est fictif : noms
 * inventés, SIREN à clé de Luhn fausse, liens `example.org`. Coverage : `DEMO_CRITERIA_WIDENING_COVERAGE`.
 */

interface DemoSkillResponse {
  candidates: DiscoverCandidate[]
  query: Record<string, unknown>
  degraded: unknown[]
}

const DEMO_WIDENED_ACCOUNTS = [
  { siren: '000000966', name: 'Vosges Numérique Services (démo)', city: 'Épinal', department: '88', daysAgo: 6 },
  { siren: '000000974', name: 'Atelier Sundgau Logiciels (démo)', city: 'Altkirch', department: '68', daysAgo: 15 },
] as const

function demoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
}

function typedSkill(query: Record<string, unknown>): string | null {
  const pick = (value: unknown): string | null =>
    Array.isArray(value) ? (value.map(v => String(v ?? '').trim()).find(v => v.length > 0) ?? null) : null
  return pick(query.keywords) ?? pick(query.technologiesObserved)
}

/**
 * La réponse de démonstration, élargie au premier voisin de la compétence quand l'exact reste sous le seuil.
 * Inchangée en strict (`strict`), sans compétence connue du référentiel, ou au-dessus du seuil (NON).
 */
export function withDemoWidening<T extends DemoSkillResponse>(
  response: T | null,
  query: Record<string, unknown>,
  strict: boolean | undefined,
): T | null {
  if (!response || strict === true || response.candidates.length >= CRITERIA_WIDEN_MIN_RESULTS) return response
  const skill = typedSkill(query)
  const neighbour = skill ? skillWideningTiers(skill)[0] : undefined
  const first = neighbour?.items[0]
  if (!neighbour || !first) return response
  const widened: DiscoverCandidate[] = DEMO_WIDENED_ACCOUNTS.map(account => ({
    name: account.name,
    siren: account.siren,
    nafCode: '62.01Z',
    sector: 'Programmation informatique',
    city: account.city,
    department: account.department,
    headcountRange: '50 à 99 salariés',
    creationDate: null,
    score: null,
    scoreFactors: [],
    // #4115.5 — les voisins élargis portent aussi leurs signaux datés (dates figées, `demoSkillSignals`).
    signals: demoSkillSignals(first.search, account.siren),
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    skillEvidence: {
      skill: first.search,
      offerCount: 1,
      latestOffer: {
        title: `Développeur ${first.search} H/F`,
        city: account.city,
        date: demoDay(account.daysAgo),
        url: `https://offres.example.org/demo/${account.siren}`,
        source: null,
      },
    },
    widenedBy: { axis: 'skill', tier: neighbour.tier, code: first.code },
  }))
  const widening: CriteriaWidening = {
    minResults: CRITERIA_WIDEN_MIN_RESULTS,
    exactCount: response.candidates.length,
    steps: [{ axis: 'skill', tier: neighbour.tier, codes: [first.code], added: widened.length }],
  }
  return { ...response, candidates: [...response.candidates, ...widened], query: { ...response.query, widening } }
}
