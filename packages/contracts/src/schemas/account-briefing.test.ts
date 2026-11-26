import { describe, expect, it } from 'vitest'
import {
  axesLimitedByData,
  BRIEFING_BLOCKS,
  briefingBlockSchema,
  computeAccountScore,
  dishonestBlocks,
  SCORE_AXES,
  SCORE_TOTAL_MAX,
  type BriefingBlock,
  type ScoreAxisResult,
} from './account-briefing.js'

function block(over: Partial<BriefingBlock>): BriefingBlock {
  return briefingBlockSchema.parse({ key: 'bellum_read', ...over })
}

function axis(a: ScoreAxisResult['axis'], points: number): ScoreAxisResult {
  return { axis: a, points, evidence: 'preuve', lever: null }
}

describe('la restitution en huit blocs (§22)', () => {
  it('les huit questions, dans l’ordre où un commercial se les pose', () => {
    expect(BRIEFING_BLOCKS).toHaveLength(8)
    expect(BRIEFING_BLOCKS[0]).toBe('bellum_read')
    // Le huitième est celui qui manquait partout, et le plus important : sans
    // lui, l'utilisateur ne distingue pas ce qu'on n'a pas trouvé de ce qu'on a
    // délibérément écarté.
    expect(BRIEFING_BLOCKS[7]).toBe('excluded')
  })

  it('un bloc vide DOIT dire pourquoi', () => {
    // Un bloc vide sans raison se lit comme un bug ; avec sa raison, il se lit
    // comme une information. La distinction change ce que l'utilisateur fait.
    expect(dishonestBlocks([block({ content: '', missingReason: null })])).toEqual(['bellum_read'])
    expect(dishonestBlocks([block({ content: '', missingReason: 'aucune référence comparable' })])).toEqual([])
    expect(dishonestBlocks([block({ content: 'du contenu', missingReason: null })])).toEqual([])
  })

  it('un bloc ne peut pas être rempli ET justifié comme vide', () => {
    expect(dishonestBlocks([block({ content: 'du contenu', missingReason: 'vide' })])).toEqual(['bellum_read'])
  })
})

describe('le score en cinq axes (§28)', () => {
  it('cinq axes sur 5, soit 25 — le total est DÉRIVÉ, pas recopié', () => {
    // Deux constantes qui se contredisent produiraient un score sur 25 affiché
    // sur 20, et personne ne s'en apercevrait.
    expect(SCORE_AXES).toHaveLength(5)
    expect(SCORE_TOTAL_MAX).toBe(25)
  })

  it('le total est calculé, jamais rendu par le modèle', () => {
    // Un total demandé au modèle peut ne pas être la somme de ses parties, et
    // l'écran affiche alors un nombre cohérent avec lui-même — donc invisible.
    const score = computeAccountScore([
      axis('fit', 2),
      axis('signal', 5),
      axis('accessibility', 3),
      axis('capacity', 1),
      axis('data_quality', 2),
    ])
    expect(score.total).toBe(13)
    expect(score.max).toBe(25)
  })

  it('une note aberrante est ramenée dans ses bornes', () => {
    const score = computeAccountScore([axis('fit', 99), axis('signal', -4)])
    expect(score.axes.map(a => a.points)).toEqual([5, 0])
  })

  it('distingue « compte difficile » de « on ne sait rien » (§27)', () => {
    // Un 4/25 parce que le compte est dur n'appelle pas la même décision qu'un
    // 4/25 parce que le profil ESN manque. Le premier dit « passez votre
    // chemin », le second « complétez votre profil ». Les afficher pareil fait
    // abandonner des comptes pour une mauvaise raison.
    const faibleDonnee = computeAccountScore([
      axis('fit', 1),
      axis('signal', 5),
      axis('accessibility', 2),
      axis('capacity', 3),
      axis('data_quality', 1),
    ])
    expect(axesLimitedByData(faibleDonnee)).toEqual(['fit', 'accessibility'])

    const bonneDonnee = computeAccountScore([
      axis('fit', 1),
      axis('signal', 5),
      axis('accessibility', 2),
      axis('capacity', 3),
      axis('data_quality', 5),
    ])
    // Données solides : le score bas dit quelque chose du COMPTE, pas de nous.
    expect(axesLimitedByData(bonneDonnee)).toEqual([])
  })

  it('la capacité reste jugeable même sans données sur la cible', () => {
    // Elle dépend de l'ESN — sa taille, ses références, sa concurrence — pas de
    // ce qu'on a réussi à collecter sur le compte.
    const score = computeAccountScore([axis('capacity', 2), axis('data_quality', 0)])
    expect(axesLimitedByData(score)).not.toContain('capacity')
  })
})
