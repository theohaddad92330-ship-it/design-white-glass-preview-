import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { CvAutoParseService } from './cv-auto-parse.service'
import { CvAutoReadStatusService } from './cv-auto-read-status.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const OTHER_WS = 'w0000000-0000-4000-8000-000000000002'
const OWNER = 'u0000000-0000-4000-8000-000000000001'

type FakeJob = {
  data: { workspaceId: string; userId: string; consultantId: string }
  failedReason?: string
  finishedOn?: number
}

function make(
  over: {
    failed?: FakeJob[]
    progress?: { unread: string; read: string }
    rows?: unknown[]
    week?: { full_name: string; total: string }[]
  } = {},
) {
  const getFailed = jest.fn(async () => over.failed ?? [])
  const queue = { getFailed } as unknown as Queue
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('since_cte')) return [over.progress ?? { unread: '0', read: '0' }]
    if (sql.includes('read_this_week')) return over.week ?? []
    return over.rows ?? []
  })
  const consultants = { manager: { query } } as unknown as Repository<ConsultantEntity>
  const enqueue = jest.fn(async () => true)
  const autoParse = { enqueue } as unknown as CvAutoParseService
  return { service: new CvAutoReadStatusService(queue, consultants, autoParse), getFailed, query, enqueue }
}

describe('CvAutoReadStatusService — lot BATCH-CV (12/10/2026) : « N / total lus » et les échecs NOMMÉS', () => {
  it('pendant un import : la progression est lue, total = lus + restants', async () => {
    const { service } = make({ progress: { unread: '1600', read: '400' } })
    const status = await service.status(WS)
    expect(status.unread).toBe(1600)
    expect(status.progress).toEqual({ read: 400, total: 2000 })
  })

  it('rien à lire : AUCUNE progression (jamais « 0 / 0 »)', async () => {
    const { service } = make({ progress: { unread: '0', read: '12' } })
    expect((await service.status(WS)).progress).toBeNull()
  })

  it('un échec FINAL est listé avec sa raison et le nom du fichier — jamais perdu en silence', async () => {
    const failedAt = Date.parse('2026-10-12T08:00:00Z')
    const { service } = make({
      failed: [
        {
          data: { workspaceId: WS, userId: OWNER, consultantId: 'c1' },
          failedReason: 'Le service de lecture du CV est indisponible pour le moment.',
          finishedOn: failedAt,
        },
      ],
      rows: [{ id: 'c1', full_name: null, filename: 'jean-dupont.pdf', cv_auto_read_at: null }],
    })
    const status = await service.status(WS)
    expect(status.failed).toEqual([
      {
        consultantId: 'c1',
        label: 'jean-dupont.pdf',
        reason: 'Le service de lecture du CV est indisponible pour le moment.',
        failedAt: '2026-10-12T08:00:00.000Z',
      },
    ])
  })

  it('sait dire NON : l’échec d’un AUTRE espace n’est jamais montré, une fiche relue depuis sort de la liste', async () => {
    const failedAt = Date.parse('2026-10-12T08:00:00Z')
    const { service, query } = make({
      failed: [
        { data: { workspaceId: OTHER_WS, userId: OWNER, consultantId: 'x1' }, failedReason: 'r', finishedOn: failedAt },
        { data: { workspaceId: WS, userId: OWNER, consultantId: 'c2' }, failedReason: 'r', finishedOn: failedAt },
      ],
      rows: [{ id: 'c2', full_name: 'Marie', filename: null, cv_auto_read_at: '2026-10-12T09:00:00Z' }],
    })
    const status = await service.status(WS)
    expect(status.failed).toEqual([])
    const lookup = query.mock.calls.find(call => !String(call[0]).includes('since_cte'))
    expect(lookup?.[1]).toEqual([WS, ['c2']])
  })

  it('« Relancer les échecs » remet en file CHAQUE fiche en échec de l’espace, au nom de son propriétaire', async () => {
    const failedAt = Date.parse('2026-10-12T08:00:00Z')
    const { service, enqueue } = make({
      failed: [
        { data: { workspaceId: WS, userId: OWNER, consultantId: 'c1' }, failedReason: 'r', finishedOn: failedAt },
        { data: { workspaceId: OTHER_WS, userId: OWNER, consultantId: 'x1' }, failedReason: 'r', finishedOn: failedAt },
      ],
      rows: [{ id: 'c1', full_name: null, filename: 'a.pdf', cv_auto_read_at: null }],
    })
    expect(await service.retryFailed(WS)).toEqual({ queued: 1 })
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith(WS, OWNER, 'c1')
  })

  it('Théo 23/10 — « CV lu = fiche qualifiée » : les CV lus de la semaine, nommés, jamais comptés sans nom', async () => {
    const { service, query } = make({
      week: [
        { full_name: 'Nadia Benali', total: '3' },
        { full_name: 'Camille Roussel', total: '3' },
        { full_name: 'Anthony Vasseur', total: '3' },
      ],
    })
    const status = await service.status(WS)
    expect(status.readThisWeek).toEqual({ count: 3, names: ['Nadia Benali', 'Camille Roussel', 'Anthony Vasseur'] })
    const call = query.mock.calls.find(([sql]) => sql.includes('read_this_week'))
    expect(call?.[1]).toEqual([WS])
  })

  it('sait dire NON : aucun CV lu cette semaine → null, jamais « 0 CV lus »', async () => {
    const { service } = make({ week: [] })
    expect((await service.status(WS)).readThisWeek).toBeNull()
  })
})
