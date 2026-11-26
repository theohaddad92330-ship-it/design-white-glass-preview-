import type { Repository } from 'typeorm'
import type { CrmDealEntity } from '../../database/entities/crm-mirror.entity'
import { CrmMirrorReader } from './crm-mirror.reader'

const WS = '00000000-0000-4000-8000-000000000001'
const ACCOUNT = '00000000-0000-4000-8000-0000000000a1'

function reader(answer: (sql: string, params: unknown[]) => unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' '), params })
    return answer(sql, params)
  })
  const repo = { manager: { query } } as unknown as Repository<CrmDealEntity>
  return { reader: new CrmMirrorReader(repo), calls }
}

const dealRow = {
  external_id: 'd1',
  title: 'Régie',
  amount: '120000',
  currency: 'EUR',
  stage_label: 'Proposition',
  stage_external_id: 's2',
  pipeline_external_id: 'p1',
  status: 'lost',
  lost_reason: 'Budget',
  expected_close_date: new Date('2026-12-01T00:00:00Z'),
  closed_at: new Date('2026-10-01T00:00:00Z'),
  crm_created_at: null,
  account_external_id: 'org-1',
  company_name: 'TF1',
  crm_updated_at: new Date('2026-10-18T09:00:00Z'),
  owner_external_id: '77',
  owner_name: 'Claire Martin',
  contact_external_ids: ['per-1'],
  crm_url: null,
}

describe('CrmMirrorReader (SYNC-A A.5)', () => {
  it('miroir VIDE pour ce fournisseur : null — l’appelant retombe sur la lecture directe', async () => {
    const { reader: r } = reader(sql => (sql.includes('EXISTS') ? [{ mirrored: false }] : []))
    expect(await r.readDeals(WS, 'pipedrive')).toBeNull()
  })

  it('miroir rempli : une page d’affaires à la forme de la lecture commune, bornée par l’espace, archivées exclues', async () => {
    const { reader: r, calls } = reader(sql => (sql.includes('EXISTS') ? [{ mirrored: true }] : [dealRow]))
    const readDeals = await r.readDeals(WS, 'pipedrive')
    const page = await readDeals!('user-1', { limit: 1, since: '2026-10-01T00:00:00Z' })
    expect(page.deals[0]).toMatchObject({
      id: 'd1',
      title: 'Régie',
      amount: 120000,
      currency: 'EUR',
      stage: 'Proposition',
      status: 'lost',
      closeDate: '2026-12-01T00:00:00.000Z',
      closedAt: '2026-10-01T00:00:00.000Z',
      createdAt: null,
      accountId: 'org-1',
      accountName: 'TF1',
      modifiedAt: '2026-10-18T09:00:00.000Z',
      ownerId: '77',
      lostReason: 'Budget',
    })
    // Page pleine : un curseur de décalage ; sinon fin de lecture.
    expect(page.nextAfter).toBe('m:1')
    const select = calls[1]!
    expect(select.sql).toMatch(/WHERE d\.workspace_id = \$1 AND d\.provider = \$2 AND d\.archived_at IS NULL/)
    expect(select.params.slice(0, 3)).toEqual([WS, 'pipedrive', '2026-10-01T00:00:00Z'])
  })

  it('la fiche compte : affaires et activités du compte, non archivées, propriétaire nommé, jamais un corps', async () => {
    const { reader: r, calls } = reader(sql =>
      sql.includes('FROM crm_activities')
        ? [
            {
              provider: 'hubspot',
              external_id: 'a1',
              kind: 'call',
              subject: 'Point projet',
              occurred_at: new Date('2026-10-10T09:00:00Z'),
              done: null,
              owner_name: null,
              crm_url: null,
            },
          ]
        : [{ ...dealRow, provider: 'hubspot', amount: null }],
    )
    const view = await r.accountView(WS, ACCOUNT)
    expect(view.deals[0]).toMatchObject({
      provider: 'hubspot',
      title: 'Régie',
      amount: null,
      ownerName: 'Claire Martin',
    })
    expect(view.activities[0]).toEqual({
      provider: 'hubspot',
      id: 'a1',
      kind: 'call',
      subject: 'Point projet',
      occurredAt: '2026-10-10T09:00:00.000Z',
      done: null,
      ownerName: null,
      url: null,
    })
    for (const call of calls) {
      expect(call.sql).toMatch(/workspace_id = \$1 AND \w+\.account_id = \$2 AND \w+\.archived_at IS NULL/)
      expect(call.params.slice(0, 2)).toEqual([WS, ACCOUNT])
    }
  })
})
