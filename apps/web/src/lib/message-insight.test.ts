import { describe, expect, it } from 'vitest'
import {
  availableUnusedElements,
  combineAngleWithTone,
  SPECIFICITY_ELEMENT_KINDS,
  type MessageSpecificity,
} from './message-insight'

describe('availableUnusedElements — #1926.30 (message générique)', () => {
  it('exclut les éléments déjà cités ET ceux que le dossier n’alimente pas', () => {
    const specificity: MessageSpecificity = {
      status: 'generique',
      count: 1,
      minimum: 2,
      elements: [{ kind: 'precise_contact', value: 'Camille Martin' }],
      unavailable: ['available_consultant', 'access_path'],
    }

    const result = availableUnusedElements(specificity)

    expect(result).not.toContain('precise_contact')
    expect(result).not.toContain('available_consultant')
    expect(result).not.toContain('access_path')
    // Tout le reste du registre EST disponible et n'a pas été cité.
    expect(result).toEqual(
      SPECIFICITY_ELEMENT_KINDS.filter(
        kind => kind !== 'precise_contact' && kind !== 'available_consultant' && kind !== 'access_path',
      ),
    )
  })

  it('rend une liste vide si tout est soit cité soit indisponible', () => {
    const specificity: MessageSpecificity = {
      status: 'specifique',
      count: SPECIFICITY_ELEMENT_KINDS.length,
      minimum: 2,
      elements: SPECIFICITY_ELEMENT_KINDS.map(kind => ({ kind, value: 'x' })),
      unavailable: [],
    }

    expect(availableUnusedElements(specificity)).toEqual([])
  })
})

describe('combineAngleWithTone — #1926.31', () => {
  it('ajoute l’instruction à l’angle précédent, sans le remplacer', () => {
    expect(combineAngleWithTone('migration cloud', { id: 'tutoiement', instruction: 'tutoiement' })).toBe(
      'migration cloud tutoiement',
    )
  })

  it('garde seulement l’instruction quand aucun angle précédent n’existe', () => {
    expect(combineAngleWithTone('', { id: 'plus_court', instruction: 'plus court' })).toBe('plus court')
  })

  it('ignore les espaces superflus de l’angle précédent', () => {
    expect(combineAngleWithTone('  angle  ', { id: 'plus_direct', instruction: 'ton plus direct' })).toBe(
      'angle ton plus direct',
    )
  })
})
