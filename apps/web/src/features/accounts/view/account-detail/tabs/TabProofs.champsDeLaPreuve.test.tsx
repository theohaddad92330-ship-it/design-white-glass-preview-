import type { Account, Proof } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2124.48 / .52 / .54 — CE QU'UNE PREUVE MONTRE D'ELLE-MÊME.
 *
 * Trois des huit champs demandés étaient DÉJÀ persistés et n'étaient lus par
 * personne : `mission_id` (le contexte), `scope` (l'autorisation de citation,
 * affichée sous un mot — « Interne » — qui ne disait pas de quoi il s'agissait)
 * et `created_at` (la date). Une preuve sans date se lit comme intemporelle ;
 * c'est la faute la plus coûteuse chez un prospect, où l'on cite un résultat de
 * 2019 comme s'il datait d'hier.
 *
 * Ce que cette suite tient : la preuve NOMME ce qui manque plutôt que de le
 * taire — « Ni mission ni contexte rattaché » est une information, un blanc
 * n'en est pas une.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const useAccountMarketContext = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (...args: unknown[]) => useAccountMarketContext(...args),
}))

const { TabProofs } = await import('./TabProofs')

let accountSeq = 100
const nextAccount = (): Account => ({ id: `acc-${++accountSeq}`, company_name: 'Acme' }) as Account

function proof(over: Partial<Proof> = {}): Proof {
  return {
    id: 'p-1',
    account_id: 'acc-1',
    mission_id: null,
    claim: 'Migration de 400 To en 6 mois',
    detail: null,
    strength: 'declared',
    scope: 'internal',
    sector: null,
    anonymised: false,
    created_at: '2026-03-12T09:00:00.000Z',
    technologies: [],
    ...over,
  }
}

type Capitalisation = Parameters<typeof apiFetch>[0] extends never ? never : Record<string, unknown>

function draw(capitalisation: Capitalisation) {
  apiFetch.mockResolvedValue(capitalisation)
  return renderWithRouter(<TabProofs account={nextAccount()} />)
}

const MISSION = { mission_id: 'm-1', label: 'Data lake', status: 'ended', started_on: null, ended_on: null }

describe('TabProofs — les champs de la preuve (#2124.48 / .52 / .54)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReset().mockReturnValue({ data: undefined })
  })
  afterEach(() => cleanup())

  it('affiche la MISSION derrière l’identifiant, pas l’identifiant (#2124.48)', async () => {
    draw({
      delivered: [MISSION],
      proofs: [proof({ mission_id: 'm-1' })],
      pendingRex: [],
      collectedRex: [],
      testimonials: [],
    })
    expect(await screen.findByText(/Mission : Data lake/)).toBeInTheDocument()
    // L'identifiant ne s'affiche jamais : il n'apprend rien à personne.
    expect(screen.queryByText(/m-1/)).not.toBeInTheDocument()
  })

  it('à défaut de mission, affiche le CONTEXTE écrit — et sinon le DIT (#2124.48)', async () => {
    draw({
      delivered: [],
      proofs: [
        proof({ id: 'p-a', mission_id: null, detail: 'Audit de sécurité mené hors contrat.' }),
        proof({ id: 'p-b', claim: 'Sans rien', mission_id: null, detail: null }),
      ],
      pendingRex: [],
      collectedRex: [],
      testimonials: [],
    })
    expect(await screen.findByText(/Audit de sécurité mené hors contrat\./)).toBeInTheDocument()
    // Un blanc se lirait comme un défaut d'affichage. L'absence est NOMMÉE.
    expect(screen.getByText(/Ni mission ni contexte rattaché/)).toBeInTheDocument()
  })

  it('NOMME l’autorisation de citation — « Interne » ne disait pas de quoi il s’agissait (#2124.52)', async () => {
    draw({
      delivered: [],
      proofs: [
        proof({ id: 'p-a', scope: 'client_safe' }),
        proof({ id: 'p-b', claim: 'Preuve non relue', scope: 'internal' }),
      ],
      pendingRex: [],
      collectedRex: [],
      testimonials: [],
    })
    expect(await screen.findByText('Citation autorisée')).toBeInTheDocument()
    // Pas « citation interdite » : personne n'a refusé, personne n'a vérifié.
    expect(screen.getByText('Citation non validée')).toBeInTheDocument()
  })

  it('affiche la DATE de la preuve (#2124.54)', async () => {
    draw({
      delivered: [],
      proofs: [proof({ created_at: '2026-03-12T09:00:00.000Z' })],
      pendingRex: [],
      collectedRex: [],
      testimonials: [],
    })
    expect(await screen.findByText(/12 mars 2026/)).toBeInTheDocument()
  })
})
