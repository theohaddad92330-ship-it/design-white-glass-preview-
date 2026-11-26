import type { Repository } from 'typeorm'
import { NotificationsService } from './notifications.service'
import type { IntegrationsService } from '../integrations/integrations.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { NotificationEntity } from '../../database/entities/notification.entity'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'

const WS_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const WS_B = 'bbbbbbbb-0000-0000-0000-00000000000b'
const BOB = '11111111-0000-0000-0000-000000000002'
const ALICE = '11111111-0000-0000-0000-000000000001'

type Row = Record<string, unknown>

/** Dépôt en mémoire qui honore `IsNull`, `In` et les `where` en tableau (OU). */
function memoryRepo(initial: Row[]) {
  const store = initial.map(r => ({ ...r }))
  const matchesValue = (actual: unknown, expected: unknown): boolean => {
    if (expected !== null && typeof expected === 'object' && '_type' in (expected as object)) {
      const op = expected as { _type: string; _value: unknown }
      if (op._type === 'isNull') return actual == null
      if (op._type === 'in') return (op._value as unknown[]).includes(actual)
      if (op._type === 'not') return !matchesValue(actual, op._value)
      throw new Error(`opérateur non géré: ${op._type}`)
    }
    return actual === expected
  }
  const matchOne = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => matchesValue(row[k], v))
  const matches = (row: Row, where: Row | Row[] | undefined) =>
    Array.isArray(where) ? where.some(w => matchOne(row, w)) : matchOne(row, where ?? {})
  return {
    findAndCount: jest.fn(async ({ where, take, skip }: { where?: Row | Row[]; take?: number; skip?: number }) => {
      const filtered = store
        .filter(r => matches(r, where))
        .sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])))
      return [filtered.slice(skip ?? 0, (skip ?? 0) + (take ?? filtered.length)), filtered.length] as [Row[], number]
    }),
    count: jest.fn(async ({ where }: { where?: Row | Row[] }) => store.filter(r => matches(r, where)).length),
    update: jest.fn(async (where: Row, patch: Row) => {
      store.forEach((row, i) => {
        if (matches(row, where)) store[i] = { ...row, ...patch }
      })
    }),
    manager: {
      query: jest.fn(async () => [{ user_id: ALICE, first_name: 'Alice', last_name: 'Martin', email: 'a@esn.test' }]),
    },
    _store: store,
  }
}

const note = (id: string, over: Row): Row => ({
  id,
  user_id: BOB,
  type: 'system',
  title: id,
  body: '',
  link: null,
  read_at: null,
  workspace_id: null,
  actor_user_id: null,
  created_at: new Date('2026-10-14T10:00:00Z'),
  ...over,
})

function build(rows: Row[]) {
  const notifs = memoryRepo(rows)
  const service = new NotificationsService(
    {} as unknown as Repository<NotificationPreferenceEntity>,
    notifs as unknown as Repository<NotificationEntity>,
    {} as unknown as Repository<AccountEntity>,
    {} as unknown as IntegrationsService,
  )
  return { service, notifs }
}

const ROWS = [
  note('perso', { type: 'credit_low' }),
  note('team-a', { type: 'account_assigned', workspace_id: WS_A, actor_user_id: ALICE }),
  note('team-b', { type: 'account_assigned', workspace_id: WS_B, actor_user_id: ALICE }),
  note('legacy-mention', { type: 'chat_mention' }),
  note('other-user', { user_id: ALICE, type: 'account_assigned', workspace_id: WS_A }),
]

