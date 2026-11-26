import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiscoverLoading } from './DiscoverStates'

describe('DiscoverLoading — un seul indicateur (#4517)', () => {
  it('dit le chargement UNE fois : une ligne de progression, ni liste d’étapes ni barre', () => {
    const { container } = render(<DiscoverLoading />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(container.querySelectorAll('[aria-hidden="true"] .skeleton').length).toBeGreaterThan(0)
  })

  it('#4517.1 — un seul élément animé : le spinner ; les squelettes sont immobiles', () => {
    const { container } = render(<DiscoverLoading />)
    expect(container.querySelectorAll('.animate-spin')).toHaveLength(1)
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
    skeletons.forEach(el => expect(el.className).toContain('[animation:none]'))
  })

  it('« Arrêter » est proposé quand la recherche peut être coupée', () => {
    render(<DiscoverLoading onStop={() => undefined} />)
    expect(screen.getByRole('button', { name: /arrêter|stop/i })).toBeInTheDocument()
  })

  it('ne nomme jamais un fournisseur', () => {
    const { container } = render(<DiscoverLoading />)
    expect(container.textContent).not.toMatch(/pappers|insee|sirene|bodacc|boamp|apollo|brave/i)
  })
})
