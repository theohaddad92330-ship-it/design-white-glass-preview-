import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROSPECTING_HARD_FAILURES,
  PROSPECTING_HARD_FAILURE_KEYS,
  hardFailuresToSource,
  prospectingHardFailureSchema,
  sourcedHardFailureCount,
} from './prospecting-hard-failures.js'

/**
 * #3010 (point 9) / #2386 — les QUINZE hard failures, sourcées ou nommées « à sourcer ».
 *
 * Même limite assumée que GA-38 sur `doctrine-registry.ts` : cette garde ne peut pas
 * vérifier qu'un fichier cité empêche VRAIMENT la défaillance nommée (il faudrait une
 * sémantique que seule une relecture humaine porte). Elle vérifie les deux choses
 * qu'une relecture ne fait pas fiablement à chaque tour : que chaque fichier cité
 * EXISTE sur le disque, et que le registre reste honnête — aucune entrée « à sourcer »
 * ne porte de citation, aucune autre n'en manque.
 */

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('hard failures #2386 — complétude', () => {
  it('porte les QUINZE libellés d’#2386, sans doublon', () => {
    expect(PROSPECTING_HARD_FAILURES).toHaveLength(15)
    expect(PROSPECTING_HARD_FAILURES).toHaveLength(PROSPECTING_HARD_FAILURE_KEYS.length)
    expect(new Set(PROSPECTING_HARD_FAILURES.map(entry => entry.key)).size).toBe(15)
  })

  it('chaque entrée respecte son contrat — « à sourcer » ⇔ pas de citation', () => {
    for (const entry of PROSPECTING_HARD_FAILURES) {
      expect(prospectingHardFailureSchema.safeParse(entry).success, entry.key).toBe(true)
    }
  })

  it('les clés suivent l’ORDRE d’#2386, verbatim', () => {
    expect(PROSPECTING_HARD_FAILURES.map(entry => entry.key)).toEqual([...PROSPECTING_HARD_FAILURE_KEYS])
  })
})

describe('hard failures #2386 — les citations existent VRAIMENT', () => {
  it('lit un corpus non vide', () => {
    const cited = PROSPECTING_HARD_FAILURES.filter(entry => entry.citation !== null)
    expect(cited.length).toBeGreaterThan(0)
  })

  it('chaque citation pointe un fichier ouvrable depuis la racine du dépôt', () => {
    const missing = PROSPECTING_HARD_FAILURES.filter(entry => entry.citation !== null)
      .map(entry => entry.citation!.split(':')[0]!)
      .filter(path => !existsSync(join(REPO_ROOT, path)))
    expect(missing).toEqual([])
  })

  it('la garde sait dire NON — un chemin inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/prospecting-hard-failures.ts'))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'apps/api/src/modules/outreach/fichier-qui-nexiste-pas.ts'))).toBe(false)
  })

  it('aucune entrée « a_sourcer » ne porte de citation', () => {
    const lying = hardFailuresToSource().filter(entry => entry.citation !== null)
    expect(lying.map(entry => entry.key)).toEqual([])
  })

  it('toute entrée qui n’est PAS « a_sourcer » porte une citation', () => {
    const uncited = PROSPECTING_HARD_FAILURES.filter(entry => entry.coverage !== 'a_sourcer' && entry.citation === null)
    expect(uncited.map(entry => entry.key)).toEqual([])
  })
})

describe('hard failures #2386 — « à sourcer » ne se compte jamais comme couvert', () => {
  it('reconnaît qu’au moins une entrée reste à sourcer — un registre tout vert serait suspect', () => {
    // Décision Louis 28/09/2026 : un élément sans source est nommé « à sourcer »,
    // jamais inventé pour forcer un total complet.
    expect(hardFailuresToSource().length).toBeGreaterThan(0)
  })

  it('exclut les entrées « a_sourcer » du compte sourcé', () => {
    const toSource = hardFailuresToSource()
    expect(sourcedHardFailureCount()).toBe(PROSPECTING_HARD_FAILURES.length - toSource.length)
    for (const entry of toSource) {
      expect(entry.coverage).toBe('a_sourcer')
    }
  })

  it('distingue « full » et « partial » — une couverture partielle dit ce qui manque', () => {
    const partial = PROSPECTING_HARD_FAILURES.filter(entry => entry.coverage === 'partial')
    expect(partial.length).toBeGreaterThan(0)
    for (const entry of partial) {
      // Une entrée `partial` DOIT nommer ce qu'elle ne couvre pas encore, sinon
      // elle se lit comme une couverture pleine par accident.
      expect(entry.note.length).toBeGreaterThan(40)
    }
  })
})
