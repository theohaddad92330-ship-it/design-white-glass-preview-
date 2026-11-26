import { describe, expect, it } from 'vitest'
import { effectsForMove, splitStageActions, SERVER_PERFORMED_STAGE_ACTIONS } from './stage-move.js'

describe('les cases du panneau d’effets disent QUI fait le geste', () => {
  it('#4195 — « créer la mission » n’est plus une case : c’est un effet annoncé', () => {
    const effects = effectsForMove('negotiation', 'won')
    expect(effects.proposals.find(item => item.key === 'create_mission')).toBeUndefined()
    expect(effects.createsMission).toBe(true)
    expect(effectsForMove('qualified', 'negotiation').createsMission).toBe(false)
  })

  it('un geste qui sort de l’outil reste toujours à la main de l’utilisateur', () => {
    for (const stage of ['won', 'confirmed', 'negotiation', 'profiles_submitted'] as const) {
      for (const proposal of effectsForMove('qualified', stage).proposals) {
        if (proposal.external) expect(proposal.performedBy).toBe('user')
        // Et la règle d'origine tient : jamais pré-coché.
        if (proposal.external) expect(proposal.checked).toBe(false)
      }
    }
  })

  it('toute action déclarée « server » a bien une entrée dans la liste exécutable', () => {
    const stages = [
      'detected',
      'potential',
      'qualified',
      'confirmed',
      'profiles_submitted',
      'negotiation',
      'won',
      'lost',
      'dormant',
    ] as const
    for (const stage of stages) {
      for (const proposal of effectsForMove('qualified', stage).proposals) {
        if (proposal.performedBy === 'server') {
          expect(SERVER_PERFORMED_STAGE_ACTIONS as readonly string[]).toContain(proposal.key)
        }
      }
    }
  })
})

describe('splitStageActions', () => {
  it('sépare ce que le serveur fait de ce qui reste à faire', () => {
    expect(splitStageActions(['create_mission', 'prepare_onboarding', 'tell_consultant'])).toEqual({
      // #4339.2 — `prepare_onboarding` est désormais exécutée ; `tell_consultant` (retirée) ressort en « à faire ».
      server: ['create_mission', 'prepare_onboarding'],
      pending: ['tell_consultant'],
    })
  })

  it('range une clé inconnue dans « à faire » plutôt que de la jeter', () => {
    // Un client plus récent que le serveur ne doit pas voir une case
    // disparaître en silence : elle ressort en rappel.
    expect(splitStageActions(['clef_du_futur']).pending).toEqual(['clef_du_futur'])
  })

  it('ne rend rien quand rien n’a été coché', () => {
    expect(splitStageActions([])).toEqual({ server: [], pending: [] })
  })
})
