import { describe, expect, it } from 'vitest'
import {
  BOARD_INTAKE_STAGES,
  MISSION_BOARD_COLUMNS,
  MISSION_BOARD_LABELS,
  cardsInColumn,
  columnForMission,
  columnForProject,
  type MissionBoardCard,
} from './mission-board.js'
import { PROJECT_STAGES } from './project.js'
import { missionStatusSchema } from './mission.js'

const card = (over: Partial<MissionBoardCard>): MissionBoardCard => ({
  id: 'c-1',
  source: 'project',
  column: 'gagnee',
  label: 'Migration Cloud',
  accountName: 'ACME',
  originState: 'won',
  ...over,
})

/**
 * Le board Missions à douze colonnes (décision D2).
 *
 * Ce que ces tests protègent n'est pas la table de correspondance — elle se
 * relit — mais la PROPRIÉTÉ qui rend la vue tenable : elle projette, elle ne
 * possède rien. Le jour où quelqu'un ajoutera un état à un projet ou à une
 * mission, la couverture tombera ici plutôt que de laisser une carte
 * disparaître silencieusement du board.
 */
describe('board Missions — projection', () => {
  it('place chaque étape de projet, ou l’écarte explicitement', () => {
    // Aucun `undefined` possible : le jour où une étape est ajoutée au cycle,
    // ce test tombe au lieu de laisser une carte disparaître.
    for (const stage of PROJECT_STAGES) {
      const column = columnForProject(stage)
      expect(column === null || MISSION_BOARD_COLUMNS.includes(column)).toBe(true)
    }
  })

  it('place chaque statut de mission dans une colonne, sans exception', () => {
    for (const status of missionStatusSchema.options) {
      expect(MISSION_BOARD_COLUMNS).toContain(columnForMission(status))
    }
  })

  it('écarte l’entonnoir de détection — sinon le board se noie sous les signaux', () => {
    expect(BOARD_INTAKE_STAGES).toEqual(['detected', 'potential'])
  })

  it('range une mission qui démarre dans « gagnée », pas dans « en cours »', () => {
    // La mission est signée mais personne n'a encore facturé un jour. Les
    // confondre ferait apparaître en production une mission qui n'a pas démarré.
    expect(columnForMission('onboarding')).toBe('gagnee')
    expect(columnForMission('active')).toBe('en_cours')
  })

  it('range une mission suspendue et un projet en sommeil au même endroit', () => {
    expect(columnForMission('paused')).toBe('en_veille')
    expect(columnForProject('dormant')).toBe('en_veille')
  })

  it('range les deux fins de mission dans « terminée » — l’écart se lit sur la carte', () => {
    expect(columnForMission('ended')).toBe('terminee')
    expect(columnForMission('terminated')).toBe('terminee')
  })
})

describe('board Missions — ce qu’une colonne affiche', () => {
  it('montre les MISSIONS avant les projets dans une colonne partagée', () => {
    // Dans « gagnée », une mission signée est plus avancée qu'un projet qui
    // vient de l'être : c'est elle qu'on veut voir en premier.
    const cards = [
      card({ id: 'p', source: 'project' }),
      card({ id: 'm', source: 'mission', originState: 'onboarding' }),
    ]

    expect(cardsInColumn(cards, 'gagnee').map(entry => entry.id)).toEqual(['m', 'p'])
  })

  it('ne mélange pas les colonnes', () => {
    const cards = [card({ id: 'a', column: 'gagnee' }), card({ id: 'b', column: 'perdue' })]

    expect(cardsInColumn(cards, 'perdue').map(entry => entry.id)).toEqual(['b'])
  })

  it('rend une colonne vide sans inventer de carte', () => {
    expect(cardsInColumn([], 'matching')).toEqual([])
  })

  it('garde l’état d’ORIGINE sur chaque carte — c’est ce qui dit où la déplacer', () => {
    // La vue ne possède aucun état : le mouvement se fait sur l'écran qui
    // possède l'objet. Sans l'état d'origine, on ne saurait pas lequel.
    const [only] = cardsInColumn([card({ originState: 'won' })], 'gagnee')
    expect(only?.originState).toBe('won')
  })
})

describe('board Missions — libellés', () => {
  it('nomme les douze colonnes en FR et en EN', () => {
    for (const column of MISSION_BOARD_COLUMNS) {
      expect(MISSION_BOARD_LABELS[column].fr.length).toBeGreaterThan(0)
      expect(MISSION_BOARD_LABELS[column].en.length).toBeGreaterThan(0)
    }
  })

  it('compte bien DOUZE colonnes, sans doublon', () => {
    expect(MISSION_BOARD_COLUMNS).toHaveLength(12)
    expect(new Set(MISSION_BOARD_COLUMNS).size).toBe(12)
  })
})
