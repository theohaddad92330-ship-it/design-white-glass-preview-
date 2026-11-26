import type { Account, Proof, TechnoPrevalenceTier } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1638.2 — LE CONTEXTE DE MARCHÉ d'une preuve : courante / spécialisée / rare
 * DANS NOTRE RÉFÉRENTIEL.
 *
 * Ce que cette suite tient, et qui n'est pas décoratif :
 *  1. Le palier vient du SERVEUR, qui l'a calculé sur les quantiles du corpus.
 *     L'écran ne connaît ni fréquence ni seuil — il ne peut donc pas en
 *     inventer un.
 *  2. Une technologie SANS palier n'affiche rien. « Inconnu » n'est pas
 *     « courante », et l'absence du champ entier (mémoire marché non montée,
 *     lecture indisponible) se rend pareil : silence.
 *  3. L'ordre des preuves ne bouge PAS. Le retour l'interdit nommément : pas de
 *     classement automatique en V1, un savoir-faire rare pouvant être plus
 *     pertinent qu'un savoir-faire ubiquitaire.
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
    claim: 'Mission Data Engineer — Banque',
    detail: null,
    strength: 'declared',
    scope: 'internal',
    sector: null,
    anonymised: false,
    created_at: '2026-01-01T00:00:00.000Z',
    technologies: ['Spark', 'Airflow', 'Python'],
    ...over,
  }
}

type Capitalisation = {
  delivered: unknown[]
  proofs: Proof[]
  pendingRex: unknown[]
  testimonials: unknown[]
  techno_prevalence?: { techno: string; tier: TechnoPrevalenceTier }[]
}

function draw(capitalisation: Partial<Capitalisation> = {}) {
  apiFetch.mockResolvedValue({
    delivered: [],
    proofs: [proof()],
    pendingRex: [],
    testimonials: [],
    ...capitalisation,
  })
  // Le compte n'est pas couvert par la mémoire marché : la compatibilité
  // technique (#1612.1) reste muette, et cette suite mesure le SEUL bloc
  // qu'elle décrit.
  useAccountMarketContext.mockReturnValue({ data: null })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabProofs account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('TabProofs — le contexte de marché d’une preuve', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReset()
  })
  afterEach(() => cleanup())

  it('nomme le palier de chaque technologie, groupées par palier', async () => {
    draw({
      techno_prevalence: [
        { techno: 'Spark', tier: 'rare' },
        { techno: 'Airflow', tier: 'specialisee' },
        { techno: 'Python', tier: 'courante' },
      ],
    })

    expect(await screen.findByText(/Rare dans notre référentiel.*Spark/)).toBeInTheDocument()
    expect(screen.getByText(/spécialisée dans notre référentiel.*Airflow/)).toBeInTheDocument()
    expect(screen.getByText(/Courante dans notre référentiel.*Python/)).toBeInTheDocument()
  })

  it('regroupe deux technologies du MÊME palier sur une seule ligne', async () => {
    draw({
      techno_prevalence: [
        { techno: 'Spark', tier: 'rare' },
        { techno: 'Airflow', tier: 'rare' },
      ],
    })

    expect(await screen.findByText(/Rare dans notre référentiel.*Spark, Airflow/)).toBeInTheDocument()
  })

  it('n’affiche RIEN pour une technologie sans palier — « inconnu » n’est pas « courante »', async () => {
    draw({ techno_prevalence: [{ techno: 'Spark', tier: 'rare' }] })

    expect(await screen.findByText(/Rare dans notre référentiel/)).toBeInTheDocument()
    expect(screen.queryByText(/Airflow.*référentiel|référentiel.*Airflow/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Courante dans notre référentiel/)).not.toBeInTheDocument()
  })

  it('se tait entièrement quand le champ est ABSENT — mémoire marché non montée ou indisponible', async () => {
    draw()

    expect(await screen.findByText('Mission Data Engineer — Banque')).toBeInTheDocument()
    expect(screen.queryByText(/dans notre référentiel/)).not.toBeInTheDocument()
  })

  it('se tait quand le champ est présent mais VIDE', async () => {
    draw({ techno_prevalence: [] })

    expect(await screen.findByText('Mission Data Engineer — Banque')).toBeInTheDocument()
    expect(screen.queryByText(/dans notre référentiel/)).not.toBeInTheDocument()
  })

  it('ne dit JAMAIS que la preuve répond au besoin du client', async () => {
    draw({
      techno_prevalence: [
        { techno: 'Spark', tier: 'rare' },
        { techno: 'Python', tier: 'courante' },
      ],
    })

    await screen.findByText(/Rare dans notre référentiel/)
    expect(screen.queryByText(/besoin/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/répond/i)).not.toBeInTheDocument()
  })

  it('ne CLASSE pas les preuves — l’ordre rendu est celui du serveur', async () => {
    // Le piège que le retour nomme : trier par rareté ferait passer la preuve
    // « rare » devant, et le volume brut deviendrait un jugement de valeur.
    apiFetch.mockResolvedValue({
      delivered: [],
      proofs: [
        proof({ id: 'p-1', claim: 'Preuve courante', technologies: ['Python'] }),
        proof({ id: 'p-2', claim: 'Preuve rare', technologies: ['Spark'] }),
      ],
      pendingRex: [],
      testimonials: [],
      techno_prevalence: [
        { techno: 'Python', tier: 'courante' },
        { techno: 'Spark', tier: 'rare' },
      ],
    })
    useAccountMarketContext.mockReturnValue({ data: null })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TabProofs account={ACCOUNT} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('Preuve rare')).toBeInTheDocument())
    const claims = screen.getAllByText(/^Preuve (courante|rare)$/).map(node => node.textContent)
    expect(claims).toEqual(['Preuve courante', 'Preuve rare'])
  })
})
