/**
 * #1813 — « dans le tableau de bord aussi, tout est replié par défaut pour
 * laisser de la place et voir directement à quoi on a accès sans devoir
 * scroll de fou ».
 *
 * Le comportement de repli lui-même est couvert par la suite partagée
 * `CollapsedSection.test.tsx` (GA-26 — un seul endroit). Ce fichier prouve
 * seulement que le cockpit personnel l'utilise bien, pour ses trois
 * sections, tout en laissant `PersonalKpiRow` visible (la vue d'ensemble
 * elle-même : quatre nombres sur une ligne, rien à déplier pour les lire).
 */
import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { CockpitPerspective, PersonalCockpitResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PersonalCockpit } from './PersonalCockpit'

const { mockUse } = vi.hoisted(() => ({ mockUse: vi.fn() }))
vi.mock('../../hooks/usePersonalCockpit', () => ({ usePersonalCockpit: () => mockUse() }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 30,
  population: 3,
  computed_at: '2026-09-04T09:00:00.000Z',
}
const PERSPECTIVE: CockpitPerspective = {
  trajectory: {
    pipeline: { amount_euros: 120000, open_count: 30, valued_count: 4 },
    missions_active: 2,
    invoiced_euros: null,
    collected_euros: null,
    finance_readable: false,
    provenance: PROVENANCE,
  },
  coverage: {
    followed: 3,
    without_next_action: 1,
    no_interaction_30d: 7,
    new_signals_7d: 0,
    never_worked: 0,
    anomalies: [],
    provenance: PROVENANCE,
  },
  relationship: {
    active_threads: 2,
    awaiting_reply: 1,
    replies_received: 0,
    accounts_without_interaction: 7,
    provenance: PROVENANCE,
  },
  dormant: [],
  series: { coverage: null, outreach: null, provenance: PROVENANCE },
}

const POPULATED: PersonalCockpitResponse = {
  kpis: { my_accounts: 3, relances_open: 2, relances_overdue: 1, messages_this_week: 5 },
  priorities: [],
  relances: [],
  perspective: PERSPECTIVE,
  accounts: [],
  messages: [],
}

describe('PersonalCockpit — trois sections repliées par défaut, la ligne de KPI reste visible (#1813)', () => {
  it('ne rend PAS le détail des cartes au premier rendu, mais la ligne de KPI reste là', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)

    // La ligne de KPI (hors repli) est bien la vue d'ensemble immédiate.
    expect(await screen.findByText('Mon portefeuille')).toBeInTheDocument()
    // Le détail, lui, est replié : les titres internes des cartes n'y sont pas.
    expect(screen.queryByText('Ma trajectoire')).not.toBeInTheDocument()
    expect(screen.queryByText('Ma dynamique relationnelle')).not.toBeInTheDocument()
    expect(screen.queryByText('Mes priorités')).not.toBeInTheDocument()
  })

  it('porte trois en-têtes, chacun un vrai bouton avec aria-expanded à false', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)
    await screen.findByText('Mon portefeuille')

    for (const title of [
      'Ma trajectoire & mon portefeuille',
      'Mes opportunités & ma dynamique relationnelle',
      'Mes prochaines étapes',
    ]) {
      const toggle = screen.getByRole('button', { name: title })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle).toHaveAttribute('type', 'button')
    }
  })

  it('ouvrir une section ne déplie QUE celle-là — replié n’est pas retiré', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)
    await screen.findByText('Mon portefeuille')

    fireEvent.click(screen.getByRole('button', { name: 'Ma trajectoire & mon portefeuille' }))

    expect(screen.getByText('Ma trajectoire')).toBeInTheDocument()
    expect(screen.queryByText('Ma dynamique relationnelle')).not.toBeInTheDocument()
    expect(screen.queryByText('Mes priorités')).not.toBeInTheDocument()
  })
})

/**
 * #4356.1 — un PARCOURS GUIDÉ au lieu de quatre blocs « voir plus ».
 *
 * Les sections du recul étaient quatre disclosures muets, au même poids, sans
 * ordre ni suite : on ouvrait au hasard. Elles deviennent une suite d'étapes
 * numérotées (« Étape 2 sur 4 »), chacune terminée par « Étape suivante »,
 * qui referme l'étape lue et ouvre la suivante. Rien n'est retiré : chaque
 * étape reste ouvrable directement, et garde son ancre (les tuiles y mènent).
 */
describe('PersonalCockpit — le recul en parcours guidé (#4356.1)', () => {
  const TITLES = [
    'Ce qui a bougé depuis ta dernière visite',
    'Ma trajectoire & mon portefeuille',
    'Mes opportunités & ma dynamique relationnelle',
    'Mes prochaines étapes',
  ]

  it('numérote les étapes, dans l’ordre', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)
    await screen.findByText('Mon portefeuille')

    const steps = screen.getByRole('list', { name: 'Parcours de mon cockpit' })
    const items = Array.from(steps.querySelectorAll(':scope > li'))
    expect(items).toHaveLength(4)
    items.forEach((item, index) => {
      expect(item.textContent).toContain(`Étape ${index + 1} sur 4`)
      expect(item.querySelector('button[aria-expanded]')).toHaveAttribute('aria-label', TITLES[index])
    })
  })

  it('« Étape suivante » referme l’étape lue et ouvre la suivante', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)
    await screen.findByText('Mon portefeuille')

    fireEvent.click(screen.getByRole('button', { name: TITLES[1] }))
    fireEvent.click(screen.getByRole('button', { name: `Étape suivante : ${TITLES[2]}` }))

    expect(screen.getByRole('button', { name: TITLES[1] })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: TITLES[2] })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ma dynamique relationnelle')).toBeInTheDocument()
  })

  it('la dernière étape n’annonce pas de suite inventée', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    renderWithRouter(<PersonalCockpit />)
    await screen.findByText('Mon portefeuille')

    fireEvent.click(screen.getByRole('button', { name: TITLES[3] }))
    expect(screen.queryByRole('button', { name: /^Étape suivante/ })).not.toBeInTheDocument()
  })
})
