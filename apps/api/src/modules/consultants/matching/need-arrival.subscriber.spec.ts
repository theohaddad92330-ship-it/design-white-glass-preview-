import type { DataSource, InsertEvent, QueryRunner, TransactionCommitEvent, TransactionRollbackEvent } from 'typeorm'
import { ProjectNeedEntity } from '../../../database/entities/project-need.entity'
import type { AutoNeedMatchingService } from './auto-need-matching.service'
import { NeedArrivalSubscriber } from './need-arrival.subscriber'

function need(id: string): ProjectNeedEntity {
  return Object.assign(new ProjectNeedEntity(), {
    id,
    workspace_id: 'w-1',
    owner_id: null,
    skills: [],
    seniority: null,
    location: null,
    remote: null,
    start_on: null,
  })
}

function harness() {
  const subscribers: unknown[] = []
  const dataSource = { subscribers } as unknown as DataSource
  const onNeedCreated = jest.fn(async () => 'queued' as const)
  const autoMatching = { onNeedCreated } as unknown as AutoNeedMatchingService
  const subscriber = new NeedArrivalSubscriber(dataSource, autoMatching)
  return { subscriber, subscribers, onNeedCreated }
}

const runner = (active: boolean) => ({ isTransactionActive: active }) as unknown as QueryRunner
const inserted = (entity: ProjectNeedEntity, queryRunner: QueryRunner) =>
  ({ entity, queryRunner }) as unknown as InsertEvent<ProjectNeedEntity>

describe('NeedArrivalSubscriber — TOUTE insertion d’un besoin par l’ORM est une arrivée (c93)', () => {
  it('s’inscrit auprès de la source de données — sans cela, rien ne l’appelle', () => {
    const { subscriber, subscribers } = harness()
    expect(subscribers).toContain(subscriber)
    expect(subscriber.listenTo()).toBe(ProjectNeedEntity)
  })

  it('dans une transaction : RIEN avant le commit (le job lirait un besoin encore invisible)', async () => {
    const { subscriber, onNeedCreated } = harness()
    const qr = runner(true)
    subscriber.afterInsert(inserted(need('n-1'), qr))
    subscriber.afterInsert(inserted(need('n-2'), qr))
    expect(onNeedCreated).not.toHaveBeenCalled()

    subscriber.afterTransactionCommit({ queryRunner: qr } as TransactionCommitEvent)
    await new Promise(resolve => setImmediate(resolve))
    expect(onNeedCreated.mock.calls.map(call => ((call as unknown[])[0] as ProjectNeedEntity).id)).toEqual([
      'n-1',
      'n-2',
    ])
  })

  it('une transaction annulée n’annonce AUCUN besoin', async () => {
    const { subscriber, onNeedCreated } = harness()
    const qr = runner(true)
    subscriber.afterInsert(inserted(need('n-1'), qr))
    subscriber.afterTransactionRollback({ queryRunner: qr } as TransactionRollbackEvent)
    subscriber.afterTransactionCommit({ queryRunner: qr } as TransactionCommitEvent)
    await new Promise(resolve => setImmediate(resolve))
    expect(onNeedCreated).not.toHaveBeenCalled()
  })

  it('hors transaction : l’insertion est déjà visible, l’arrivée part tout de suite', async () => {
    const { subscriber, onNeedCreated } = harness()
    subscriber.afterInsert(inserted(need('n-1'), runner(false)))
    await new Promise(resolve => setImmediate(resolve))
    expect(onNeedCreated).toHaveBeenCalledTimes(1)
  })

  it('une automatisation en panne ne remonte JAMAIS dans l’écriture du besoin', async () => {
    const { subscriber, onNeedCreated } = harness()
    onNeedCreated.mockRejectedValueOnce(new Error('boom') as never)
    expect(() => subscriber.afterInsert(inserted(need('n-1'), runner(false)))).not.toThrow()
    await new Promise(resolve => setImmediate(resolve))
  })
})
