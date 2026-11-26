import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { WatchHypothesis, WatchSignal } from '@/features/accounts/model/watch'
import { i18n } from '@/i18n'
import { WatchHypothesesPanel } from './WatchHypothesesPanel'

const founding = {
  id: 'a1-watch-0',
  analysisId: 's1',
  signal: 'Plan 2029 annoncé',
  date: '2026-07-01',
  sourceUrl: 'https://example.org/demo/press/sg-1',
  sourceKind: 'press',
} as WatchSignal

const hypothesis = (overrides: Partial<WatchHypothesis> = {}): WatchHypothesis => ({
  hypothesis: 'SG arbitre ses investissements applicatifs',
  confidence: 'probable',
  esnAngle: 'Cadrage de capacité',
  firstAction: 'Demander les chantiers cadrés',
  foundingSignals: [founding],
  citedSignals: [],
  ...overrides,
})

// #3939.a — « hypothèses qualifiées + signaux fondateurs » visibles dans la Veille.
describe('WatchHypothesesPanel (#3939.a)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme l’hypothèse, sa convergence, son angle et ses signaux fondateurs avec leur preuve', () => {
    render(<WatchHypothesesPanel hypotheses={[hypothesis()]} />)
    expect(screen.getByRole('heading', { name: 'Hypothèses qualifiées' })).toBeInTheDocument()
    expect(screen.getByText('SG arbitre ses investissements applicatifs')).toBeInTheDocument()
    expect(screen.getByText('Convergence partielle')).toBeInTheDocument()
    expect(screen.getByText('Signaux fondateurs')).toBeInTheDocument()
    expect(screen.getByText(/Plan 2029 annoncé/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voir l'article/ })).toHaveAttribute(
      'href',
      'https://example.org/demo/press/sg-1',
    )
  })

  it('aucune probabilité : jamais de pourcentage ni le mot « probable »', () => {
    const { container } = render(<WatchHypothesesPanel hypotheses={[hypothesis()]} />)
    expect(container.textContent).not.toMatch(/%|probab/i)
  })

  it('analyse antérieure au lien : la prose de l’analyse, nommée comme telle', () => {
    render(
      <WatchHypothesesPanel
        hypotheses={[hypothesis({ foundingSignals: [], citedSignals: ['Augmentation de capital'] })]}
      />,
    )
    expect(screen.getByText('Signaux cités par l’analyse')).toBeInTheDocument()
    expect(screen.queryByText('Signaux fondateurs')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans hypothèse, aucun panneau', () => {
    const { container } = render(<WatchHypothesesPanel hypotheses={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
