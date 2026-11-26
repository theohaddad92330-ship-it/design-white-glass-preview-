import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { normalizeDiscoverResponse } from '../lib/discover-normalize'
import { CandidateProvenance } from './CandidateProvenance'

// #4793.1 (recette prod 01/11, PARTIAL) — « 0 marqueur base commune à l'écran » : un compte venu de la base COMMUNE se
// reconnaît sur sa carte, en mots simples, sans nommer une source ni un fournisseur (#4791.4, doctrine).
describe('#4793.1 — un compte de la base commune se reconnaît à l’écran', () => {
  const response = normalizeDiscoverResponse({
    candidates: [
      { name: 'COMMUN', siren: '700000001', fromCommonBase: true },
      { name: 'REGISTRE', siren: '700000002' },
      { name: 'FAUX', siren: '700000003', fromCommonBase: 'oui' },
    ],
    query: {},
    degraded: [],
  })
  const [common, registry, fake] = response.candidates

  it('le normaliseur garde le booléen vrai, et seulement lui', () => {
    expect(common?.fromCommonBase).toBe(true)
    expect(registry?.fromCommonBase).toBeUndefined()
    expect(fake?.fromCommonBase).toBeUndefined()
  })

  it('la carte dit « base commune », sans nommer de source', () => {
    render(<CandidateProvenance candidate={common!} />)
    const text = screen.getByTestId('candidate-provenance').textContent ?? ''
    expect(text).toMatch(/base commune/i)
    expect(text).not.toMatch(/dataforge|market memory|pappers|apollo|brave|firecrawl|cr[ée]dit/i)
  })

  it('SAIT DIRE NON : une carte du registre n’affiche rien', () => {
    const { container } = render(<CandidateProvenance candidate={registry!} />)
    expect(container.textContent).toBe('')
  })

  it('le besoin daté et la base commune se lisent ensemble, sur une seule ligne', () => {
    render(
      <CandidateProvenance candidate={{ fromCommonBase: true, observedNeed: { label: 'Java', date: '2025-03-12' } }} />,
    )
    const text = screen.getByTestId('candidate-provenance').textContent ?? ''
    expect(text).toMatch(/base commune/i)
    expect(text).toMatch(/Java/)
  })
})
