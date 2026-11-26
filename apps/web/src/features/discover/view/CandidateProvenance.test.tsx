import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { normalizeDiscoverResponse } from '../lib/discover-normalize'
import { CandidateProvenance } from './CandidateProvenance'

/**
 * #4430 / #4437 (Louis 21/10/2026) — la carte dit POURQUOI un compte voisin est là et DE QUAND sont ses
 * offres lues en cache ; un compte trouvé par une collecte fraîche le dit. Jamais un nom de fournisseur ;
 * rien de tout ça sur une carte exacte aux offres fraîches (« on n'affiche pas ce qu'on n'a pas »).
 */
const raw = {
  candidates: [
    { name: 'ALPHA', siren: '800000001', jobsAsOf: '2026-10-19' },
    { name: 'GAMMA', siren: '800000003', widenedFrom: { axis: 'signal', requested: ['hiring:react'], via: 'tender' } },
    { name: 'DELTA', siren: '800000004', skillFreshFill: true },
    { name: 'EXACT', siren: '800000005' },
    { name: 'BAD', siren: '800000006', jobsAsOf: 'hier', widenedFrom: { axis: 'humeur' } },
  ],
  query: {},
  degraded: [],
  widening: { requested: ['hiring:react'], added: 1, via: ['hiring', 'tender'] },
}

describe('#4430 / #4437 — provenance d’un compte proposé', () => {
  const response = normalizeDiscoverResponse(raw)
  const [alpha, gamma, delta, exact, bad] = response.candidates

  it('le normaliseur garde ce que l’IA a dit, et rejette ce qui n’est pas au contrat', () => {
    expect(alpha?.jobsAsOf).toBe('2026-10-19')
    expect(gamma?.widenedFrom?.via).toBe('tender')
    expect(delta?.skillFreshFill).toBe(true)
    expect(bad?.jobsAsOf).toBeUndefined()
    expect(bad?.widenedFrom).toBeUndefined()
    expect(response.widening?.added).toBe(1)
  })

  it('un voisin dit pourquoi il est là, en mots simples', () => {
    render(<CandidateProvenance candidate={gamma!} />)
    expect(screen.getByTestId('candidate-provenance').textContent).toMatch(/voisin/i)
    expect(screen.getByTestId('candidate-provenance').textContent).toMatch(/appel d'offres/i)
  })

  it('des offres lues en cache disent leur date', () => {
    render(<CandidateProvenance candidate={alpha!} />)
    expect(screen.getByTestId('candidate-provenance').textContent).toContain('19/10/2026')
  })

  it('un compte trouvé par une collecte fraîche le dit, sans nommer de source', () => {
    render(<CandidateProvenance candidate={delta!} />)
    const text = screen.getByTestId('candidate-provenance').textContent ?? ''
    expect(text).toMatch(/fraîche/i)
    expect(text).not.toMatch(/fantastic|mantiks|theirstack|jooble|adzuna/i)
  })

  it('une carte exacte aux offres fraîches n’affiche rien', () => {
    const { container } = render(<CandidateProvenance candidate={exact!} />)
    expect(container.textContent).toBe('')
  })
})
