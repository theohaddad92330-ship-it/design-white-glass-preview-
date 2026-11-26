import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrivalEntries } from './ArrivalEntries'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

/** #4962.1 / #4962.3 — l'arrivée NOMME trois entrées : analyser un compte, trouver des comptes, parler à Laura. */
describe('ArrivalEntries — #4962.1', () => {
  afterEach(cleanup)

  it('nomme les trois entrées, chacune vers une route EXISTANTE', () => {
    render(<ArrivalEntries />)
    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/search', '/discover', '/chat'])
    expect(screen.getByText('arrival.analyze.label')).toBeTruthy()
    expect(screen.getByText('arrival.discover.label')).toBeTruthy()
    expect(screen.getByText('arrival.laura.label')).toBeTruthy()
  })

  it('chaque entrée est une cible tactile ≥ 44 px', () => {
    render(<ArrivalEntries />)
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('min-h-11')
  })
})
