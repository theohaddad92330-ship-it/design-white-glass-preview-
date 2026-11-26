import { describe, expect, it } from 'vitest'
import { CATALOGUE_KEYS, EDITABLE_CATALOGUES, catalogueDeletion } from './catalogue.js'

/**
 * Les catalogues d'un espace (PDF 2 §11.3).
 *
 * Une seule règle mérite d'être tenue sans base, et c'est celle qui coûte : une
 * valeur qui SERT ne se supprime pas. L'effacer emporterait l'explication de
 * tous les enregistrements qui la portaient — et c'est justement ce qu'on relit
 * six mois plus tard.
 */
describe('catalogueDeletion', () => {
  it('supprime une valeur que personne n’utilise', () => {
    expect(catalogueDeletion({ usage: 0 })).toBe('delete')
  })

  it('DÉSACTIVE une valeur utilisée, même une seule fois', () => {
    expect(catalogueDeletion({ usage: 1 })).toBe('archive')
    expect(catalogueDeletion({ usage: 240 })).toBe('archive')
  })
})

describe('le catalogue des catalogues', () => {
  it('couvre les huit du §11.3', () => {
    expect(CATALOGUE_KEYS).toHaveLength(8)
  })

  it('n’ouvre à l’édition que ce qui appartient vraiment à l’espace', () => {
    // Les motifs de fin de positionnement et les compétences normalisées vivent
    // dans le CODE : ils traversent les espaces, et un indicateur comparable
    // exige un vocabulaire commun.
    expect(EDITABLE_CATALOGUES).not.toContain('submission_outcome_reasons')
    expect(EDITABLE_CATALOGUES).not.toContain('normalised_skills')
    for (const key of EDITABLE_CATALOGUES) expect(CATALOGUE_KEYS).toContain(key)
  })
})
