import { describe, expect, it } from 'vitest'
import {
  ROUTE_REGISTRY,
  ROUTE_REMOVAL_CHECKLIST,
  ROUTE_STATUSES,
  ROUTE_STATUS_MEANING,
  routeRegistryEntrySchema,
  routeRemovalIsSafe,
} from './route-registry.js'

describe('ROUTE_STATUSES (#2143.22, épopée #2924)', () => {
  it('porte les SIX statuts nommés par l’issue, dans son ordre', () => {
    expect(ROUTE_STATUSES).toEqual([
      'KEEP_PRIMARY',
      'KEEP_CONTEXTUAL',
      'MERGE',
      'ADMIN_ONLY',
      'ARCHIVE_ROUTE',
      'REMOVE_AFTER_MIGRATION',
    ])
  })

  it('chaque statut a un sens écrit — jamais un code nu', () => {
    for (const status of ROUTE_STATUSES) {
      expect(ROUTE_STATUS_MEANING[status]).toBeTruthy()
    }
  })
})

describe('routeRegistryEntrySchema (#2143.21, épopée #2924)', () => {
  it('EXIGE les neuf champs nommés par l’issue', () => {
    const shape = routeRegistryEntrySchema.shape
    for (const field of [
      'currentName',
      'currentRole',
      'dataUsed',
      'possibleActions',
      'canonicalHomeOf',
      'trafficNote',
      'duplicates',
      'targetDestination',
      'status',
    ]) {
      expect(shape).toHaveProperty(field)
    }
  })

  it('REFUSE une entrée sans rôle actuel — un champ obligatoire ne se devine pas', () => {
    expect(() =>
      routeRegistryEntrySchema.parse({
        path: '/x',
        currentName: 'X',
        dataUsed: ['x'],
        possibleActions: [],
        canonicalHomeOf: null,
        trafficNote: null,
        duplicates: [],
        targetDestination: '/x',
        status: 'KEEP_PRIMARY',
      }),
    ).toThrow()
  })
})

describe('ROUTE_REGISTRY — le registre réel', () => {
  it('chaque ligne du registre est une entrée VALIDE du schéma', () => {
    for (const entry of ROUTE_REGISTRY) {
      expect(() => routeRegistryEntrySchema.parse(entry)).not.toThrow()
    }
  })

  it('aucun chemin en double — un objet, une seule maison canonique (#2143.25)', () => {
    const paths = ROUTE_REGISTRY.map(entry => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  // #2143.2 (second lot, 26/09 nuit) — les quatre sections de NIVEAU
  // SUPÉRIEUR ajoutées : chacune une entrée réelle et VISIBLE de la nav
  // principale (`sections.ts`), classées `KEEP_PRIMARY` comme les six du
  // premier lot.
  it('porte les quatre autres sections de niveau supérieur (second lot, #2924)', () => {
    const byPath = new Map(ROUTE_REGISTRY.map(entry => [entry.path, entry]))
    for (const path of ['/projects', '/consultants', '/missions', '/pilotage']) {
      expect(byPath.get(path)?.status).toBe('KEEP_PRIMARY')
    }
  })
})

describe('ROUTE_REMOVAL_CHECKLIST / routeRemovalIsSafe (#2143.23, épopée #2924)', () => {
  it('porte les SIX vérifications nommées par l’issue', () => {
    expect(ROUTE_REMOVAL_CHECKLIST).toHaveLength(6)
  })

  it('refuse un retrait tant qu’une case n’a pas de réponse écrite — non répondu ≠ sûr', () => {
    const allButOne = Object.fromEntries(ROUTE_REMOVAL_CHECKLIST.slice(0, 5).map(check => [check, false]))
    expect(routeRemovalIsSafe(allButOne)).toBe(false)
  })

  it('refuse un retrait dès qu’une case répond « oui, ça existe » (une raison de garder)', () => {
    const answers = Object.fromEntries(ROUTE_REMOVAL_CHECKLIST.map(check => [check, false]))
    answers.inbound_links = true
    expect(routeRemovalIsSafe(answers)).toBe(false)
  })

  it('autorise un retrait seulement quand les six répondent NON', () => {
    const answers = Object.fromEntries(ROUTE_REMOVAL_CHECKLIST.map(check => [check, false]))
    expect(routeRemovalIsSafe(answers)).toBe(true)
  })
})
