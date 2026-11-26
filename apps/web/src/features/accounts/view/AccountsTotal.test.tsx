import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { AccountsTotal } from './AccountsTotal'

// MEYER-IMPORT M.4 — /accounts n'affichait aucun total de comptes.
describe('AccountsTotal — M.4', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('écrit le total serveur, au singulier comme au pluriel', () => {
    const { rerender } = render(<AccountsTotal total={607} />)
    expect(screen.getByTestId('accounts-total')).toHaveTextContent('607 comptes')
    rerender(<AccountsTotal total={1} />)
    expect(screen.getByTestId('accounts-total')).toHaveTextContent(/^1 compte$/)
  })

  it('NON : un total inconnu ou nul ne s’écrit jamais « 0 compte »', () => {
    const { rerender } = render(<AccountsTotal total={undefined} />)
    expect(screen.queryByTestId('accounts-total')).toBeNull()
    rerender(<AccountsTotal total={0} />)
    expect(screen.queryByTestId('accounts-total')).toBeNull()
  })

  it('EN : dans la langue de l’interface', async () => {
    await i18n.changeLanguage('en')
    render(<AccountsTotal total={12} />)
    expect(screen.getByTestId('accounts-total')).toHaveTextContent('12 accounts')
  })
})
