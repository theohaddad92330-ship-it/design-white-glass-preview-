import { describe, expect, it } from 'vitest'
import { PROJECT_STAGES } from './project.js'
import {
  effectsForMove,
  SERVER_PERFORMED_STAGE_ACTIONS,
  STAGE_ACTION_TASKS,
  stageActionExecution,
} from './stage-move.js'

// #4339.2 — une proposition cochée produit un résultat VISIBLE (tâche datée, brouillon, matching) ou n'existe pas.
const allProposals = () =>
  PROJECT_STAGES.flatMap(stage => effectsForMove('qualified', stage).proposals.map(proposal => ({ stage, proposal })))

describe('chaque proposition du panneau a une exécution réelle (#4339.2)', () => {
  it('aucune proposition n’est un simple rappel : toutes sont exécutées par le serveur', () => {
    for (const { proposal } of allProposals()) {
      expect(proposal.performedBy).toBe('server')
      expect(proposal.execution).toBeDefined()
    }
  })

  it('la liste exécutable est EXACTEMENT les propositions + la signature (rien d’orphelin, rien de manquant)', () => {
    const keys = new Set(allProposals().map(({ proposal }) => proposal.key))
    keys.add('create_mission')
    expect([...SERVER_PERFORMED_STAGE_ACTIONS].sort()).toEqual([...keys].sort())
  })

  it('une tâche porte son texte (titre, objectif, résultat attendu) et une échéance en jours', () => {
    for (const { proposal } of allProposals()) {
      if (proposal.execution.kind !== 'task') continue
      expect(proposal.execution.dueInDays).toBeGreaterThanOrEqual(0)
      const text = STAGE_ACTION_TASKS[proposal.key]
      expect(text?.title.length).toBeGreaterThan(0)
      expect(text?.objective.length).toBeGreaterThan(0)
      expect(text?.expectedResult.length).toBeGreaterThan(0)
    }
  })

  it('le copilote n’envoie jamais : un brouillon n’est pas « externe » et ne se pré-coche pas', () => {
    for (const { proposal } of allProposals()) {
      if (proposal.execution.kind === 'draft') {
        expect(proposal.external).toBe(false)
        expect(proposal.checked).toBe(false)
      }
    }
  })

  it('« Profil présenté » : les quatre propositions de Théo, et les deux vérifications écrites', () => {
    const effects = effectsForMove('confirmed', 'profiles_submitted')
    expect(effects.proposals.map(item => [item.key, item.execution])).toEqual([
      ['verify_profile_sent', { kind: 'task', dueInDays: 1 }],
      ['schedule_interview', { kind: 'task', dueInDays: 2 }],
      ['prepare_follow_up_mail', { kind: 'draft' }],
      ['search_more_profiles', { kind: 'matching' }],
    ])
    expect(effects.checks).toEqual(['at_most_five_profiles', 'none_rejected_here'])
  })

  it('« Proposer des consultants de ton vivier » lance le matching du besoin qualifié', () => {
    expect(stageActionExecution('create_submissions')).toEqual({ kind: 'matching' })
    expect(effectsForMove('qualified', 'confirmed').proposals.map(item => item.key)).toContain('create_submissions')
  })

  it('les propositions sans exécution câblée ont été RETIRÉES, pas laissées en rappel', () => {
    const keys = allProposals().map(({ proposal }) => proposal.key)
    for (const removed of [
      'schedule_followups',
      'prepare_client_message',
      'tell_consultant',
      'ask_budget',
      'create_needs',
      'first_task',
    ]) {
      expect(keys).not.toContain(removed)
    }
  })

  it('une clé inconnue n’a pas d’exécution', () => {
    expect(stageActionExecution('clef_du_futur')).toBeNull()
  })
})
