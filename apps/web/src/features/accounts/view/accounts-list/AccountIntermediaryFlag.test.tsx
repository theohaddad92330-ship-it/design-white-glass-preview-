import { render, screen } from '@testing-library/react'
import { AccountIntermediaryFlag } from './AccountIntermediaryFlag'

/**
 * #2265.14 (épopée #2851) — même contrat que `IntermediaryBadge` (Découvrir) :
 * rien pour un compte ordinaire, un avertissement pour un cabinet ou une
 * plateforme reconnue au NAF ou au nom déjà en base.
 */
describe('AccountIntermediaryFlag', () => {
  it('n’affiche rien pour un compte ordinaire', () => {
    const { container } = render(<AccountIntermediaryFlag nafCode="62.02A" companyName="Une ESN quelconque" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche rien quand le NAF est absent et le nom ne matche aucun repli', () => {
    const { container } = render(<AccountIntermediaryFlag nafCode={null} companyName="ACME" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avertit sur le NAF d’un cabinet de recrutement (78.10Z)', () => {
    render(<AccountIntermediaryFlag nafCode="78.10Z" companyName="Une entreprise quelconque" />)
    expect(screen.getByTestId('account-intermediary-flag')).toBeInTheDocument()
  })

  it('avertit sur le nom d’une plateforme connue, NAF absent', () => {
    render(<AccountIntermediaryFlag nafCode={null} companyName="Collective.work" />)
    expect(screen.getByTestId('account-intermediary-flag')).toBeInTheDocument()
  })

  it('nomme le partenaire DÉCLARÉ par l’espace, jamais sans ce fait (#2265.5)', () => {
    const { container } = render(<AccountIntermediaryFlag nafCode="62.02A" companyName="ALTEN" />)
    expect(container).toBeEmptyDOMElement()
    render(<AccountIntermediaryFlag nafCode="62.02A" companyName="ALTEN" isDeclaredPartner />)
    expect(screen.getByTestId('account-intermediary-flag')).toHaveTextContent(/partenaire déclaré/i)
  })

  it('nomme la source de données « pas un prospect », avant toute autre nature (#2265.7)', () => {
    render(<AccountIntermediaryFlag nafCode="78.10Z" companyName="Pappers" isDeclaredPartner />)
    expect(screen.getByTestId('account-intermediary-flag')).toHaveTextContent(/source de données/i)
  })

  it('#4470 — le badge tient dans sa cellule : il passe à la ligne (min-w-0), jamais nowrap', () => {
    render(<AccountIntermediaryFlag nafCode="78.10Z" companyName="Une entreprise quelconque" />)
    const flag = screen.getByTestId('account-intermediary-flag')
    expect(flag.className).not.toContain('whitespace-nowrap')
    expect(flag.className).not.toContain('shrink-0')
    expect(flag.className).toContain('min-w-0')
    expect(flag.className).toContain('max-w-full')
  })
})
