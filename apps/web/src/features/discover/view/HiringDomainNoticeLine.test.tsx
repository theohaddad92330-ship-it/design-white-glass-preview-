import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HiringDomainNoticeLine } from './HiringDomainNoticeLine'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => `${key}${opts?.count ? `:${opts.count}` : ''}`,
  }),
}))

// #3901.w — profil muet : l'écran DIT « IT par défaut » et renvoie vers Mon profil.
describe('HiringDomainNoticeLine — #3901.w', () => {
  it('profil vide : la ligne est dite, avec un lien vers /profile', () => {
    render(<HiringDomainNoticeLine notice={{ kind: 'noRoles' }} />)
    expect(screen.getByTestId('hiring-domain-notice').textContent).toContain('card.hiringDomainNoRoles')
    expect(screen.getByRole('link').getAttribute('href')).toBe('/settings/profile')
  })

  it('hors domaine : le nombre de comptes rangés en fin de liste', () => {
    render(<HiringDomainNoticeLine notice={{ kind: 'offDomain', count: 3 }} />)
    expect(screen.getByTestId('hiring-domain-notice').textContent).toContain(':3')
  })

  it('rien à dire : rien rendu', () => {
    render(<HiringDomainNoticeLine notice={null} />)
    expect(screen.queryByTestId('hiring-domain-notice')).toBeNull()
  })
})
