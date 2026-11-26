import type { EventBus } from '@bellum/events'
import type { Repository } from 'typeorm'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { OutboxDrainer } from './outbox.drainer'

/**
 * The drainer claims pending rows with `SELECT ... FOR UPDATE SKIP LOCKED`
 * inside a transaction so that, at >1 replica, two drainers can never publish
 * the same row (which would emit each event N times). These specs mock the
 * query runner / query builder and assert the locking semantics + the
 * transaction lifecycle, plus the existing per-row retry/dead behaviour.
 */

function makeRow(overrides: Partial<OutboxEntity> = {}): OutboxEntity {
  const eventId = overrides.event_id ?? 'evt-1'
  return {
    event_id: eventId,
    event_type: 'account.analyzed',
    payload: { eventId },
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    published_at: null,
    ...overrides,
  } as unknown as OutboxEntity
}

function setup(rows: OutboxEntity[]) {
  // Chainable query-builder mock; every builder method returns `this` so the
  // fluent chain resolves, and `getMany` yields the claimed rows.
  const builder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  }
  const txRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    save: jest.fn().mockImplementation(async (r: OutboxEntity) => r),
  }
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: { getRepository: jest.fn().mockReturnValue(txRepo) },
  }
  const repo = {
    manager: { connection: { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } },
  } as unknown as Repository<OutboxEntity>
  const bus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBus
  const drainer = new OutboxDrainer(repo, bus)
  return { drainer, repo, bus, queryRunner, txRepo, builder }
}

describe('OutboxDrainer', () => {
  it('claims pending rows with FOR UPDATE SKIP LOCKED, ordered by created_at', async () => {
    const rows = [makeRow({ event_id: 'a' }), makeRow({ event_id: 'b' })]
    const { drainer, builder } = setup(rows)

    await drainer.drain()

    expect(builder.where).toHaveBeenCalledWith('outbox.status = :status', { status: 'pending' })
    expect(builder.orderBy).toHaveBeenCalledWith('outbox.created_at', 'ASC')
    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write')
    expect(builder.setOnLocked).toHaveBeenCalledWith('skip_locked')
  })

  it('publishes each claimed row exactly once and marks it published (no double-processing)', async () => {
    const rows = [makeRow({ event_id: 'a' }), makeRow({ event_id: 'b' })]
    const { drainer, bus, txRepo } = setup(rows)

    const result = await drainer.drain()

    expect(bus.publish as jest.Mock).toHaveBeenCalledTimes(2)
    expect(bus.publish as jest.Mock).toHaveBeenNthCalledWith(1, rows[0].payload)
    expect(bus.publish as jest.Mock).toHaveBeenNthCalledWith(2, rows[1].payload)
    expect(rows[0].status).toBe('published')
    expect(rows[1].status).toBe('published')
    expect(txRepo.save).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ published: 2, failed: 0 })
  })

  it('runs the claim + publishes inside a single committed transaction', async () => {
    const { drainer, queryRunner } = setup([makeRow()])

    await drainer.drain()

    expect(queryRunner.connect).toHaveBeenCalledTimes(1)
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1)
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled()
    expect(queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it('claims the batch via the transaction-scoped repository, not the shared one', async () => {
    const rows = [makeRow()]
    const { drainer, queryRunner, txRepo } = setup(rows)

    await drainer.drain()

    expect(queryRunner.manager.getRepository).toHaveBeenCalledWith(OutboxEntity)
    expect(txRepo.createQueryBuilder).toHaveBeenCalledWith('outbox')
  })

  it('honours the batch size via take()', async () => {
    const { drainer, builder } = setup([])

    await drainer.drain(17)

    expect(builder.take).toHaveBeenCalledWith(17)
  })

  it('rolls back, rethrows and still releases the runner when the claim query fails', async () => {
    const { drainer, builder, queryRunner } = setup([])
    ;(builder.getMany as jest.Mock).mockRejectedValueOnce(new Error('connection reset'))

    await expect(drainer.drain()).rejects.toThrow('connection reset')

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1)
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled()
    expect(queryRunner.release).toHaveBeenCalledTimes(1)
  })

  // #4616 — `startTransaction()` levait AVANT le `try` : la connexion déjà prise n'était jamais rendue. Toutes
  // les 2 s, sur chaque réplica, pendant une panne : une fuite par tick jusqu'à vider le pool.
  it('#4616 — rend la connexion quand startTransaction() échoue (aucune fuite)', async () => {
    const { drainer, queryRunner } = setup([])
    ;(queryRunner.startTransaction as jest.Mock).mockRejectedValueOnce(new Error('timeout exceeded'))

    await expect(drainer.drain()).rejects.toThrow('timeout exceeded')

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled()
    expect(queryRunner.release).toHaveBeenCalledTimes(1)
  })

  it('a per-row publish failure increments attempts and still commits the rest of the batch', async () => {
    const rows = [makeRow({ event_id: 'ok' }), makeRow({ event_id: 'boom' })]
    const { drainer, bus, queryRunner } = setup(rows)
    ;(bus.publish as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bus down'))

    const result = await drainer.drain()

    expect(result).toEqual({ published: 1, failed: 1 })
    expect(rows[0].status).toBe('published')
    // The failed row stays pending so the next tick retries it.
    expect(rows[1].status).toBe('pending')
    expect(rows[1].attempts).toBe(1)
    expect(rows[1].last_error).toBe('bus down')
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled()
  })

  it('moves a row to dead once it exhausts MAX_ATTEMPTS', async () => {
    const row = makeRow({ event_id: 'zombie', attempts: 9 })
    const { drainer, bus } = setup([row])
    ;(bus.publish as jest.Mock).mockRejectedValue(new Error('still down'))

    const result = await drainer.drain()

    expect(result).toEqual({ published: 0, failed: 1 })
    expect(row.attempts).toBe(10)
    expect(row.status).toBe('dead')
  })
})
