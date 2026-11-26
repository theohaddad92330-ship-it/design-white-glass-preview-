import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountFreshness, computeFreshnessFact } from './AccountFreshness'

const { crmPresence } = vi.hoisted(() => ({ crmPresence: vi.fn() }))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => crmPresence() }))
beforeEach(() => {
  crmPresence.mockReset().mockReturnValue({ data: undefined })
})

/**
 * #2117.41-45 — la fraîcheur dit ce qu'elle mesure : analyse complète,
 * rafraîchissement ciblé (par axe) ou observation structurelle — jamais une
 * seule date « Analyse » qui reste figée pendant qu'un axe a bougé depuis.
 */
describe('computeFreshnessFact — la fraîcheur RÉELLE la plus récente', () => {
  const base = {
    created_at: '2026-01-01T00:00:00Z',
    status: 'completed' as Account['status'],
    last_analyzed_at: null as string | null,
    signals_refreshed_at: null as string | null,
    contacts_refreshed_at: null as string | null,
    entities_refreshed_at: null as string | null,
    strategy_refreshed_at: null as string | null,
  }

  it('retombe sur l’analyse complète quand rien d’autre n’a bougé', () => {
    const fact = computeFreshnessFact({ ...base, last_analyzed_at: '2026-02-01T10:00:00Z' })
    expect(fact).toEqual({ nature: 'fullAnalysis', at: '2026-02-01T10:00:00Z' })
  })

  it('rend `null` quand AUCUNE des quatre sources n’est mesurée — jamais une date devinée', () => {
    expect(computeFreshnessFact({ ...base, status: 'analyzing' })).toBeNull()
  })

  it('préfère un rafraîchissement CIBLÉ plus récent que l’analyse complète — #2117.43', () => {
    const fact = computeFreshnessFact({
      ...base,
      last_analyzed_at: '2026-02-01T10:00:00Z',
      contacts_refreshed_at: '2026-03-15T09:00:00Z',
    })
    expect(fact).toEqual({ nature: 'targetedRefresh', at: '2026-03-15T09:00:00Z', dimension: 'contacts' })
  })

  it('nomme l’axe « entités » comme une observation STRUCTURELLE, distincte du reste — #2117.45', () => {
    const fact = computeFreshnessFact({
      ...base,
      last_analyzed_at: '2026-02-01T10:00:00Z',
      entities_refreshed_at: '2026-04-01T08:00:00Z',
    })
    expect(fact).toEqual({ nature: 'structuralObservation', at: '2026-04-01T08:00:00Z' })
  })

  it('choisit le PLUS RÉCENT des quatre, quelle que soit la nature', () => {
    const fact = computeFreshnessFact({
      ...base,
      last_analyzed_at: '2026-05-01T00:00:00Z',
      signals_refreshed_at: '2026-01-01T00:00:00Z',
      entities_refreshed_at: '2026-06-01T00:00:00Z',
      strategy_refreshed_at: '2026-03-01T00:00:00Z',
    })
    expect(fact?.nature).toBe('structuralObservation')
    expect(fact?.at).toBe('2026-06-01T00:00:00Z')
  })

  it('un compte legacy `completed` sans run retombe sur `created_at` — comportement de C1, inchangé', () => {
    const fact = computeFreshnessFact({ ...base, status: 'completed', last_analyzed_at: null })
    expect(fact).toEqual({ nature: 'fullAnalysis', at: base.created_at })
  })
})

const stubAccount: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME Corp',
  siren: null,
  sector: null,
  employees: null,
  revenue: null,
  headquarters: null,
  website: null,
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_analyzed_at: '2026-02-01T10:00:00Z',
}

