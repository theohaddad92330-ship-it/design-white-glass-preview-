import { fireEvent, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * Propagation suggestion → analyse, volet anti-verrou (Théo P0 §5 :
 * « une suggestion accélère, elle ne verrouille jamais »).
 *
 * On ouvre /search comme si on venait de cliquer une suggestion (URL = company
 * + suggestionId + suggestionReason) et on vérifie que :
 *  1. le brouillon est pré-rempli MAIS éditable (l'input n'est pas désactivé) ;
 *  2. éditer le nom purge l'origine suggestion de l'URL (persistDraft round-trip)
 *     — sinon un run « BNP » traînerait l'origine d'une suggestion « SG ».
 */

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }))

const SUGGESTION_DRAFT = {
  company: 'Société Générale',
  suggestionId: 'societe-generale--banque',
  suggestionReason: 'Grand compte bancaire aligné sur ton expertise data',
  // #3819 (lot RBB) — les critères Découvrir voyagent et se purgent avec l'origine.
  suggestionCriteria: { zone: 'Paris' },
} as const

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
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
    useNavigate: () => navigateSpy,
    useSearch: () => SUGGESTION_DRAFT,
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  navigateSpy.mockClear()
})

function lastPersistDraftUpdater(): (prev: Record<string, unknown>) => Record<string, unknown> {
  const call = [...navigateSpy.mock.calls]
    .reverse()
    .find(([arg]) => arg?.replace === true && typeof arg?.search === 'function') as
    | [{ search: (prev: Record<string, unknown>) => Record<string, unknown> }]
    | undefined
  expect(call, 'persistDraft should navigate({ replace: true, search: fn })').toBeDefined()
  return call![0].search
}

describe('Search — brouillon depuis une suggestion (anti-verrou)', () => {
  it('pré-remplit le nom de la suggestion tout en gardant le champ éditable', async () => {
    renderWithRouter(<Search />)
    const input = (await screen.findByPlaceholderText(/Recherche une entreprise/)) as HTMLInputElement

    // Accéléré : le nom de la suggestion est pré-rempli.
    expect(input.value).toBe('Société Générale')
    // Jamais verrouillé : le champ reste éditable (aucun `disabled`).
    expect(input).not.toBeDisabled()

    // On peut recibler la société avant tout submit (le jobId n'existe pas encore).
    fireEvent.change(input, { target: { value: 'BNP Paribas' } })
    expect(input.value).toBe('BNP Paribas')
  })

  it("purge l'origine suggestion de l'URL dès la première édition du nom", async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)

    fireEvent.change(input, { target: { value: 'BNP Paribas' } })

    // persistDraft écrit via navigate({ replace: true, search: prev => next }).
    const next = lastPersistDraftUpdater()(SUGGESTION_DRAFT)

    // L'origine suggestion est retirée (le run ne « vient » plus de la suggestion)…
    expect(next.suggestionId).toBeUndefined()
    expect(next.suggestionReason).toBeUndefined()
    expect(next.suggestionCriteria).toBeUndefined()
    // …tandis que la société éditée est bien persistée pour la reprise du brouillon.
    expect(next.company).toBe('BNP Paribas')
  })

  it('éditer le nom ne touche plus au `scope` de l’URL (lien existant préservé)', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    // Cadrage analyse (15/10) — l'écran 1 n'a plus de sélecteur de périmètre : un
    // ancien `scope=` reste lu (migré vers « Où ? »), jamais réécrit ni effacé.
    fireEvent.change(input, { target: { value: 'Siemens' } })
    const next = lastPersistDraftUpdater()({ ...SUGGESTION_DRAFT, scope: 'filiales' })
    expect(next.scope).toBe('filiales')
  })
})

describe('Search — écran 1 sans périmètre (cadrage analyse 15/10, remplace #3743)', () => {
  it('ni « France » ni « Groupe entier » à l’écran 1 : la géographie se pose à l’écran « Cadrer »', async () => {
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    // Théo B r1-recherche.R7 — le périmètre est UN bouton qui ouvre sa feuille ; aucune rangée de zones sur la page.
    expect(screen.getByRole('button', { name: /^Périmètre/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Groupe entier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Monde' })).not.toBeInTheDocument()
  })
})
