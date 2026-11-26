import { NotFoundException } from '@nestjs/common'
import { CampaignAudienceService } from './campaign-audience.service'

const W = 'w-1'
const ME = 'u-me'
const NOW = new Date('2026-09-28T12:00:00Z')

function contact(over: Record<string, unknown>) {
  return {
    full_name: `Contact ${String(over['id'])}`,
    title: null,
    account_id: 'a-1',
    entity: null,
    decision_role: null,
    seniority: null,
    location: null,
    family: null,
    priority: null,
    user_status: 'new',
    assigned_to: null,
    email: `${String(over['id'])}@acme.test`,
    phone: null,
    linkedin_url: null,
    identity_confirmed_at: new Date('2026-09-01T00:00:00Z'),
    last_enrichment_at: null,
    email_sent_at: null,
    lifecycle_state: null,
    excluded_at: null,
    anonymized_at: null,
    ...over,
  }
}

function build(options: {
  contacts?: Record<string, unknown>[]
  stopped?: string[]
  sequences?: Record<string, unknown>[]
  /** #2380.53 — l'historique COMPLET (toutes statuts) ; défaut = la même liste que `sequences`. */
  allSequences?: Record<string, unknown>[]
  accounts?: Record<string, unknown>[]
  targetItems?: Record<string, unknown>[]
  projectContacts?: Record<string, unknown>[]
  need?: Record<string, unknown> | null
  /** #2202.15 — les besoins ouverts de l'espace (sélecteur de l'écran). */
  needsList?: Record<string, unknown>[]
  dormant?: Record<string, unknown>[]
  /** #2380.11 — l'activité (événement) lue, ses participants. */
  activity?: Record<string, unknown> | null
  participants?: Record<string, unknown>[]
  /** #2380.11 — les événements récents de l'espace (sélecteur de l'écran). */
  events?: Record<string, unknown>[]
  /** #2380.13 — les relations partenaires de l'espace. */
  partners?: Record<string, unknown>[]
  /** #2202.12 — les vues enregistrées (de n'importe quel espace) et les ids que le résolveur de filtres rend. */
  savedViews?: Record<string, unknown>[]
  filteredIds?: string[]
}) {
  const contacts = { find: jest.fn().mockResolvedValue(options.contacts ?? []) }
  const dormantAccounts = jest.fn().mockResolvedValue(options.dormant ?? [])
  const accounts = {
    find: jest.fn((query: { where?: { commercial_status?: string } }) =>
      query?.where?.commercial_status === 'dormant'
        ? dormantAccounts(query)
        : Promise.resolve(options.accounts ?? [{ id: 'a-1', company_name: 'Acme', priority_gate: 'core' }]),
    ),
  }
  const sequences = {
    find: jest.fn((query: { where?: { status?: string } }) =>
      Promise.resolve(
        query?.where?.status === 'active'
          ? (options.sequences ?? [])
          : (options.allSequences ?? options.sequences ?? []),
      ),
    ),
  }
  const targetItems = { find: jest.fn().mockResolvedValue(options.targetItems ?? []) }
  const projectContacts = { find: jest.fn().mockResolvedValue(options.projectContacts ?? []) }
  const needs = {
    findOne: jest.fn().mockResolvedValue(options.need === undefined ? null : options.need),
    find: jest.fn().mockResolvedValue(options.needsList ?? []),
  }
  const activities = {
    findOne: jest.fn().mockResolvedValue(options.activity === undefined ? null : options.activity),
    find: jest.fn().mockResolvedValue(options.events ?? []),
  }
  const participants = { find: jest.fn().mockResolvedValue(options.participants ?? []) }
  const partners = { find: jest.fn().mockResolvedValue(options.partners ?? []) }
  const contactStops = {
    stoppedAmong: jest.fn().mockResolvedValue(new Map((options.stopped ?? []).map(id => [id, 'do_not_call']))),
  }
  const savedViews = {
    // Fidèle au filtre : une vue ne se rend que si `id` ET `workspace_id` correspondent.
    findOne: jest.fn((query: { where: { id: string; workspace_id: string } }) =>
      Promise.resolve(
        (options.savedViews ?? []).find(
          v => v['id'] === query.where.id && v['workspace_id'] === query.where.workspace_id,
        ) ?? null,
      ),
    ),
  }
  const contactsService = { contactIdsForFilters: jest.fn().mockResolvedValue(options.filteredIds ?? []) }
  const service = new CampaignAudienceService(
    contacts as never,
    accounts as never,
    sequences as never,
    targetItems as never,
    projectContacts as never,
    needs as never,
    activities as never,
    participants as never,
    partners as never,
    savedViews as never,
  )
  const run = (req: never) =>
    service.preview(W, ME, req, contactStops.stoppedAmong, contactsService.contactIdsForFilters, NOW)
  return {
    service,
    run,
    contacts,
    dormantAccounts,
    contactStops,
    sequences,
    projectContacts,
    needs,
    activities,
    participants,
    partners,
    savedViews,
    contactsService,
  }
}

