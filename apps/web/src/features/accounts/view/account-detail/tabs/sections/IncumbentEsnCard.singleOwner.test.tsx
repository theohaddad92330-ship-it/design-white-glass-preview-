import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCanonicalContextSection } from './AccountCanonicalContextSection'
import { IncumbentEsnCard } from './IncumbentEsnCard'

/**
 * #2116.10 — GA-26 : l'ESN en place n'a qu'UN rendu dans l'onglet. Les deux
 * composants réels sont montés côte à côte, comme dans `TabOverview` — c'est
 * le point où une régression (ré-ajouter le bloc « Qui est déjà en place »
 * dans `AccountCanonicalContextCard`) redeviendrait invisible aux deux suites
 * séparées, qui ne se voient jamais l'une l'autre.
 */
const CONTEXT: AccountIntelligenceContextView = {
  accountId: 'acc-1',
  // #3219 (#190.1) — aucune contradiction de champ ouverte sur ce compte.
  conflicts: [],
  // #2116.3 / .6 / .7 — l'identité et la mémoire marché font partie de la vue
  // depuis ce lot ; ce fichier ne les teste pas, il les déclare INCONNUES
  // plutôt que de les inventer.
  companyName: { state: 'unknown' },
  sector: { state: 'unknown' },
  headquarters: { state: 'unknown' },
  marketMemory: {
    provenance: { source: 'market_memory', observedAt: null },
    read: { status: 'unavailable', reason: 'hors sujet de ce test' },
  },
  incumbentEsn: {
    state: 'known',
    value: [{ name: 'Capgemini', contractType: null, strengths: null, weaknesses: null }],
    provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
  },
  technologies: { state: 'unknown' },
  entryPaths: { state: 'unknown' },
  recommendations: [],
}

vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({
  useAccountIntelligenceContext: () => ({ data: CONTEXT }),
}))
// #3916.b — la carte « Annonces légales » lit aussi la veille des registres.
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined }),
}))

describe('IncumbentEsnCard — propriétaire unique de l’ESN en place (#2116.10, GA-26)', () => {
  it('rend le nom du titulaire EXACTEMENT une fois quand la carte et la section sont montées ensemble', async () => {
    renderWithRouter(
      <>
        <IncumbentEsnCard accountId="acc-1" />
        <AccountCanonicalContextSection accountId="acc-1" onTabChange={vi.fn()} />
      </>,
    )
    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.getAllByText('Capgemini')).toHaveLength(1)
    expect(screen.getAllByText('ESN déjà en place')).toHaveLength(1)
    // La section canonique ne porte plus ce titre : c'est la carte qui le garde.
    expect(screen.queryByText('Qui est déjà en place')).toBeNull()
  })
})
