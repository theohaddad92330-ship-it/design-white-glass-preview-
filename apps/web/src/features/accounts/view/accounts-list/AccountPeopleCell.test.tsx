import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AccountPeopleCell } from './AccountPeopleCell'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}))

describe('AccountPeopleCell — Personnes et badge Décideur', () => {
  it('montre deux visages en initiales, le nombre et le badge « Décideur »', () => {
    render(
      <AccountPeopleCell
        accountId="a1"
        people={{
          count: 8,
          has_decider: true,
          top: [
            { name: 'Maxime Delaunay', is_decider: true },
            { name: 'Camille Aubert', is_decider: false },
          ],
        }}
      />,
    )
    expect(screen.getByText('MD')).toBeInTheDocument()
    expect(screen.getByText('CA')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByTestId('decider-badge')).toHaveTextContent('Décideur')
  })

  // #4497 (V22, GA-18/19) — sans contact, AUCUNE ligne : ni tiret, ni « 0 » (revient sur le tiret nommé).
  it('SAIT DIRE NON : sans décideur, pas de badge ; sans contact, rien — ni « - » ni « 0 »', () => {
    const { rerender } = render(
      <AccountPeopleCell
        accountId="a1"
        people={{ count: 2, has_decider: false, top: [{ name: 'Paul Roy', is_decider: false }] }}
      />,
    )
    expect(screen.queryByTestId('decider-badge')).toBeNull()
    rerender(<AccountPeopleCell accountId="a1" people={{ count: 0, has_decider: false, top: [] }} />)
    expect(screen.queryByTestId('account-people')).toBeNull()
    expect(screen.queryByText('-')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
    rerender(<AccountPeopleCell accountId="a1" people={undefined} />)
    expect(screen.queryByText('-')).toBeNull()
    expect(screen.queryByTestId('account-people')).toBeNull()
  })
})
