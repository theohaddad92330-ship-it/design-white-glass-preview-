import { createHash } from 'node:crypto'

/** Empreinte stable des filtres : l'ordre des clés ne change pas le périmètre. */
export function filtersKeyOf(filters: Record<string, unknown>): string {
  const sort = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, inner]) => [key, sort(inner)]),
          )
        : value
  return createHash('sha1')
    .update(JSON.stringify(sort(filters)))
    .digest('hex')
}
