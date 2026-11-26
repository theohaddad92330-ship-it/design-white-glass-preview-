import type { MarketPreview } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { MarketPreviewCard } from './MarketPreviewCard'

const PREVIEW: MarketPreview = {
  paths_observed: 41,
  esn_observed: 3,
  observed_stack: ['Data', 'Java', 'Cloud'],
  role_families: ['Data', 'Développement', 'PMO'],
}

const IDLE = { isPending: false, notCovered: false, unavailable: false }

describe('MarketPreviewCard (#1589.2) — le vocabulaire est fermé', () => {
  it('rend les quatre observations demandées', () => {
    render(<MarketPreviewCard preview={PREVIEW} {...IDLE} />)
    expect(screen.getByText('Ce que Bellum sait déjà')).toBeInTheDocument()
    expect(screen.getByText('Recours à des externes')).toBeInTheDocument()
    expect(screen.getByText('Observé')).toBeInTheDocument()
    expect(screen.getByText('Data · Java · Cloud')).toBeInTheDocument()
    expect(screen.getByText('Plusieurs liens observés')).toBeInTheDocument()
    expect(screen.getByText('Data · Développement · PMO')).toBeInTheDocument()
  })

  it('nomme sa source, sans parler de crédit (#4463)', () => {
    render(<MarketPreviewCard preview={PREVIEW} {...IDLE} />)
    expect(screen.getByText(/Observations du marché/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('⚠️ une dimension vide sur un compte COUVERT se dit « Inconnu », jamais « aucune »', () => {
    render(<MarketPreviewCard preview={{ ...PREVIEW, esn_observed: 0, observed_stack: [] }} {...IDLE} />)
    expect(screen.getAllByText('Inconnu').length).toBe(2)
    expect(screen.queryByText(/aucune/i)).not.toBeInTheDocument()
  })

  it('⚠️ « non couvert » n’est JAMAIS « ce compte n’externalise pas »', () => {
    render(<MarketPreviewCard preview={null} isPending={false} notCovered unavailable={false} />)
    expect(screen.getByText(/pas suffisamment d'observations marché/)).toBeInTheDocument()
    expect(screen.queryByText(/externalis/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Observé')).not.toBeInTheDocument()
  })

  it('⚠️ une PANNE ne se rend pas comme un compte non couvert', () => {
    render(<MarketPreviewCard preview={null} isPending={false} notCovered={false} unavailable />)
    expect(screen.getByText(/n'ont pas pu être lues/)).toBeInTheDocument()
    expect(screen.queryByText(/pas suffisamment d'observations/)).not.toBeInTheDocument()
  })

  it('pendant le chargement, le bloc se TAIT — un verdict démenti apprend à ne plus lire', () => {
    const { container } = render(<MarketPreviewCard preview={null} isPending notCovered={false} unavailable={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('⚠️ aucun nombre de parcours n’est écrit — l’aperçu n’est pas un recensement', () => {
    const { container } = render(<MarketPreviewCard preview={PREVIEW} {...IDLE} />)
    expect(container.textContent).not.toContain('41')
    expect(container.textContent).not.toContain('3')
  })
})
