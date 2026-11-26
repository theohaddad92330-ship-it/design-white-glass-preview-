import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../../database/entities/account.entity'
import type { WorkspaceRole } from '@bellum/contracts'
import { TeamInboxDerivedService } from './team-inbox-derived.service'

const WS = 'aaaaaaaa-0000-0000-0000-000000000001'
const ADMIN = '11111111-0000-0000-0000-000000000001'

function build(opts: { canonical?: boolean; waiting?: number }) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM esn_profiles')) return opts.canonical ? [{ ok: 1 }] : []
    if (sql.includes('user_onboarding_transitions')) return [{ count: String(opts.waiting ?? 0) }]
    return []
  })
  const repo = { manager: { query } } as unknown as Repository<AccountEntity>
  return { service: new TeamInboxDerivedService(repo), query }
}

// #4158.18 — l'entrée est CALCULÉE à la lecture, jamais stockée.
describe('TeamInboxDerivedService — #4158.18 admin prévenu', () => {
  it('un gestionnaire voit « N collègues attendent » tant qu’aucune fiche canonique n’existe', async () => {
    const { service } = build({ canonical: false, waiting: 2 })
    const entries = await service.entriesFor(ADMIN, WS, 'admin')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'esn_description_pending', derived: true, read_at: null })
    expect(entries[0]?.title).toContain('2')
    expect(entries[0]?.link).toBe('/settings/profile')
  })

  it('singulier pour un seul collègue', async () => {
    const { service } = build({ canonical: false, waiting: 1 })
    const [entry] = await service.entriesFor(ADMIN, WS, 'owner')
    expect(entry?.title).toContain('1 collègue attend')
  })

  it('aucune ligne quand la fiche entreprise existe', async () => {
    const { service } = build({ canonical: true, waiting: 3 })
    expect(await service.entriesFor(ADMIN, WS, 'admin')).toEqual([])
  })

  it('aucune ligne quand personne n’a fini son onboarding (jamais « 0 collègue »)', async () => {
    const { service } = build({ canonical: false, waiting: 0 })
    expect(await service.entriesFor(ADMIN, WS, 'admin')).toEqual([])
  })

  it('un membre sans team:manage ne voit rien et ne déclenche aucune requête', async () => {
    const { service, query } = build({ canonical: false, waiting: 5 })
    for (const role of ['sales', 'viewer', 'member', 'recruiter'] as WorkspaceRole[]) {
      expect(await service.entriesFor(ADMIN, WS, role)).toEqual([])
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('les requêtes sont bornées à l’espace actif et excluent l’appelant', async () => {
    const { service, query } = build({ canonical: false, waiting: 1 })
    await service.entriesFor(ADMIN, WS, 'sales_ops')
    for (const call of query.mock.calls as unknown as [string, unknown[]][]) {
      expect(call[1][0]).toBe(WS)
    }
    const waitingCall = (query.mock.calls as unknown as [string, unknown[]][]).find(c =>
      c[0].includes('user_onboarding_transitions'),
    )
    expect(waitingCall?.[1]).toContain(ADMIN)
  })

  it('un échec de lecture ne casse jamais la boîte : aucune ligne', async () => {
    const repo = {
      manager: { query: jest.fn().mockRejectedValue(new Error('db')) },
    } as unknown as Repository<AccountEntity>
    const service = new TeamInboxDerivedService(repo)
    expect(await service.entriesFor(ADMIN, WS, 'admin')).toEqual([])
  })
})
