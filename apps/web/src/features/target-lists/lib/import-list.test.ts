import type { TargetCandidate } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { IMPORT_LIST_MAX_NAMES, parseImportedNames, pickExactCandidate } from './import-list'

// #2156.55 — « Importer une liste ». Une liste importée référence des fiches
// RÉELLES de l'espace (`addTargetListItemSchema` exige un `ref_id` réel) :
// jamais un nom collé ne devient une fiche inventée. Ces deux fonctions pures
// portent la seule décision qui compte — parser proprement, puis ne matcher
// QUE ce qui est certain — pour que le geste réseau (api.ts) reste un simple
// appelant testé séparément.

function candidate(overrides: Partial<TargetCandidate> = {}): TargetCandidate {
  return { kind: 'account', id: 'acc-1', label: 'Renault', sublabel: null, ...overrides }
}

describe('parseImportedNames — #2156.55', () => {
  it('sépare par ligne ET par virgule, ignore les lignes vides', () => {
    expect(parseImportedNames('Renault\nThales, Orange\n\n  ')).toEqual(['Renault', 'Thales', 'Orange'])
  })

  it('déduplique sans tenir compte de la casse, garde la première graphie', () => {
    expect(parseImportedNames('Renault\nrenault\nRENAULT')).toEqual(['Renault'])
  })

  it('rogne les espaces de chaque nom', () => {
    expect(parseImportedNames('  Renault  ,  Thales  ')).toEqual(['Renault', 'Thales'])
  })

  it('un collage vide ne rend aucun nom', () => {
    expect(parseImportedNames('   \n  \n')).toEqual([])
  })

  it("borne à IMPORT_LIST_MAX_NAMES — un collage massif n'explose pas en appels réseau", () => {
    const many = Array.from({ length: IMPORT_LIST_MAX_NAMES + 20 }, (_, i) => `Compte ${i}`).join('\n')
    expect(parseImportedNames(many)).toHaveLength(IMPORT_LIST_MAX_NAMES)
  })
})

describe('pickExactCandidate — #2156.55', () => {
  it('matche un nom identique, à la casse près', () => {
    const candidates = [candidate({ label: 'Renault' })]
    expect(pickExactCandidate('renault', candidates)).toBe(candidates[0])
  })

  it('ne matche rien si aucun candidat ne porte exactement ce nom', () => {
    const candidates = [candidate({ label: 'Renault Group' })]
    expect(pickExactCandidate('Renault', candidates)).toBeNull()
  })

  it('ne devine jamais entre deux candidats au même nom exact — ambiguïté = pas de match', () => {
    const candidates = [
      candidate({ id: 'acc-1', label: 'Orange' }),
      candidate({ id: 'contact-1', kind: 'contact', label: 'Orange' }),
    ]
    expect(pickExactCandidate('Orange', candidates)).toBeNull()
  })

  it('une liste de candidats vide ne matche rien', () => {
    expect(pickExactCandidate('Renault', [])).toBeNull()
  })
})
