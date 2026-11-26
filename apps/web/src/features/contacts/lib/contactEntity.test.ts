import { describe, expect, it } from 'vitest'
import { accountCrumbLabel, cleanEntity, needsAccountFallback } from './contactEntity'

/**
 * Vu en passant (lot R22, 07/10) — recette : fiche contact /contacts/<id>,
 * fil d'Ariane « N/A » et « Entité : N/A » alors que « Dossiers associés »
 * montrait MUTUELLE UNEO. `contact.entity` est une déclaration libre
 * (#2158.57) : un import qui n'a pas pu la renseigner peut y avoir écrit le
 * bruit littéral « N/A » plutôt qu'un `null` propre.
 */
describe('cleanEntity — jamais le bruit « N/A » rendu tel quel', () => {
  it('rend l’entité déclarée quand elle est utilisable', () => {
    expect(cleanEntity('Filiale Sud')).toBe('Filiale Sud')
  })

  it('traite "N/A" (et variantes de casse/bruit) comme une absence', () => {
    expect(cleanEntity('N/A')).toBeNull()
    expect(cleanEntity('n/a')).toBeNull()
    expect(cleanEntity('Non identifié')).toBeNull()
    expect(cleanEntity('-')).toBeNull()
    expect(cleanEntity('  ')).toBeNull()
    expect(cleanEntity(null)).toBeNull()
  })
})

describe('needsAccountFallback — ne charge le compte QUE quand l’entité ne suffit pas', () => {
  it('pas besoin quand l’entité est utilisable', () => {
    expect(needsAccountFallback('Filiale Sud')).toBe(false)
  })

  it('besoin quand l’entité est absente ou bruit', () => {
    expect(needsAccountFallback(null)).toBe(true)
    expect(needsAccountFallback('N/A')).toBe(true)
  })
})

describe('accountCrumbLabel — le compte associé en repli, jamais « N/A » affiché', () => {
  it('rend l’entité déclarée quand elle est utilisable', () => {
    expect(accountCrumbLabel('Filiale Sud', 'Mutuelle Uneo', 'Compte')).toBe('Filiale Sud')
  })

  it('ignore le bruit « N/A » et prend le compte associé', () => {
    expect(accountCrumbLabel('N/A', 'Mutuelle Uneo', 'Compte')).toBe('Mutuelle Uneo')
  })

  it('sans entité ni compte associé, retombe sur le libellé générique — jamais N/A affiché', () => {
    expect(accountCrumbLabel(null, null, 'Compte')).toBe('Compte')
    expect(accountCrumbLabel('N/A', null, 'Compte')).toBe('Compte')
  })
})
