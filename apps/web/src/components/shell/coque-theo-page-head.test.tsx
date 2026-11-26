/**
 * Coque Théo (23/10/2026) — l'en-tête de page des maquettes appliquées (`.page-head`,
 * `.v18-head`, `.a14-head`) : un titre de niveau 1 en 30 px, une phrase dessous, les
 * actions à droite ; puis « Comment travailler ici ? » (`.v18-guide`).
 *
 * Le fil d'Ariane a déménagé dans la barre du haut : sur bureau, l'en-tête ne le
 * répète pas (loi 4 du tome 7 — rien n'apparaît deux fois sous la même forme).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@/test/i18n-default-language'

const pathname = { current: '/settings/profile' }
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  useLocation: (opts?: { select?: (s: { pathname: string }) => unknown }) =>
    opts?.select ? opts.select({ pathname: pathname.current }) : { pathname: pathname.current },
  useNavigate: () => vi.fn(),
  useRouterState: (opts?: { select?: (s: { location: { pathname: string } }) => unknown }) =>
    opts?.select
      ? opts.select({ location: { pathname: pathname.current } })
      : { location: { pathname: pathname.current } },
}))

// Le centre d'aide lit le rôle pour ORDONNER ses guides ; inconnu, il garde l'ordre du registre.
vi.mock('@/lib/permissions', () => ({ useUserPermissions: () => ({ status: 'unknown' }) }))

const { PageHeader } = await import('@/components/layout/PageHeader')
const { ScreenGuideLink } = await import('./ScreenGuideLink')

describe('Coque Théo — en-tête de page', () => {
  it('le titre est un niveau 1 de 30 px (text-3xl), suivi de la phrase de l’écran', () => {
    pathname.current = '/settings/profile'
    render(<PageHeader pageTitle="Mon profil" pageSubtitle="Ce que Laura sait de toi." />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Mon profil' })
    expect(heading.className).toContain('text-3xl')
    expect(screen.getByText('Ce que Laura sait de toi.')).toBeInTheDocument()
  })

  it('sur bureau, le fil d’Ariane vit dans la barre du haut : l’en-tête ne le répète pas', () => {
    pathname.current = '/accounts/abc-123'
    const { container } = render(<PageHeader pageTitle="ACME" trailInTopbar />)
    expect(container.querySelector('nav[aria-label="breadcrumb"]')).toBeNull()
    expect(screen.queryByText('Comptes')).toBeNull()
  })

  it('sur mobile (sans barre du haut), le fil reste dans l’en-tête', () => {
    pathname.current = '/accounts/abc-123'
    render(<PageHeader pageTitle="ACME" />)
    expect(screen.getByText('Comptes')).toBeInTheDocument()
  })

  it('« Comment travailler ici ? » ouvre le centre d’aide EXISTANT (les guides du registre)', async () => {
    render(<ScreenGuideLink />)
    await userEvent.click(screen.getByRole('button', { name: 'Comment travailler ici ?' }))
    expect(await screen.findByRole('dialog', { name: 'Aide et guides' })).toBeInTheDocument()
  })
})
