import { describe, expect, it } from 'vitest'
import { analysisContextFromSearch, startsWithFieldKey, stripFieldKeyPrefix } from './search-deep-link.js'

/**
 * #2162.27 / épopée #2892 — Laura ouvre `/search` avec un preset STRUCTURÉ.
 *
 * Le lien est PLAT (`?preset=signal&signalType=tender&source=…`) : un paramètre
 * par sous-champ, jamais un JSON encodé — c'est la forme que le modèle écrit
 * sans se tromper, et celle que `_deep_link_refusal` vérifie clé par clé côté
 * IA. Ce test tient la LECTURE : ce qui n'appartient pas au preset annoncé ne
 * se glisse pas dans le contexte, une valeur hors liste est jetée, et le
 * routeur (qui analyse les valeurs en JSON : `2026` → nombre) ne perd rien.
 */
describe('analysisContextFromSearch (#2162.27)', () => {
  it('rend le preset structuré avec ses seuls champs', () => {
    expect(
      analysisContextFromSearch({
        company: 'Capgemini',
        preset: 'signal',
        signalType: 'tender',
        source: 'BOAMP',
        implication: 'Refonte du SI RH',
      }),
    ).toEqual({ preset: 'signal', signalType: 'tender', source: 'BOAMP', implication: 'Refonte du SI RH' })
  })

  it('dit NON à un champ qui appartient à un AUTRE preset', () => {
    expect(analysisContextFromSearch({ preset: 'signal', offer: 'Cloud', source: 'Presse' })).toEqual({
      preset: 'signal',
      source: 'Presse',
    })
  })

  it('jette une valeur hors liste plutôt que de la deviner', () => {
    expect(analysisContextFromSearch({ preset: 'signal', signalType: 'rumeur', source: 'Presse' })).toEqual({
      preset: 'signal',
      source: 'Presse',
    })
  })

  it('garde une valeur que le routeur a analysée en nombre', () => {
    expect(analysisContextFromSearch({ preset: 'strategic', potentialVolume: 500, closingHorizon: 2027 })).toEqual({
      preset: 'strategic',
      potentialVolume: '500',
      closingHorizon: '2027',
    })
  })

  it('sans preset, `context` reste le texte libre déjà livré', () => {
    expect(analysisContextFromSearch({ context: '  Pousser notre offre data  ' })).toEqual({
      preset: 'free',
      notes: 'Pousser notre offre data',
    })
    expect(analysisContextFromSearch({ preset: 'free', context: 'Note' })).toEqual({ preset: 'free', notes: 'Note' })
  })

  it('un preset structuré ne lit PAS `context` — il n’a pas de champ libre', () => {
    expect(analysisContextFromSearch({ preset: 'retry', context: 'texte', newAngle: 'Angle data' })).toEqual({
      preset: 'retry',
      newAngle: 'Angle data',
    })
  })

  it('rend null quand le lien ne porte aucun contexte — l’appelant garde son défaut', () => {
    expect(analysisContextFromSearch({ company: 'Acme' })).toBeNull()
    expect(analysisContextFromSearch({ preset: 'inconnu', offer: 'x' })).toBeNull()
    expect(analysisContextFromSearch({ context: '   ' })).toBeNull()
  })

  it('un preset structuré sans aucun champ s’ouvre quand même, vide et éditable', () => {
    expect(analysisContextFromSearch({ preset: 'incumbent' })).toEqual({ preset: 'incumbent' })
  })
})

/**
 * #4655 — « Ton angle » arrivait prérempli avec `prioritizationReason: Commencer par…` : le gabarit laissait passer
 * la CLÉ qui transporte la phrase. L'utilisateur lit la phrase, jamais le nom du champ.
 */
describe('une valeur ne porte jamais la clé de son champ (#4655)', () => {
  it('retire un préfixe `identifiantCamelCase:` en tête', () => {
    expect(stripFieldKeyPrefix('prioritizationReason: Commencer par vérifier la forme juridique')).toBe(
      'Commencer par vérifier la forme juridique',
    )
    expect(
      analysisContextFromSearch({ preset: 'strategic', prioritizationReason: 'prioritizationReason: Forme juridique' }),
    ).toEqual({ preset: 'strategic', prioritizationReason: 'Forme juridique' })
  })

  it('dit NON à ce qui n’est pas une clé : phrase, heure, mot simple, URL', () => {
    for (const text of ['Priorité: forte', 'Rendez-vous à 10:30', 'https://exemple.fr', 'Commencer par: la forme']) {
      expect(stripFieldKeyPrefix(text)).toBe(text)
    }
  })

  it('startsWithFieldKey reconnaît le gabarit fautif', () => {
    expect(startsWithFieldKey('suggestionReason: x')).toBe(true)
    expect(startsWithFieldKey('Commencer par x')).toBe(false)
  })
})
