import { describe, expect, it } from 'vitest'
import { projectChoice } from './project-choice'

const LONG =
  'Industrie mécanique de précision, sous-traitance aéronautique et ferroviaire, sites en Bourgogne-Franche-Comté, renouvellement du parc machines et montée en cadence sur trois ans, recherche de partenaires'

describe('projectChoice — #2575 : le NOM court d’abord, la description ensuite', () => {
  it('coupe une description sectorielle de 400 caractères : titre court + compte, description en secondaire', () => {
    const choice = projectChoice({ company_name: 'Acme Industrie', label: LONG.repeat(2) })
    expect(choice.title.startsWith('Acme Industrie — ')).toBe(true)
    expect(choice.title.length).toBeLessThanOrEqual(80)
    expect(choice.title.endsWith('…')).toBe(true)
    expect(choice.description).toBe(LONG.repeat(2))
  })

  it('un libellé court reste tel quel, sans description doublon', () => {
    const choice = projectChoice({ company_name: 'Acme', label: 'Refonte SI' })
    expect(choice.title).toBe('Acme — Refonte SI')
    expect(choice.description).toBeNull()
  })

  it('sans compte, le titre est le libellé seul', () => {
    expect(projectChoice({ company_name: null, label: 'Refonte SI' }).title).toBe('Refonte SI')
  })
})
