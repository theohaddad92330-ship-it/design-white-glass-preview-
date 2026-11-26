import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DISCOVER_BLOCK_CAP } from '@bellum/contracts'
import { DiscoverHistoryBlocks } from './DiscoverHistoryBlocks'
import type { DiscoverCandidate, DiscoverSignal } from '@/features/discover/lib/discover-types'

const NOW = Date.parse('2026-10-28T12:00:00Z')
const offer = (date: string): DiscoverSignal => ({ type: 'hiring', date, label: 'Développeur Java' })
const account = (siren: string, signals: DiscoverSignal[]) =>
  ({ name: `Compte ${siren}`, siren, signals }) as unknown as DiscoverCandidate
const recent = (n: number) => account(`r${n}`, [offer('2026-10-20')])
const old = (n: number) => account(`h${n}`, [offer('2025-02-01'), offer('2026-07-20')])

const view = (rows: DiscoverCandidate[], subject?: string) =>
  render(
    <DiscoverHistoryBlocks
      rows={rows}
      nowMs={NOW}
      {...(subject ? { subject } : {})}
      renderRow={(candidate, reason) => (
        <p data-testid="row">
          {candidate.name}
          {reason ? <span data-testid="reason-given" /> : null}
        </p>
      )}
    />,
  )

describe('#4761 — les deux blocs de Découvrir', () => {
  it('nomme les deux blocs dans l’ordre : Signaux récents, puis Comptes à historique', () => {
    view([old(1), recent(1)])
    const headings = screen.getAllByRole('heading').map(h => h.textContent)
    expect(headings[0]).toMatch(/Signaux récents/)
    expect(headings[1]).toMatch(/Comptes à historique/)
  })

  it('dit « 20 sur 134 » et un « Voir les 114 autres » explicite — jamais un plafond silencieux', () => {
    view(Array.from({ length: 134 }, (_, i) => recent(i)))
    expect(screen.getAllByTestId('row')).toHaveLength(DISCOVER_BLOCK_CAP)
    expect(screen.getByTestId('discover-block-recent-count').textContent).toBe('20 sur 134')
    fireEvent.click(screen.getByRole('button', { name: 'Voir les 114 autres' }))
    expect(screen.getAllByTestId('row')).toHaveLength(134)
  })

  it('un bloc vide disparaît : ni titre, ni « 0 »', () => {
    view([recent(1)])
    expect(screen.queryByTestId('discover-block-history')).toBeNull()
    expect(screen.queryByText(/Comptes à historique/)).toBeNull()
    expect(screen.queryByText(/^0$/)).toBeNull()
  })

  it('un compte à historique reçoit sa raison ; un compte récent n’en reçoit pas', () => {
    view([recent(1), old(1)], 'Java')
    expect(screen.getAllByTestId('reason-given')).toHaveLength(1)
  })

  it('compte les comptes sans signal ni historique au lieu de les taire', () => {
    view([recent(1), account('n', [])])
    expect(screen.getByTestId('discover-blocks-unlisted').textContent).toMatch(/1 autre compte/)
  })
})
