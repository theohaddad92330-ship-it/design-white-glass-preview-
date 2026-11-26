import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * Loi 4 du tome 7 : « si un élément apparaît deux fois sous la même forme et
 * avec le même contenu, l'un des deux est en trop ».
 *
 * Mesuré à l'écran le 23/08 : la barre d'onglets affichait « Ma journée ·
 * Messagerie · Tableau de bord », le premier actif, et la ligne juste en
 * dessous répétait « Ma journée ». Sur Comptes, sur Projets, sur Talents —
 * partout où une section a plusieurs onglets, en desktop comme en mobile.
 */
// ⚠️ La VRAIE i18n, pas une doublure qui rend la clé. Une première version
// mockait `useTranslation`, si bien que le titre ne valait jamais le libellé
// de l'onglet, la condition n'était jamais vraie et le test passait avec ET
// sans le correctif — il ne prouvait rien.
import '@/test/i18n-default-language'

const pathname = { current: '/briefing' }
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  // `useLocation` est appelé SANS argument par certains consommateurs : la
  // doublure doit le supporter, sinon elle échoue avant d'avoir rien mesuré.
  useLocation: (opts?: { select?: (s: { pathname: string }) => unknown }) =>
    opts?.select ? opts.select({ pathname: pathname.current }) : { pathname: pathname.current },
}))

const { PageHeader } = await import('./PageHeader')

describe('le fil d’ariane ne répète pas l’onglet actif', () => {
  it('se tait À L’ŒIL quand il dirait exactement ce que l’onglet dit déjà', () => {
    // `pageTitle` est passé EXPLICITEMENT : c'est par là que « Ma journée »
    // arrive en production, `/briefing` n'étant pas dans `pageTitleKeys`. Une
    // version du test qui l'omettait mesurait une branche morte et passait
    // avec comme sans le correctif.
    pathname.current = '/briefing'
    const { container } = render(<PageHeader pageTitle="Ma journée" />)
    // #2456 (16/09/2026) — le mot est bien là, MAIS hors du flux visuel.
    // La loi 4 interdit qu'un élément apparaisse deux fois **sous la même
    // forme** ; `sr-only` n'est pas une forme visible et ne réserve aucun
    // pixel. Ce que ce test mesurait avant — « zéro occurrence du texte » —
    // était plus fort que la règle, et c'est ce qui laissait le document sans
    // aucun titre de niveau 1 (mesuré sur `/discover` : `h1` → 0).
    const visible = container.querySelector(':scope > :not(.sr-only)')
    expect(visible).toBeNull()
    const onlyNode = container.firstElementChild
    expect(onlyNode?.className).toContain('sr-only')
    expect(onlyNode?.tagName).toBe('H1')
    expect(onlyNode?.textContent).toBe('Ma journée')
  })

  it('reste rendu quand il dit où l’on est DANS la section', () => {
    // « Comptes › ACME » n'est pas une répétition : le second niveau dit quelque
    // chose qu'aucun onglet ne dit.
    pathname.current = '/accounts/abc-123'
    render(<PageHeader pageTitle="ACME" />)
    expect(screen.getByText('ACME')).toBeInTheDocument()
  })

  it('ne réserve AUCUNE hauteur quand il n’a rien à dire', () => {
    // Ce qui était une répétition serait devenu un trou : 48 px de bande vide
    // sous une bordure qui ne sépare plus rien. Les deux se remarquent. Le
    // titre `sr-only` de #2456 ne change rien ici : il n'occupe aucune place,
    // et la bande de 48 px reste absente.
    pathname.current = '/briefing'
    const { container } = render(<PageHeader pageTitle="Ma journée" />)
    expect(container.querySelector('header')).toBeNull()
  })

  it('#2456 — un écran qui écrit son titre lui-même n’en reçoit pas un second', () => {
    // `titleInScreen` est la SEULE sortie, et son défaut est le comportement
    // sûr : sans elle, l'écran reçoit le titre de l'entête.
    pathname.current = '/briefing'
    const { container } = render(<PageHeader pageTitle="Ma journée" titleInScreen />)
    expect(container.textContent).toBe('')
  })

  it('#2456 — hors section à onglets, le titre reste VISIBLE, il ne devient pas masqué', () => {
    // La correction ne devait pas cacher les titres qui s'affichaient déjà.
    pathname.current = '/settings/profile'
    render(<PageHeader pageTitle="Mon profil" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Mon profil' })
    expect(heading.className).not.toContain('sr-only')
  })

  it('garde le BADGE quand il masque le titre', () => {
    // « 3 alertes » n'est pas une redite : c'est la seule information de cette
    // ligne, et la retirer ferait disparaître un compteur introuvable ailleurs.
    pathname.current = '/pilotage'
    render(<PageHeader pageTitleBadge={<span>3 alertes</span>} />)
    expect(screen.getByText('3 alertes')).toBeInTheDocument()
  })

  it('reste rendu sur un écran hors section', () => {
    pathname.current = '/settings/profile'
    const { container } = render(<PageHeader />)
    expect((container.textContent ?? '').trim().length).toBeGreaterThan(0)
  })
})
