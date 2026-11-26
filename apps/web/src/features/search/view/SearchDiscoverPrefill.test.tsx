import { screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { buildAnalyzeSearch } from '@/features/discover/lib/discover-analyze'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { Search } from './Search'

/**
 * #3910 — « la raison de la priorisation, j'aimerais que ça vienne de l'outil ».
 * La chaîne COMPLÈTE : le lien que Découvrir fabrique (`buildAnalyzeSearch`) arrive dans
 * `/search`, le champ « Raison de la priorisation » est prérempli ET dit « Proposé par … —
 * modifiable » ; éditer le texte retire la mention ; une ouverture hors Découvrir laisse le
 * champ vide, sans mention. C'est le test que la recette (écriture : 8 crédits) ne peut pas jouer.
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
    useSearch: () => currentSearch,
  }
})

const CANDIDATE: DiscoverCandidate = {
  name: 'Naval Group',
  siren: '311 / 000',
  nafCode: '30.11Z',
  sector: 'Construction navale',
  city: 'Paris',
  department: '75',
  headcountRange: '10 000 à 19 999 salariés',
  creationDate: null,
  score: 70,
  scoreMax: 100,
  scoreUnmeasured: [],
  dataConfidence: null,
  scoreFactors: [],
  signals: [],
  angle: 'Deux sites recrutent en parallèle : le renfort se prépare avant la montée en charge.',
  suggestedRoles: [],
  portfolioState: 'new',
  accountId: null,
  sources: [],
}

let currentSearch: Record<string, unknown> = {}

beforeAll(() => {
  window.scrollTo = vi.fn()
})

const reasonField = (container: HTMLElement) =>
  container.querySelector('#ctx-strategic-prioritizationReason') as HTMLTextAreaElement | HTMLInputElement | null

// #4085 revient sur l'affichage des champs structurés, délibérément ; la raison #3910 voyage toujours.
describe('Search — la raison de Découvrir (#3910) voyage sans champ visible (#4085)', () => {
  it('depuis Découvrir : aucun champ « Raison de la priorisation », aucune mention', async () => {
    currentSearch = { ...buildAnalyzeSearch(CANDIDATE) }
    const { container } = renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    expect(reasonField(container)).toBeNull()
    expect(screen.queryByText(/Proposé par .* — modifiable/)).toBeNull()
    // Le choix d'intent reste là : « Ouvrir ce compte » est allumé (preset strategic venu de l'URL).
    expect(screen.getByRole('button', { name: 'Ouvrir ce compte' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hors Découvrir : pas de champ non plus', async () => {
    currentSearch = { company: 'Naval Group', preset: 'strategic' }
    const { container } = renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    expect(reasonField(container)).toBeNull()
  })
})