const request = (source: Record<string, unknown>, filters: Record<string, unknown> = {}) =>
  ({ source, filters }) as never

describe('CampaignAudienceService.preview (#2974)', () => {
  it('lit les contacts VIVANTS de l’espace et rend une liste mono-contact', async () => {
    const { run, contacts } = build({ contacts: [contact({ id: 'c-1' }), contact({ id: 'c-2' })] })
    const result = await run(request({ kind: 'workspace_contacts' }))
    expect(contacts.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspace_id: W, hidden: false }),
      }),
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
    expect(result.eligible.every(e => e.sequence_scope === 'mono_contact')).toBe(true)
    expect(result.eligible[0].account_name).toBe('Acme')
  })

  it('consulte la MÊME porte d’arrêt que l’armement d’une séquence (opt-out exclu)', async () => {
    const { run, contactStops } = build({ contacts: [contact({ id: 'c-1' })], stopped: ['c-1'] })
    const result = await run(request({ kind: 'workspace_contacts' }))
    expect(contactStops.stoppedAmong).toHaveBeenCalledWith(W, ['c-1'])
    // #2380.61 — la raison de l'arrêt est AFFICHÉE.
    expect(result.excluded).toEqual([
      { contact_id: 'c-1', full_name: 'Contact c-1', reason: 'opted_out', stop_reason: 'do_not_call' },
    ])
  })

  it('#2380.8 — la source import ne lit que les contacts arrivés par import', async () => {
    const { run, contacts } = build({ contacts: [contact({ id: 'c-1' })] })
    await run(request({ kind: 'import' }))
    expect(contacts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: W, source: 'import' }) }),
    )
  })

  it('#2380.12 — comptes dormants : les contacts des seuls comptes au statut dormant', async () => {
    const { run, contacts, dormantAccounts } = build({
      contacts: [contact({ id: 'c-1' })],
      dormant: [{ id: 'a-1' }],
    })
    const result = await run(request({ kind: 'dormant_accounts' }))
    expect(dormantAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ commercial_status: 'dormant' }) }),
    )
    expect(contacts.find).toHaveBeenCalled()
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1'])
  })

  it('#2380.12 — aucun compte dormant : liste vide, aucune lecture de contacts', async () => {
    const { run, contacts } = build({ dormant: [] })
    const result = await run(request({ kind: 'dormant_accounts' }))
    expect(result.eligible).toEqual([])
    expect(contacts.find).not.toHaveBeenCalled()
  })

  it('un effacement RGPD (`anonymized_at`) est exclu sans être nommé', async () => {
    const { run } = build({ contacts: [contact({ id: 'c-1', anonymized_at: new Date() })] })
    const result = await run(request({ kind: 'workspace_contacts' }))
    expect(result.excluded).toEqual([{ contact_id: 'c-1', full_name: null, reason: 'erasure_requested' }])
  })

  it('un contact déjà en séquence active chez un collègue est signalé et exclu', async () => {
    const { run } = build({
      contacts: [contact({ id: 'c-1' })],
      sequences: [{ id: 's-1', contact_id: 'c-1', user_id: 'u-collegue' }],
    })
    const result = await run(request({ kind: 'workspace_contacts' }))
    expect(result.collisions).toEqual([
      { contact_id: 'c-1', sequence_id: 's-1', owner_id: 'u-collegue', is_team_collision: true },
    ])
    expect(result.eligible).toEqual([])
  })

  it('un compte écarté exclut ses contacts', async () => {
    const { run } = build({
      contacts: [contact({ id: 'c-1' })],
      accounts: [{ id: 'a-1', company_name: 'Acme', priority_gate: 'parked' }],
    })
    const result = await run(request({ kind: 'workspace_contacts' }))
    expect(result.excluded[0].reason).toBe('account_excluded')
  })

  it('source opportunité : les contacts liés au projet, scopés à l’espace (#2380.6)', async () => {
    const { run, projectContacts, contacts } = build({
      projectContacts: [{ contact_id: 'c-9' }],
      contacts: [contact({ id: 'c-9' })],
    })
    const result = await run(request({ kind: 'opportunity', opportunity_id: 'p-1' }))
    expect(projectContacts.find).toHaveBeenCalledWith({ where: { workspace_id: W, project_id: 'p-1' } })
    expect(contacts.find).toHaveBeenCalledTimes(1)
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-9'])
  })

  it('source opportunité sans contact lié : liste vide, aucune lecture de contacts', async () => {
    const { run, contacts } = build({})
    const result = await run(request({ kind: 'opportunity', opportunity_id: 'p-1' }))
    expect(contacts.find).not.toHaveBeenCalled()
    expect(result.preview.total).toBe(0)
  })

  it('source besoin : le demandeur ET le décideur, scopés à l’espace (#2380.7)', async () => {
    const { run, needs, contacts } = build({
      need: { id: 'n-1', contact_id: 'c-9', decision_maker_contact_id: 'c-10' },
      contacts: [contact({ id: 'c-9' }), contact({ id: 'c-10' })],
    })
    const result = await run(request({ kind: 'need', need_id: 'n-1' }))
    expect(needs.findOne).toHaveBeenCalledWith({
      where: { id: 'n-1', workspace_id: W },
      select: ['id', 'contact_id', 'decision_maker_contact_id'],
    })
    expect(result.eligible.map(e => e.contact_id).sort()).toEqual(['c-10', 'c-9'])
  })

  it('source besoin sans décideur déclaré : seul le demandeur, jamais un second nom deviné', async () => {
    const { run, contacts } = build({
      need: { id: 'n-1', contact_id: 'c-9', decision_maker_contact_id: null },
      contacts: [contact({ id: 'c-9' })],
    })
    const result = await run(request({ kind: 'need', need_id: 'n-1' }))
    expect(contacts.find).toHaveBeenCalledTimes(1)
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-9'])
  })

  it('source besoin : demandeur et décideur identiques ne comptent qu’une fois (#2380.43)', async () => {
    const { run, contacts } = build({
      need: { id: 'n-1', contact_id: 'c-9', decision_maker_contact_id: 'c-9' },
      contacts: [contact({ id: 'c-9' })],
    })
    const result = await run(request({ kind: 'need', need_id: 'n-1' }))
    expect(contacts.find).toHaveBeenCalledTimes(1)
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-9'])
  })

  it('source besoin introuvable dans cet espace : refus clair, jamais une audience vide inventée', async () => {
    const { run } = build({ need: null })
    await expect(run(request({ kind: 'need', need_id: 'n-1' }))).rejects.toBeInstanceOf(NotFoundException)
  })

  it('source liste de cibles introuvable : refus clair, jamais une audience vide inventée (#2380.2)', async () => {
    const { run } = build({ targetItems: [] })
    await expect(run(request({ kind: 'target_list', target_list_id: 't-1' }))).rejects.toBeInstanceOf(NotFoundException)
  })

  it('source sélection explicite : garde l’ordre de la sélection (#2380.3/.4)', async () => {
    const { run } = build({ contacts: [contact({ id: 'c-1' }), contact({ id: 'c-2' })] })
    const result = await run(request({ kind: 'contact_ids', contact_ids: ['c-2', 'c-1'] }))
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-2', 'c-1'])
  })

  it('#2380.53 — le plafond par contact lit l’HISTORIQUE complet des séquences, pas seulement l’active', async () => {
    const { run } = build({
      contacts: [contact({ id: 'c-1' }), contact({ id: 'c-2' })],
      allSequences: [
        { id: 's-1', contact_id: 'c-1', user_id: ME, status: 'completed' },
        { id: 's-2', contact_id: 'c-1', user_id: ME, status: 'canceled' },
      ],
    })
    const result = await run(request({ kind: 'workspace_contacts' }, { max_per_contact: 2 }))
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-2'])
    expect(result.excluded).toEqual([{ contact_id: 'c-1', full_name: 'Contact c-1', reason: 'frequency_cap' }])
  })

  it('#2380.53 — sans séquence passée, un contact n’est jamais plafonné', async () => {
    const { run } = build({ contacts: [contact({ id: 'c-1' })] })
    const result = await run(request({ kind: 'workspace_contacts' }, { max_per_contact: 1 }))
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1'])
  })

  // #2380.79 — gate de recette : deux espaces, jamais une fuite de l'un dans l'autre.
  it('#2380.79 — deux espaces distincts ne se lisent jamais l’un l’autre', async () => {
    const { service, contacts, contactStops, contactsService } = build({ contacts: [contact({ id: 'c-1' })] })
    await service.preview(
      'w-1',
      ME,
      request({ kind: 'workspace_contacts' }),
      contactStops.stoppedAmong,
      contactsService.contactIdsForFilters,
      NOW,
    )
    await service.preview(
      'w-2',
      ME,
      request({ kind: 'workspace_contacts' }),
      contactStops.stoppedAmong,
      contactsService.contactIdsForFilters,
      NOW,
    )
    const workspaceIdsQueried = contacts.find.mock.calls.map(
      (call: [{ where: { workspace_id: string } }]) => call[0].where.workspace_id,
    )
    expect(workspaceIdsQueried).toEqual(['w-1', 'w-2'])
  })

  // #2380.77 — gate de recette : cible dynamique, jamais un instantané mis en cache.
  it('#2380.77 — un second lancement relit l’espace, un contact apparu entre les deux ressort', async () => {
    const { service, contacts, contactStops, contactsService } = build({ contacts: [contact({ id: 'c-1' })] })
    const first = await service.preview(
      W,
      ME,
      request({ kind: 'workspace_contacts' }),
      contactStops.stoppedAmong,
      contactsService.contactIdsForFilters,
      NOW,
    )
    expect(first.eligible.map(e => e.contact_id)).toEqual(['c-1'])

    // Un contact arrive entre les deux lancements (import, création manuelle…) — la cible
    // n'est pas figée : le prochain aperçu le voit, sans redémarrage ni cache à vider.
    contacts.find.mockResolvedValueOnce([contact({ id: 'c-1' }), contact({ id: 'c-2' })])
    const second = await service.preview(
      W,
      ME,
      request({ kind: 'workspace_contacts' }),
      contactStops.stoppedAmong,
      contactsService.contactIdsForFilters,
      NOW,
    )
    expect(second.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
  })

  it('source événement : les participants RÉSOLUS en contact, hors utilisateur, scopés à l’espace (#2380.11)', async () => {
    const { run, activities, participants, contacts } = build({
      activity: { id: 'act-1' },
      participants: [
        { contact_id: 'c-1', is_self: false },
        { contact_id: 'c-1', is_self: false },
        { contact_id: null, is_self: false },
      ],
      contacts: [contact({ id: 'c-1' })],
    })
    const result = await run(request({ kind: 'event_participants', activity_id: 'act-1' }))
    expect(activities.findOne).toHaveBeenCalledWith({
      where: { id: 'act-1', workspace_id: W },
      select: ['id'],
    })
    expect(participants.find.mock.calls[0]?.[0]?.where).toMatchObject({ activity_id: 'act-1', is_self: false })
    expect(contacts.find).toHaveBeenCalledTimes(1)
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1'])
  })

  it('source événement introuvable : refus clair, jamais une audience vide inventée (#2380.11)', async () => {
    const { run } = build({ activity: null })
    await expect(run(request({ kind: 'event_participants', activity_id: 'act-x' }))).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('source événement sans participant résolu : aucune ligne, aucune requête contacts (#2380.11)', async () => {
    const { run, contacts } = build({ activity: { id: 'act-1' }, participants: [{ contact_id: null, is_self: false }] })
    const result = await run(request({ kind: 'event_participants', activity_id: 'act-1' }))
    expect(contacts.find).not.toHaveBeenCalled()
    expect(result.preview.total).toBe(0)
  })

  it('source partenaires : égalité EXACTE d’e-mail (sans casse) avec le contact d’une ESN partenaire (#2380.13)', async () => {
    const { run, partners, contacts } = build({
      partners: [{ contactEmail: 'Paul@Partner.test' }, { contactEmail: null }, { contactEmail: '  ' }],
      contacts: [contact({ id: 'c-7', email: 'paul@partner.test' })],
    })
    const result = await run(request({ kind: 'partners' }))
    expect(partners.find.mock.calls[0]?.[0]?.where).toMatchObject({ workspaceId: W })
    const where = contacts.find.mock.calls[0]?.[0]?.where
    expect(JSON.stringify(where)).toContain('paul@partner.test')
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-7'])
  })

  it('source partenaires sans e-mail de contact partenaire : aucune ligne, aucune requête contacts (#2380.13)', async () => {
    const { run, contacts } = build({ partners: [{ contactEmail: null }] })
    const result = await run(request({ kind: 'partners' }))
    expect(contacts.find).not.toHaveBeenCalled()
    expect(result.preview.total).toBe(0)
  })
})

describe('CampaignAudienceService.listEvents (#2380.11)', () => {
  const event = (id: string, subject: string | null) => ({
    id,
    subject,
    kind: 'meeting',
    occurred_at: new Date('2026-09-20T10:00:00Z'),
  })

  it('ne liste que les événements de l’espace, réunions et appels', async () => {
    const { service, activities } = build({ events: [] })
    await service.listEvents(W)
    expect(activities.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: W }) }),
    )
  })

  it('un événement sans participant résolu en contact ne fait AUCUNE ligne', async () => {
    const { service } = build({
      events: [event('e-1', 'Salon'), event('e-2', 'Atelier')],
      participants: [
        { activity_id: 'e-1', contact_id: 'c-1' },
        { activity_id: 'e-1', contact_id: 'c-2' },
        { activity_id: 'e-1', contact_id: 'c-1' },
      ],
    })
    const rows = await service.listEvents(W)
    expect(rows).toEqual([
      {
        activity_id: 'e-1',
        kind: 'meeting',
        subject: 'Salon',
        occurred_at: '2026-09-20T10:00:00.000Z',
        participant_count: 2,
      },
    ])
  })

  it('aucun événement → liste vide, aucune lecture de participants', async () => {
    const { service, participants } = build({ events: [] })
    expect(await service.listEvents(W)).toEqual([])
    expect(participants.find).not.toHaveBeenCalled()
  })
})

