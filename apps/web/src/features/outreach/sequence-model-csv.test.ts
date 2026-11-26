import { describe, expect, it } from 'vitest'
import { modelSteps, modelToCsv, textToBase64 } from './sequence-model-csv'

describe('modelToCsv', () => {
  it('écrit l’en-tête attendu par l’importation puis une ligne par étape rédigée', () => {
    const csv = modelToCsv('Relance comité achats', [
      { day: 0, subject: 'Suite au comité', body: 'Bonjour {{prenom}},' },
      { day: 3, subject: '', body: '' },
      { day: 7, subject: 'Dernier point', body: 'Un mot de plus.' },
    ])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Campagne,Tier,J+n,Objet,Corps')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('"Relance comité achats","","J+0","Suite au comité","Bonjour {{prenom}},"')
    expect(lines[2]).toContain('"J+7"')
  })

  it('double les guillemets et ne perd pas les retours à la ligne d’un message', () => {
    const csv = modelToCsv('A', [{ day: 0, subject: 'Dis "oui"', body: 'ligne 1\nligne 2' }])
    expect(csv).toContain('"Dis ""oui"""')
    expect(csv).toContain('"ligne 1\nligne 2"')
  })

  it('un délai négatif ou décimal devient un jour entier ≥ 0', () => {
    expect(modelToCsv('A', [{ day: -2, subject: '', body: 'x' }])).toContain('"J+0"')
    expect(modelToCsv('A', [{ day: 2.9, subject: '', body: 'x' }])).toContain('"J+2"')
  })
})

describe('modelSteps', () => {
  it('écarte les étapes sans message', () => {
    expect(modelSteps([{ day: 0, subject: 's', body: '  ' }])).toEqual([])
  })
})

describe('textToBase64', () => {
  it('encode de l’UTF-8 (accents compris)', () => {
    expect(atob(textToBase64('é'))).toBe('Ã©')
  })
})
