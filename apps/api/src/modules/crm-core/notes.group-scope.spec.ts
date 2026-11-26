import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { NotesService } from './notes.service'

const WORKSPACE = 'ws-1'
const USER = 'user-1'
const SANOFI = '11111111-1111-4111-8111-111111111111'
const PASTEUR = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

type Call = { sql: string; params: unknown[] }

function build(rowsFor: (sql: string, params: unknown[]) => unknown[]) {
  const calls: Call[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    return rowsFor(sql, params)
  })
  const saved: Array<Record<string, unknown>> = []
  const repo = {
    manager: { query },
    create: (value: Record<string, unknown>) => value,
    save: jest.fn(async (value: Record<string, unknown>) => {
      saved.push(value)
      return { ...value, id: 'note-1' }
    }),
    findOne: jest.fn(async () => ({ id: 'note-1', user_id: USER, workspace_id: WORKSPACE, body: 'x', pinned: false })),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const service = new NotesService(repo as never, workspaceContext as never)
  return { service, calls, saved, repo }
}

const noteRow = (over: Record<string, unknown> = {}) => ({
  id: 'note-1',
  entityType: 'account',
  entityId: SANOFI,
  body: 'Grille achats : trois devis, 45 jours.',
  authorId: USER,
  firstName: 'Louis',
  lastName: 'S',
  email: null,
  pinned: false,
  createdAt: '2026-10-11T08:00:00.000Z',
  updatedAt: '2026-10-11T08:00:00.000Z',
  alsoAppliesToAccountIds: [PASTEUR],
  ...over,
})

