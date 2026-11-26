/**
 * Recursively rename every object key from camelCase to snake_case.
 *
 * The IA service emits a mix of camelCase (Claude prompt outputs) and
 * snake_case (Pappers Pydantic dumps) inside the analysis blob. We run this
 * pass at the persistence boundary (``accounts.applyResearch``) so the DB
 * row is snake end-to-end, matching the rest of the Postgres schema and the
 * ``@bellum/contracts`` types the web reads.
 *
 * Arrays are walked. Date / Buffer / Map / Set / class instances are left
 * untouched — TypeORM never hands us those in a JSONB column.
 */
export function toSnakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toSnakeCaseKeys)
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[camelToSnake(key)] = toSnakeCaseKeys(v)
    }
    return out
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function camelToSnake(key: string): string {
  // Already snake or screaming-snake — preserve.
  if (!/[A-Z]/.test(key)) return key
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}
