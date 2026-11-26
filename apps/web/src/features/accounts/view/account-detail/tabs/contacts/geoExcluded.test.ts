import { describe, expect, it } from 'vitest'
import { readGeoExcludedContacts } from './geoExcluded'

// SIMON-FIX S.18 — le motif « Hors du périmètre géographique choisi (France) » posé par l'API
// (`excludeOutsideGeoPerimeter`) doit se LIRE sur l'onglet Contacts, pas rester en base.
const out = (reason: string | null, excluded = true) => ({
  excluded_at: excluded ? '2026-10-19T08:00:00.000Z' : null,
  exclusion_reason: reason,
})

describe('readGeoExcludedContacts', () => {
  it('compte les contacts écartés par le périmètre et garde le périmètre nommé', () => {
    const view = readGeoExcludedContacts([
      out('Hors du périmètre géographique choisi (France)'),
      out('Hors du périmètre géographique choisi (France)'),
      out('hors site (Lyon, Paris)'),
      out('Doublon'),
      out(null, false),
    ])
    expect(view).toEqual({ country: 2, perimeters: ['France'], sites: 1, areas: ['Lyon, Paris'] })
  })

  it('ne dit rien quand aucun contact n’est écarté par le périmètre (jamais « 0 écarté »)', () => {
    expect(readGeoExcludedContacts([out('Doublon'), out(null, false)])).toBeNull()
    expect(readGeoExcludedContacts([])).toBeNull()
  })

  it('un motif de périmètre sur un contact RESTAURÉ (excluded_at nul) ne compte pas', () => {
    expect(readGeoExcludedContacts([out('Hors du périmètre géographique choisi (France)', false)])).toBeNull()
  })
})
