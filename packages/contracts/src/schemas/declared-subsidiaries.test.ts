import { describe, expect, it } from 'vitest'
import { joinSubsidiaryNames, parseDeclaredSubsidiaries } from './declared-subsidiaries.js'

/**
 * #219.6 (#3231, lot X50) — la déclaration MANUELLE de filiales : une saisie
 * texte (noms séparés par virgule, point-virgule ou retour à la ligne) devient la
 * liste que les lecteurs de `accounts.subsidiaries` (Laura, mémoire marché)
 * connaissent déjà. Jamais une filiale devinée, jamais un doublon.
 */
describe('parseDeclaredSubsidiaries', () => {
  it('sépare par virgule, point-virgule et retour à la ligne, sans blanc', () => {
    expect(parseDeclaredSubsidiaries('Boursorama, Treezor; Forge\n  Ayvens ')).toEqual([
      'Boursorama',
      'Treezor',
      'Forge',
      'Ayvens',
    ])
  })

  it('dédoublonne sans tenir compte de la casse, en gardant la première graphie', () => {
    expect(parseDeclaredSubsidiaries('Treezor, TREEZOR, treezor ')).toEqual(['Treezor'])
  })

  it('écarte un nom de plus de 200 signes et borne la liste à 30', () => {
    const long = 'x'.repeat(201)
    const many = Array.from({ length: 40 }, (_, i) => `Filiale ${i}`).join(',')
    expect(parseDeclaredSubsidiaries(long)).toEqual([])
    expect(parseDeclaredSubsidiaries(many)).toHaveLength(30)
  })

  it('une saisie vide ou absente est une liste vide, jamais un nom inventé', () => {
    expect(parseDeclaredSubsidiaries('')).toEqual([])
    expect(parseDeclaredSubsidiaries('  ,; ')).toEqual([])
    expect(parseDeclaredSubsidiaries(null)).toEqual([])
    expect(parseDeclaredSubsidiaries(undefined)).toEqual([])
  })
})

describe('joinSubsidiaryNames', () => {
  it('lit les noms, y compris une entrée objet, et ignore le reste', () => {
    expect(joinSubsidiaryNames(['Treezor', { name: 'Forge' }, { legal_name: 'Ayvens' }, 3, null, {}])).toBe(
      'Treezor, Forge, Ayvens',
    )
  })

  it('aucune filiale = null (une absence ne fait pas de ligne)', () => {
    expect(joinSubsidiaryNames([])).toBeNull()
    expect(joinSubsidiaryNames(undefined)).toBeNull()
    expect(joinSubsidiaryNames('pas une liste')).toBeNull()
  })
})
