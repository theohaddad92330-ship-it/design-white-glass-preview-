import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { ColleagueActivityBanner } from '@/features/team-guardrails/components/ColleagueActivityBanner'
import { DuplicateCandidatesCard } from '@/features/team-guardrails/components/DuplicateCandidatesCard'
import { ContactAmbiguousIdentityAlert } from '../components/ContactAmbiguousIdentityAlert'
import { ContactPreflight } from '../components/ContactPreflight'
import { ContactSolicitationCollisionAlert } from '../components/ContactSolicitationCollisionAlert'
import { DetectedNewEmployer } from '../components/DetectedNewEmployer'
import { HistoricalContactStillUseful } from '../components/HistoricalContactStillUseful'
import { ContactAlertsBand } from './ContactAlertsBand'

/**
 * #4596 — les SEPT cartes du bandeau « Avant d'agir » : chacune s'ignore, se revérifie quand elle sait se relire, et
 * porte UN geste nommé qui mène quelque part. Avant : six sur sept n'offraient aucun bouton.
 */
const hooks = vi.hoisted(() => ({
  preflightRefetch: vi.fn().mockResolvedValue({ isError: false, error: null }),
  colleagueRefetch: vi.fn().mockResolvedValue({ isError: false, error: null }),
  duplicatesRefetch: vi.fn().mockResolvedValue({ isError: false, error: null }),
  sequencesRefetch: vi.fn().mockResolvedValue({ isError: false, error: null }),
  propose: vi.fn(),
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/search">{children}</a>,
}))
vi.mock('@/features/contacts/hooks/useContactPreflight', () => ({
  useContactPreflight: () => ({
    data: { items: [{ kind: 'identity_doubt' }], unknowns: [] },
    refetch: hooks.preflightRefetch,
  }),
}))
vi.mock('@/features/outreach/hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({
    data: [
      { id: 's1', status: 'active' },
      { id: 's2', status: 'active' },
    ],
    refetch: hooks.sequencesRefetch,
  }),
}))
vi.mock('@/features/team-guardrails/hooks', () => ({
  useContactColleagueActivity: () => ({
    data: {
      items: [
        {
          user_id: 'u-2',
          name: 'Awa',
          is_responsible: false,
          last_action: null,
          last_action_at: '2026-10-20T09:00:00.000Z',
        },
      ],
    },
    refetch: hooks.colleagueRefetch,
  }),
  useDuplicateCandidates: () => ({
    data: { items: [{ id: 'd-1', label: 'Sandrine M.', reason: 'same_email', owner_name: null }] },
    refetch: hooks.duplicatesRefetch,
  }),
  useProposeMerge: () => ({ mutate: hooks.propose, isPending: false }),
}))

const contact = {
  id: 'c-1',
  full_name: 'Sandrine Martin',
  lifecycle_state: 'historique',
  last_enrichment_result: 'ambiguous',
  apollo_enrichment: { employment_history: [{ current: true, organization_name: 'Société Générale' }] },
} as unknown as Contact

function renderBand(onReveal = vi.fn(), onRefresh = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ContactAlertsBand contactId="c-1">
      <ContactPreflight contactId="c-1" onReveal={onReveal} />
      <HistoricalContactStillUseful contact={contact} onReveal={onReveal} onRecheck={onRefresh} />
      <DetectedNewEmployer contact={contact} onReveal={onReveal} onRecheck={onRefresh} />
      <ContactAmbiguousIdentityAlert contact={contact} onReveal={onReveal} onRecheck={onRefresh} />
      <ContactSolicitationCollisionAlert contact={contact} onReveal={onReveal} />
      <ColleagueActivityBanner contactId="c-1" onReveal={onReveal} />
      <DuplicateCandidatesCard kind="contact" id="c-1" />
    </ContactAlertsBand>,
  )
  return { onReveal, onRefresh }
}

describe('les sept cartes du bandeau (#4596)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    window.localStorage.clear()
    vi.clearAllMocks()
    useCurrentUserStore.setState({
      currentUser: { id: '22222222-2222-4222-8222-222222222222', email: 'a@b.fr', created_at: '2026-01-01', roles: [] },
    })
  })

  it('le pli compte les sept cartes, et chacune s’ignore PAR CARTE (jamais « tout »)', async () => {
    renderBand()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /à vérifier avant d’agir/ })).toHaveTextContent('7 points'),
    )
    expect(screen.getAllByRole('button', { name: /^Ignorer$|Garder la fiche telle quelle/ })).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /tout ignorer/i })).toBeNull()
  })

  it('chaque carte porte UN geste nommé qui mène quelque part', async () => {
    const { onReveal } = renderBand()
    await waitFor(() => screen.getByRole('button', { name: /à vérifier avant d’agir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Corriger la fiche' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mettre la fiche à jour' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’identité' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voir l’autre envoi' }))
    for (const button of screen.getAllByRole('button', { name: 'Voir l’historique des échanges' })) {
      fireEvent.click(button)
    }
    expect(onReveal.mock.calls.map(call => call[0])).toEqual([
      'contact-correct',
      'contact-correct',
      'contact-fold-protections',
      'contact-outreach',
      'contact-timeline',
      'contact-timeline',
    ])
    // « doublon probable » : le geste existant PROPOSE la fusion, jamais ne fusionne.
    fireEvent.click(screen.getByRole('button', { name: 'Proposer la fusion' }))
    expect(hooks.propose).toHaveBeenCalledWith('d-1')
  })

  it('« garder la version humaine » : la carte du nouvel employeur se range sans toucher à la fiche', async () => {
    renderBand()
    await waitFor(() => screen.getByRole('button', { name: 'Garder la fiche telle quelle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Garder la fiche telle quelle' }))
    expect(screen.getByText('Nouvel employeur détecté', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Ignorée le/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /à vérifier avant d’agir/ })).toHaveTextContent('6 points')
  })

  it('« Revérifier » relit la carte (lecture seule) et dit quand', async () => {
    renderBand()
    await waitFor(() => screen.getByRole('button', { name: /à vérifier avant d’agir/ }))
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Revérifier' })[0])
    })
    expect(hooks.preflightRefetch).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Revérifié le/)).toBeInTheDocument()
  })
})
