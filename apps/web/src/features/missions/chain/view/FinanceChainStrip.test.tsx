import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceChainStrip } from './FinanceChainStrip'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe('FinanceChainStrip', () => {
  it('rend les quatre étapes de la chaîne, dans l’ordre', () => {
    render(<FinanceChainStrip current="activity" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('financeChain.activity.title')
    expect(items[3].textContent).toContain('financeChain.settlement.title')
  })

  it('marque l’étape courante et laisse les autres atteignables', () => {
    render(<FinanceChainStrip current="controls" />)
    const current = screen.getAllByRole('listitem')[1]
    expect(current?.getAttribute('aria-current')).toBe('step')
    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/missions/cra',
      '/missions/facturation',
      '/missions/encaissements',
    ])
  })
})
