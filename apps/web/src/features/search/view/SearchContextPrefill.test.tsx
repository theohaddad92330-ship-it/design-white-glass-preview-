import { screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #2162.27 — Laura (ou tout appelant) peut ouvrir `/search` avec le contexte
 * libre déjà rédigé, pas seulement le nom de l'entreprise (`company`, déjà
 * couvert). Même mécanique que `SearchDraft.test.tsx` (`company` +
 * `suggestionId`) : une VALEUR INITIALE, jamais un verrou — le champ reste
 * éditable.
 *
 * Tranche de ce lot : le preset `free` (texte libre) uniquement. Un preset
 * structuré (`push-offer`, `signal`…) a un sous-schéma par champ et reste
 * `retenu` — voir la note du registre #2162.27.
 */
const DRAFT_WITH_CONTEXT = {
  company: 'Capgemini',
  context: 'Développer notre offre cloud sur ce compte',
} as const

const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
            createElement(prop, props, children)
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearch: () => DRAFT_WITH_CONTEXT,
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

describe('Search — préremplissage du contexte libre (#2162.27)', () => {
  // Refonte Théo R1 : le texte libre a une place — « Ton angle, en une phrase » — où il s'affiche, éditable.
  it('ouvre le composeur sur « Autre » avec le texte libre dans « Ton angle »', async () => {
    renderWithRouter(<Search />)
    const input = (await screen.findByPlaceholderText(/Recherche une entreprise/)) as HTMLInputElement
    expect(input.value).toBe('Capgemini')
    expect(screen.getByLabelText(/Ton angle, en une phrase/)).toHaveValue('Développer notre offre cloud sur ce compte')
    // « Un autre objectif » est dans le menu « Autres objectifs » : le menu annonce qu'un objectif y est retenu.
    expect(screen.getByRole('button', { name: /Autres objectifs, 1 retenu/ })).toBeInTheDocument()
  })
})
