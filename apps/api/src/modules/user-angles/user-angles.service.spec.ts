/**
 * #4739 — « Mes angles » : les angles qu'un commercial écrit lui-même, personnels à leur créateur.
 * Testé en mémoire (GA-07 : le service ne touche que son repository).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { UserAnglesService } from './user-angles.service'

type Row = Record<string, unknown>

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function build(seed: Row[] = []) {
  const rows: Row[] = seed.map(r => ({ created_at: new Date(), updated_at: new Date(), ...r }))
  let n = 0
  const repo = {
    rows,
    find: jest.fn(async (opts: { where: Row }) =>
      rows.filter(r => Object.entries(opts.where).every(([k, v]) => (v === null ? r[k] == null : r[k] === v))),
    ),
    findOne: jest.fn(
      async (opts: { where: Row }) =>
        rows.find(r => Object.entries(opts.where).every(([k, v]) => (v === null ? r[k] == null : r[k] === v))) ?? null,
    ),
    create: jest.fn((r: Row) => ({ ...r })),
    save: jest.fn(async (r: Row) => {
      if (!r['id']) {
        const saved = { ...r, id: `angle-${++n}`, created_at: new Date(), updated_at: new Date() }
        rows.push(saved)
        return saved
      }
      const at = rows.findIndex(x => x['id'] === r['id'])
      rows[at] = { ...rows[at], ...r }
      return rows[at]
    }),
  }
  return { service: new UserAnglesService(repo as never), repo }
}

describe('UserAnglesService', () => {
  it('crée un angle écrit à la main, personnel à son créateur, source « human »', async () => {
    const { service, repo } = build()
    const angle = await service.create(
      { userId: ME, workspaceId: WS },
      { title: '  Conformité DORA  ', content: ' Le comité exige… ' },
    )
    expect(angle).toMatchObject({ title: 'Conformité DORA', content: 'Le comité exige…', archived: false })
    expect(repo.rows[0]).toMatchObject({ user_id: ME, workspace_id: WS, source: 'human' })
  })

  it('refuse un titre ou un contenu vide', async () => {
    const { service } = build()
    await expect(
      service.create({ userId: ME, workspaceId: WS }, { title: '   ', content: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.create({ userId: ME, workspaceId: WS }, { title: 'x', content: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('ne liste que MES angles non archivés', async () => {
    const { service } = build([
      { id: 'a', user_id: ME, title: 'A', content: 'a', archived_at: null },
      { id: 'b', user_id: ME, title: 'B', content: 'b', archived_at: new Date() },
      { id: 'c', user_id: OTHER, title: 'C', content: 'c', archived_at: null },
    ])
    const list = await service.list(ME)
    expect(list.map(a => a.id)).toEqual(['a'])
  })

  it('modifie / renomme un angle à moi ; celui d’un autre est introuvable (jamais « interdit »)', async () => {
    const { service } = build([
      { id: 'a', user_id: ME, title: 'A', content: 'a', archived_at: null },
      { id: 'c', user_id: OTHER, title: 'C', content: 'c', archived_at: null },
    ])
    const updated = await service.update(ME, 'a', { title: 'Renommé' })
    expect(updated).toMatchObject({ id: 'a', title: 'Renommé', content: 'a' })
    await expect(service.update(ME, 'c', { title: 'Vol' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('retirer ARCHIVE (la ligne reste), ne supprime pas', async () => {
    const { service, repo } = build([{ id: 'a', user_id: ME, title: 'A', content: 'a', archived_at: null }])
    await service.archive(ME, 'a')
    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]!['archived_at']).toBeInstanceOf(Date)
    await expect(service.archive(OTHER, 'a')).rejects.toBeInstanceOf(NotFoundException)
  })
})
