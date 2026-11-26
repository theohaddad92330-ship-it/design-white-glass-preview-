import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, CompanySuggestion } from '@bellum/contracts'
import { createElement, type ReactNode, useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * recette 10/09 (P0) — « le champ "Recherche une entreprise" ne retient
 * qu'UNE lettre ».
 *
 * Mesuré trois fois en production sur `3d0eecfa1` :
 *  1. « THALES » tapé d'un trait → l'écran ne retient que « T ».
 *  2. Retapé lettre par lettre, une seconde entre chaque → bloqué sur « T »,
 *     `document.activeElement` vaut `BODY`.
 *  3. En repartant d'une saisie déjà à 3 caractères (focus déjà acquis avant
 *     ce test, donc la frappe suivante ne franchit plus la frontière
 *     vide → non-vide) : la saisie continue normalement.
 *
 * Cause RÉELLE (vérifiée en isolant chaque hypothèse) : `SearchLaunchPanel`
 * bascule, à la première lettre tapée, entre deux TYPES d'éléments React
 * différents à la même position (`motion.div` d'un côté, `Fragment` de
 * l'autre) — React démonte tout le sous-arbre, `CompanySearchField` et son
 * `<input>` compris, et le remonte aussitôt. Le focus part alors au `<body>`,
 * et toute lettre tapée ensuite n'atteint plus le champ : c'est ce que les
 * tests 1 et 2 ci-dessous prouvent, sans dépendre de la sémantique focus de
 * jsdom pour le test 1 (comparaison d'identité DOM, imparable).
 */
const h = vi.hoisted(() => ({
  searchParams: {} as Record<string, unknown>,
  sourceAccount: null as Account | null,
}))

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: h.sourceAccount, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: null,
    percent: null,
    accountId: null,
    error: null,
    startAnalysis: vi.fn(),
    reset: vi.fn(),
  }),
}))
// Une suggestion réelle et STABLE (pas de réseau) : #3 doit continuer à taper
// sans qu'un clic n'ait jamais eu lieu sur cette ligne.
const STUB_SUGGESTION: CompanySuggestion = {
  name: 'THALES',
  siren: '552059024',
  city: 'Courbevoie',
  sector: '',
}
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => {
    const [value, setValue] = useState('')
    return {
      suggestions: value.trim().length >= 2 ? [STUB_SUGGESTION] : [],
      broadenedFrom: undefined,
      sourceUnavailable: false,
      loading: false,
      search: (next: string) => setValue(next),
      clearSuggestions: () => setValue(''),
    }
  },
  MIN_QUERY_LENGTH: 2,
}))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants — sans cache, `motion.div` change de
 * type à chaque rendu et React démonte tout, ce qui rendrait ce test aveugle
 * exactement au défaut qu'il vérifie. Copié tel quel depuis `Search.test.tsx`.
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
    useNavigate: () => vi.fn(),
    useSearch: () => h.searchParams,
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  h.searchParams = {}
  h.sourceAccount = null
})

describe('Search — recette 10/09, le champ ne retient qu’une lettre (P0)', () => {
  it('garde le MÊME nœud DOM pour le champ avant et après la première lettre', async () => {
    renderWithRouter(<Search />)
    const before = await screen.findByPlaceholderText(/Recherche une entreprise/)

    const user = userEvent.setup()
    await user.click(before)
    await user.keyboard('T')

    // Une nouvelle requête DOM : si le composant a été démonté puis remonté,
    // elle rend un ÉLÉMENT DIFFÉRENT, même si son placeholder est identique.
    const after = screen.getByPlaceholderText(/Recherche une entreprise/)
    expect(after).toBe(before)
  })

  it('garde le focus sur le champ après la première lettre — jamais au <body>', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)

    const user = userEvent.setup()
    await user.click(input)
    expect(document.activeElement).toBe(input)

    await user.keyboard('T')

    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(input)
  })

  it('accumule bien les lettres frappées une par une, sans se bloquer sur la première', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText<HTMLInputElement>(/Recherche une entreprise/)

    const user = userEvent.setup()
    await user.click(input)
    await user.keyboard('T')
    await user.keyboard('H')
    await user.keyboard('A')
    await user.keyboard('L')
    await user.keyboard('E')
    await user.keyboard('S')

    expect(input.value).toBe('THALES')
  })

  it('en repartant d’une saisie déjà non vide, la frappe continue sans se verrouiller sur une suggestion', async () => {
    // #3 du brief : la saisie est déjà à 3 caractères (équivalent de « posé
    // par script ») — la frontière vide → non-vide est déjà franchie, donc le
    // remontage qui perd le focus ne peut plus se reproduire ici. Ce test
    // vérifie qu'aucun AUTRE mécanisme (la liste de suggestions) ne valide
    // une entrée tout seul pendant que l'utilisateur continue de taper.
    h.searchParams = { company: 'THA' }
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText<HTMLInputElement>(/Recherche une entreprise/)
    expect(input.value).toBe('THA')

    const user = userEvent.setup()
    await user.click(input)
    await user.keyboard('LES')

    expect(input.value).toBe('THALES')
    // Si une suggestion avait été validée toute seule, l'entête annoncerait
    // le nom de CETTE suggestion plutôt que la saisie en cours.
    expect(screen.queryByText(/NGUYEN THI THU THAO/)).not.toBeInTheDocument()
  })
})
