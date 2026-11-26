import { ConflictException, NotFoundException } from '@nestjs/common'
import { ACCOUNT_FOLLOW_CAP_REACHED } from '@bellum/contracts'
import { SignalLibraryService } from './signal-library.service'

/**
 * Théo A signaux.N2 / signaux-veilles.N1 — ce que ces tests doivent savoir dire NON :
 *  · un état n'est posé que sur un compte DE L'ESPACE de l'appelant (sinon 404, rien n'est écrit) ;
 *  · « remettre dans la bibliothèque » retire la préférence, jamais le signal ;
 *  · une veille n'est lisible que par son auteur ou, partagée, par l'espace — et seul l'auteur la règle ;
 *  · « supprimer » une veille l'archive (les informations déjà collectées restent) ;
 *  · la prévision d'échéance est calculée, et absente en pause.
 */
const ACC = '3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b11'
const WATCH = {
  name: 'Transformation & Data',
  account_ids: [ACC],
  natures: [],
  keywords: ['data'],
  cadence: '3_days' as const,
  starts_on: '2026-10-22',
  timezone: 'Europe/Paris',
  channel: 'in_app' as const,
  shared: false,
}

function build(answers: Array<(sql: string, params: unknown[]) => unknown>) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const queue = [...answers]
  const repo = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      const next = queue.shift()
      return next ? next(sql, params) : []
    }),
  }
  return { service: new SignalLibraryService(repo as never), calls, repo }
}

/**
 * #4506 — un faux SQL qui répond selon la REQUÊTE (et non selon l'ordre) : le plafond se lit dans une
 * transaction verrouillée, et l'ordre exact des lectures n'est pas ce que ces tests prouvent.
 */
function buildBySql(answers: { inWorkspace?: number; followed?: string[]; watchId?: string }) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (/count\(\*\)::int AS count FROM accounts/.test(sql))
      return [{ count: answers.inWorkspace ?? new Set(params[0] as string[]).size }]
    if (/SELECT f\.account_id FROM account_follows/.test(sql))
      return (answers.followed ?? []).map(account_id => ({ account_id }))
    if (/INSERT INTO signal_watches/.test(sql)) return [{ id: answers.watchId ?? 'w1' }]
    if (/SELECT id FROM signal_watches/.test(sql)) return [{ id: 'w1' }]
    if (/UPDATE signal_watches/.test(sql)) return [[{ id: 'w1' }], 1]
    return []
  })
  const repo = {
    query,
    manager: { transaction: async <T>(work: (m: { query: typeof query }) => Promise<T>) => work({ query }) },
  }
  return { service: new SignalLibraryService(repo as never), calls }
}

const ACC2 = '3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b12'
const ACC3 = '3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b13'
const ACC4 = '3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b14'

describe('SignalLibraryService.setStates', () => {
  const req = { items: [{ account_id: ACC, signal_key: 'levée de fonds' }], state: 'saved' as const }

  it('refuse (404) un compte hors de l’espace, sans rien écrire', async () => {
    const { service, calls } = build([() => [{ count: 0 }]])
    await expect(service.setStates('u1', 'ws1', req)).rejects.toBeInstanceOf(NotFoundException)
    expect(calls.some(call => /INSERT INTO signal_user_states/.test(call.sql))).toBe(false)
  })

  it('pose l’état par UPSERT, une ligne par (utilisateur, compte, fait)', async () => {
    const { service, calls } = build([() => [{ count: 1 }], () => []])
    await service.setStates('u1', 'ws1', req)
    const write = calls.find(call => /INSERT INTO signal_user_states/.test(call.sql))
    expect(write?.sql).toMatch(/ON CONFLICT \(user_id, account_id, signal_key\) DO UPDATE/)
    expect(write?.params).toContain('u1')
    expect(write?.params).toContain('saved')
  })

  it('null remet dans la bibliothèque : la préférence part, le signal reste', async () => {
    const { service, calls } = build([() => [{ count: 1 }], () => []])
    await service.setStates('u1', 'ws1', { ...req, state: null })
    const write = calls.at(-1)
    expect(write?.sql).toMatch(/DELETE FROM signal_user_states/)
    expect(write?.sql).not.toMatch(/accounts/)
  })
})

describe('SignalLibraryService.createWatch', () => {
  it('refuse un compte hors de l’espace', async () => {
    const { service, calls } = buildBySql({ inWorkspace: 0 })
    await expect(service.createWatch('u1', 'ws1', WATCH)).rejects.toBeInstanceOf(NotFoundException)
    expect(calls.some(call => /INSERT INTO/.test(call.sql))).toBe(false)
  })

  it('écrit la veille de son auteur dans son espace, active', async () => {
    const { service, calls } = buildBySql({ followed: [ACC] })
    const result = await service.createWatch('u1', 'ws1', WATCH)
    expect(result).toEqual({ id: 'w1' })
    const write = calls.find(call => /INSERT INTO signal_watches/.test(call.sql))
    expect(write?.params.slice(0, 2)).toEqual(['u1', 'ws1'])
  })
})

