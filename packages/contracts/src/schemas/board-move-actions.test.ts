import { describe, expect, it } from 'vitest'
import {
  BOARD_CAPABILITIES,
  SERVER_PERFORMED_BOARD_ACTIONS,
  defaultCheckedKeys,
  effectsForBoardMove,
  splitBoardActions,
  type MissionBoardColumn,
} from './board-move.js'
import { MISSION_BOARD_COLUMNS } from './mission-board.js'

/**
 * Les cases du board Missions disent QUI fait le geste (arbitrage du 26/08/2026).
 *
 * Le défaut corrigé : `moveBoardCard` rendait `acceptedActions` tel quel et
 * n'exécutait rien. Vingt cases qu'on cochait et qui ne faisaient rien — le
 * défaut exact que le pipe des Projets avait corrigé un mois plus tôt.
 */
const COLUMNS = MISSION_BOARD_COLUMNS as readonly MissionBoardColumn[]

describe('board — chaque proposition déclare son exécutant', () => {
  it('toutes les propositions portent `performedBy`', () => {
    for (const to of COLUMNS) {
      for (const proposal of effectsForBoardMove('en_cours', to).proposals) {
        expect(['server', 'user']).toContain(proposal.performedBy)
      }
    }
  })

  it('un geste qui SORT de l’outil reste toujours à la main de l’utilisateur', () => {
    // Un message client qui partirait sur un glisser-déposer est la seule faute
    // de cet écran qui ne se rattrape pas.
    for (const to of COLUMNS) {
      for (const proposal of effectsForBoardMove('en_cours', to).proposals) {
        if (proposal.external) {
          expect(proposal.performedBy).toBe('user')
          expect(proposal.defaultChecked).toBe(false)
        }
      }
    }
  })

  it('toute action déclarée « server » a bien une entrée dans la liste exécutable', () => {
    // Sinon elle retomberait en rappel sans que personne s'en aperçoive : la
    // case aurait de nouveau l'air de faire quelque chose.
    for (const to of COLUMNS) {
      for (const proposal of effectsForBoardMove('en_cours', to).proposals) {
        if (proposal.performedBy === 'server') {
          expect(SERVER_PERFORMED_BOARD_ACTIONS as readonly string[]).toContain(proposal.key)
        }
      }
    }
  })

  it('et réciproquement : aucune clé exécutable ne dort hors du catalogue', () => {
    const declared = new Set<string>()
    for (const to of COLUMNS) {
      for (const proposal of effectsForBoardMove('en_cours', to).proposals) {
        if (proposal.performedBy === 'server') declared.add(proposal.key)
      }
    }
    expect([...declared].sort()).toEqual([...SERVER_PERFORMED_BOARD_ACTIONS].sort())
  })

  it('« écarter le compte » et « point à J+30 » sont les deux gestes du serveur', () => {
    expect([...SERVER_PERFORMED_BOARD_ACTIONS].sort()).toEqual(['park_account', 'plan_j30_review'])
  })

  it('un REX reste à l’humain — un résumé fabriqué serait de la donnée inventée', () => {
    for (const key of ['collect_rex', 'collect_loss_rex']) {
      expect(SERVER_PERFORMED_BOARD_ACTIONS as readonly string[]).not.toContain(key)
    }
  })
})

describe('splitBoardActions', () => {
  it('sépare ce que le serveur fait de ce qui reste à faire', () => {
    expect(splitBoardActions(['park_account', 'collect_loss_rex'])).toEqual({
      server: ['park_account'],
      pending: ['collect_loss_rex'],
    })
  })

  it('range une clé inconnue dans « à faire » plutôt que de la jeter', () => {
    // Un client plus récent que le serveur ne doit pas voir une case disparaître
    // en silence : c'est ce qui a rendu le défaut d'origine invisible.
    expect(splitBoardActions(['clef_du_futur']).pending).toEqual(['clef_du_futur'])
  })

  it('ne rend rien quand rien n’a été coché', () => {
    expect(splitBoardActions([])).toEqual({ server: [], pending: [] })
  })
})

describe('board — une capacité absente ne pré-coche rien', () => {
  it('« point à J+30 » n’est pas pré-coché sans agenda connecté', () => {
    // Il est exécuté par le serveur : le pré-cocher sans agenda ferait échouer
    // une action à chaque déplacement de carte.
    const { proposals } = effectsForBoardMove('gagnee', 'en_cours')
    expect(defaultCheckedKeys(proposals, [])).not.toContain('plan_j30_review')
    expect(defaultCheckedKeys(proposals, ['calendar'])).toContain('plan_j30_review')
  })

  it('les capacités déclarées restent celles que le produit sait vérifier', () => {
    expect([...BOARD_CAPABILITIES]).toEqual(['mailbox', 'calendar', 'crm'])
  })
})
