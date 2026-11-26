import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Un déplacement ne part JAMAIS sans confirmation.
 *
 * Le glisser-déposer est le seul geste du produit qui modifie quelque chose que
 * d'autres personnes ont déjà dans leur propre agenda, et qui leur envoie un
 * courrier. Il se déclenche d'un mouvement de souris, parfois par accident.
 *
 * Trois propriétés tiennent cette porte fermée, et aucune ne se voit à l'écran
 * une fois le mal fait — d'où ce garde sur les sources :
 *
 *  1. la grille ne connaît AUCUN moyen d'écrire : elle appelle `onDragEnd`,
 *     c'est-à-dire qu'elle propose ;
 *  2. l'écriture (`useRescheduleEvent`) n'est appelée que depuis la fonction de
 *     confirmation du dialogue ;
 *  3. un geste qui ne change rien est écarté avant même d'ouvrir la
 *     confirmation — sinon un simple clic, capté comme un déplacement de deux
 *     pixels, préviendrait les invités d'un changement inexistant.
 */

const AGENDA = join(__dirname, '../features/agenda')

const grid = readFileSync(join(AGENDA, 'view/AgendaGrid.tsx'), 'utf8')
const board = readFileSync(join(AGENDA, 'view/AgendaBoard.tsx'), 'utf8')
const drag = readFileSync(join(AGENDA, 'agenda-drag.ts'), 'utf8')

describe('le déplacement d’un rendez-vous passe par une confirmation', () => {
  it('la grille ne sait pas écrire — elle propose', () => {
    // Si la grille importait la mutation, un geste écrirait directement.
    expect(grid).not.toContain('useRescheduleEvent')
    expect(grid).toContain('onDragEnd')
  })

  it('l’écriture n’est déclenchée que depuis la confirmation', () => {
    // `reschedule.mutate` doit vivre dans `confirmMove`, la fonction que le
    // bouton du dialogue appelle — nulle part ailleurs.
    const calls = board.match(/reschedule\.mutate\(/g) ?? []
    expect(calls).toHaveLength(1)
    const confirm = board.slice(board.indexOf('const confirmMove'), board.indexOf('const confirmMove') + 1400)
    expect(confirm).toContain('reschedule.mutate(')
  })

  it('un geste qui ne change rien n’ouvre même pas la confirmation', () => {
    expect(grid).toContain('isNoopDrag')
    expect(drag).toContain('export function isNoopDrag')
  })

  it('le message annonce ce qui S’EST PASSÉ, pas ce qui a été demandé', () => {
    // Sur un agenda qui prévient toujours, annoncer un déplacement discret
    // serait un mensonge que le client corrigerait lui-même.
    expect(board).toContain('result.guestsNotified')
  })

  it('la case reste verrouillée quand la capacité est inconnue', () => {
    // `silentReschedule` absent (déploiement d'API antérieur) doit se lire « on
    // ne sait pas se taire » — le cas prudent.
    expect(board).toContain('silentReschedule === true')
  })
})
