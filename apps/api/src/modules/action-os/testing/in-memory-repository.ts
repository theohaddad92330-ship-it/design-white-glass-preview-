/**
 * Un dépôt TypeORM EN MÉMOIRE pour les specs d'Action OS — qui STOCKE les lignes
 * et applique les contraintes qu'on lui déclare.
 *
 * Pourquoi pas `createMockRepository` : une simulation de soldes, de clics
 * concurrents et de reprises ne prouve rien contre un `jest.fn()` qui rend
 * `{ affected: 1 }` à chaque appel (même raison que
 * `credit-reservation.service.spec.ts`). Ici un `UPDATE … WHERE status =
 * 'planned'` ne touche plus rien au second clic, parce que la ligne a changé.
 *
 * Opérateurs pris en charge : égalité, `In`, `LessThan`, `IsNull`, et un
 * `where` en tableau (OU). Rien d'autre — une spec qui en aurait besoin doit
 * l'ajouter ici, pas contourner.
 */
type Row = Record<string, unknown>
type FindOperatorLike = { _type: string; _value: unknown }

function isOperator(value: unknown): value is FindOperatorLike {
  return typeof value === 'object' && value !== null && '_type' in value
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (isOperator(expected)) {
    switch (expected._type) {
      case 'in':
        return (expected._value as unknown[]).includes(actual)
      case 'lessThan':
        return new Date(actual as string).getTime() < new Date(expected._value as string).getTime()
      case 'isNull':
        return actual === null || actual === undefined
      default:
        throw new Error(`in-memory repository: operator ${expected._type} not supported`)
    }
  }
  return actual === expected
}

function matches(row: Row, where: Row | Row[] | undefined): boolean {
  if (!where) return true
  if (Array.isArray(where)) return where.some(clause => matches(row, clause))
  return Object.entries(where).every(([key, value]) => matchesValue(row[key], value))
}

export class UniqueViolation extends Error {
  readonly code = '23505'
  constructor(constraint: string) {
    super(`duplicate key value violates unique constraint "${constraint}"`)
  }
}

export function inMemoryRepository<T extends object>(
  options: { unique?: { name: string; clash: (rows: readonly T[], candidate: T) => boolean } } = {},
) {
  const rows: T[] = []
  let sequence = 0

  const repo = {
    rows,
    create(entity: Partial<T>): T {
      return { ...entity } as T
    },
    async save(entity: T): Promise<T> {
      const record = entity as Row
      const existing = record['id'] ? rows.find(row => (row as Row)['id'] === record['id']) : undefined
      if (existing) {
        Object.assign(existing, entity)
        return existing
      }
      if (options.unique?.clash(rows, entity)) throw new UniqueViolation(options.unique.name)
      const stored = {
        created_at: new Date(),
        ...record,
        id: (record['id'] as string | undefined) ?? `row-${++sequence}`,
      } as unknown as T
      rows.push(stored)
      return stored
    },
    async findOne(args: { where?: Row | Row[]; order?: Record<string, 'ASC' | 'DESC'> }): Promise<T | null> {
      return (await repo.find(args))[0] ?? null
    },
    async find(
      args: { where?: Row | Row[]; order?: Record<string, 'ASC' | 'DESC'>; take?: number } = {},
    ): Promise<T[]> {
      let found = rows.filter(row => matches(row as Row, args.where))
      const order = args.order ? Object.entries(args.order)[0] : undefined
      if (order) {
        const [key, direction] = order
        found = [...found].sort((a, b) => {
          const left = new Date((a as Row)[key] as string).getTime()
          const right = new Date((b as Row)[key] as string).getTime()
          return direction === 'DESC' ? right - left : left - right
        })
      }
      return args.take ? found.slice(0, args.take) : found
    },
    async update(criteria: string | Row | Row[], patch: Partial<T>): Promise<{ affected: number }> {
      const where = typeof criteria === 'string' ? { id: criteria } : criteria
      let affected = 0
      for (const row of rows) {
        if (!matches(row as Row, where)) continue
        Object.assign(row, patch)
        affected += 1
      }
      return { affected }
    },
  }
  return repo
}
