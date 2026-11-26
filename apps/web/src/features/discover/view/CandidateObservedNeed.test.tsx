import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { normalizeDiscoverResponse } from '../lib/discover-normalize'
import { CandidateProvenance } from './CandidateProvenance'

/**
 * #4791.2 / #4762.1 (Louis 31/10) — un compte de la base commune porte son besoin DATÉ (« Besoin Java, mars
 * 2025 »), récent ou historique. Ligne sans date = pas de besoin ; aucune source nommée sur la carte (#4791.4).
 */
const raw = {
  candidates: [
    { name: 'BASE', siren: '700000001', observedNeed: { label: 'Java', date: '2025-03-12' } },
    { name: 'SANS DATE', siren: '700000002', observedNeed: { label: 'Java' } },
    { name: 'EXACT', siren: '700000003' },
  ],
  query: {},
  degraded: [],
}

describe('#4791.2 — le besoin daté de la base commune sur la carte', () => {
  const [base, undated, exact] = normalizeDiscoverResponse(raw).candidates

  it('le normaliseur garde un besoin daté, rejette un besoin sans date', () => {
    expect(base?.observedNeed).toEqual({ label: 'Java', date: '2025-03-12' })
    expect(undated?.observedNeed).toBeUndefined()
    expect(exact?.observedNeed).toBeUndefined()
  })

  it('la carte dit « Besoin Java, mars 2025 », sans nommer de source', () => {
    render(<CandidateProvenance candidate={base!} />)
    const text = screen.getByTestId('candidate-provenance').textContent ?? ''
    expect(text).toMatch(/Besoin Java, mars 2025/)
    expect(text).not.toMatch(/dataforge|orion|market|mémoire|base commune|commun/i)
  })

  it('sans besoin daté, aucune ligne', () => {
    const { container } = render(<CandidateProvenance candidate={undated!} />)
    expect(container.textContent).toBe('')
  })
})

/**
 * #5203 (lot 782) — la carte dit POURQUOI le compte est là : la NATURE du besoin et sa date, « en 2022 » quand il est
 * ancien, « il y a 3 mois » quand il est récent. Jamais une source nommée.
 */
describe('#5203 — nature et date du besoin sur la carte', () => {
  const at = (date: string, nature?: string) =>
    normalizeDiscoverResponse({
      candidates: [
        { name: 'X', siren: '700000009', observedNeed: { label: 'Java', date, ...(nature ? { nature } : {}) } },
      ],
      query: {},
      degraded: [],
    }).candidates[0]!

  it('un besoin ancien se dit avec sa nature et son année', () => {
    render(<CandidateProvenance candidate={at('2022-05-10', 'mission')} />)
    expect(screen.getByTestId('candidate-provenance').textContent).toMatch(/Mission Java, en 2022/)
  })

  it('un recrutement récent se dit « il y a N mois »', () => {
    const date = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)
    render(<CandidateProvenance candidate={at(date, 'recrutement')} />)
    expect(screen.getByTestId('candidate-provenance').textContent).toMatch(/Recrutement Java, il y a 3 mois/)
  })

  it('sans nature, la phrase d’avant reste (« Besoin Java, … »)', () => {
    render(<CandidateProvenance candidate={at('2025-03-12')} />)
    expect(screen.getByTestId('candidate-provenance').textContent).toMatch(/Besoin Java, mars 2025/)
  })
})
