import type { Account, AccountMarketContext, Proof } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1612.1 / #1638.1 — la compatibilité TECHNIQUE observée, sur l'onglet
 * Preuves & REX.
 *
 * Deux issues du 06/09 demandaient la MÊME chose sous deux vocabulaires
 * (« technologies », « compétences ») : afficher « Compatibilité technique
 * observée » quand une preuve et l'environnement technique observé du compte
 * (`useAccountMarketContext().data.observed_stack`) partagent AU MOINS deux
 * technologies.
 *
 * Ce que cette suite tient, et qui n'est pas décoratif :
 *  1. Le seuil est un seuil — UNE technologie commune n'affiche RIEN.
 *  2. Un environnement technique ABSENT (compte non couvert par la mémoire
 *     marché) n'affiche rien non plus, et ne dit JAMAIS « incompatible » — la
 *     doctrine interdit de lire une absence comme un refus.
 *  3. La technologie d'une preuve est SAISIE par qui la déclare : rien dans le
 *     pipeline ne peut la deviner, donc le formulaire de création la porte.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const useAccountMarketContext = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (...args: unknown[]) => useAccountMarketContext(...args),
}))

const { TabProofs } = await import('./TabProofs')

const ACCOUNT = { id: 'acc-1', company_name: 'Acme' } as Account

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
    created_at: '2026-01-01T00:00:00.000Z',
    technologies: [],
    ...over,
  }
}

type Capitalisation = {
  delivered: { mission_id: string; label: string; status: string; started_on: string | null; ended_on: string | null }[]
  proofs: Proof[]
  pendingRex: unknown[]
  testimonials: unknown[]
}

const EMPTY: Capitalisation = { delivered: [], proofs: [], pendingRex: [], testimonials: [] }
// `empty` (TabProofs.tsx) se déclenche quand LES TROIS de delivered/proofs/
// testimonials sont vides : une mission fictive suffit à garder le formulaire
// monté quand le test porte sur la création, sans introduire de preuve.
const WITH_A_MISSION: Capitalisation = {
  ...EMPTY,
  delivered: [{ mission_id: 'm-1', label: 'Mission A', status: 'active', started_on: null, ended_on: null }],
}

function mockMarketContext(observedStack: string[] | null | undefined) {
  useAccountMarketContext.mockReturnValue({
    data:
      observedStack === null
        ? null
        : ({ paths_observed: 40, esn_observed: 2, observed_stack: observedStack } as AccountMarketContext),
  })
}

function draw(capitalisation: Capitalisation = EMPTY) {
  // `mockResolvedValue` (pas `Once`) : un `invalidateQueries` après création
  // relance le GET, et ce second appel doit trouver la même réponse par
  // défaut plutôt qu'`undefined`.
  apiFetch.mockResolvedValue(capitalisation)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabProofs account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabProofs — « Compatibilité technique observée » (#1612.1 / #1638.1)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReset()
  })
  afterEach(() => cleanup())

  it('l’affiche, NOMMÉE, à partir de DEUX technologies communes', async () => {
    mockMarketContext(['java', 'aws', 'kafka'])
    draw({ ...EMPTY, proofs: [proof({ technologies: ['Java', 'AWS'] })] })

    expect(await screen.findByText('Compatibilité technique observée')).toBeInTheDocument()
    // Un score n'est jamais nu : les technologies communes sont NOMMÉES, pas
    // seulement comptées.
    expect(screen.getByText(/Java, AWS/)).toBeInTheDocument()
  })

  it('sait dire NON — UNE seule technologie commune n’affiche rien', async () => {
    mockMarketContext(['java', 'python'])
    draw({ ...EMPTY, proofs: [proof({ technologies: ['Java'] })] })

    await screen.findByText('Migration de 400 To en 6 mois')
    expect(screen.queryByText('Compatibilité technique observée')).not.toBeInTheDocument()
  })

  it('sait dire NON — un environnement technique ABSENT n’affiche rien, et ne dit JAMAIS « incompatible »', async () => {
    // Compte non couvert par la mémoire marché : `data` est `null`.
    mockMarketContext(null)
    draw({ ...EMPTY, proofs: [proof({ technologies: ['Java', 'AWS'] })] })

    await screen.findByText('Migration de 400 To en 6 mois')
    expect(screen.queryByText('Compatibilité technique observée')).not.toBeInTheDocument()
    expect(screen.queryByText(/incompatible/i)).not.toBeInTheDocument()
  })

  it('une preuve SANS technologie déclarée n’affiche rien, même face à un environnement riche', async () => {
    mockMarketContext(['java', 'aws', 'kafka'])
    draw({ ...EMPTY, proofs: [proof({ technologies: [] })] })

    await screen.findByText('Migration de 400 To en 6 mois')
    expect(screen.queryByText('Compatibilité technique observée')).not.toBeInTheDocument()
  })

  it('une preuve ANTÉRIEURE au champ (`technologies` absent) n’affiche rien — jamais un crash', async () => {
    mockMarketContext(['java', 'aws'])
    const legacyProof = proof()
    delete (legacyProof as { technologies?: string[] }).technologies
    draw({ ...EMPTY, proofs: [legacyProof] })

    await screen.findByText('Migration de 400 To en 6 mois')
    expect(screen.queryByText('Compatibilité technique observée')).not.toBeInTheDocument()
  })
})

describe('TabProofs — la technologie d’une preuve est SAISIE par qui la déclare', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReturnValue({ data: null })
  })
  afterEach(() => cleanup())

  it('envoie les technologies saisies, nettoyées de leurs espaces et de leurs doublons', async () => {
    draw(WITH_A_MISSION)
    await screen.findByText('Aucune preuve enregistrée.')

    fireEvent.change(screen.getByPlaceholderText('Migration de 400 To en 6 mois…'), {
      target: { value: 'Nouvelle preuve' },
    })
    fireEvent.change(screen.getByLabelText(/Technologies/i), { target: { value: ' Java ,AWS ,, Java' } })

    apiFetch.mockResolvedValueOnce(proof({ id: 'p-2', claim: 'Nouvelle preuve', technologies: ['Java', 'AWS'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/capitalisation/proofs',
          method: 'POST',
          body: expect.objectContaining({ claim: 'Nouvelle preuve', technologies: ['Java', 'AWS'] }),
        }),
      )
    })
  })

  it('n’envoie AUCUN champ `technologies` quand rien n’a été saisi', async () => {
    draw(WITH_A_MISSION)
    await screen.findByText('Aucune preuve enregistrée.')

    fireEvent.change(screen.getByPlaceholderText('Migration de 400 To en 6 mois…'), {
      target: { value: 'Preuve sans techno' },
    })
    apiFetch.mockResolvedValueOnce(proof({ id: 'p-3', claim: 'Preuve sans techno' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.objectContaining({ technologies: expect.anything() }),
        }),
      )
    })
  })
})