describe('NotificationsService — boîte scopée à l’espace actif (#4158.14)', () => {
  it('montre les notifications personnelles ET celles de l’espace actif, jamais celles d’un autre espace', async () => {
    const { service } = build(ROWS)
    const a = await service.list(BOB, 1, 20, { workspaceId: WS_A })
    expect(a.data.map(i => i.id).sort()).toEqual(['perso', 'team-a'])
    const b = await service.list(BOB, 1, 20, { workspaceId: WS_B })
    expect(b.data.map(i => i.id).sort()).toEqual(['perso', 'team-b'])
  })

  // #4158.56 — une ancienne notification d'équipe SANS espace (rien à en déduire) ne se lit plus
  // dans tous les espaces : seulement dans l'espace personnel (celui dont on est propriétaire).
  it('#4158.56 — une ancienne notification d’équipe sans espace ne se lit que dans l’espace personnel', async () => {
    const { service } = build(ROWS)
    const personal = await service.list(BOB, 1, 20, { workspaceId: WS_A, personalSpace: true })
    expect(personal.data.map(i => i.id).sort()).toEqual(['legacy-mention', 'perso', 'team-a'])
    const shared = await service.list(BOB, 1, 20, { workspaceId: WS_B, personalSpace: false })
    expect(shared.data.map(i => i.id)).not.toContain('legacy-mention')
  })

  it('sans espace actif, les notifications personnelles et les anciennes d’équipe sont lues', async () => {
    const { service } = build(ROWS)
    const page = await service.list(BOB, 1, 20)
    expect(page.data.map(i => i.id).sort()).toEqual(['legacy-mention', 'perso'])
  })

  it('le filtre « Équipe » ne garde que les types d’équipe de l’espace actif', async () => {
    const { service } = build(ROWS)
    const page = await service.list(BOB, 1, 20, { workspaceId: WS_A, scope: 'team' })
    expect(page.data.map(i => i.id)).toEqual(['team-a'])
    const personal = await service.list(BOB, 1, 20, { workspaceId: WS_A, scope: 'team', personalSpace: true })
    expect(personal.data.map(i => i.id).sort()).toEqual(['legacy-mention', 'team-a'])
  })

  it('le filtre « Équipe » sans espace actif ne montre que l’équipe sans espace (jamais le personnel)', async () => {
    const { service } = build(ROWS)
    const page = await service.list(BOB, 1, 20, { scope: 'team' })
    expect(page.data.map(i => i.id)).toEqual(['legacy-mention'])
  })

  it('l’auteur est écrit en clair, et null quand la notification n’en a pas', async () => {
    const { service } = build(ROWS)
    const page = await service.list(BOB, 1, 20, { workspaceId: WS_A })
    expect(page.data.find(i => i.id === 'team-a')?.actor_name).toBe('Alice Martin')
    expect(page.data.find(i => i.id === 'perso')?.actor_name).toBeNull()
  })

  it('le compteur non lu suit la même portée', async () => {
    const { service } = build(ROWS)
    expect(await service.unreadCount(BOB, { workspaceId: WS_A })).toBe(2)
    expect(await service.unreadCount(BOB, { workspaceId: WS_A, personalSpace: true })).toBe(3)
    expect(await service.unreadCount(BOB, { workspaceId: WS_B })).toBe(2)
    expect(await service.unreadCount(BOB)).toBe(2)
  })

  it('un compteur à zéro vaut 0 mesuré, et une notification lue ne compte plus', async () => {
    const { service } = build([note('x', { read_at: new Date(), workspace_id: WS_A })])
    expect(await service.unreadCount(BOB, { workspaceId: WS_A })).toBe(0)
  })

  it('« tout marquer lu » ne touche ni l’autre espace ni un autre utilisateur', async () => {
    const { service, notifs } = build(ROWS)
    await service.markAllRead(BOB, { workspaceId: WS_A, personalSpace: true })
    const readIds = notifs._store.filter(r => r['read_at']).map(r => r['id'])
    expect(readIds.sort()).toEqual(['legacy-mention', 'perso', 'team-a'])
    expect(notifs._store.find(r => r['id'] === 'team-b')?.['read_at']).toBeNull()
    expect(notifs._store.find(r => r['id'] === 'other-user')?.['read_at']).toBeNull()
  })

  it('aucun auteur ⇒ aucune requête de profils', async () => {
    const { service, notifs } = build([note('perso', {})])
    await service.list(BOB, 1, 20, { workspaceId: WS_A })
    expect(notifs.manager.query).not.toHaveBeenCalled()
  })
})

describe('#4158.56 — « tout marquer lu » ne touche pas ce que la personne ne voit pas', () => {
  it('hors espace personnel, une ancienne notification d’équipe sans espace reste non lue', async () => {
    const { service, notifs } = build(ROWS)
    await service.markAllRead(BOB, { workspaceId: WS_A })
    expect(notifs._store.find(r => r['id'] === 'legacy-mention')?.['read_at']).toBeNull()
    expect(notifs._store.find(r => r['id'] === 'perso')?.['read_at']).not.toBeNull()
  })
})
