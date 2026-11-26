import { render, screen } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { DiscoverOriginLine } from './DiscoverOriginLine'

function account(criteria: Account['discover_origin_criteria']): Account {
  return { origin: 'discover', discover_origin_criteria: criteria } as Account
}

/**
 * #4433.9 (re-recette prod 26/10) — « élarg* » = 0 occurrence sur le dossier : le palier qui a fait sortir un compte
 * élargi se lit dans « Sélectionné dans Découvrir sur : … ».
 */
describe('DiscoverOriginLine — palier de zone', () => {
  it('nomme le palier en toutes lettres', () => {
    render(
      <DiscoverOriginLine
        account={account({ zone_widened: { tier: 'department', area: 'Nord', place: 'Lille' } })}
        hideReason={false}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent(
      'Sélectionné dans Découvrir sur : Élargi au département · Nord',
    )
  })

  it('nomme la distance mesurée d’un compte élargi à 50 km', () => {
    render(
      <DiscoverOriginLine
        account={account({ zone_widened: { tier: 'radius_50', distance_km: 38.4, place: 'Lille' } })}
        hideReason={false}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent('Élargi à 50 km · à 38 km de Lille')
  })

  it('un compte exact ne dit rien d’élargi', () => {
    render(<DiscoverOriginLine account={account({ zone: 'Lille' })} hideReason={false} />)
    expect(screen.getByTestId('discover-origin-line')).not.toHaveTextContent(/élargie/)
  })
})
