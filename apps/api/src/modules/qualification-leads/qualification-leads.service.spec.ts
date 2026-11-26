import type { Repository } from 'typeorm'
import type { QualificationLeadDecisionEntity } from '../../database/entities/qualification-lead-decision.entity'
import { QualificationLeadsService } from './qualification-leads.service'

/**
 * #2172.42 → .49 / .54 — CE QU'UNE DÉCISION ÉCRIT, ET CE QU'ELLE N'ÉCRIT PAS.
 *
 * Les deux gardes de ce service sont des ABSENCES, donc elles se testent en
 * regardant ce qui part vers la base : une portée d'espace, un motif, une date —
 * et aucun chemin vers la donnée marché.
 */

function repoDouble() {
  const saved: Record<string, unknown>[] = []
  const repo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row)
      return { id: 'dec-1', ...row }
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
  }
  return { repo: repo as unknown as Repository<QualificationLeadDecisionEntity>, spy: repo, saved }
}

const NOW = new Date('2026-09-15T00:00:00.000Z')

describe('QualificationLeadsService — écarter une piste', () => {
  it('écrit le motif, la date et la portée `workspace` — jamais autre chose', async () => {
    const { repo, saved } = repoDouble()
    const service = new QualificationLeadsService(repo)

    await service.decide(
      'ws-1',
      'acc-1',
      'lead-1',
      'user-1',
      { decision: 'dismissed', reason: 'no_access', note: null, snoozed_until: null },
      NOW,
    )

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      lead_key: 'lead-1',
      decision: 'dismissed',
      reason: 'no_access',
      scope: 'workspace',
      decided_by: 'user-1',
      snoozed_until: null,
    })
  })

  it('SAIT DIRE NON : une portée envoyée par l’appelant est ignorée, pas obéie', async () => {
    const { repo, saved } = repoDouble()
    const service = new QualificationLeadsService(repo)

    await service.decide(
      'ws-1',
      'acc-1',
      'lead-1',
      'user-1',
      // Un appelant qui aurait contourné la validation : le service pose la
      // portée lui-même, il ne la lit pas.
      { decision: 'dismissed', reason: 'out_of_target', note: null, snoozed_until: null, scope: 'global' } as never,
      NOW,
    )

    expect(saved[0]?.scope).toBe('workspace')
  })

  it('n’écrit RIEN dans la donnée marché — le service n’a qu’un dépôt, celui des décisions', () => {
    // La garde la plus forte est structurelle : il n'existe aucun chemin
    // d'écriture vers la mémoire marché, parce qu'il n'y a pas de code pour.
    expect(QualificationLeadsService.length).toBe(1)
    const source = QualificationLeadsService.toString()
    expect(source.length).toBeGreaterThan(50)
    expect(source).not.toMatch(/market|marche|marché/i)
  })

  it('ne SUPPRIME jamais : reprendre une piste écartée retire la décision, pas la piste', async () => {
    const { repo, spy } = repoDouble()
    const service = new QualificationLeadsService(repo)

    await service.reopen('ws-1', 'lead-1')

    expect(spy.delete).toHaveBeenCalledWith({ workspace_id: 'ws-1', lead_key: 'lead-1' })
    // Rien d'autre n'est touché : le service ne connaît pas `opportunities`.
    expect(spy.save).not.toHaveBeenCalled()
  })

  it('une mise en veille porte son échéance et aucun motif', async () => {
    const { repo, saved } = repoDouble()
    const service = new QualificationLeadsService(repo)

    await service.decide(
      'ws-1',
      'acc-1',
      'lead-2',
      'user-1',
      { decision: 'snoozed', reason: null, note: null, snoozed_until: '2026-10-01T00:00:00.000Z' },
      NOW,
    )

    expect(saved[0]).toMatchObject({ decision: 'snoozed', reason: null, snoozed_until: '2026-10-01T00:00:00.000Z' })
  })

  it('la lecture est bornée à l’espace ET au compte', async () => {
    const { repo, spy } = repoDouble()
    const service = new QualificationLeadsService(repo)

    await service.decisions('ws-1', 'acc-1')

    expect(spy.find).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', account_id: 'acc-1' } })
  })
})
