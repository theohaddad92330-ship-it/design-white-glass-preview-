import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import { NeedFramingCard } from './NeedFramingCard'

// #4270.3 (18/10) — en espace forfait / conseil, un besoin se lit comme un PROJET À
// CADRER : périmètre, sponsor, budget, relus sur les champs existants.

const need = (over: Partial<OpenNeedRow> = {}): OpenNeedRow =>
  ({
    context: 'Refonte du SI paie, deux pays',
    decision_maker_contact_id: '00000000-0000-4000-8000-000000000001',
    decision_maker_name: 'Claire Martin',
    budget_cents: '12000000',
    ...over,
  }) as OpenNeedRow

describe('#4270.3 — NeedFramingCard', () => {
  it('dit « Projet à cadrer » et relit périmètre, sponsor et budget', () => {
    render(<NeedFramingCard need={need()} />)
    expect(screen.getByRole('heading', { name: 'Projet à cadrer' })).toBeInTheDocument()
    expect(screen.getByText('Périmètre')).toBeInTheDocument()
    expect(screen.getByText('Refonte du SI paie, deux pays')).toBeInTheDocument()
    expect(screen.getByText('Sponsor')).toBeInTheDocument()
    expect(screen.getByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText(/120\s?000/)).toBeInTheDocument()
    // RV4-E-FIX 4291.7 — l'échéance se lit aussi, datée quand elle est connue.
    expect(screen.getByText('Échéance')).toBeInTheDocument()
  })

  it('RV4-E-FIX 4291.7 — une échéance connue se lit, jamais « à cadrer »', () => {
    render(<NeedFramingCard need={need({ deadline_at: '2026-11-30T00:00:00.000Z' })} />)
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/aucune date limite communiquée/)).toBeNull()
  })

  it('absent ≠ « 0 » : rien de renseigné se NOMME, aucun zéro', () => {
    const { container } = render(
      <NeedFramingCard
        need={need({ context: null, decision_maker_contact_id: null, decision_maker_name: null, budget_cents: null })}
      />,
    )
    // RV4-E-FIX 4291.7 — chaque absence est nommée « à cadrer » (périmètre, sponsor, échéance, budget).
    expect(screen.getAllByText(/à cadrer :/)).toHaveLength(4)
    expect(screen.getByText(/le contexte n’a pas été écrit/)).toBeInTheDocument()
    expect(screen.getByText(/personne n’a été désigné comme sponsor/)).toBeInTheDocument()
    expect(screen.getByText(/aucune date limite communiquée/)).toBeInTheDocument()
    expect(screen.getByText(/le client n’a pas communiqué de budget/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\s?€/)
  })

  // #4291.7 — la mention « à cadrer » dure tant que le besoin n'est pas cadré : une fois périmètre, sponsor,
  // échéance et budget connus, le titre ne la porte plus.
  it('#4291.7 — « Projet à cadrer » tant qu’un des quatre manque, « Projet cadré » quand tout est connu', () => {
    const { unmount } = render(<NeedFramingCard need={need()} />)
    expect(screen.getByRole('heading', { name: 'Projet à cadrer' })).toBeInTheDocument()
    unmount()
    render(<NeedFramingCard need={need({ deadline_at: '2026-11-30T00:00:00.000Z' })} />)
    expect(screen.getByRole('heading', { name: 'Projet cadré' })).toBeInTheDocument()
    expect(screen.queryByText(/à cadrer/)).toBeNull()
  })
})
