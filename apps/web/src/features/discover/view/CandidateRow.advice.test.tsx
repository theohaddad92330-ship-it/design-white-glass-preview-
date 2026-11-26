/**
 * #3408.2 (recette 30/09) — PÉRIMÈTRE, RISQUE, PREMIÈRE ACTION, SUR LA CARTE.
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

describe('#3408.2 — CandidateAdvice sur CandidateRow', () => {
  it('un candidat à explorer dit son risque et sa première action, sans périmètre inventé', async () => {
    renderCandidate()
    const advice = await screen.findByTestId('discover-candidate-advice')
    expect(advice).toHaveTextContent(/Risque :\s*accès non établi à ce stade/)
    expect(advice).toHaveTextContent(/Première action :\s*vérifier la voie d’accès avant d’engager/)
    expect(advice).not.toHaveTextContent('Périmètre conseillé')
  })

  it('le périmètre reprend les technologies nommées par les signaux', async () => {
    renderCandidate({ signals: [{ technologies: ['Java', 'Kafka'] }] as unknown as DiscoverCandidate['signals'] })
    expect(await screen.findByTestId('discover-candidate-advice')).toHaveTextContent(
      /Périmètre conseillé :\s*Java, Kafka/,
    )
  })

  it('#3408 — le libellé ne passe jamais sur deux lignes : seule la valeur reprend à la ligne', async () => {
    renderCandidate()
    const advice = await screen.findByTestId('discover-candidate-advice')
    const labels = advice.querySelectorAll('dt')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label).toHaveClass('whitespace-nowrap', 'shrink-0')
    }
    for (const value of advice.querySelectorAll('dd')) expect(value).toHaveClass('min-w-0')
  })

  it('un compte déjà possédé ne porte aucune suggestion', async () => {
    renderCandidate({ accountId: 'acc-1' })
    await screen.findByText('ACME')
    expect(screen.queryByTestId('discover-candidate-advice')).not.toBeInTheDocument()
  })
})
