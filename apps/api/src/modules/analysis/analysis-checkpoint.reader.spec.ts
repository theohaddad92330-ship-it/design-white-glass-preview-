import { Repository } from 'typeorm'
import { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import { OutboxEntity } from '../../database/entities/outbox.entity'

/**
 * Le checkpoint de reprise est ce qui décide si un run REPREND (et saute les
 * phases déjà payées) ou REPART de zéro. Lu trop large, il transforme toute
 * ré-analyse d'un compte déjà analysé en no-op : le graphe saute les quatre
 * phases, `plan` n'écrit rien, et le compte reste bloqué en `analyzing` pendant
 * que le run s'annonce en succès.
 *
 * La borne est DOUBLE, et il en faut bien deux : le JOB (les tentatives BullMQ
 * d'un même job reprennent — auto-guérison après un flux coupé) ET le RUN
 * COURANT (le `jobId` est déterministe : même utilisateur + même entreprise =
 * même identifiant, donc à lui seul il ne distingue pas la relance d'aujourd'hui
 * du run du mois dernier).
 */
describe('AnalysisCheckpointReader', () => {
  let reader: AnalysisCheckpointReader
  let where: jest.Mock
  let andWhere: jest.Mock
  let getRawMany: jest.Mock

  /** Frontière du run courant — toute lecture en est bornée. */
  const RUN_STARTED_AT = new Date('2026-08-16T08:00:00.000Z')

  beforeEach(() => {
    getRawMany = jest.fn().mockResolvedValue([])
    andWhere = jest.fn().mockReturnThis()
    where = jest.fn().mockReturnThis()
    const qb = {
      select: jest.fn().mockReturnThis(),
      where,
      andWhere,
      getRawMany,
    }
    const outbox = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<OutboxEntity>
    reader = new AnalysisCheckpointReader(outbox)
  })

  /** Tous les prédicats passés au query builder, aplatis. */
  const predicates = (): string => [...where.mock.calls, ...andWhere.mock.calls].map(call => String(call[0])).join(' ')

  /** Les paramètres liés, fusionnés. */
  const bindings = (): Record<string, unknown> =>
    Object.assign({}, ...[...where.mock.calls, ...andWhere.mock.calls].map(call => call[1] ?? {}))

  it('ne compte que les phases du job courant, jamais tout l’historique du compte', async () => {
    await reader.loadCompletedPhases('acc-1', 'job-42', RUN_STARTED_AT)

    expect(predicates()).toContain('jobId')
    expect(bindings()).toMatchObject({ accountId: 'acc-1', jobId: 'job-42' })
  })

  it('ne compte que les phases du RUN courant — une relance n’hérite pas du run précédent', async () => {
    // Le `jobId` étant déterministe, c'est cette borne-ci (et elle seule) qui
    // sépare deux analyses successives de la même entreprise. Sans elle, une
    // relance s'affichait à 100 % dès la première seconde et sautait ses trois
    // premières phases.
    await reader.loadCompletedPhases('acc-1', 'job-42', RUN_STARTED_AT)

    expect(predicates()).toContain('created_at')
    expect(bindings()).toMatchObject({ since: RUN_STARTED_AT })
  })

  it('remonte les phases reprenables du job', async () => {
    getRawMany.mockResolvedValueOnce([{ phase: 'research' }, { phase: 'contacts' }])

    const done = await reader.loadCompletedPhases('acc-1', 'job-42', RUN_STARTED_AT)

    expect(done).toEqual(new Set(['research', 'contacts']))
  })

  it('écarte `plan` : Phase 4 bascule le compte en `completed`, elle ne se reprend pas', async () => {
    getRawMany.mockResolvedValueOnce([{ phase: 'research' }, { phase: 'plan' }])

    const done = await reader.loadCompletedPhases('acc-1', 'job-42', RUN_STARTED_AT)

    expect(done).toEqual(new Set(['research']))
  })

  it('sans job, ne reprend RIEN plutôt que de reprendre le compte entier', async () => {
    // Le repli sûr est de repartir à neuf : un run neuf re-paie ses phases, un
    // run qui saute tout ne produit rien du tout.
    getRawMany.mockResolvedValueOnce([{ phase: 'research' }, { phase: 'contacts' }])

    const done = await reader.loadCompletedPhases('acc-1', '', RUN_STARTED_AT)

    expect(done).toEqual(new Set())
    expect(getRawMany).not.toHaveBeenCalled()
  })

  it('sans frontière de run, ne reprend RIEN non plus — « je ne sais pas » n’est pas « rien de fait »', async () => {
    // Même arbitrage que ci-dessus, appliqué à l'autre borne : une frontière
    // illisible (ligne de run absente, lecture en échec) ne doit pas rouvrir
    // tout l'historique du couple (compte, job).
    getRawMany.mockResolvedValueOnce([{ phase: 'research' }, { phase: 'contacts' }])

    const done = await reader.loadCompletedPhases('acc-1', 'job-42', null)

    expect(done).toEqual(new Set())
    expect(getRawMany).not.toHaveBeenCalled()
  })
})