describe('#3895 — NotesService : la portée entité du groupe', () => {
  it('lister les notes d’un compte ramène aussi celles qui valent pour lui, nommant leur origine', async () => {
    const { service, calls } = build((sql, params) => {
      if (/FROM notes n/.test(sql)) return [noteRow()]
      if (/FROM accounts/.test(sql) && /ANY/.test(sql)) {
        expect(params[0]).toEqual(expect.arrayContaining([SANOFI, PASTEUR]))
        return [
          { id: SANOFI, name: 'Sanofi' },
          { id: PASTEUR, name: 'Sanofi Pasteur' },
        ]
      }
      return []
    })
    const items = await service.list(USER, 'account', PASTEUR)
    const notesSql = calls.find(call => /FROM notes n/.test(call.sql))
    expect(notesSql?.sql).toContain('also_applies_to_account_ids')
    expect(notesSql?.sql).toContain('n.workspace_id =')
    expect(items).toHaveLength(1)
    expect(items[0]?.inheritedFrom).toEqual({ id: SANOFI, name: 'Sanofi' })
  })

  it('une note lue sur son compte d’origine n’est pas « héritée » et nomme sa portée', async () => {
    const { service } = build((sql, params) => {
      if (/FROM notes n/.test(sql)) return [noteRow()]
      if (/ANY/.test(sql))
        return [
          { id: PASTEUR, name: 'Sanofi Pasteur' },
          { id: SANOFI, name: 'Sanofi' },
        ]
      return params ? [] : []
    })
    const items = await service.list(USER, 'account', SANOFI)
    expect(items[0]?.inheritedFrom).toBeNull()
    expect(items[0]?.alsoAppliesTo).toEqual([{ id: PASTEUR, name: 'Sanofi Pasteur' }])
  })

  it('lister les notes d’un contact ne cherche jamais de portée de groupe', async () => {
    const { service, calls } = build(() => [])
    await service.list(USER, 'contact', SANOFI)
    expect(calls[0]?.sql).not.toContain('also_applies_to_account_ids')
  })

  it('écrire une portée vérifie l’espace ET le groupe, puis l’écrit', async () => {
    const { service, saved, calls } = build((sql, params) => {
      if (/to_regclass/.test(sql)) return [{ exists: true }]
      if (/FROM accounts WHERE id = \$1/.test(sql)) return [{ id: SANOFI }]
      if (/group_head_siren/.test(sql)) return [{ id: PASTEUR, name: 'Sanofi Pasteur' }]
      if (/FROM notes n/.test(sql)) return [noteRow()]
      return params ? [] : []
    })
    await service.create(USER, {
      entityType: 'account',
      entityId: SANOFI,
      body: ' Grille achats ',
      alsoAppliesToAccountIds: [PASTEUR],
    })
    expect(saved[0]?.also_applies_to_account_ids).toEqual([PASTEUR])
    const groupCheck = calls.find(call => call.sql.includes('group_head_siren'))
    expect(groupCheck?.sql).toContain('workspace_id')
    expect(groupCheck?.params).toEqual(expect.arrayContaining([WORKSPACE]))
  })

  it('sait dire NON : un compte hors du groupe est refusé, rien n’est écrit', async () => {
    const { service, saved } = build(sql => {
      if (/to_regclass/.test(sql)) return [{ exists: true }]
      if (/FROM accounts WHERE id = \$1/.test(sql)) return [{ id: SANOFI }]
      if (/group_head_siren/.test(sql)) return [] // OTHER n'est pas du même groupe
      return []
    })
    await expect(
      service.create(USER, { entityType: 'account', entityId: SANOFI, body: 'x', alsoAppliesToAccountIds: [OTHER] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(saved).toHaveLength(0)
  })

  it('une note sans portée écrit un tableau vide (rien d’inféré)', async () => {
    const { service, saved } = build(sql => {
      if (/to_regclass/.test(sql)) return [{ exists: true }]
      if (/FROM accounts WHERE id = \$1/.test(sql)) return [{ id: SANOFI }]
      if (/FROM notes n/.test(sql)) return [noteRow({ alsoAppliesToAccountIds: [] })]
      return []
    })
    await service.create(USER, { entityType: 'account', entityId: SANOFI, body: 'x' })
    expect(saved[0]?.also_applies_to_account_ids).toEqual([])
  })

  it('modifier la portée est réservé à l’auteur', async () => {
    const { service, repo } = build(() => [])
    repo.findOne.mockResolvedValueOnce({
      id: 'note-1',
      user_id: 'someone-else',
      workspace_id: WORKSPACE,
      entity_type: 'account',
      entity_id: SANOFI,
    } as never)
    await expect(service.update(USER, 'note-1', { alsoAppliesToAccountIds: [PASTEUR] })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('les entités du groupe d’un compte : seulement celles de SON espace', async () => {
    const { service, calls } = build(sql =>
      /group_head_siren/.test(sql) ? [{ id: PASTEUR, name: 'Sanofi Pasteur' }] : [],
    )
    const entities = await service.groupEntities(USER, SANOFI)
    expect(entities).toEqual([{ id: PASTEUR, name: 'Sanofi Pasteur' }])
    expect(calls[0]?.sql).toContain('s.workspace_id = o.workspace_id')
    expect(calls[0]?.sql).toContain('o.workspace_id = $2')
  })
  // #4158.62 — les droits suivent l'ENTITÉ : le composeur de notes ne nomme pas une entité
  // hors du périmètre BU du lecteur (même clause que `GET /accounts/:id/group-entities`).
  it('#4158.62 — avec un périmètre BU, la requête borne le compte ouvert ET chaque entité nommée', async () => {
    const BU = '44444444-4444-4444-8444-444444444444'
    const { service, calls } = build(() => [])
    await service.groupEntities(USER, SANOFI, { businessUnitIds: [BU], includeUnassigned: true })
    const sql = calls[0]?.sql ?? ''
    expect(sql).toContain('s.business_unit_id')
    expect(sql).toContain('o.business_unit_id')
    expect(sql).toContain(BU)
  })

  it('#4158.62 — sans cloisonnement, la requête reste byte-identique (aucune clause BU)', async () => {
    const { service, calls } = build(() => [])
    await service.groupEntities(USER, SANOFI, null)
    await service.groupEntities(USER, SANOFI)
    expect(calls[0]?.sql).not.toContain('business_unit_id')
    expect(calls[1]?.sql).toBe(calls[0]?.sql)
  })
  // #4158.62 — les droits suivent l'ENTITÉ aussi à la LECTURE des notes d'un compte.
  describe('#4158.62 — lecture des notes sous périmètre BU', () => {
    const BU = '44444444-4444-4444-8444-444444444444'
    const scope = { businessUnitIds: [BU], includeUnassigned: true } as const

    it('un compte HORS du périmètre du lecteur est un 404 : aucune note n’est lue', async () => {
      const { service, calls } = build(sql => (/business_unit_id/.test(sql) ? [] : [noteRow()]))
      await expect(service.list(USER, 'account', SANOFI, scope)).rejects.toBeInstanceOf(NotFoundException)
      expect(calls.some(call => /FROM notes n/.test(call.sql))).toBe(false)
    })

    it('un compte dans le périmètre se lit, et le nom d’une entité hors périmètre n’est PAS servi', async () => {
      const { service, calls } = build(sql => {
        if (/SELECT 1 FROM accounts/.test(sql)) return [{ one: 1 }]
        if (/FROM notes n/.test(sql)) return [noteRow()]
        if (/ANY/.test(sql)) return [{ id: SANOFI, name: 'Sanofi' }] // PASTEUR filtré par la clause BU
        return []
      })
      const items = await service.list(USER, 'account', SANOFI, scope)
      expect(items[0]?.alsoAppliesTo).toEqual([])
      const naming = calls.find(call => /id = ANY/.test(call.sql))
      expect(naming?.sql).toContain('business_unit_id')
      expect(naming?.sql).toContain(BU)
    })

    it('sans cloisonnement, aucune requête de plus et aucune clause BU (byte-identique)', async () => {
      const { service, calls } = build(sql => (/FROM notes n/.test(sql) ? [noteRow()] : []))
      await service.list(USER, 'account', SANOFI, null)
      expect(calls.every(call => !call.sql.includes('business_unit_id'))).toBe(true)
      expect(calls.some(call => /SELECT 1 FROM accounts/.test(call.sql))).toBe(false)
    })

    it('un contact n’est pas concerné par la porte de compte', async () => {
      const { service, calls } = build(() => [])
      await service.list(USER, 'contact', SANOFI, scope)
      expect(calls.some(call => call.sql.includes('business_unit_id'))).toBe(false)
    })
  })
})

describe('#4158.58 — NotesService.create : écrire une note reste dans le périmètre BU', () => {
  const scope = { businessUnitIds: ['44444444-4444-4444-8444-444444444444'], includeUnassigned: true } as const
  const input = { entityType: 'account', entityId: SANOFI, body: 'Appel du jour' } as const
  const rowsFor = (inScope: boolean) => (sql: string) => {
    if (/to_regclass/.test(sql)) return [{ exists: true }]
    if (/business_unit_id/.test(sql)) return inScope ? [{ id: SANOFI }] : []
    if (/FROM accounts WHERE id = \$1/.test(sql)) return [{ id: SANOFI }]
    if (/FROM notes n/.test(sql)) return [noteRow({ alsoAppliesToAccountIds: [] })]
    return []
  }

  it('refuse (403, message nommé) une note sur un compte hors périmètre — et n’écrit rien', async () => {
    const { service, saved } = build(rowsFor(false))
    const failure = await service.create(USER, input, { scope }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ForbiddenException)
    expect((failure as ForbiddenException).message).toMatch(/périmètre/)
    expect(saved).toHaveLength(0)
  })

  it('témoin : un compte dans le périmètre s’écrit', async () => {
    const { service, saved } = build(rowsFor(true))
    await service.create(USER, input, { scope })
    expect(saved).toHaveLength(1)
  })

  it('témoin : sans cloisonnement (scope null), aucune lecture de périmètre de plus', async () => {
    const { service, calls, saved } = build(rowsFor(false))
    await service.create(USER, input, { scope: null })
    expect(saved).toHaveLength(1)
    expect(calls.filter(c => /business_unit_id/.test(c.sql))).toHaveLength(0)
  })
})
