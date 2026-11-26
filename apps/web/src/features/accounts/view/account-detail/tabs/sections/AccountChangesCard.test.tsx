import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountChanges } from '@bellum/contracts'

/**
 * #4180 (EX-10) — ce qui a changé depuis la dernière vérification : des lignes DATÉES, « rien de nouveau » qui
 * n'efface rien, et SILENCE (pas « 0 ») quand rien n'est comparable.
 */
type QueryState = { data?: AccountChanges; isPending: boolean; isError: boolean }
const state: { current: QueryState } = { current: { data: undefined, isPending: true, isError: false } }

vi.mock('@/features/accounts/hooks/useAccountChanges', () => ({ useAccountChanges: () => state.current }))

const { AccountChangesCard } = await import('./AccountChangesCard')

const ACCOUNT = { id: '33333333-3333-4333-8333-333333333333', name: 'Aubrac' }
const base: AccountChanges = {
  account: ACCOUNT,
  lastCheckedAt: '2026-09-01T00:00:00.000Z',
  status: 'changes',
  items: [],
  retained: { facts: 3, contacts: 9 },
}

beforeEach(() => {
  state.current = { data: undefined, isPending: true, isError: false }
})
afterEach(cleanup)

describe('AccountChangesCard — #4180', () => {
  it('liste chaque changement avec sa nature, son libellé et son entité — une offre dit qu’elle n’est pas un besoin confirmé', () => {
    state.current = {
      isPending: false,
      isError: false,
      data: {
        ...base,
        items: [
          {
            kind: 'new_manager',
            date: '2026-09-12',
            label: 'Camille Durand — Directrice technique',
            entity: 'Division Avions',
          },
          { kind: 'hiring_offer', date: '2026-09-15', label: '4 ingénieurs PLM', entity: null, confirmedNeed: false },
        ],
      },
    }
    render(<AccountChangesCard accountId={ACCOUNT.id} />)
    expect(
      screen.getByText(/Nouveau responsable · Camille Durand — Directrice technique \(Division Avions\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Offre de recrutement · 4 ingénieurs PLM — offre de recrutement, pas un besoin de prestation confirmé/,
      ),
    ).toBeInTheDocument()
  })

  it('#2164.29/.30 — sépare « Ce qui est nouveau » de « Ce que nous savions déjà », sans compter deux fois le neuf', () => {
    state.current = {
      isPending: false,
      isError: false,
      data: {
        ...base,
        // 3 faits et 9 contacts au dossier, DONT 1 offre neuve et 1 responsable neuf.
        items: [
          { kind: 'new_manager', date: '2026-09-12', label: 'Camille Durand — DSI', entity: null },
          { kind: 'hiring_offer', date: '2026-09-15', label: '4 ingénieurs PLM', entity: null, confirmedNeed: false },
        ],
      },
    }
    render(<AccountChangesCard accountId={ACCOUNT.id} />)
    const fresh = screen.getByTestId('account-changes-new')
    expect(fresh).toHaveTextContent('Ce qui est nouveau')
    expect(fresh).toHaveTextContent('Camille Durand — DSI')
    const known = screen.getByTestId('account-changes-already-known')
    expect(known).toHaveTextContent('Ce que nous savions déjà')
    expect(known).toHaveTextContent('2 faits et 8 contacts')
    expect(known).not.toHaveTextContent('Camille Durand')
  })

  it('NON — rien de connu avant la vérification : aucune section « déjà connu », jamais « 0 fait »', () => {
    state.current = {
      isPending: false,
      isError: false,
      data: {
        ...base,
        retained: { facts: 1, contacts: 0 },
        items: [{ kind: 'business_event', date: '2026-09-15', label: 'Rachat de Sopra', entity: null }],
      },
    }
    render(<AccountChangesCard accountId={ACCOUNT.id} />)
    expect(screen.getByTestId('account-changes-new')).toHaveTextContent('Rachat de Sopra')
    expect(screen.queryByTestId('account-changes-already-known')).toBeNull()
  })

  it('« rien de nouveau » se dit et nomme ce qui reste connu', () => {
    state.current = { isPending: false, isError: false, data: { ...base, status: 'nothing_new' } }
    render(<AccountChangesCard accountId={ACCOUNT.id} />)
    expect(screen.getByTestId('account-changes-nothing-new').textContent).toMatch(/Rien de nouveau/)
    expect(screen.getByTestId('account-changes-nothing-new').textContent).toMatch(/3 faits et 9 contacts/)
  })

  it('NON — sans vérification précédente, la carte ne rend rien : ni « rien de nouveau » ni « 0 »', () => {
    state.current = {
      isPending: false,
      isError: false,
      data: { ...base, status: 'no_reference', lastCheckedAt: null, retained: null },
    }
    const { container } = render(<AccountChangesCard accountId={ACCOUNT.id} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('NON — une panne ne se raconte pas « rien de nouveau »', () => {
    state.current = { data: undefined, isPending: false, isError: true }
    render(<AccountChangesCard accountId={ACCOUNT.id} />)
    expect(screen.getByText(/Ce n’est pas « rien de nouveau »/)).toBeInTheDocument()
    expect(screen.queryByTestId('account-changes-nothing-new')).toBeNull()
  })
})
