import { render, screen } from '@testing-library/react'
import { AccountTierFlag } from './AccountTierFlag'

// #4426.4 — le tiering A/B/C du fichier du client se lit sur la ligne du compte ; absent ⇒ rien.
describe('AccountTierFlag', () => {
  it.each([
    [['Tier A'], 'Tier A'],
    [['ESN', 'tier b'], 'Tier B'],
    [['Tier C', 'Tier A'], 'Tier A'],
  ])('étiquettes %j → pastille « %s »', (tags, label) => {
    render(<AccountTierFlag tags={tags} />)
    expect(screen.getByTestId('account-tier-flag')).toHaveTextContent(label)
  })

  it.each([[undefined], [null], [[]], [['Priorité', 'Tier D', 'Tiers']]])('étiquettes %j → rien', tags => {
    const { container } = render(<AccountTierFlag tags={tags} />)
    expect(container).toBeEmptyDOMElement()
  })
})
