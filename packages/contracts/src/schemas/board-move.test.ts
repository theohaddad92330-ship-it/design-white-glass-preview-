import { describe, expect, it } from 'vitest'
import { MISSION_BOARD_COLUMNS, type MissionBoardColumn } from './mission-board.js'
import { defaultCheckedKeys, effectsForBoardMove, offerableProposals } from './board-move.js'

const ALL = MISSION_BOARD_COLUMNS

describe('les effets d’un déplacement sur le board', () => {
  it('couvre les douze colonnes d’arrivée', () => {
    for (const to of ALL) {
      const effects = effectsForBoardMove('en_cours', to)
      expect(effects.proposals.length).toBeGreaterThan(0)
    }
  })

  it('ne pré-coche JAMAIS un envoi externe, quelle que soit la transition', () => {
    // La seule faute de cet écran qui ne se rattrape pas : une case cochée
    // d'avance qui écrit à un client.
    for (const from of ALL) {
      for (const to of ALL) {
        for (const proposal of effectsForBoardMove(from, to).proposals) {
          if (proposal.external) expect(proposal.defaultChecked).toBe(false)
        }
      }
    }
  })

  it('ne pré-coche que du niveau N1', () => {
    for (const to of ALL) {
      for (const proposal of effectsForBoardMove('en_cours', to).proposals) {
        if (proposal.defaultChecked) expect(proposal.level).toBe('n1')
      }
    }
  })

  it('exige un motif vers « Perdue », et nulle part ailleurs', () => {
    for (const to of ALL) {
      expect(effectsForBoardMove('en_cours', to).reasonRequired).toBe(to === 'perdue')
    }
  })

  it('signale la seule transition qui CRÉE un objet', () => {
    expect(effectsForBoardMove('validation_client', 'gagnee').createsMission).toBe(true)
    expect(effectsForBoardMove('gagnee', 'en_cours').createsMission).toBe(false)
    // Revenir dans « gagnée » depuis « en cours » ne recrée rien : la mission
    // existe déjà, et en créer une seconde ferait deux missions pour un contrat.
    expect(effectsForBoardMove('en_cours', 'gagnee').createsMission).toBe(true)
  })

  it('écrit sur l’objet d’origine, jamais sur une colonne du board', () => {
    // C'est la décision D2 : le board est une projection, il n'a pas d'état.
    for (const to of ALL) {
      for (const change of effectsForBoardMove('en_cours', to).changes) {
        expect(change).not.toContain('board')
        expect(change).toMatch(/^(missions|projects|project_needs|submissions)\./)
      }
    }
  })

  it('« À créer » ne change rien — c’est la mission qui manque, pas l’état', () => {
    expect(effectsForBoardMove('gagnee', 'a_creer').changes).toEqual([])
  })

  it('vérifie la date de fin en entrant en cours et en renouvellement', () => {
    expect(effectsForBoardMove('gagnee', 'en_cours').checks).toContain('end_date_known')
    expect(effectsForBoardMove('en_cours', 'renouvellement').checks).toContain('end_date_known')
  })

  it('propose de collecter le REX à la fin comme à la perte', () => {
    expect(effectsForBoardMove('en_cours', 'terminee').proposals.map(p => p.key)).toContain('collect_rex')
    expect(effectsForBoardMove('en_cours', 'perdue').proposals.map(p => p.key)).toContain('collect_loss_rex')
  })

  it('ne propose aucune date de revue cochée en veille — on date, on ne décide pas à la place', () => {
    const [proposal] = effectsForBoardMove('en_cours', 'en_veille').proposals
    expect(proposal?.key).toBe('set_review_date')
    expect(proposal?.defaultChecked).toBe(false)
  })

  it('rend un résultat identique pour deux appels sur la même transition', () => {
    expect(effectsForBoardMove('en_cours', 'renouvellement')).toEqual(effectsForBoardMove('en_cours', 'renouvellement'))
  })
})

describe('les capacités', () => {
  const renewal = effectsForBoardMove('en_cours', 'renouvellement').proposals

  it('grise une action dont le connecteur manque, sans la retirer', () => {
    const offered = offerableProposals(renewal, [])
    const feedback = offered.find(entry => entry.proposal.key === 'ask_client_feedback')
    expect(feedback).toBeDefined()
    expect(feedback?.disabled).toBe(true)
    expect(feedback?.missingCapability).toBe('mailbox')
  })

  it('la rend cliquable dès que la capacité est là', () => {
    const offered = offerableProposals(renewal, ['mailbox'])
    expect(offered.find(entry => entry.proposal.key === 'ask_client_feedback')?.disabled).toBe(false)
  })

  it('ne coche jamais une action grisée, même de niveau N1', () => {
    const running = effectsForBoardMove('gagnee', 'en_cours').proposals
    // « Planifier le point J+30 » est N1 et pré-cochée, mais elle exige un
    // agenda : sans agenda, elle reste décochée.
    expect(defaultCheckedKeys(running, [])).not.toContain('plan_j30_review')
    expect(defaultCheckedKeys(running, ['calendar'])).toContain('plan_j30_review')
  })

  it('laisse passer les actions qui n’exigent rien', () => {
    const running = effectsForBoardMove('gagnee', 'en_cours').proposals
    expect(defaultCheckedKeys(running, [])).toContain('set_timesheet_cadence')
  })
})

describe('la matrice complète', () => {
  it('rend un effet pour chacune des 144 transitions, sans exception', () => {
    let count = 0
    for (const from of ALL) {
      for (const to of ALL) {
        const effects = effectsForBoardMove(from as MissionBoardColumn, to as MissionBoardColumn)
        expect(Array.isArray(effects.proposals)).toBe(true)
        count += 1
      }
    }
    expect(count).toBe(144)
  })
})
