import { describe, expect, it } from 'vitest'
import { splitWhyForDisclosure, detailKindOf } from './reply-disclosure'

describe('splitWhyForDisclosure — la raison courte reste visible, le reste se déplie', () => {
  it('garde le premier paragraphe visible et range la suite', () => {
    expect(splitWhyForDisclosure('Raison courte.\n\nPreuve A.\n\nPreuve B.')).toEqual({
      lead: 'Raison courte.',
      rest: 'Preuve A.\n\nPreuve B.',
    })
  })
  it('un seul paragraphe : rien à déplier', () => {
    expect(splitWhyForDisclosure('Une seule raison.')).toEqual({ lead: 'Une seule raison.', rest: '' })
  })
  it('une liste à puces garde ses trois premières puces visibles', () => {
    const body = '- a\n- b\n- c\n- d\n- e'
    expect(splitWhyForDisclosure(body)).toEqual({ lead: '- a\n- b\n- c', rest: '- d\n- e' })
  })
  it('un corps vide ne produit rien', () => {
    expect(splitWhyForDisclosure('')).toEqual({ lead: '', rest: '' })
  })
})

describe('detailKindOf — seul un intitulé de DÉTAIL se plie, jamais un contenu inconnu', () => {
  it('reconnaît sources, limites, méthode, détail (FR + EN)', () => {
    expect(detailKindOf('Sources')).toBe('sources')
    expect(detailKindOf('Limites de cette analyse')).toBe('limits')
    expect(detailKindOf('Méthode')).toBe('method')
    expect(detailKindOf('Methodology')).toBe('method')
    expect(detailKindOf('Détail')).toBe('detail')
    expect(detailKindOf('Contexte élargi')).toBe('detail')
  })
  it('un intitulé inconnu reste visible (on ne cache pas une information critique)', () => {
    expect(detailKindOf('Cartographie Montpellier')).toBeNull()
    expect(detailKindOf('Comptes à appeler')).toBeNull()
  })
})
