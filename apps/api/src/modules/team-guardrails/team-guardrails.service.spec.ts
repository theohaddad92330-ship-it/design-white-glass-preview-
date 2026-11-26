import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { TeamGuardrailsService } from './team-guardrails.service'

const WS = 'ws-1'
const ME = 'u-me'
const BOB = 'u-bob'

type Role = 'owner' | 'sales' | 'viewer' | 'sales_ops'

function build(
  opts: {
    role?: Role
    account?: object | null
    contact?: object | null
    scopeRows?: object[]
    teamRows?: object[]
    entity?: object | null
    businessUnit?: object | null
    me?: string
  } = {},
) {
  const account = opts.account === undefined ? { id: 'a1', workspace_id: WS, assigned_to: BOB } : opts.account
  const contact =
    opts.contact === undefined
      ? { id: 'c1', workspace_id: WS, email: 'jean@acme.fr', full_name: 'Jean Martin', assigned_to: null }
      : opts.contact
  const repo = (extra: Record<string, jest.Mock> = {}) => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(async (x: object) => ({ id: 'new-1', created_at: new Date(), ...x })),
    create: jest.fn((x: object) => x),
    ...extra,
  })
  const accounts = repo({
    // Une fiche d'un AUTRE espace n'est jamais rendue : le filtre workspace_id compte.
    findOne: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
      where.workspace_id === WS ? account : null,
    ),
  })
  const contacts = repo({
    findOne: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
      where.workspace_id === WS ? contact : null,
    ),
    find: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
      where.workspace_id === WS && contact ? [contact] : [],
    ),
  })
  const profiles = repo({
    find: jest.fn().mockResolvedValue([
      { user_id: BOB, first_name: 'Bob', last_name: 'Durand', email: 'bob@esn.fr' },
      { user_id: ME, first_name: 'Moi', last_name: null, email: 'me@esn.fr' },
    ]),
  })
  const actions = repo()
  const messages = repo()
  const dnc = repo()
  const team = repo({
    find: jest.fn().mockResolvedValue(opts.teamRows ?? []),
    findOne: jest.fn(
      async ({ where }: { where: { user_id: string } }) =>
        (opts.teamRows ?? []).find((r: { user_id?: string }) => r.user_id === where.user_id) ?? null,
    ),
  })
  const scopes = repo({
    find: jest.fn().mockResolvedValue(opts.scopeRows ?? []),
    findOne: jest.fn(
      async ({ where }: { where: { id?: string } }) =>
        (opts.scopeRows ?? []).find((r: { id?: string }) => !where.id || r.id === where.id) ?? null,
    ),
  })
  // Une entité n'est rendue que pour (id, account_id) : celle d'un autre compte n'existe pas ici.
  const entities = repo({
    findOne: jest.fn(async ({ where }: { where: { id: string; account_id: string } }) =>
      opts.entity && (opts.entity as { account_id: string }).account_id === where.account_id ? opts.entity : null,
    ),
  })
  // #4996.4 — une BU n'est rendue que pour (id, workspace_id) : celle d'un autre espace n'existe pas ici.
  const businessUnits = repo({
    findOne: jest.fn(async ({ where }: { where: { id: string; workspace_id: string } }) =>
      opts.businessUnit &&
      (opts.businessUnit as { id: string; workspace_id: string }).workspace_id === where.workspace_id &&
      (opts.businessUnit as { id: string }).id === where.id
        ? opts.businessUnit
        : null,
    ),
  })
  const project = { id: 'p1', workspace_id: WS, account_id: 'a1' }
  const projects = repo({
    findOne: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
      where.workspace_id === WS ? project : null,
    ),
  })
  // Le constructeur de requête des positionnements : chaînable, rend les lignes fournies.
  const submissionRows: unknown[] = []
  const chain: Record<string, jest.Mock> = {}
  for (const name of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy']) {
    chain[name] = jest.fn(() => chain)
  }
  chain.getRawMany = jest.fn(async () => submissionRows)
  const submissions = repo({ createQueryBuilder: jest.fn(() => chain) })
  // L'appelant : le contrôleur résout l'espace ACTIF et le rôle, le service les reçoit.
  const ctx = { userId: opts.me ?? ME, workspaceId: WS, role: opts.role ?? 'sales' }
  const members = repo({ findOne: jest.fn().mockResolvedValue({ user_id: BOB }) })
  const service = new TeamGuardrailsService(
    accounts as never,
    contacts as never,
    actions as never,
    messages as never,
    profiles as never,
    dnc as never,
    team as never,
    repo() as never,
    repo() as never,
    repo() as never,
    repo() as never,
    submissions as never,
    projects as never,
    members as never,
    scopes as never,
    entities as never,
    businessUnits as never,
  )
  return {
    service,
    accounts,
    contacts,
    actions,
    messages,
    dnc,
    team,
    members,
    ctx,
    submissionRows,
    chain,
    scopes,
    entities,
    businessUnits,
  }
}