describe('#4506 — plafond de 3 comptes suivis DISTINCTS, toutes veilles confondues', () => {
  it('une veille sur deux comptes non suivis les SUIT, sous le verrou de suivi de l’utilisateur', async () => {
    const { service, calls } = buildBySql({ followed: [] })
    await service.createWatch('u1', 'ws1', { ...WATCH, account_ids: [ACC, ACC2] })
    const lock = calls.findIndex(call => /pg_advisory_xact_lock/.test(call.sql))
    expect(calls[lock]?.params).toEqual(['account_follows:u1'])
    const follow = calls.find(call => /INSERT INTO account_follows/.test(call.sql))
    expect(follow?.params).toEqual(['u1', 'ws1', [ACC, ACC2]])
    expect(follow?.sql).toMatch(/ON CONFLICT \(user_id, account_id\) DO UPDATE SET archived_at = NULL/)
    expect(lock).toBeLessThan(calls.indexOf(follow!))
  })

  it('REFUSE (409, ACCOUNT_FOLLOW_CAP_REACHED) le 4e compte distinct, sans rien écrire', async () => {
    const { service, calls } = buildBySql({ followed: [ACC, ACC2, ACC3] })
    const attempt = service.createWatch('u1', 'ws1', { ...WATCH, account_ids: [ACC4] })
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(service.createWatch('u1', 'ws1', { ...WATCH, account_ids: [ACC4] })).rejects.toMatchObject({
      response: { code: ACCOUNT_FOLLOW_CAP_REACHED },
    })
    expect(calls.some(call => /INSERT INTO (signal_watches|account_follows)/.test(call.sql))).toBe(false)
  })

  it('un compte déjà suivi ne compte pas deux fois : 3 suivis + une veille sur l’un d’eux passe', async () => {
    const { service, calls } = buildBySql({ followed: [ACC, ACC2, ACC3] })
    await service.createWatch('u1', 'ws1', { ...WATCH, account_ids: [ACC2, ACC3] })
    expect(calls.some(call => /INSERT INTO account_follows/.test(call.sql))).toBe(false)
    expect(calls.some(call => /INSERT INTO signal_watches/.test(call.sql))).toBe(true)
  })

  it('régler une veille tient le même plafond (409 au 4e, la veille n’est pas réécrite)', async () => {
    const { service, calls } = buildBySql({ followed: [ACC, ACC2] })
    await expect(
      service.updateWatch('u1', 'ws1', 'w1', { ...WATCH, account_ids: [ACC, ACC3, ACC4] }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(calls.some(call => /UPDATE signal_watches/.test(call.sql))).toBe(false)
  })

  it('régler la veille d’un autre utilisateur : 404, rien n’est suivi pour lui', async () => {
    const calls: Array<{ sql: string }> = []
    const query = jest.fn(async (sql: string) => {
      calls.push({ sql })
      if (/count\(\*\)::int AS count FROM accounts/.test(sql)) return [{ count: 1 }]
      if (/FROM signal_watches/.test(sql)) return []
      if (/SELECT f\.account_id FROM account_follows/.test(sql)) return []
      return []
    })
    const service = new SignalLibraryService({
      query,
      manager: { transaction: async (w: (m: unknown) => unknown) => w({ query }) },
    } as never)
    await expect(service.updateWatch('u1', 'ws1', 'w-of-u2', WATCH)).rejects.toBeInstanceOf(NotFoundException)
    const owner = calls.find(call => /SELECT id FROM signal_watches/.test(call.sql))
    expect(owner?.sql).toMatch(/user_id = \$1/)
    expect(calls.some(call => /INSERT INTO account_follows|UPDATE signal_watches/.test(call.sql))).toBe(false)
  })
})

describe('SignalLibraryService.listWatches', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'w1',
    user_id: 'u1',
    name: 'Transformation & Data',
    account_ids: [ACC],
    natures: [],
    keywords: [],
    cadence: '3_days',
    starts_on: '2026-10-22',
    timezone: 'Europe/Paris',
    channel: 'in_app',
    shared: false,
    state: 'active',
    created_at: new Date('2026-10-20T08:00:00Z'),
    ...over,
  })
  const accounts = [{ id: ACC, company_name: 'SNCF', followed: true }]

  it('calcule la prochaine échéance, et la retire en pause', async () => {
    const { service } = build([
      () => [row({}), row({ id: 'w2', state: 'paused' })],
      () => accounts,
      () => [{ count: 1 }],
    ])
    const result = await service.listWatches('u1', 'ws1', '2026-10-22')
    expect(result.items[0]?.next_run_on).toBe('2026-10-22')
    expect(result.items[1]?.next_run_on).toBeNull()
    expect(result.items[0]?.accounts).toEqual([{ account_id: ACC, company_name: 'SNCF', followed: true }])
  })

  it('une veille d’un collègue est en lecture seule (mine = false)', async () => {
    const { service } = build([() => [row({ user_id: 'u2', shared: true })], () => accounts, () => [{ count: 0 }]])
    const result = await service.listWatches('u1', 'ws1', '2026-10-22')
    expect(result.items[0]?.mine).toBe(false)
  })

  it('dit le plafond de suivi à côté des veilles', async () => {
    const { service } = build([() => [], () => [{ count: 2 }]])
    const result = await service.listWatches('u1', 'ws1', '2026-10-22')
    expect(result.follow_max).toBe(3) // #4267 — Louis 23/10 : 3 par utilisateur
    expect(result.followed_count).toBe(2)
  })
})

describe('SignalLibraryService.archiveWatch / setWatchState', () => {
  it('« supprimer » archive : un UPDATE, jamais un DELETE, et seulement les veilles de son auteur', async () => {
    const { service, calls } = build([() => [{ id: 'w1' }]])
    await service.archiveWatch('u1', 'w1')
    expect(calls[0]?.sql).toMatch(/UPDATE signal_watches SET archived_at/)
    expect(calls[0]?.sql).not.toMatch(/DELETE/)
    expect(calls[0]?.sql).toMatch(/user_id = \$1/)
  })

  it('404 quand la veille n’est pas la sienne', async () => {
    const { service } = build([() => []])
    await expect(service.setWatchState('u1', 'w9', 'paused')).rejects.toBeInstanceOf(NotFoundException)
  })
})
