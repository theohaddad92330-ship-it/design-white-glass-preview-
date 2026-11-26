/**
 * #3408.3 (beta 30/09/2026, #3408) — LE NIVEAU D'EFFORT SUGGÉRÉ, SUR LA CARTE.
 *
 * Le retour bêta demande que Découvrir « permette de produire une sélection
 * structurée » dans le vocabulaire du board d'effort (Focus / Sprint /
 * partenaires possibles / à surveiller / à écarter). La famille (tome 1
 * §8.4, `FamilyBadge`) existait déjà et se voit sur chaque carte ; ce fichier
 * prouve que le pont vers ce second vocabulaire (`EffortSuggestionBadge`,
 * `suggestedEffortLevelFor`) est bien CÂBLÉ sur l'écran, pas seulement testé
 * en pur (`discover-effort-suggestion.test.ts`).
 */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))

import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function renderCandidate(over: Partial<DiscoverCandidate> = {}) {
  return renderWithRouter(
    <CandidateRow
      defaultOpen
      candidate={candidate(over)}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('#3408.3 — EffortSuggestionBadge sur CandidateRow', () => {
  it('suggère « qualification au volume » pour un candidat non encore adressé (famille par défaut)', async () => {
    renderCandidate()
    const badge = await screen.findByTestId('discover-effort-suggestion-badge')
    expect(badge).toHaveTextContent('Suggéré : À qualifier')
  })

  it('suggère la route partenaire quand un prestataire est déjà en place', async () => {
    renderCandidate({
      addressability: {
        score: 10,
        max: 20,
        unmeasured: [],
        factors: [{ axis: 'lock', label: 'Verrouillage', points: 4 }],
      },
      signals: [],
    })
    const badge = await screen.findByTestId('discover-effort-suggestion-badge')
    expect(badge).toHaveTextContent('Suggéré : Route partenaire')
  })

  it('ne montre AUCUNE suggestion pour un candidat déjà possédé (compte réel, décision réelle)', async () => {
    renderCandidate({ accountId: 'acc-1' })
    await screen.findByText('ACME')
    expect(screen.queryByTestId('discover-effort-suggestion-badge')).not.toBeInTheDocument()
  })
})
