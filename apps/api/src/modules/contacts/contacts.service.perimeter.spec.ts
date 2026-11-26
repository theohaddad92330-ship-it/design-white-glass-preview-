/**
 * #4996 L4 — `ContactsService.findByAccountInPerimeter` : la zone du lecteur filtre (`mine`) ou ordonne (`all`) les
 * contacts d'un compte, sans jamais cacher un contact sans entité ; les zones lues sont CELLES DU LECTEUR, bornées à
 * l'espace. La garde dit NON : hors périmètre BU ou compte vide, aucune zone n'est même lue.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = (rows: Array<{ id: string; entity_id: string | null }>, zones: string[], defaults: string[]) => {
  const contacts = createMockRepository()
  const query = contacts.manager.query as jest.Mock
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('account_team_scopes')) return zones.map(entity_id => ({ entity_id }))
    if (sql.includes('account_entities')) return defaults.map(id => ({ id }))
    return []
  })
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    createMockRepository() as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  jest.spyOn(service, 'findByAccountForHttp').mockResolvedValue(rows as never)
  return { service, query }
}

const rows = [
  { id: 'a', entity_id: 'e-bnp' },
  { id: 'b', entity_id: 'e-sg' },
  { id: 'c', entity_id: null },
  { id: 'd', entity_id: 'e-def' },
]

describe('ContactsService.findByAccountInPerimeter (#4996 L4)', () => {
  it('mine : ma zone, les sans-entité et l’entité par défaut ; le compteur est exact', async () => {
    const { service } = build(rows, ['e-sg'], ['e-def'])
    const out = await service.findByAccountInPerimeter('acc-1', 'user-1', 'mine')
    expect(out.contacts.map(r => r.id)).toEqual(['b', 'c', 'd'])
    expect(out.outside_perimeter_count).toBe(1)
  })

  it('all : tout est rendu, ma zone d’abord, le compteur reste porté', async () => {
    const { service } = build(rows, ['e-sg'], ['e-def'])
    const out = await service.findByAccountInPerimeter('acc-1', 'user-1', 'all')
    expect(out.contacts.map(r => r.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(out.outside_perimeter_count).toBe(1)
  })

  it('sans zone d’entité (texte libre seul compris) : aucun filtre, aucun compteur', async () => {
    const { service } = build(rows, [], ['e-def'])
    const out = await service.findByAccountInPerimeter('acc-1', 'user-1', 'mine')
    expect(out.contacts.map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.outside_perimeter_count).toBeNull()
  })

  it('lit les zones DU LECTEUR, dans SON espace, sans zone archivée ni texte libre', async () => {
    const { service, query } = build(rows, ['e-sg'], [])
    await service.findByAccountInPerimeter('acc-1', 'user-1', 'mine')
    const call = query.mock.calls.find(([sql]) => String(sql).includes('account_team_scopes'))
    expect(call?.[0]).toContain('removed_at IS NULL')
    expect(call?.[0]).toContain('entity_id IS NOT NULL')
    expect(call?.[1]).toEqual(['ws-1', 'acc-1', 'user-1'])
  })

  it('NON : compte hors périmètre (liste vide) — aucune zone lue, aucun compteur', async () => {
    const { service, query } = build([], ['e-sg'], [])
    const out = await service.findByAccountInPerimeter('acc-autre-espace', 'user-1', 'mine')
    expect(out).toEqual({ contacts: [], outside_perimeter_count: null })
    expect(query).not.toHaveBeenCalled()
  })
})
