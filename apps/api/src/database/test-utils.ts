/// <reference types="jest" />
/**
 * Test helpers for TypeORM repositories. Keeps specs terse and consistent:
 * every mocked repo method is a `jest.fn()` so spec assertions can check
 * call args without repeating the boilerplate.
 */

type JestFn = ReturnType<typeof jest.fn>
type AsyncJestFn<T = unknown> = jest.Mock<Promise<T>>

type MockQueryBuilder = {
  insert: JestFn
  values: JestFn
  orIgnore: JestFn
  returning: JestFn
  delete: JestFn
  update: JestFn
  set: JestFn
  where: JestFn
  andWhere: JestFn
  distinctOn: JestFn
  leftJoin: JestFn
  innerJoin: JestFn
  select: JestFn
  addSelect: JestFn
  setParameter: JestFn
  groupBy: JestFn
  orderBy: JestFn
  addOrderBy: JestFn
  offset: JestFn
  limit: JestFn
  clone: JestFn
  getCount: AsyncJestFn<number>
  execute: AsyncJestFn
  getMany: AsyncJestFn<unknown[]>
  getOne: AsyncJestFn<unknown>
  getRawMany: AsyncJestFn<unknown[]>
  getRawOne: AsyncJestFn<unknown>
  // #2123.46 — une requête qui rend les ENTITÉS et les colonnes jointes en un
  // seul aller-retour (l'action, plus le nom du compte qu'elle fait avancer).
  getRawAndEntities: AsyncJestFn<{ entities: unknown[]; raw: unknown[] }>
}

export function createMockQueryBuilder(executeResult: unknown = { affected: 1 }): MockQueryBuilder {
  const qb: MockQueryBuilder = {
    insert: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    returning: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    distinctOn: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    setParameter: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    clone: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0) as AsyncJestFn<number>,
    execute: jest.fn().mockResolvedValue(executeResult) as AsyncJestFn,
    getMany: jest.fn().mockResolvedValue([]) as AsyncJestFn<unknown[]>,
    getOne: jest.fn().mockResolvedValue(null) as AsyncJestFn<unknown>,
    getRawMany: jest.fn().mockResolvedValue([]) as AsyncJestFn<unknown[]>,
    getRawOne: jest.fn().mockResolvedValue(null) as AsyncJestFn<unknown>,
    // #2123.46 — une requête qui rend les ENTITÉS et les colonnes jointes en un
    // seul aller-retour (l'action, plus le nom du compte qu'elle fait avancer).
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }) as AsyncJestFn<{
      entities: unknown[]
      raw: unknown[]
    }>,
  }
  qb.insert.mockReturnValue(qb)
  qb.values.mockReturnValue(qb)
  qb.orIgnore.mockReturnValue(qb)
  qb.returning.mockReturnValue(qb)
  qb.delete.mockReturnValue(qb)
  qb.update.mockReturnValue(qb)
  qb.set.mockReturnValue(qb)
  qb.where.mockReturnValue(qb)
  qb.andWhere.mockReturnValue(qb)
  qb.distinctOn.mockReturnValue(qb)
  qb.leftJoin.mockReturnValue(qb)
  qb.innerJoin.mockReturnValue(qb)
  qb.select.mockReturnValue(qb)
  qb.addSelect.mockReturnValue(qb)
  qb.setParameter.mockReturnValue(qb)
  qb.groupBy.mockReturnValue(qb)
  qb.orderBy.mockReturnValue(qb)
  qb.addOrderBy.mockReturnValue(qb)
  qb.offset.mockReturnValue(qb)
  qb.limit.mockReturnValue(qb)
  qb.clone.mockReturnValue(qb)
  return qb
}

export function createMockRepository<T extends object = object>() {
  const qb = createMockQueryBuilder()
  // ``manager.query`` is used by services that drop down to raw SQL
  // (currently AccountsService.findOne / getBranches, which need JSONB
  // operators TypeORM doesn't expose). Default to ``[]`` — specs that
  // care about the rows override this per-test.
  // ``manager.transaction`` : exécute le callback sur ce même manager (pas de vraie
  // transaction) — suffit aux services qui ne s'en servent que pour poser un
  // verrou consultatif (`pg_advisory_xact_lock`) autour d'une section critique.
  const manager: {
    query: AsyncJestFn<unknown[]>
    transaction: jest.Mock
  } = {
    query: jest.fn().mockResolvedValue([]) as AsyncJestFn<unknown[]>,
    transaction: jest.fn(),
  }
  manager.transaction.mockImplementation(async (work: (m: unknown) => Promise<unknown>) => work(manager))
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async (entity: T) => entity),
    upsert: jest.fn().mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] }),
    insert: jest.fn().mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] }),
    create: jest.fn().mockImplementation((entity: Partial<T>) => entity as T),
    merge: jest.fn().mockImplementation((a: Partial<T>, b: Partial<T>) => ({ ...a, ...b })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([]) as AsyncJestFn<unknown[]>,
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    manager,
    _qb: qb,
  }
}

export type MockRepository<T extends object = object> = ReturnType<typeof createMockRepository<T>>