describe('AccountFreshness — le rendu', () => {
  it('nomme le rafraîchissement CIBLÉ par son axe plutôt que de dire « Analyse »', async () => {
    renderWithRouter(
      <AccountFreshness account={{ ...stubAccount, contacts_refreshed_at: '2026-03-15T09:00:00Z' }} />,
      '/accounts/test-id',
    )
    await waitFor(() => expect(screen.getByText(/Rafraîchissement ciblé/i)).toBeInTheDocument())
    expect(screen.getByText(/Contacts/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Analyse complète/i)).not.toBeInTheDocument()
  })

  it('#2117.41 — dit « Analyse actualisée il y a N » (valeur réelle), la date EXACTE en info-bulle', async () => {
    const recent = new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    renderWithRouter(<AccountFreshness account={{ ...stubAccount, last_analyzed_at: recent }} />, '/accounts/test-id')
    const line = await screen.findByText(/^Analyse actualisée il y a 5 heures$/)
    expect(line.getAttribute('title')).toMatch(/^Analyse complète le .+ à \d{2}:\d{2}$/)
  })

  it('#3492 — sans date, AUCUNE ligne : ni « non mesuré », ni icône seule', async () => {
    const { container } = renderWithRouter(
      <AccountFreshness account={{ ...stubAccount, status: 'analyzing', last_analyzed_at: null }} />,
      '/accounts/test-id',
    )
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('R15-4 — aucune position absolue : la fraîcheur garde SA rangée et ne recouvre plus « Prochaine action »', async () => {
    const { container } = renderWithRouter(<AccountFreshness account={stubAccount} />, '/accounts/test-id')
    await screen.findByText(/Analyse actualisée/)
    expect(container.querySelector('[class*="absolute"]')).toBeNull()
  })

  it('#3492 — CRM connecté et date connue : jamais de ligne « non mesuré » sur la synchronisation', async () => {
    crmPresence.mockReturnValue({ data: { provider: 'hubspot', matched: true } })
    const { container } = renderWithRouter(<AccountFreshness account={stubAccount} />, '/accounts/test-id')
    await screen.findByText(/Analyse actualisée/)
    expect(container.textContent).not.toMatch(/non mesur|synchronisation/i)
  })
})

// #4283.8 (recette 23/10) — « Analyse actualisée avant-hier » seul ne dit ni QUAND, ni QUAND la suite : la date
// ABSOLUE de la dernière analyse se lit à côté, et un compte suivi dit sa prochaine ré-analyse (la date vient de l'API,
// le même calcul que le job de ré-analyse — GA-26). Un compte non suivi n'en porte aucune.
describe('AccountFreshness — date absolue et prochaine ré-analyse (#4283.8)', () => {
  it('dit la date ABSOLUE de la dernière analyse à côté du « il y a »', async () => {
    renderWithRouter(
      <AccountFreshness account={{ ...stubAccount, last_analyzed_at: '2026-10-21T12:00:00Z' }} />,
      '/accounts/test-id',
    )
    expect(await screen.findByTestId('freshness-analysis-date')).toHaveTextContent('21 octobre 2026')
  })

  it('compte suivi : « Prochaine ré-analyse le <date> », celle que l’API annonce', async () => {
    renderWithRouter(
      <AccountFreshness
        account={{ ...stubAccount, last_analyzed_at: '2026-10-21T12:00:00Z', next_reanalysis_at: '2026-11-05' }}
      />,
      '/accounts/test-id',
    )
    expect(await screen.findByTestId('freshness-next-reanalysis')).toHaveTextContent(
      'Prochaine ré-analyse le 5 novembre 2026',
    )
  })

  it('SAIT DIRE NON : compte non suivi (ou sans date), aucune date de prochaine ré-analyse', async () => {
    renderWithRouter(
      <AccountFreshness
        account={{
          ...stubAccount,
          last_analyzed_at: '2026-10-21T12:00:00Z',
          next_reanalysis_at: null,
          next_reanalysis_reason: 'not_followed',
        }}
      />,
      '/accounts/test-id',
    )
    await screen.findByTestId('freshness-analysis-date')
    expect(screen.queryByTestId('freshness-next-reanalysis')).toBeNull()
  })
})
