import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import routesEn from '@/i18n/locales/en/routes.json'
import discoverFr from '@/i18n/locales/fr/discover.json'
import discoverEn from '@/i18n/locales/en/discover.json'
import routesFr from '@/i18n/locales/fr/routes.json'
import { Discover } from './Discover'

// Même mock que Discover.test.tsx : le module de route bouclerait sinon.
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const Rendered = ({ children, ...props }: any) => {
          const Component = prop as string
          return <Component {...props}>{children}</Component>
        }
        return Rendered
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

/**
 * #2456 — « lis-moi le titre de cette page », sur `/discover`.
 *
 * Mesuré en production au SHA `3993b432b` le 16/09/2026 à 10 h 04 :
 * `document.querySelectorAll('h1').length` → **0**, et
 * `[role="heading"][aria-level="1"]` → **0**, sur 255 éléments lus. Le
 * `document.title` était juste ; c'est le titre DANS la page qui manquait, et
 * la première chose annoncée était « TA CIBLE » — un libellé de bloc.
 */
describe('#2456 — /discover porte un titre de niveau 1', () => {
  it('rend UN titre de niveau 1 : « Découvrir. » (maquette V22, #4493)', async () => {
    renderWithRouter(<Discover />)
    // On attend le titre lui-même — une barrière qui ne peut pas mentir : si elle tient, un h1 existe ;
    // si elle lâche, c'est exactement le défaut que #2456 garde.
    await screen.findByRole('heading', { level: 1 })
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(`${discoverFr.overview.title}.`)
  })

  it('#4493 revient sur #2456 (décision Louis 24/10) : le `document.title` garde sa phrase, le h1 dit le nom', () => {
    expect(discoverFr.overview.title).toBe('Découvrir')
    expect(discoverEn.overview.title).toBe('Discover')
    expect(routesFr.discover.title).toContain(routesFr.discover.pageTitle)
    expect(routesEn.discover.title).toContain(routesEn.discover.pageTitle)
  })
})
