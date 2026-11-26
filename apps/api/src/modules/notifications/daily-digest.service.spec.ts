import { composeDailyDigests, groupRulesByWorkspace } from './daily-digest.service'
import type { WatchlistRuleEntity } from '../watchlist-rules/watchlist-rule.entity'

/**
 * Le digest QUOTIDIEN de veille (§11). On teste la logique PURE : fenêtre 24 h,
 * filtre par règles du workspace, et « rien d'inventé ».
 */

const NOW = new Date('2026-07-24T09:00:00.000Z').getTime()
const isoHoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString().slice(0, 10)

function row(over: Partial<Parameters<typeof composeDailyDigests>[0][number]> = {}) {
  return {
    id: 'acc-1',
    user_id: 'u1',
    workspace_id: 'w1',
    company_name: 'Doctolib',
    sector: 'Santé & Medtech',
    priority_score: 8,
    recent_signals: [{ title: 'Levée de fonds', date: isoHoursAgo(6), source: 'Les Échos' }],
    ...over,
  }
}

const noRules = new Map<string, string[]>()

describe('composeDailyDigests — fenêtre 24 h', () => {
  it('garde un signal daté dans les dernières 24 h', () => {
    const digests = composeDailyDigests([row()], NOW, noRules)
    expect(digests).toHaveLength(1)
    expect(digests[0].totalSignals).toBe(1)
    expect(digests[0].accounts[0].companyName).toBe('Doctolib')
  })

  it('exclut un signal plus vieux que 24 h — journée vide = pas de digest', () => {
    const old = row({ recent_signals: [{ title: 'Vieux signal', date: isoHoursAgo(72), source: 'BODACC' }] })
    expect(composeDailyDigests([old], NOW, noRules)).toEqual([])
  })

  it("n'invente rien : un signal sans date ne passe pas", () => {
    const undated = row({ recent_signals: [{ title: 'Sans date', source: 'X' }] })
    expect(composeDailyDigests([undated], NOW, noRules)).toEqual([])
  })

  it('ne remonte que les comptes suivis avec au moins un signal du jour', () => {
    const empty = row({ id: 'acc-2', recent_signals: [] })
    const digests = composeDailyDigests([row(), empty], NOW, noRules)
    expect(digests[0].accounts).toHaveLength(1)
  })
})

describe('composeDailyDigests — filtre par règles du workspace (§11)', () => {
  it('sans règle, envoie tous les signaux du jour des comptes suivis', () => {
    const digests = composeDailyDigests([row()], NOW, noRules)
    expect(digests[0].totalSignals).toBe(1)
  })

  it('avec une règle qui matche le libellé du signal, le garde', () => {
    const rules = new Map([['w1', ['levée']]])
    const digests = composeDailyDigests([row()], NOW, rules)
    expect(digests[0].totalSignals).toBe(1)
  })

  it('avec une règle qui matche le SECTEUR du compte, garde ses signaux', () => {
    const rules = new Map([['w1', ['santé']]])
    const digests = composeDailyDigests([row()], NOW, rules)
    expect(digests[0].totalSignals).toBe(1)
  })

  it('avec des règles qui ne matchent rien, le compte disparaît du digest', () => {
    const rules = new Map([['w1', ['aéronautique']]])
    expect(composeDailyDigests([row()], NOW, rules)).toEqual([])
  })

  it("n'applique les règles d'un workspace qu'à SES comptes", () => {
    const otherWs = row({ id: 'acc-3', workspace_id: 'w2', user_id: 'u2', company_name: 'Qonto', sector: 'FinTech' })
    const rules = new Map([['w1', ['aéronautique']]]) // ne concerne que w1
    const digests = composeDailyDigests([row(), otherWs], NOW, rules)
    // w1 filtré (rien ne matche), w2 sans règle → passe
    expect(digests.map(d => d.userId)).toEqual(['u2'])
  })
})

describe('groupRulesByWorkspace', () => {
  it('groupe les valeurs de règles par workspace', () => {
    const rows = [
      { id: 'r1', workspace_id: 'w1', value: 'Banque' },
      { id: 'r2', workspace_id: 'w1', value: 'CTO' },
      { id: 'r3', workspace_id: 'w2', value: 'Retail' },
    ] as WatchlistRuleEntity[]
    const map = groupRulesByWorkspace(rows)
    expect(map.get('w1')).toEqual(['Banque', 'CTO'])
    expect(map.get('w2')).toEqual(['Retail'])
  })
})

// #4267.1 — le digest quotidien ne lit que les comptes SUIVIS EXPLICITEMENT, et l'envoie à CELUI QUI SUIT.
describe('DailyDigestService — la population lue', () => {
  it('joint les suivis actifs, adresse le suiveur, ne lit plus le statut commercial', async () => {
    const { createMockRepository } = await import('../../database/test-utils')
    const { DailyDigestService } = await import('./daily-digest.service')
    const accounts = createMockRepository()
    const rules = createMockRepository()
    const service = new DailyDigestService(
      accounts as never,
      createMockRepository() as never,
      createMockRepository() as never,
      rules as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
    )

    await service.run(new Date('2026-10-18T07:00:00Z'))

    expect(accounts._qb.innerJoin).toHaveBeenCalledWith(
      'account_follows',
      'follow',
      'follow.account_id = account.id AND follow.archived_at IS NULL',
    )
    expect(accounts._qb.select).toHaveBeenCalledWith(expect.arrayContaining(['follow.user_id AS user_id']))
    expect(JSON.stringify(accounts._qb.where.mock.calls.concat(accounts._qb.andWhere.mock.calls))).not.toContain(
      'commercial_status',
    )
  })
})
