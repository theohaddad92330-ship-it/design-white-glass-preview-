import { describe, expect, it } from 'vitest'
import { AWAITING_TIMESHEET_STATUSES, TIMESHEET_STATUSES } from './mission.js'

/**
 * #4548.2 / #4548.3 / #4548.4 — la décision « neuf statuts, ni `not_due` ni `received` » est GARDÉE.
 *
 * Elle est écrite au docblock de `TIMESHEET_STATUSES` : rien n'écrit aujourd'hui un relevé « pas encore dû »
 * (`statusWithoutRow` rend `expected`) ni « reçu, pas examiné » (c'est `submitted` sans `internal_reviewed_at`,
 * un FAIT déjà porté par sa colonne — le recopier en statut ferait vivre la même information à deux endroits, GA-26).
 * Ajouter l'un des deux sans producteur, c'est du code que personne n'appelle ; l'ajouter AVEC un producteur
 * s'écrit dans l'ordre : contrainte SQL d'abord (GA-11/12), valeur EN FIN d'enum (GA-08), puis cette liste.
 */
describe('TIMESHEET_STATUSES — la décision de #4548', () => {
  it('garde ses neuf valeurs dans leur rang (GA-08) : les ajouts se font EN FIN, jamais au milieu', () => {
    expect([...TIMESHEET_STATUSES]).toEqual([
      'draft',
      'submitted',
      'validated',
      'disputed',
      'expected',
      'missing',
      'not_required',
      'rejected',
      'escalated',
    ])
  })

  it('sait dire NON : ni `not_due` ni `received` n’ont de producteur, donc aucun statut', () => {
    const known = new Set<string>(TIMESHEET_STATUSES)
    expect(known.has('not_due')).toBe(false)
    expect(known.has('received')).toBe(false)
  })

  it('ce qui se relance reste dans l’enum : l’attente ne contient aucun statut inconnu', () => {
    const known = new Set<string>(TIMESHEET_STATUSES)
    for (const status of AWAITING_TIMESHEET_STATUSES) expect(known.has(status)).toBe(true)
  })
})
