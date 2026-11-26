import { describe, expect, it } from 'vitest'
import { getSortDirection, getSortField, toggleSort } from './types'

/**
 * #2627.1 — « trier et filtrer le portefeuille par VERDICT, pas score ».
 * `SortField` ne portait que `name`/`date` : rien ne pouvait mettre les
 * comptes GO en tête. `score` rejoint les deux, avec le même réflexe que
 * `date` — premier clic = le sens qui a du sens en premier (le plus récent
 * pour une date, le meilleur verdict pour un score), pas toujours `asc`.
 */
describe('#2627.1 — SortField porte "score" (le verdict), pas seulement name/date', () => {
  it('un premier clic sur la colonne verdict trie GO en tête (desc)', () => {
    expect(toggleSort('score', 'name_asc')).toBe('score_desc')
  })

  it('un second clic inverse, comme les autres colonnes', () => {
    expect(toggleSort('score', 'score_desc')).toBe('score_asc')
  })

  it('getSortField / getSortDirection lisent "score_desc" comme les autres clés', () => {
    expect(getSortField('score_desc')).toBe('score')
    expect(getSortDirection('score_desc')).toBe('desc')
  })
})
