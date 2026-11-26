import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { TabAccess } from './TabAccess'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * Un libellé d'AFFICHAGE écrit hors du catalogue i18n est français pour
 * toujours (09/09) : `discover_scoring.py` et `access_scoring.py` composaient
 * leurs phrases en français, rendues verbatim par cet onglet — en anglais,
 * l'utilisateur lisait « Relation — L'entrée n'est pas froide ».
 *
 * Deux mécanismes distincts, deux familles de tests :
 *
 * - les axes d'adressabilité (lock/proportion/relation) reçoivent un NOUVEAU
 *   champ additif, `label_key` (+ `label_params`) — STRICTEMENT ADDITIF, donc
 *   testé dans les deux sens : traduit quand il est là, replié sur `label`
 *   quand il ne l'est pas (le cas « IA plus ancienne, fenêtre de déploiement
 *   Vercel/Railway ») ;
 * - la correction datée (« marché arrive à échéance ») réutilise un CODE déjà
 *   existant, `correction.key` (`echeance_proche`) — pas de nouveau champ.
 */

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(overrides: Partial<Landscape>): Landscape {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    addressability: null,
    ...overrides,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabAccess — label_key des axes d’adressabilité (repli + traduction)', () => {
  beforeEach(async () => {
    apiFetchMock.mockReset()
    await i18n.changeLanguage('fr')
  })
  afterEach(cleanup)

  it('affiche le label brut quand label_key est absent — le cas « IA ancienne »', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({
        addressability: {
          score: 3,
          max: 3,
          unmeasured: [],
          factors: [
            {
              axis: 'relation',
              label: 'Une relation existe déjà — l’entrée n’est pas froide',
              points: 3,
              evidence: 'ton CRM connecté a retrouvé ce compte',
            },
          ],
        },
      }),
    )
    mount()

    expect(await screen.findByText('3/3')).toBeInTheDocument()
    expect(screen.getByText(/Relation — Une relation existe déjà/)).toBeInTheDocument()
  })

  it('préfère la traduction ANGLAISE de label_key quand elle est là', async () => {
    await i18n.changeLanguage('en')
    apiFetchMock.mockResolvedValue(
      landscape({
        addressability: {
          score: 3,
          max: 3,
          unmeasured: [],
          factors: [
            {
              axis: 'relation',
              label: 'Une relation existe déjà — l’entrée n’est pas froide',
              points: 3,
              evidence: 'ton CRM connecté a retrouvé ce compte',
              label_key: 'axes.relation',
            },
          ],
        },
      }),
    )
    mount()

    expect(await screen.findByText('3/3')).toBeInTheDocument()
    // La preuve que ce n'est PAS le repli qui a gagné : le français d'origine
    // n'apparaît nulle part.
    expect(screen.getByText(/Relation — A relationship already exists/)).toBeInTheDocument()
    expect(screen.queryByText(/Une relation existe déjà/)).not.toBeInTheDocument()
  })

  it('retombe sur le label français si la clé est inconnue du catalogue — jamais une clé brute à l’écran', async () => {
    await i18n.changeLanguage('en')
    apiFetchMock.mockResolvedValue(
      landscape({
        addressability: {
          score: 5,
          max: 6,
          unmeasured: [],
          factors: [
            {
              axis: 'lock',
              label: 'Un futur libellé jamais traduit',
              points: 5,
              evidence: 'preuve',
              label_key: 'axes.uneCleInconnue',
            },
          ],
        },
      }),
    )
    mount()

    expect(await screen.findByText('5/6')).toBeInTheDocument()
    // Axe traduit ("Lock", EN) + libellé replié sur le français faute de clé connue.
    expect(screen.getByText(/Lock — Un futur libellé jamais traduit/)).toBeInTheDocument()
    expect(screen.queryByText(/axes\.uneCleInconnue/)).not.toBeInTheDocument()
  })
})

describe('TabAccess — la correction datée se traduit par son key, jamais par son label brut', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  const BARRIER_WITH_CORRECTION = {
    score: 4.6,
    accessibility: 5.4,
    access_class: 'B',
    label: 'Ouvert par une entité',
    measurable: true,
    missing: [],
    proxies: [],
    corrections: [
      {
        key: 'echeance_proche',
        delta: -1.5,
        label: 'Le marché en place arrive à échéance',
        evidence: 'marché public en cours jusqu’au 2027-01-01',
      },
    ],
  }

  it('en français, rend le texte connu (identique au label brut, par coïncidence)', async () => {
    await i18n.changeLanguage('fr')
    apiFetchMock.mockResolvedValue(landscape({ barrier: BARRIER_WITH_CORRECTION }))
    mount()

    expect(await screen.findByText(/Ouvert par une entité/)).toBeInTheDocument()
    expect(screen.getByText(/Le marché en place arrive à échéance/)).toBeInTheDocument()
  })

  it('en anglais, traduit la correction — jamais le français brut', async () => {
    await i18n.changeLanguage('en')
    apiFetchMock.mockResolvedValue(landscape({ barrier: BARRIER_WITH_CORRECTION }))
    mount()

    expect(await screen.findByText(/Open through an entity/)).toBeInTheDocument()
    expect(screen.getByText(/The current contract is coming up for renewal/)).toBeInTheDocument()
    expect(screen.queryByText(/Le marché en place arrive à échéance/)).not.toBeInTheDocument()
  })
})
