import { describe, expect, it } from 'vitest'
import { contactProvenanceKind, contactSourceLabel } from './contactProvenance'

/**
 * La provenance d'un contact, dite dans le vocabulaire CANONIQUE.
 *
 * `contactSourceLabel` nomme la source précise (« Registre officiel »,
 * « Reconstruction IA ») ; elle ne dit pas ce que le commercial doit en FAIRE.
 * Or les gestes diffèrent : une valeur saisie par un collègue se discute avec
 * lui, une valeur d'un registre public se vérifie à la source, une valeur d'un
 * modèle se relit. C'est ce que les cinq catégories de `Provenance` portent, et
 * c'est pourquoi la table de correspondance vit ici — à un seul endroit, pour
 * la table des contacts ET la frise du cycle de vie.
 */
describe('contactProvenanceKind — la catégorie, pas le fournisseur', () => {
  it('range une saisie humaine du côté humain', () => {
    expect(contactProvenanceKind('manual')).toBe('human')
    expect(contactProvenanceKind('import')).toBe('human')
  })

  it('range les fournisseurs d’enrichissement du côté « outil connecté »', () => {
    for (const source of ['apollo', 'dropcontact', 'hunter', 'lusha']) {
      expect(contactProvenanceKind(source), source).toBe('connector')
    }
  })

  it('range les registres et le web ouvert du côté public', () => {
    expect(contactProvenanceKind('pappers')).toBe('public')
    expect(contactProvenanceKind('brave_search')).toBe('public')
  })

  it('range ce qui vient d’un modèle du côté modèle — c’est ce qui se relit', () => {
    expect(contactProvenanceKind('ia_reconstruction')).toBe('model')
    expect(contactProvenanceKind('ai_generated')).toBe('model')
  })

  /**
   * Une source qu'on ne sait pas classer ne reçoit PAS une catégorie par
   * défaut : « source publique » sur une donnée de démonstration serait une
   * provenance inventée, exactement ce que la primitive existe pour empêcher.
   * L'écran retombe alors sur le libellé de la source, qui reste vrai.
   */
  it('rend null plutôt que de deviner une catégorie', () => {
    expect(contactProvenanceKind('demo')).toBeNull()
    expect(contactProvenanceKind('une_source_inconnue')).toBeNull()
  })

  it('le libellé de source reste rendu tel quel pour une source non mappée', () => {
    expect(contactSourceLabel('une_source_inconnue')).toBe('une_source_inconnue')
  })
})
