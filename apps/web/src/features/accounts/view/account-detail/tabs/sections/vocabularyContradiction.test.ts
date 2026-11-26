import { describe, expect, it } from 'vitest'
import { contradictsVerifiedContacts, dropContradictedVocabularyText } from './vocabularyContradiction'

/**
 * #3709 (recette Arquus 07/10) — « Aucun contact direct vérifié… » à côté de
 * « 32 vérifiés » : phrase du modèle, contredite par le décompte réel.
 */
describe('contradictsVerifiedContacts', () => {
  const SENTENCES = [
    'Aucun contact direct vérifié chez ARQUUS à ce stade.',
    'Il n’y a pas de contact vérifié chez ARQUUS.',
    'aucun contact verifie',
    'No verified contact at ARQUUS.',
  ]

  it.each(SENTENCES)('« %s » est contredite dès qu’un contact est vérifié', sentence => {
    expect(contradictsVerifiedContacts(sentence, 32)).toBe(true)
  })

  it('avec zéro contact vérifié, la phrase reste vraie et s’affiche', () => {
    expect(contradictsVerifiedContacts(SENTENCES[0], 0)).toBe(false)
  })

  it('une phrase sans cette affirmation n’est jamais touchée', () => {
    expect(contradictsVerifiedContacts('Programme d’armement terrestre', 32)).toBe(false)
    expect(contradictsVerifiedContacts('Contacts vérifiés : 32', 32)).toBe(false)
    expect(contradictsVerifiedContacts(undefined, 32)).toBe(false)
  })
})

describe('dropContradictedVocabularyText', () => {
  it('vide le champ contredit, garde le terme et l’autre champ', () => {
    const term = {
      term: 'Contact direct',
      kind: 'entity',
      meaning: 'Aucun contact direct vérifié.',
      commercialWhy: 'Ouvre le compte',
    }
    expect(dropContradictedVocabularyText(term, 3)).toEqual({ ...term, meaning: '' })
  })

  it('rend le même objet quand rien n’est contredit', () => {
    const term = { term: 'Titan', kind: 'program', meaning: 'Programme blindé' }
    expect(dropContradictedVocabularyText(term, 3)).toBe(term)
  })
})
