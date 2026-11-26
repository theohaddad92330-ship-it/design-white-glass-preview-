import { FindOperator } from 'typeorm'

type Row = Record<string, unknown> & { id: string }
type Where = Record<string, unknown>

/** Un opérateur TypeORM (`IsNull`, `Like`) ou une valeur simple, confrontés à la valeur d'une ligne. */
function matchesValue(expected: unknown, actual: unknown): boolean {
  if (expected instanceof FindOperator) {
    const op = expected as FindOperator<unknown>
    if (op.type === 'isNull') return actual === null || actual === undefined
    if (op.type === 'like') return typeof actual === 'string' && actual.startsWith(String(op.value).replace(/%$/, ''))
    throw new Error(`opérateur ${op.type} non géré par le faux dépôt`)
  }
  return expected === actual
}

function matches(row: Row, where: Where | Where[]): boolean {
  const clauses = Array.isArray(where) ? where : [where]
  return clauses.some(clause => Object.entries(clause).every(([key, expected]) => matchesValue(expected, row[key])))
}

/**
 * Un dépôt de connexions EN MÉMOIRE, à l'état réel (insert / update / delete) :
 * les tests « deux consentements ⇒ deux lignes » et « un collègue ne voit rien »
 * ne se prouvent pas avec des mocks qui répondent ce qu'on leur a dicté.
 */
export function makeFakeConnectionRepo() {
  const rows: Row[] = []
  let seq = 0
  return {
    rows,
    findOne: async ({ where }: { where: Where | Where[] }) => rows.find(row => matches(row, where)) ?? null,
    find: async ({ where }: { where: Where | Where[]; order?: Record<string, string> }) =>
      rows.filter(row => matches(row, where)),
    insert: async (values: Record<string, unknown>) => {
      seq += 1
      rows.push({ created_at: new Date(2026, 9, seq), ...values, id: `conn-${seq}` })
    },
    update: async (criteria: { id: string }, patch: Record<string, unknown>) => {
      const row = rows.find(candidate => candidate.id === criteria.id)
      if (row) Object.assign(row, patch)
    },
    delete: async (criteria: { id: string }) => {
      const index = rows.findIndex(candidate => candidate.id === criteria.id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}
