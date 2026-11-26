import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * #2298.4 (réfuté en production le 19/09/2026) — L'AVEU DE FRAÎCHEUR sur
 * L'ONGLET ACCÈS.
 *
 * Mesuré en production le 19/09 ~11:15Z, sur le même espace : ACTIA Group
 * affichait « aucun rapprochement possible : ton CRM n'est pas connecté… »
 * et LVMH (un compte qui PORTE une mission) affichait « Une relation existe
 * déjà… ton CRM connecté a retrouvé ce compte ». Les deux textes se
 * contredisaient sur l'état du CRM d'un même espace — parce que
 * `raw_analysis.addressability` est un résultat STOCKÉ au moment de
 * l'analyse (`account-access.service.ts`), jamais recalculé à l'affichage :
 * deux comptes analysés à des dates différentes portent deux vérités.
 *
 * Ce test tient que l'écran DIT désormais que son calcul est antérieur à la
 * capacité #2298.4 (missions/agenda/e-mails/correction, en plus du CRM),
 * en comparant `addressabilityCollectedAt` à `SEGMENT_CAPABILITY_EPOCH.
 * access_relation` — la doctrine « un correctif de collecte rattrape
 * l'existant » (CLAUDE.md).
 */

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(addressabilityCollectedAt: string | null): Landscape {
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
    addressability: {
      score: 2,
      max: 6,
      unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
      factors: [
        {
          label: 'Semi-ouvert — estimation de registre',
          points: 2,
          evidence: 'barrière estimée 5.7/10 sur 5 proxies publics (classe C)',
          axis: 'lock',
        },
      ],
    },
    addressabilityCollectedAt,
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

describe('l’onglet Accès dit quand son calcul de relation est antérieur à la capacité (#2298.4)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('un compte analysé AVANT la capacité #2298.4 (témoin positif — ACTIA) affiche l’aveu de fraîcheur', async () => {
    apiFetchMock.mockResolvedValue(landscape('2026-09-10T08:00:00.000Z'))
    mount()

    expect(await screen.findByText(/à revérifier/i)).toBeInTheDocument()
    expect(screen.getByText(/10 septembre 2026/)).toBeInTheDocument()
  })

  it('un compte analysé APRÈS la capacité #2298.4 (témoin négatif — LVMH) n’affiche RIEN', async () => {
    apiFetchMock.mockResolvedValue(landscape('2026-09-19T12:00:00.000Z'))
    mount()

    await screen.findByText('2/6')
    expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
  })

  it('un compte jamais analysé pour ce segment (`null`) est signalé périmé, jamais présumé à jour', async () => {
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()

    expect(await screen.findByText(/non mesurée/i)).toBeInTheDocument()
  })
})
