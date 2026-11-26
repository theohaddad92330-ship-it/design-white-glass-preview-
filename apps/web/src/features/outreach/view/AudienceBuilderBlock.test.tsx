import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CampaignAudienceResult } from '@bellum/contracts'
import { AudienceBuilderBlock } from './AudienceBuilderBlock'

const preview = vi.fn()
const events = vi.fn()
const needs = vi.fn()
vi.mock('../api', () => ({
  campaignAudienceApi: {
    preview: (...args: unknown[]) => preview(...args),
    events: (...args: unknown[]) => events(...args),
    needs: (...args: unknown[]) => needs(...args),
  },
}))

const RESULT: CampaignAudienceResult = {
  eligible: [
    {
      contact_id: 'c-1',
      full_name: 'Claire Martin',
      title: 'DSI',
      account_id: 'a-1',
      account_name: 'Acme',
      assigned_to: null,
      email: 'claire@acme.test',
      sequence_scope: 'mono_contact',
      duplicate_suspected: true,
      identity_unverified: false,
      owned_by_other: false,
      already_contacted: false,
    },
    {
      contact_id: 'c-2',
      full_name: 'Claire M.',
      title: null,
      account_id: 'a-1',
      account_name: 'Acme',
      assigned_to: null,
      email: 'claire@acme.test',
      sequence_scope: 'mono_contact',
      duplicate_suspected: true,
      identity_unverified: true,
      owned_by_other: false,
      already_contacted: false,
    },
  ],
  excluded: [
    { contact_id: 'c-3', full_name: 'Paul Durand', reason: 'already_in_sequence' },
    { contact_id: 'c-4', full_name: null, reason: 'erasure_requested' },
    { contact_id: 'c-5', full_name: 'Marc Petit', reason: 'opted_out', stop_reason: 'do_not_call' },
    { contact_id: 'c-6', full_name: 'Léa Roy', reason: 'opted_out', stop_reason: null },
  ],
  duplicates: [{ key: 'email', contact_ids: ['c-1', 'c-2'] }],
  collisions: [{ contact_id: 'c-3', sequence_id: 's-1', owner_id: 'u-2', is_team_collision: true }],
  preview: {
    total: 4,
    eligible: 2,
    missing_coordinates: 0,
    unverified_identity: 1,
    already_in_sequence: 1,
    already_contacted: 0,
    duplicates: 2,
    other_owner: 0,
    excluded_accounts: 0,
    left_contacts: 0,
    team_collisions: 1,
    frequency_capped: 0,
    personal_contacts: 0,
  },
}

function renderBlock(onPrepare = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AudienceBuilderBlock onPrepare={onPrepare} />
    </QueryClientProvider>,
  )
  return { onPrepare }
}

