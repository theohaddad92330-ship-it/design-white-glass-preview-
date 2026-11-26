import { render, screen } from '@testing-library/react'
import { AccountIntermediaryNotice } from './AccountIntermediaryNotice'

describe('AccountIntermediaryNotice', () => {
  it('n’affiche rien pour un compte ordinaire', () => {
    const { container } = render(<AccountIntermediaryNotice nafCode="62.02A" companyName="ACME" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avertit sur le NAF d’une plateforme de mise à disposition (78.30Z)', () => {
    render(<AccountIntermediaryNotice nafCode="78.30Z" companyName="Une entreprise quelconque" />)
    expect(screen.getByTestId('account-intermediary-notice')).toBeInTheDocument()
    expect(screen.getByText(/pas client final/i)).toBeInTheDocument()
  })

  it('avertit sur le nom d’un cabinet connu (repli, NAF absent)', () => {
    render(<AccountIntermediaryNotice nafCode={null} companyName="Hays France" />)
    expect(screen.getByTestId('account-intermediary-notice')).toBeInTheDocument()
  })
})
