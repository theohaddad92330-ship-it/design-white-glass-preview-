import type { BriefingAction } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DecisionsSection } from './DecisionsSection'

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// Même mock que `ActionsBlock.test.tsx` — `PriorityCard` exige un
// `QueryClientProvider` pour `useSetRoleFit`/`useSetCardDisposition`, hors du
// périmètre de ce fichier (qui teste le regroupement en décisions, pas le
// geste « prioritaire pour moi »).
// #3265.13 (épopée #3287) — `DecisionCard` monte `PriorityCard`, qui lit
// désormais `usePlanItems` (dernier résultat déclaré du compte) ; ce fichier
// n'a pas de session à lui offrir.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))
vi.mock('../api', () => ({
  useSetRoleFit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCardDisposition: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

function card(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id' | 'kind'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: {},
    href: null,
    priority: 1,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  }
}

describe('DecisionsSection (BEL-SC-227, #3256)', () => {
  it('ne rend rien sans décision — une absence ne fait aucune ligne', () => {
    const { container } = render(<DecisionsSection decisions={[]} dispersionDetected={false} capacity={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rend une carte par décision, avec son étiquette de catégorie', () => {
    render(
      <DecisionsSection
        decisions={[
          { category: 'protect', action: card({ id: 'a', kind: 'mission_end' }) },
          { category: 'nextMove', action: card({ id: 'b', kind: 'account' }) },
        ]}
        dispersionDetected={false}
        capacity={null}
      />,
    )
    expect(screen.getAllByTestId('decisions-section')).toHaveLength(1)
    expect(screen.getByText('Protéger l’existant')).toBeInTheDocument()
    expect(screen.getByText('Prochain mouvement')).toBeInTheDocument()
  })

  it('BEL-SC-227.24 — la note de dispersion se pose sur la décision qui simplifie, jamais les autres', () => {
    render(
      <DecisionsSection
        decisions={[
          { category: 'protect', action: card({ id: 'a', kind: 'mission_end' }) },
          { category: 'simplify', action: card({ id: 'c', kind: 'task' }) },
        ]}
        dispersionDetected
        capacity={null}
      />,
    )
    expect(
      screen.getAllByText('Plusieurs sujets administratifs sont ouverts en même temps — celui-ci les regroupe.'),
    ).toHaveLength(1)
  })

  it('sans dispersion, aucune note ne s’affiche', () => {
    render(
      <DecisionsSection
        decisions={[{ category: 'simplify', action: card({ id: 'c', kind: 'task' }) }]}
        dispersionDetected={false}
        capacity={null}
      />,
    )
    expect(screen.queryByText(/Plusieurs sujets administratifs/)).not.toBeInTheDocument()
  })

  it('BEL-SC-227.22 — une capacité à zéro dossier ouvrable se DIT, jamais devinée', () => {
    render(
      <DecisionsSection
        decisions={[{ category: 'nextMove', action: card({ id: 'b', kind: 'account' }) }]}
        dispersionDetected={false}
        capacity={0}
      />,
    )
    expect(screen.getByText("0 dossier ouvrable aujourd'hui")).toBeInTheDocument()
  })

  it('une capacité inconnue (agenda non répondu) n’affiche aucune ligne', () => {
    render(
      <DecisionsSection
        decisions={[{ category: 'nextMove', action: card({ id: 'b', kind: 'account' }) }]}
        dispersionDetected={false}
        capacity={null}
      />,
    )
    expect(screen.queryByText(/dossier ouvrable/)).not.toBeInTheDocument()
  })
})
