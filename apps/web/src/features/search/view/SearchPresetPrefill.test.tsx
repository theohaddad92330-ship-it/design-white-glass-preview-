import { screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #2162.27 / épopée #2892 — Laura ouvre `/search` avec un preset STRUCTURÉ.
 * Le lien plat (`?preset=signal&source=…`) arrive dans le composeur : le preset
 * est sélectionné, ses champs sont remplis ET éditables. Un champ d'un autre
 * preset (`offer`) ne se glisse nulle part.
 */
const DRAFT_WITH_PRESET = {
  company: 'Capgemini',
  preset: 'signal',
  source: 'BOAMP',
  implication: 'Refonte du SI RH',
  offer: 'Cloud',
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
    useSearch: () => DRAFT_WITH_PRESET,
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

describe('Search — préremplissage d’un preset structuré (#2162.27)', () => {
  it('ouvre le composeur sur le preset annoncé, ses champs remplis et éditables', async () => {
    const { container } = renderWithRouter(<Search />)
    const input = (await screen.findByPlaceholderText(/Recherche une entreprise/)) as HTMLInputElement
    expect(input.value).toBe('Capgemini')

    // #4085 : les champs structurés ne s'affichent qu'au choix d'un modèle ; le preset s'allume dans
    // le menu « Autres objectifs » (« Vérifier un signal » y vit), ses valeurs restent dans le contexte.
    expect(container.querySelector('#ctx-signal-source')).toBeNull()
    expect(container.querySelector('#ctx-signal-implication')).toBeNull()
    expect(screen.getByRole('button', { name: /Autres objectifs, 1 retenu/ })).toBeInTheDocument()
    // NON : le composeur n'est pas le texte libre, et `offer` (push-offer) n'est lu nulle part.
    expect(container.querySelector('#ctx-push-offer-offer')).toBeNull()
  })
})
