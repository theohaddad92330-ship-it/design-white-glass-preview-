import { WRITABLE_IMPORT_OBJECTS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { importedObjectQueryPrefixes } from './imported-object-queries'

/**
 * #2958.106 (recette Antoine) — après un import ÉCRIT de 927 contacts,
 * l'annuaire servait encore la liste vide d'avant l'import : rien ne disait au
 * cache que la base avait changé. Chaque objet écrivable nomme ici les listes
 * qui le montrent, pour qu'elles soient relues.
 */
describe('importedObjectQueryPrefixes', () => {
  it('#2958.106 — un import de contacts fait relire l’annuaire', () => {
    expect(importedObjectQueryPrefixes('contact')).toContainEqual(['contacts'])
  })

  it('chaque objet écrivable nomme au moins une liste à relire', () => {
    for (const object of WRITABLE_IMPORT_OBJECTS) {
      expect(importedObjectQueryPrefixes(object).length, object).toBeGreaterThan(0)
    }
  })

  it('un objet non écrit ne fait rien relire', () => {
    expect(importedObjectQueryPrefixes(null)).toEqual([])
    expect(importedObjectQueryPrefixes('activity')).toEqual([])
  })
})
