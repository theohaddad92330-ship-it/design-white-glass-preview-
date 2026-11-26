import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemoryLedgerEntry } from '@bellum/contracts'

/**
 * #1962.19 / #1962.20 / #1962.22 — PROMOTION NOTE → FAIT : UN GESTE DÉDIÉ.
 *
 * Avant ce lot, la seule porte de confirmation était de RÉÉCRIRE le texte
 * d'une note de Laura (Q1, 13/09) — une note qu'on veut confirmer TELLE
 * QU'ELLE EST n'avait aucun geste. « Confirmer comme fait » appelle le même
 * `PATCH /memory/facts/:id`, avec `confirm: true` au lieu d'un texte réécrit.
 * La PORTÉE (#1962.20) reste le geste EXISTANT (`onSetScope`, #1916.21) — un
 * réglage vit à un seul endroit (GA-26), il ne se dédouble pas ici.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

const mutate = vi.fn()
vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useUpdateFact: () => ({ mutate, isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

const { MemoryFactRow } = await import('./MemoryFactRow')

function fact(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'f-1',
    layer: 'facts',
    text: 'ALTEN ne serait plus sur le compte.',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'workspace',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: null,
    ...over,
  }
}

function renderRow(entry: MemoryLedgerEntry) {
  return render(
    <MemoryFactRow entry={entry} onForget={vi.fn()} forgetting={false} onSetScope={vi.fn()} settingScope={false} />,
  )
}

describe('MemoryFactRow — confirmer une note de Laura comme fait (#1962.19)', () => {
  it('une note de Laura non confirmée porte le geste « Confirmer comme fait »', () => {
    renderRow(fact({ origin: 'copilot', detail: 'copilotNote' }))
    expect(screen.getByRole('button', { name: /Confirmer comme fait/ })).toBeInTheDocument()
  })

  it('le clic confirme SANS réécrire le texte — `confirm: true` seul, jamais `fact`', () => {
    renderRow(fact({ id: 'f-9', origin: 'copilot', detail: 'copilotNote' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmer comme fait/ }))
    expect(mutate).toHaveBeenCalledWith({ id: 'f-9', confirm: true })
  })

  it('une note déjà confirmée ne porte plus le geste — elle est déjà promue', () => {
    renderRow(
      fact({
        origin: 'copilot',
        detail: 'confirmedNote',
        confirmedBy: { firstName: 'Carol', avatarUrl: null },
        confirmedAt: '2026-09-15T10:00:00.000Z',
      }),
    )
    expect(screen.queryByRole('button', { name: /Confirmer comme fait/ })).not.toBeInTheDocument()
  })

  it('un fait DÉCLARÉ (origin manual) ne porte jamais ce geste — il ne concerne que les notes de Laura', () => {
    renderRow(fact({ origin: 'manual' }))
    expect(screen.queryByRole('button', { name: /Confirmer comme fait/ })).not.toBeInTheDocument()
  })

  it('sans droit de modifier (`canEdit: false`), le geste est absent — pas grisé, absent', () => {
    renderRow(fact({ origin: 'copilot', detail: 'copilotNote', canEdit: false }))
    expect(screen.queryByRole('button', { name: /Confirmer comme fait/ })).not.toBeInTheDocument()
  })

  // #1962.22 — la date de confirmation, à côté de qui a confirmé.
  it('une note confirmée affiche QUI et QUAND', () => {
    renderRow(
      fact({
        origin: 'copilot',
        detail: 'confirmedNote',
        confirmedBy: { firstName: 'Carol', avatarUrl: null },
        confirmedAt: '2026-09-15T10:00:00.000Z',
      }),
    )
    expect(screen.getByText(/confirmée par Carol le/)).toBeInTheDocument()
  })

  // #1962.20 — la portée choisie à la promotion : le geste EXISTANT (#1916.21)
  // reste disponible sur une note fraîchement confirmée, comme sur tout fait.
  it('#1962.20 — le geste de portée existant reste disponible sur une note confirmée', () => {
    renderRow(
      fact({
        origin: 'copilot',
        detail: 'confirmedNote',
        confirmedBy: { firstName: 'Carol', avatarUrl: null },
        confirmedAt: '2026-09-15T10:00:00.000Z',
        scope: 'user',
        ownedByMe: true,
      }),
    )
    expect(screen.getByRole('button', { name: /Partager avec ton ESN/ })).toBeInTheDocument()
  })
})