// #2202.15 — Audience : besoin. Le sélecteur de l'écran ne propose que les besoins qui ont quelqu'un à cibler.
describe('CampaignAudienceService.listNeeds (#2202.15)', () => {
  const need = (over: Record<string, unknown>) => ({
    id: 'n-1',
    title: 'Architecte data',
    contact_id: null,
    decision_maker_contact_id: null,
    ...over,
  })

  it('ne lit que les besoins de l’espace, non archivés', async () => {
    const { service, needs } = build({ needsList: [] })
    await service.listNeeds(W)
    expect(needs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: W, archived_at: expect.anything() }) }),
    )
  })

  it('un besoin sans demandeur ni décideur ne fait AUCUNE ligne ; le décompte est celui des personnes distinctes', async () => {
    const { service } = build({
      needsList: [
        need({ id: 'n-1', contact_id: 'c-1', decision_maker_contact_id: 'c-2' }),
        need({ id: 'n-2', title: 'Sans contact' }),
        need({ id: 'n-3', title: 'Même personne', contact_id: 'c-1', decision_maker_contact_id: 'c-1' }),
      ],
    })
    expect(await service.listNeeds(W)).toEqual([
      { need_id: 'n-1', title: 'Architecte data', contact_count: 2 },
      { need_id: 'n-3', title: 'Même personne', contact_count: 1 },
    ])
  })
})

