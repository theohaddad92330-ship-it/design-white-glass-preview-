import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2749 → #3773 — la grille de l'accueil prend peu de place, SANS tronquer.
 *
 * #2749 (23/09) : 6 cartes de 4 rangs mesuraient 386 px ; la réponse d'alors était
 * de tronquer le bénéfice à une ligne. #3773 (06/10, Louis) renverse ce moyen :
 * « ne pas tronquer cette phrase au point de rendre la fonction ambiguë » et
 * « les descriptions utiles restent lisibles sans survol ». La place se gagne
 * autrement — QUATRE cartes au plus (`MAX_HOME_SUGGESTIONS`), une seule icône,
 * ni sur-titre en capitales ni éclair décoratif.
 *
 * jsdom ne met rien en page : ce test lit le SOURCE (comme `chat-mise-en-page.
 * test.ts`), commentaires retirés — ce fichier documente le AVANT/APRÈS dans sa
 * propre prose, et une garde qui lirait ses commentaires s'accuserait elle-même.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const GRID = withoutComments(readFileSync(join(__dirname, 'laura-home-grid.tsx'), 'utf8'))
const CHAT = withoutComments(readFileSync(join(__dirname, 'Chat.tsx'), 'utf8'))

describe('la grille de l’accueil (#3773)', () => {
  it('la phrase de la carte n’est JAMAIS tronquée — ni line-clamp ni truncate sur le bénéfice', () => {
    const card = GRID.slice(GRID.indexOf('suggestion.benefit') - 200, GRID.indexOf('suggestion.benefit') + 50)
    expect(card).not.toMatch(/line-clamp|truncate/)
    expect(GRID).not.toContain('line-clamp-1')
  })

  it('aucun sur-titre en capitales : la famille ne se lit plus en premier', () => {
    expect(GRID).not.toContain('uppercase')
    expect(GRID).not.toContain('familyLabel')
  })

  it('une seule icône par carte, et aucun éclair décoratif (Zap)', () => {
    expect(GRID).not.toContain('Zap')
    // #5042 : une seule variante de carte (la tuile « Commencer un travail »), UNE icône — une occurrence.
    expect(GRID.match(/<Icon\b/g)).toHaveLength(1)
  })

  it('la grille n’existe plus qu’à UN endroit : Chat.tsx n’en redéfinit pas une seconde', () => {
    expect(CHAT).not.toMatch(/function HomeSuggestionGrid\(/)
    expect(CHAT).toContain("from './laura-home-grid'")
  })

  it('GA-30 : chaque carte garde son plancher tactile', () => {
    expect(GRID).toContain('min-h-11')
  })
})
