import { describe, expect, it } from 'vitest'
import type { MatchNeed, MatchResult } from '@bellum/contracts'
import { groupNeedsByAccount } from './accountsForTalent'

const NEED_A = '11111111-1111-4111-8111-111111111111'
const NEED_B = '22222222-2222-4222-8222-222222222222'
const ACC_A = '33333333-3333-4333-8333-333333333333'

function need(over: Partial<MatchNeed>): MatchNeed {
  return {
    needId: NEED_A,
    role: 'DevSecOps',
    accountName: 'Société Générale',
    accountId: ACC_A,
    accountSector: null,
    projectSectors: [],
    skills: [
      { term: 'owasp', label: 'OWASP', required: true, level: null },
      { term: 'java', label: 'Java', required: false, level: null },
    ],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: 'Paris',
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: null,
    ...over,
  }
}
const result = (pushableScore: number) => ({ pushableScore }) as MatchResult

describe('groupNeedsByAccount — Théo C talents-comptes.R2', () => {
  it('classe un seul rang par compte, le meilleur besoin d’abord', () => {
    const rows = groupNeedsByAccount(
      [
        { need: need({ needId: NEED_B, role: 'Pentest' }), result: result(40) },
        { need: need({}), result: result(80) },
        { need: need({ accountName: 'Orange', accountId: null, needId: null }), result: result(60) },
      ],
      ['OWASP'],
    )
    expect(rows.map(r => r.accountName)).toEqual(['Société Générale', 'Orange'])
    expect(rows[0]?.role).toBe('DevSecOps')
    expect(rows[0]?.needCount).toBe(2)
  })

  it('N1 — besoin enregistré = « need », sans identifiant de besoin = « to_qualify »', () => {
    const rows = groupNeedsByAccount(
      [
        { need: need({}), result: result(80) },
        { need: need({ accountName: 'Orange', accountId: null, needId: null }), result: result(60) },
      ],
      [],
    )
    expect(rows.map(r => r.state)).toEqual(['need', 'to_qualify'])
  })

  it('compétences en commun : insensible à la casse, ordre du besoin, jamais inventées', () => {
    const rows = groupNeedsByAccount([{ need: need({}), result: result(80) }], ['java', 'owasp', 'Cobol'])
    expect(rows[0]?.commonSkills).toEqual(['OWASP', 'Java'])
  })

  it('N2 — une relation existante (faits du compte) est portée, sinon false', () => {
    const withHistory = need({ clientHistory: [{ kind: 'mission', date: '2026-06-01', label: 'Revue API' }] })
    const rows = groupNeedsByAccount(
      [
        { need: withHistory, result: result(80) },
        { need: need({ accountName: 'Orange', accountId: null, needId: null }), result: result(60) },
      ],
      [],
    )
    expect(rows.map(r => r.hasRelation)).toEqual([true, false])
  })

  it('un besoin sans nom de compte reste une ligne, sans lien de compte', () => {
    const rows = groupNeedsByAccount([{ need: need({ accountName: null, accountId: null }), result: result(10) }], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.accountName).toBeNull()
    expect(rows[0]?.accountId).toBeNull()
  })

  it('aucun besoin → aucune ligne', () => {
    expect(groupNeedsByAccount([], ['x'])).toEqual([])
  })
})