describe('CampaignAudienceService — source saved_view (#2202.12, doctrine c74)', () => {
  const VIEW = '0b6e2d3a-4f1c-4c8e-9a1b-2d3e4f5a6b7c'
  const mine = { id: VIEW, workspace_id: W, scope: 'contacts', filters: { role: 'decideur' } }

  it('résout les filtres de la vue de CET espace en contacts, une ligne par contact (c74)', async () => {
    const { run, contactsService, contacts } = build({
      savedViews: [mine],
      filteredIds: ['c-1', 'c-2'],
      contacts: [contact({ id: 'c-1' }), contact({ id: 'c-2' })],
    })
    const result = await run(request({ kind: 'saved_view', saved_view_id: VIEW }))
    expect(contactsService.contactIdsForFilters).toHaveBeenCalledWith(W, { role: 'decideur' }, expect.any(Number))
    expect(contacts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: W }) }),
    )
    expect(result.eligible.map(e => e.contact_id)).toEqual(['c-1', 'c-2'])
    expect(result.eligible.every(e => e.sequence_scope === 'mono_contact')).toBe(true)
  })

  it('REFUS : la vue d’un AUTRE espace ne rend aucun contact, sans erreur qui trahit son existence', async () => {
    const other = { ...mine, workspace_id: 'w-OTHER' }
    const { run, contactsService, contacts } = build({
      savedViews: [other],
      filteredIds: ['c-leak'],
      contacts: [contact({ id: 'c-leak' })],
    })
    const result = await run(request({ kind: 'saved_view', saved_view_id: VIEW }))
    expect(result.eligible).toEqual([])
    expect(contactsService.contactIdsForFilters).not.toHaveBeenCalled()
    expect(contacts.find).not.toHaveBeenCalled()
  })

  it('une vue inexistante ou d’un autre écran que « contacts » ne rend aucun contact', async () => {
    const accountsView = { ...mine, scope: 'accounts' }
    const { run, contactsService } = build({ savedViews: [accountsView], filteredIds: ['c-1'] })
    expect((await run(request({ kind: 'saved_view', saved_view_id: VIEW }))).eligible).toEqual([])
    expect((await run(request({ kind: 'saved_view', saved_view_id: 'absent' }))).eligible).toEqual([])
    expect(contactsService.contactIdsForFilters).not.toHaveBeenCalled()
  })
})
