/**
 * #4307.2 — « Voir tout l'historique (N) » sur la carte candidate : GRATUIT (6894f2cdc0 a retiré le
 * déblocage payant), déplie TOUS les signaux du compte. N est le vrai compte ; pas de geste à 5 ou moins.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate, DiscoverSignal } from '@/features/discover/lib/discover-types'

vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))

import { CandidateRow } from './CandidateRow'

const signalsOf = (n: number): DiscoverSignal[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'business' as const,
    label: `Fait historique ${i}`,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    fromSpace: true,
  }))

function candidate(signals: DiscoverSignal[]): DiscoverCandidate {
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
    signals,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
  }
}

function renderRow(c: DiscoverCandidate) {
  // #4495 — l'historique se lit dans l'aperçu du compte (la carte V22 porte le sujet et les compteurs).
  return renderWithRouter(
    <CandidateRow
      defaultOpen
      candidate={c}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

describe('CandidateRow — voir tout l’historique, gratuit (#4307.2)', () => {
  it('9 signaux : le geste porte le vrai compte et déplie tous les faits, sans crédit', async () => {
    renderRow(candidate(signalsOf(9)))
    const button = await screen.findByRole('button', { name: /Voir tout l.historique \(9\)/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // #4495 — le fait le plus récent est aussi le SUJET de la carte : on lit l'historique dans SA liste.
    expect(screen.queryByRole('list', { name: /Historique complet/ })).toBeNull()
    fireEvent.click(button)
    const history = within(screen.getByRole('list', { name: /Historique complet/ }))
    for (let i = 0; i < 9; i++) expect(history.getByText('Fait historique ' + i)).toBeInTheDocument()
    // Le bouton « Construire le dossier » porte son prix ; le geste d'historique, lui, est gratuit.
    expect(button.textContent).not.toMatch(/crédit/i)
    expect(screen.getByRole('list', { name: /Historique complet/ }).textContent).not.toMatch(/crédit/i)
  })

  it('sait dire NON : 5 signaux ou moins → aucun geste, jamais « (0) »', async () => {
    renderRow(candidate(signalsOf(5)))
    expect(screen.queryByRole('button', { name: /Voir tout l.historique/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument()
  })
})