describe('AudienceBuilderBlock (#2974)', () => {
  beforeEach(() => {
    preview.mockReset()
    events.mockReset()
    needs.mockReset()
  })

  it('ne lit rien avant le clic — aucun appel réseau à l’ouverture', () => {
    renderBlock()
    expect(screen.getByText('Construire une audience')).toBeInTheDocument()
    expect(preview).not.toHaveBeenCalled()
  })

  it('prévisualise la source et les filtres choisis, collisions exclues par défaut', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        source: { kind: 'workspace_contacts' },
        filters: {},
        include_collisions: false,
      }),
    )
  })

  it('montre les compteurs, les exclus avec leur raison, les doublons PROPOSÉS', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText('Éligibles')).toBeInTheDocument()
    expect(screen.getByText('Paul Durand')).toBeInTheDocument()
    expect(screen.getByText('Déjà dans une séquence active')).toBeInTheDocument()
    // Un effacement RGPD ne se nomme pas.
    expect(screen.getByText('Effacement demandé — personne non nommée')).toBeInTheDocument()
    expect(screen.getByText(/Doublon possible \(e-mail\) : Claire Martin, Claire M\./)).toBeInTheDocument()
    expect(screen.getByText(/rien n’est fusionné/)).toBeInTheDocument()
    expect(screen.getAllByText('Une séquence par personne').length).toBeGreaterThan(0)
  })

  it('« Préparer les séquences » remet la liste éligible à la fenêtre de création', async () => {
    preview.mockResolvedValueOnce(RESULT)
    const { onPrepare } = renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Préparer 2 séquences' }))
    expect(onPrepare).toHaveBeenCalledWith([
      { id: 'c-1', full_name: 'Claire Martin', title: 'DSI', email: 'claire@acme.test', assigned_to: null },
      { id: 'c-2', full_name: 'Claire M.', title: null, email: 'claire@acme.test', assigned_to: null },
    ])
  })

  it('un échec de lecture se DIT — jamais une audience vide inventée', async () => {
    preview.mockRejectedValueOnce(new Error('boom'))
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('L’audience n’a pas pu être lue. Réessaie.')).toBeInTheDocument()
    expect(screen.queryByText('Éligibles')).not.toBeInTheDocument()
  })

  it('#2380.61 — un arrêt s’affiche avec son motif ; sans motif écrit, rien n’est deviné', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('Marc Petit')).toBeInTheDocument()
    expect(screen.getByText('Motif de l’arrêt : ne plus appeler')).toBeInTheDocument()
    expect(screen.getAllByText(/Motif de l’arrêt/)).toHaveLength(1)
  })

  it('#2380.54 — sans plafond choisi, aucun compteur « coupés » (jamais un 0 sans plafond)', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await screen.findByText('Claire Martin')
    expect(screen.queryByText(/Coupés par le plafond/)).not.toBeInTheDocument()
  })

  it('#2380.53 — le plafond par contact envoie max_per_contact et affiche le compteur « coupés »', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    await userEvent.click(screen.getByRole('combobox', { name: 'Séquences par contact' }))
    await userEvent.click(await screen.findByRole('option', { name: '2 séquences déjà armées au plus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        source: { kind: 'workspace_contacts' },
        filters: { max_per_contact: 2 },
        include_collisions: false,
      }),
    )
    expect(await screen.findByText(/Coupés par le plafond/)).toBeInTheDocument()
  })

  it('#2380.55 — le plafond par canal envoie max_per_channel et affiche le compteur « coupés »', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    await userEvent.click(screen.getByRole('combobox', { name: 'Contacts par canal' }))
    await userEvent.click(await screen.findByRole('option', { name: '20 contacts par canal au plus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        source: { kind: 'workspace_contacts' },
        filters: { max_per_channel: 20 },
        include_collisions: false,
      }),
    )
    expect(await screen.findByText(/Coupés par le plafond/)).toBeInTheDocument()
  })

  it('#2380.13 — la source partenaires se choisit et part telle quelle', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    await userEvent.click(screen.getByRole('combobox', { name: 'Source' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Contacts de tes ESN partenaires' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({ source: { kind: 'partners' }, filters: {}, include_collisions: false }),
    )
  })

  it('#2380.65 — une boîte personnelle se dit : compteur et motif, jamais un contact silencieusement perdu', async () => {
    preview.mockResolvedValueOnce({
      ...RESULT,
      excluded: [{ contact_id: 'c-9', full_name: 'Marie Perso', reason: 'personal_contact' }],
      preview: { ...RESULT.preview, personal_contacts: 1 },
    })
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('Seule coordonnée : une boîte personnelle')).toBeInTheDocument()
    expect(screen.getByText('Boîtes personnelles')).toBeInTheDocument()
  })

  it('#2974 — un motif d’écart à 0 ne fait AUCUNE ligne ; « dans la source » et « éligibles » restent', async () => {
    preview.mockResolvedValueOnce({
      ...RESULT,
      eligible: [],
      excluded: [],
      duplicates: [],
      collisions: [],
      preview: {
        total: 0,
        eligible: 0,
        missing_coordinates: 0,
        unverified_identity: 0,
        already_in_sequence: 0,
        already_contacted: 0,
        duplicates: 0,
        other_owner: 0,
        excluded_accounts: 0,
        left_contacts: 0,
        team_collisions: 0,
        frequency_capped: 0,
        personal_contacts: 0,
      },
    })
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('Éligibles')).toBeInTheDocument()
    expect(screen.getByText('Dans la source')).toBeInTheDocument()
    expect(screen.queryByText('Boîtes personnelles')).not.toBeInTheDocument()
    expect(screen.queryByText('Collisions d’équipe')).not.toBeInTheDocument()
    expect(screen.queryByText('Doublons possibles')).not.toBeInTheDocument()
  })

  it('#2974 — un motif non nul se nomme avec son compteur (collisions d’équipe : 1)', async () => {
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    expect(await screen.findByText('Collisions d’équipe')).toBeInTheDocument()
    expect(screen.queryByText('Boîtes personnelles')).not.toBeInTheDocument()
  })

  it('#2380.11 — la source événement propose les événements de l’espace et envoie celui qui est choisi', async () => {
    events.mockResolvedValue([
      {
        activity_id: '11111111-1111-4111-8111-111111111111',
        kind: 'meeting',
        subject: 'Atelier DSI Acme',
        occurred_at: '2026-09-20T10:00:00.000Z',
        participant_count: 3,
      },
    ])
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    // Rien n'est lu tant que la source événement n'est pas choisie.
    expect(events).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Source' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Participants d’un événement' }))
    await waitFor(() => expect(events).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        source: { kind: 'event_participants', activity_id: '11111111-1111-4111-8111-111111111111' },
        filters: {},
        include_collisions: false,
      }),
    )
  })

  it('#2380.11 — aucun événement avec des participants identifiés : le dire, ne rien prévisualiser', async () => {
    events.mockResolvedValue([])
    renderBlock()
    await userEvent.click(screen.getByRole('combobox', { name: 'Source' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Participants d’un événement' }))
    expect(await screen.findByText(/Aucun événement avec des participants identifiés/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prévisualiser l’audience' })).toBeDisabled()
    expect(preview).not.toHaveBeenCalled()
  })

  // #2202.15 — Audience : besoin. Le sélecteur propose les besoins qui portent quelqu'un, et envoie celui qui est choisi.
  it('#2202.15 — la source besoin propose les besoins de l’espace et envoie celui qui est choisi', async () => {
    needs.mockResolvedValue([
      { need_id: '22222222-2222-4222-8222-222222222222', title: 'Architecte data', contact_count: 2 },
    ])
    preview.mockResolvedValueOnce(RESULT)
    renderBlock()
    expect(needs).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Source' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Personnes d’un besoin' }))
    await waitFor(() => expect(needs).toHaveBeenCalledTimes(1))
    expect(events).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser l’audience' }))
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({
        source: { kind: 'need', need_id: '22222222-2222-4222-8222-222222222222' },
        filters: {},
        include_collisions: false,
      }),
    )
  })

  it('#2202.15 — aucun besoin avec une personne : le dire, ne rien prévisualiser', async () => {
    needs.mockResolvedValue([])
    renderBlock()
    await userEvent.click(screen.getByRole('combobox', { name: 'Source' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Personnes d’un besoin' }))
    expect(await screen.findByText(/Aucun besoin avec une personne identifiée/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prévisualiser l’audience' })).toBeDisabled()
    expect(preview).not.toHaveBeenCalled()
  })
})
