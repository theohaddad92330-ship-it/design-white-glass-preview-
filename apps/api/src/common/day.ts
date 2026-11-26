import { dayKey } from '@bellum/contracts'

/**
 * Une colonne SQL `date`, ramenée au `YYYY-MM-DD` que tout le dépôt suppose.
 *
 * **Pourquoi cette fonction existe.** Le pilote `pg` rend une colonne `date`
 * (OID 1082) sous forme d'objet `Date` à minuit LOCAL dès qu'on interroge en
 * SQL brut (`manager.query`), alors que l'hydratation d'entité TypeORM, elle,
 * rend une chaîne. Les deux chemins lisent les mêmes colonnes et n'en rendent
 * pas la même chose — et toutes les annotations de requêtes brutes du dépôt
 * disent `string`. Le 01/09/2026, `POST /needs/:id/match` répondait 500 sur
 * TOUS les besoins portant une date de démarrage : `${row.start_on}T00:00:00Z`
 * composait « Tue Sep 15 2026 00:00:00 GMT+0200 (…)T00:00:00Z », donc
 * `Invalid Date`, donc `RangeError: Invalid time value`.
 *
 * Le jour est lu dans le fuseau du LECTEUR (`dayKey`) et jamais via
 * `toISOString()` : minuit local à Paris est 22 h la veille en UTC, et un
 * démarrage de mission reculé d'un jour est un fait faux.
 *
 * Une valeur illisible rend `null` — « on ne sait pas » — jamais une date de
 * remplissage.
 */
export function asDay(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : dayKey(value)
  // Une chaîne peut arriver déjà en `YYYY-MM-DD` (cast `::text`, entité
  // TypeORM) ou en horodatage complet : on garde le JOUR, sans jamais
  // reconstruire une date — reparser décalerait d'un jour la moitié de l'année.
  if (typeof value === 'string') return value.length > 0 ? value.slice(0, 10) : null
  return null
}
