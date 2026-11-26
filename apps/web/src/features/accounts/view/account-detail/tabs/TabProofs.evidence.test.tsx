import type { Account, Proof } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2124.49 à .55 — LES CHAMPS DE PREUVE, proposés puis validés.
 *
 * Décision de Louis du 14/09/2026 : « Laura les propose, l'humain valide ».
 *
 * Ce que cette suite tient :
 *  1. Une preuve AFFICHE ses champs — problème, résultat, expertise,
 *     autorisation de citation, source, date, version.
 *  2. Une valeur absente dit « non mesuré ». Jamais « 0 », jamais un tiret :
 *     un tiret se lit comme « rien à dire », et un zéro comme une mesure.
 *  3. La proposition n'écrit RIEN. Tant que personne n'a cliqué « Valider »,
 *     aucune requête d'écriture ne part — c'est la doctrine du copilote, et
 *     c'est ici qu'elle se voit à l'écran.
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
    mission_id: 'm-1',
    claim: 'Migration du socle vers les conteneurs',
    detail: null,
    strength: 'declared',
    scope: 'internal',
    sector: null,
    anonymised: false,
    created_at: '2026-02-03T00:00:00.000Z',
    technologies: [],
    problem: null,
    result: null,
    expertise: [],
    citation_allowed: null,
    source: null,
    version: 1,
    field_provenance: {},
    ...over,
  }
}

const MISSION = { mission_id: 'm-1', label: 'Migration du socle', status: 'ended', started_on: null, ended_on: null }

const PROPOSAL = {
  mission: { mission_id: 'm-1', label: 'Migration du socle', ended_on: null },
  proof_id: null,
  proposal: {
    claim: { value: 'Migration du socle', from: 'mission' },
    problem: { value: 'Réduire le délai de mise en production', from: 'need' },
    result: { value: 'Délai passé de 3 semaines à 2 jours.', from: 'rex' },
    expertise: { value: ['Architecte plateforme'], from: 'mission' },
    source: 'rex',
  },
}

function draw(over: { proofs?: Proof[]; delivered?: unknown[]; proposal?: unknown } = {}) {
  apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
    if (path.includes('proof-proposal')) return over.proposal ?? PROPOSAL
    if (path.startsWith('/capitalisation/accounts/')) {
      return {
        delivered: over.delivered ?? [MISSION],
        proofs: over.proofs ?? [proof()],
        pendingRex: [],
        testimonials: [],
      }
    }
    if (method) return proof()
    throw new Error(`appel inattendu : ${path}`)
  })
  useAccountMarketContext.mockReturnValue({ data: null })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabProofs account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

type Call = { path: string; method?: string; body?: Record<string, unknown> }

const writes = (): Call[] =>
  apiFetch.mock.calls.map(call => call[0] as Call).filter(arg => Boolean(arg.method) && arg.method !== 'GET')

describe('TabProofs — les champs de preuve', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReset()
  })
  afterEach(() => cleanup())

  it('affiche les sept champs d’une preuve renseignée', async () => {
    draw({
      proofs: [
        proof({
          problem: 'Le client ne savait pas livrer',
          result: 'Délai passé de 3 semaines à 2 jours',
          expertise: ['Architecte plateforme'],
          citation_allowed: true,
          source: 'rex',
          version: 3,
        }),
      ],
    })

    expect(await screen.findByText(/Le problème traité/)).toBeInTheDocument()
    expect(screen.getByText(/Le client ne savait pas livrer/)).toBeInTheDocument()
    expect(screen.getByText(/Délai passé de 3 semaines à 2 jours/)).toBeInTheDocument()
    expect(screen.getByText(/Architecte plateforme/)).toBeInTheDocument()
    expect(screen.getByText(/Citation autorisée/)).toBeInTheDocument()
    expect(screen.getByText(/Le retour de mission/)).toBeInTheDocument()
    expect(screen.getByText(/Version 3/)).toBeInTheDocument()
  })

  it('une valeur absente dit « non mesuré » — jamais « 0 », jamais un tiret', async () => {
    draw({ proofs: [proof()] })

    expect(await screen.findByText(/Le problème traité/)).toBeInTheDocument()
    expect(screen.getAllByText(/Non mesuré/).length).toBeGreaterThanOrEqual(3)
    // L'autorisation NON TRANCHÉE se nomme : ni autorisée, ni refusée.
    expect(screen.getByText(/Autorisation non tranchée/)).toBeInTheDocument()
    expect(screen.queryByText(/Citation non autorisée/)).not.toBeInTheDocument()
  })

  it('propose depuis la mission — et n’écrit RIEN tant que personne n’a validé', async () => {
    draw({ proofs: [] })

    fireEvent.click(await screen.findByRole('button', { name: /Proposer les champs de preuve/ }))

    expect(await screen.findByDisplayValue('Réduire le délai de mise en production')).toBeInTheDocument()
    expect(screen.getByText(/Proposé depuis le retour de mission/)).toBeInTheDocument()
    // La preuve de la doctrine : AUCUNE écriture n'est partie.
    expect(writes()).toEqual([])
  })

  it('SAIT DIRE NON : la validation écrit, et nomme les champs validés tels quels', async () => {
    draw({ proofs: [] })

    fireEvent.click(await screen.findByRole('button', { name: /Proposer les champs de preuve/ }))
    await screen.findByDisplayValue('Réduire le délai de mise en production')
    fireEvent.click(screen.getByRole('button', { name: /^Valider$/ }))

    await waitFor(() => expect(writes().length).toBe(1))
    const body = writes()[0]?.body ?? {}
    expect(body.problem).toBe('Réduire le délai de mise en production')
    expect(body.mission_id).toBe('m-1')
    expect(body.kept_from_proposal).toEqual(expect.arrayContaining(['claim', 'problem', 'result', 'expertise']))
  })

  it('un champ CORRIGÉ à la main ne se présente plus comme proposé', async () => {
    draw({ proofs: [] })

    fireEvent.click(await screen.findByRole('button', { name: /Proposer les champs de preuve/ }))
    const champ = await screen.findByDisplayValue('Réduire le délai de mise en production')
    fireEvent.change(champ, { target: { value: 'Le client ne savait pas livrer' } })
    fireEvent.click(screen.getByRole('button', { name: /^Valider$/ }))

    await waitFor(() => expect(writes().length).toBe(1))
    const body = writes()[0]?.body ?? {}
    expect(body.problem).toBe('Le client ne savait pas livrer')
    expect(body.kept_from_proposal).not.toContain('problem')
  })
})