describe('#4158.20 — déjà travaillé par X', () => {
  it('nomme en clair le responsable, avec le nom du profil', async () => {
    const { ctx, service } = build()
    const out = await service.activityOnAccount(ctx, 'a1')
    expect(out.items).toEqual([
      { user_id: BOB, name: 'Bob Durand', is_responsible: true, last_action: null, last_action_at: null },
    ])
  })

  it('rien quand le responsable, c’est moi', async () => {
    const { ctx, service } = build({ account: { id: 'a1', workspace_id: WS, assigned_to: ME } })
    expect((await service.activityOnAccount(ctx, 'a1')).items).toEqual([])
  })

  it('un compte d’un AUTRE espace répond 404 (cloisonnement)', async () => {
    const { ctx, service } = build()
    ctx.workspaceId = 'ws-autre'
    await expect(service.activityOnAccount(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.activityOnContact(ctx, 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('#4158.21/.22 — contacté par un collègue, ne pas contacter', () => {
  it('avertit d’un envoi VÉRIFIÉ d’un collègue, en le nommant', async () => {
    const { ctx, service, messages } = build()
    messages.find.mockResolvedValue([
      { contact_id: 'c1', user_id: BOB, status: 'sent', updated_at: new Date(Date.now() - 3 * 86_400_000) },
    ])
    const out = await service.checkContacts(ctx, ['c1'])
    expect(out.items).toHaveLength(1)
    expect(out.items[0]?.contacted).toMatchObject({ by_name: 'Bob Durand', proof: 'verified', days_ago: 3 })
    expect(out.items[0]?.do_not_contact).toBeNull()
  })

  it('aucune ligne quand personne n’a contacté et qu’aucune exclusion ne vise le contact', async () => {
    const { ctx, service } = build()
    expect((await service.checkContacts(ctx, ['c1'])).items).toEqual([])
  })

  it('un domaine exclu couvre l’adresse du contact, avec motif et auteur', async () => {
    const { ctx, service, dnc } = build()
    dnc.find.mockResolvedValue([
      {
        id: 'd1',
        kind: 'domain',
        contact_id: null,
        domain: 'acme.fr',
        reason: 'Client en litige',
        added_by: BOB,
        created_at: new Date(),
      },
    ])
    const [item] = (await service.checkContacts(ctx, ['c1'])).items
    expect(item?.do_not_contact).toMatchObject({
      domain: 'acme.fr',
      reason: 'Client en litige',
      added_by_name: 'Bob Durand',
    })
  })

  it('un contact d’un AUTRE espace n’apparaît pas', async () => {
    const { ctx, service } = build()
    ctx.workspaceId = 'ws-autre'
    expect((await service.checkContacts(ctx, ['c1'])).items).toEqual([])
  })

  it('ajouter un contact d’un autre espace → 404', async () => {
    const { ctx, service } = build()
    ctx.workspaceId = 'ws-autre'
    await expect(service.addDoNotContact(ctx, { contact_id: 'c1', reason: 'Litige' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('un doublon actif est refusé (409), jamais écrit deux fois', async () => {
    const { ctx, service, dnc } = build()
    dnc.findOne.mockResolvedValue({ id: 'd1' })
    await expect(
      service.addDoNotContact(ctx, { domain: 'https://www.acme.fr', reason: 'Litige' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(dnc.save).not.toHaveBeenCalled()
  })

  it('retirer exige team:manage : un commercial est refusé, rien n’est écrit', async () => {
    const { ctx, service, dnc } = build({ role: 'sales' })
    await expect(service.liftDoNotContact(ctx, 'd1')).rejects.toBeInstanceOf(ForbiddenException)
    expect(dnc.update).not.toHaveBeenCalled()
  })

  it('retirer archive (lifted_at) au lieu de supprimer', async () => {
    const { ctx, service, dnc } = build({ role: 'owner' })
    dnc.findOne.mockResolvedValue({ id: 'd1', workspace_id: WS })
    await service.liftDoNotContact(ctx, 'd1')
    expect(dnc.update).toHaveBeenCalledWith(
      { id: 'd1', workspace_id: WS },
      expect.objectContaining({ lifted_by: ME, lifted_at: expect.any(Date) }),
    )
  })
})

describe('#4158.25 — équipe de compte', () => {
  it('un commercial qui n’est pas responsable ne compose pas l’équipe (403)', async () => {
    const { ctx, service, team } = build({ role: 'sales' })
    await expect(service.addTeamMember(ctx, 'a1', BOB)).rejects.toBeInstanceOf(ForbiddenException)
    expect(team.save).not.toHaveBeenCalled()
  })

  it('le responsable ajoute un co-équipier membre de l’espace', async () => {
    const { ctx, service, team } = build({ role: 'sales', account: { id: 'a1', workspace_id: WS, assigned_to: ME } })
    await service.addTeamMember(ctx, 'a1', BOB)
    expect(team.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WS, account_id: 'a1', user_id: BOB }),
    )
  })

  it('team:manage ajoute sur n’importe quel compte', async () => {
    const { ctx, service, team, members } = build({ role: 'owner' })
    members.findOne.mockResolvedValue({ user_id: 'u-lea' })
    await service.addTeamMember(ctx, 'a1', 'u-lea')
    expect(team.save).toHaveBeenCalled()
  })

  it('refuse un utilisateur qui n’est pas membre de l’espace', async () => {
    const { ctx, service, team, members } = build({ role: 'owner' })
    members.findOne.mockResolvedValue(null)
    await expect(service.addTeamMember(ctx, 'a1', 'u-etranger')).rejects.toThrow()
    expect(team.save).not.toHaveBeenCalled()
  })

  it('compte d’un autre espace → 404 en lecture comme en écriture', async () => {
    const { ctx, service } = build({ role: 'owner' })
    ctx.workspaceId = 'ws-autre'
    await expect(service.accountTeam(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.addTeamMember(ctx, 'a1', BOB)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.removeTeamMember(ctx, 'a1', BOB)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retirer archive (removed_at)', async () => {
    const { ctx, service, team } = build({ role: 'owner' })
    await service.removeTeamMember(ctx, 'a1', BOB)
    expect(team.update).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'a1', user_id: BOB }),
      expect.objectContaining({ removed_by: ME, removed_at: expect.any(Date) }),
    )
  })
})

describe('#4158.23 — consultant déjà proposé (depuis une opportunité)', () => {
  it('nomme le collègue, le client et la date ; « client » si c’est le même compte', async () => {
    const { ctx, service, submissionRows } = build()
    submissionRows.push({
      consultant_id: 'k1',
      owner_id: BOB,
      created_at: new Date('2026-10-01T10:00:00Z'),
      account_id: 'a1',
      label: 'Architecte Java',
      company_name: 'THALES',
    })
    const out = await service.alreadyProposedOnProject(ctx, 'p1', ['k1'])
    expect(out.items).toEqual([
      {
        consultant_id: 'k1',
        by_user_id: BOB,
        by_name: 'Bob Durand',
        account_name: 'THALES',
        need_role: 'Architecte Java',
        at: '2026-10-01T10:00:00.000Z',
        relation: 'client',
      },
    ])
  })

  it('« need » quand c’est un autre client (autre opportunité ouverte)', async () => {
    const { ctx, service, submissionRows } = build()
    submissionRows.push({
      consultant_id: 'k1',
      owner_id: BOB,
      created_at: new Date('2026-10-01T10:00:00Z'),
      account_id: 'a-autre',
      label: 'DevOps',
      company_name: 'AIRBUS',
    })
    expect((await service.alreadyProposedOnProject(ctx, 'p1', ['k1'])).items[0]?.relation).toBe('need')
  })

  it('exclut mes propres positionnements et les retenus (requête filtrée par propriétaire et par étape)', async () => {
    const { ctx, service, chain } = build()
    await service.alreadyProposedOnProject(ctx, 'p1', ['k1'])
    const clauses = chain.andWhere.mock.calls.map(call => String(call[0]))
    expect(clauses.some(c => c.includes('s.owner_id <> :userId'))).toBe(true)
    expect(chain.andWhere.mock.calls.some(call => JSON.stringify(call[1] ?? {}).includes('submitted'))).toBe(true)
    expect(JSON.stringify(chain.andWhere.mock.calls)).not.toContain('"shortlisted"')
  })

  it('une opportunité d’un AUTRE espace → 404, aucune requête', async () => {
    const { ctx, service, chain } = build()
    ctx.workspaceId = 'ws-autre'
    await expect(service.alreadyProposedOnProject(ctx, 'p1', ['k1'])).rejects.toBeInstanceOf(NotFoundException)
    expect(chain.getRawMany).not.toHaveBeenCalled()
  })

  it('aucun consultant demandé → rien', async () => {
    const { ctx, service } = build()
    expect((await service.alreadyProposedOnProject(ctx, 'p1', [])).items).toEqual([])
  })
})

/* ----------------------------- #4996 — périmètres ---------------------------- */

const LEA = 'u-lea'
const OUTSIDER = 'u-outsider'
const SCOPE_ROW = { id: 's1', workspace_id: WS, account_id: 'a1', user_id: LEA, entity_id: null, label: 'IT Groupe' }

describe('#4996 — équipe enrichie des périmètres', () => {
  it('rend les zones du responsable et du co-équipier ; un membre sans zone n’a pas de ligne', async () => {
    const { ctx, service } = build({
      role: 'owner',
      teamRows: [
        { user_id: LEA, added_by: BOB, created_at: new Date('2026-11-01') },
        { user_id: ME, added_by: BOB, created_at: new Date('2026-11-01') },
      ],
      scopeRows: [SCOPE_ROW, { ...SCOPE_ROW, id: 's2', user_id: BOB, label: 'DSI' }],
    })
    ;(service as never as { profiles: { find: jest.Mock } }).profiles.find.mockResolvedValue([
      { user_id: BOB, first_name: 'Bob', last_name: 'Durand' },
      { user_id: LEA, first_name: 'Léa', last_name: 'M.' },
      { user_id: ME, first_name: 'Moi', last_name: null },
    ])
    const out = await service.accountTeam(ctx, 'a1')
    expect(out.responsible?.scopes).toEqual([{ id: 's2', entity_id: null, business_unit_id: null, label: 'DSI' }])
    expect(out.members.find(m => m.user_id === LEA)?.scopes).toEqual([
      { id: 's1', entity_id: null, business_unit_id: null, label: 'IT Groupe' },
    ])
    expect(out.members.find(m => m.user_id === ME)?.scopes).toEqual([])
  })

  it('dédoublonne à la lecture : le responsable n’apparaît pas aussi comme co-équipier', async () => {
    const { ctx, service } = build({
      role: 'owner',
      teamRows: [{ user_id: BOB, added_by: ME, created_at: new Date('2026-11-01') }],
    })
    const out = await service.accountTeam(ctx, 'a1')
    expect(out.responsible?.user_id).toBe(BOB)
    expect(out.members).toEqual([])
  })

  it('can_edit_own_scope : un co-équipier oui, un étranger à l’équipe non, team:manage oui', async () => {
    const mk = async (role: Role, me: string, teamRows: object[]) =>
      (
        await (() => {
          const b = build({ role, me, teamRows })
          return b.service.accountTeam(b.ctx, 'a1')
        })()
      ).can_edit_own_scope
    expect(await mk('sales', LEA, [{ user_id: LEA, added_by: BOB, created_at: new Date() }])).toBe(true)
    expect(await mk('sales', OUTSIDER, [])).toBe(false)
    expect(await mk('owner', OUTSIDER, [])).toBe(true)
  })
})

describe('#4996 — poser un périmètre', () => {
  const lea = [{ user_id: LEA, added_by: BOB, created_at: new Date() }]

  it('un co-équipier pose le SIEN en texte libre (Q1) : filtre personnel, pas un droit', async () => {
    const { ctx, service, scopes } = build({ role: 'sales', me: LEA, teamRows: lea })
    await service.addTeamScope(ctx, 'a1', { user_id: LEA, label: ' Retail France ' })
    expect(scopes.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WS,
        account_id: 'a1',
        user_id: LEA,
        entity_id: null,
        label: 'Retail France',
        added_by: LEA,
      }),
    )
  })

  it('refuse à un co-équipier de poser celui d’un AUTRE membre (contrôle négatif)', async () => {
    const { ctx, service, scopes } = build({ role: 'sales', me: LEA, teamRows: lea })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: BOB, label: 'Retail France' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('refuse à un NON-membre du compte de poser un périmètre, même pour lui-même', async () => {
    const { ctx, service, scopes } = build({ role: 'sales', me: OUTSIDER })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: OUTSIDER, label: 'Retail France' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('le responsable pose pour un co-équipier ; team:manage aussi', async () => {
    for (const [role, me] of [
      ['sales', BOB],
      ['owner', OUTSIDER],
    ] as const) {
      const { ctx, service, scopes } = build({ role, me, teamRows: lea })
      await service.addTeamScope(ctx, 'a1', { user_id: LEA, label: 'IT Groupe' })
      expect(scopes.save).toHaveBeenCalledTimes(1)
    }
  })

  it('refuse une zone pour quelqu’un qui n’est ni responsable ni co-équipier actif', async () => {
    const { ctx, service, scopes } = build({ role: 'owner' })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: OUTSIDER, label: 'Retail France' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('le responsable peut porter une zone sans ligne dans account_team_members', async () => {
    const { ctx, service, scopes } = build({ role: 'sales', me: BOB })
    await service.addTeamScope(ctx, 'a1', { user_id: BOB, label: 'DSI Groupe' })
    expect(scopes.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: BOB, label: 'DSI Groupe' }))
  })

  it('une entité du compte : le libellé est recopié du NOM de l’entité, pas du client', async () => {
    const { ctx, service, scopes, entities } = build({
      role: 'owner',
      teamRows: lea,
      entity: { id: 'e1', account_id: 'a1', workspace_id: WS, name: 'BNP Paribas CIB' },
    })
    await service.addTeamScope(ctx, 'a1', { user_id: LEA, entity_id: 'e1', label: 'Libellé triché' })
    expect(entities.findOne).toHaveBeenCalledWith({ where: { id: 'e1', account_id: 'a1' } })
    expect(scopes.save).toHaveBeenCalledWith(expect.objectContaining({ entity_id: 'e1', label: 'BNP Paribas CIB' }))
  })

  it('#4996.4 — une BU de l’espace : le libellé est recopié du NOM de la BU, borne d’espace dans la lecture', async () => {
    const { ctx, service, scopes, businessUnits } = build({
      role: 'owner',
      teamRows: lea,
      businessUnit: { id: 'bu-lyon', workspace_id: WS, name: 'Agence Lyon', status: 'active' },
    })
    await service.addTeamScope(ctx, 'a1', { user_id: LEA, business_unit_id: 'bu-lyon', label: 'Libellé triché' })
    expect(businessUnits.findOne).toHaveBeenCalledWith({ where: { id: 'bu-lyon', workspace_id: WS } })
    expect(scopes.save).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: null, business_unit_id: 'bu-lyon', label: 'Agence Lyon' }),
    )
  })

  it('#4996.4 — refuse la BU d’un AUTRE espace, rien n’est écrit', async () => {
    const { ctx, service, scopes } = build({
      role: 'owner',
      teamRows: lea,
      businessUnit: { id: 'bu-x', workspace_id: 'ws-autre', name: 'Agence étrangère', status: 'active' },
    })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: LEA, business_unit_id: 'bu-x' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('#4996.4 — refuse une zone entité ET BU sur la même ligne, rien n’est écrit', async () => {
    const { ctx, service, scopes } = build({
      role: 'owner',
      teamRows: lea,
      entity: { id: 'e1', account_id: 'a1', workspace_id: WS, name: 'BNP Paribas CIB' },
      businessUnit: { id: 'bu-lyon', workspace_id: WS, name: 'Agence Lyon', status: 'active' },
    })
    await expect(
      service.addTeamScope(ctx, 'a1', { user_id: LEA, entity_id: 'e1', business_unit_id: 'bu-lyon' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('#4996.4 — la même BU deux fois pour un membre : une seule ligne', async () => {
    const { ctx, service, scopes } = build({
      role: 'owner',
      teamRows: lea,
      businessUnit: { id: 'bu-lyon', workspace_id: WS, name: 'Agence Lyon', status: 'active' },
      scopeRows: [{ ...SCOPE_ROW, id: 's7', business_unit_id: 'bu-lyon', label: 'Agence Lyon' }],
    })
    await service.addTeamScope(ctx, 'a1', { user_id: LEA, business_unit_id: 'bu-lyon' })
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('refuse l’entité d’un AUTRE compte, rien n’est écrit', async () => {
    const { ctx, service, scopes } = build({
      role: 'owner',
      teamRows: lea,
      entity: { id: 'e9', account_id: 'a-autre', workspace_id: WS, name: 'Filiale étrangère' },
    })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: LEA, entity_id: 'e9' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('refuse un compte d’un AUTRE espace (404) sans lire ni écrire de zone', async () => {
    const { ctx, service, scopes } = build({ role: 'owner', account: null })
    await expect(service.addTeamScope(ctx, 'a1', { user_id: LEA, label: 'IT Groupe' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(scopes.save).not.toHaveBeenCalled()
  })

  it('une zone déjà posée (même entité ou même libellé) n’est pas dupliquée', async () => {
    const { ctx, service, scopes } = build({ role: 'owner', teamRows: lea, scopeRows: [SCOPE_ROW] })
    await service.addTeamScope(ctx, 'a1', { user_id: LEA, label: '  it groupe ' })
    expect(scopes.save).not.toHaveBeenCalled()
  })
})

describe('#4996 — retirer un périmètre', () => {
  const lea = [{ user_id: LEA, added_by: BOB, created_at: new Date() }]

  it('archive (removed_at/removed_by), ne supprime pas ; le membre le fait pour lui-même', async () => {
    const { ctx, service, scopes } = build({ role: 'sales', me: LEA, teamRows: lea, scopeRows: [SCOPE_ROW] })
    await service.removeTeamScope(ctx, 'a1', LEA, 's1')
    expect(scopes.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', workspace_id: WS, account_id: 'a1', user_id: LEA }),
      expect.objectContaining({ removed_by: LEA, removed_at: expect.any(Date) }),
    )
  })

  it('refuse à un co-équipier de retirer la zone d’un autre ; zone inconnue = 404', async () => {
    const a = build({ role: 'sales', me: LEA, teamRows: lea, scopeRows: [{ ...SCOPE_ROW, user_id: BOB }] })
    await expect(a.service.removeTeamScope(a.ctx, 'a1', BOB, 's1')).rejects.toBeInstanceOf(ForbiddenException)
    expect(a.scopes.update).not.toHaveBeenCalled()
    const b = build({ role: 'owner', teamRows: lea, scopeRows: [] })
    await expect(b.service.removeTeamScope(b.ctx, 'a1', LEA, 's-inconnue')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('#4996 — responsable ≠ co-équipier', () => {
  it('addTeamMember refuse le responsable (assigned_to) comme co-équipier', async () => {
    const { ctx, service, team } = build({ role: 'owner' })
    await expect(service.addTeamMember(ctx, 'a1', BOB)).rejects.toBeInstanceOf(BadRequestException)
    expect(team.save).not.toHaveBeenCalled()
  })

  it('retirer un co-équipier archive aussi ses zones', async () => {
    const { ctx, service, scopes } = build({ role: 'owner' })
    await service.removeTeamMember(ctx, 'a1', LEA)
    expect(scopes.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WS, account_id: 'a1', user_id: LEA }),
      expect.objectContaining({ removed_by: ME }),
    )
  })
})
