import type { DiscoverCandidate } from '@bellum/contracts'

/**
 * #4437 (Louis 21/10/2026) — le palier VOISIN d'un recrutement qualifié, en salle de démonstration.
 *
 * Le vrai chemin (`apps/ia/app/services/signal_neighbours.py`) ajoute, sous les comptes exacts d'un
 * « recrutement React » maigre, des comptes voisins (offres du domaine, appels d'offres, levées), chacun
 * étiqueté `widenedFrom`. La salle rejoue cette FORME avec UN compte fictif voisin (appel d'offres du
 * domaine, daté, lien `example.org`), le mot-clé TAPÉ repris. Coverage : `DEMO_DISCOVER_FRESH_WIDENING_COVERAGE`.
 */

function demoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
}

function typedKeywords(query: Record<string, unknown>): string[] {
  const raw = query.keywords
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []
  return list
    .map(value =>
      String(value ?? '')
        .trim()
        .toLowerCase(),
    )
    .filter(value => value.length > 0)
}

/** La réponse de démo du mode Signaux, avec UN voisin quand un recrutement qualifié est demandé ; sinon telle quelle. */
export function withDemoSignalNeighbour<T extends { candidates: unknown[] }>(
  response: T,
  query: Record<string, unknown>,
): T & { widening?: { requested: string[]; added: number; via: string[] } } {
  const keywords = typedKeywords(query)
  const sources = Array.isArray(query.sources) ? query.sources.map(String) : []
  const hiringAsked = sources.length === 0 || sources.includes('hiring')
  if (keywords.length === 0 || !hiringAsked) return response
  const requested = keywords.map(keyword => `hiring:${keyword}`)
  const neighbour: DiscoverCandidate = {
    name: 'Collectivité des Hauts-de-Lys (démo)',
    siren: '000000966',
    nafCode: '84.11Z',
    sector: 'Administration publique générale',
    city: 'Lille',
    department: '59',
    headcountRange: '1 000 à 1 999 salariés',
    creationDate: null,
    score: null,
    scoreFactors: [],
    signals: [
      {
        type: 'tender',
        label: 'Refonte du portail web et des démarches en ligne',
        date: demoDay(6),
        url: 'https://marches.example.org/demo/000000966',
      },
    ],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    widenedFrom: { axis: 'signal', requested, via: 'tender' },
  }
  return {
    ...response,
    candidates: [...response.candidates, neighbour],
    widening: { requested, added: 1, via: ['hiring', 'capital'] },
  }
}
