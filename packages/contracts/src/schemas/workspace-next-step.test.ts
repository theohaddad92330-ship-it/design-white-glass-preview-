import { describe, expect, it } from 'vitest'
import { workspaceNextSteps, workspaceProgressSchema } from './workspace-next-step.js'

// #5011.1 / #5011.2 — la suite proposée dépend de l'avancement COMPTÉ de l'espace, et cite le fait.
describe('workspaceNextSteps (#5011)', () => {
  it('espace vide : première étape — analyser un compte ou importer', () => {
    const steps = workspaceNextSteps({ accounts: 0, contacts: 0, actions: 0 })
    expect(steps.map(s => s.kind)).toEqual(['analyze_account', 'import_accounts'])
    expect(steps.every(s => s.fact === 'workspace_no_account')).toBe(true)
  })

  it('comptes sans contact : la suite concrète est de trouver des contacts, le fait porte le compte', () => {
    const steps = workspaceNextSteps({ accounts: 12, contacts: 0, actions: 0 })
    expect(steps).toEqual([{ kind: 'find_contacts', fact: 'workspace_accounts_no_contact', count: 12 }])
  })

  it('contacts sans action : préparer un message, jamais l’envoyer', () => {
    const steps = workspaceNextSteps({ accounts: 12, contacts: 30, actions: 0 })
    expect(steps).toEqual([{ kind: 'prepare_message', fact: 'workspace_contacts_no_action', count: 30 }])
  })

  it('espace avancé : aucune suite d’amorçage inventée', () => {
    expect(workspaceNextSteps({ accounts: 12, contacts: 30, actions: 4 })).toEqual([])
  })

  it('refuse un compte négatif ou fractionnaire', () => {
    expect(workspaceProgressSchema.safeParse({ accounts: -1, contacts: 0, actions: 0 }).success).toBe(false)
    expect(workspaceProgressSchema.safeParse({ accounts: 1.5, contacts: 0, actions: 0 }).success).toBe(false)
  })
})
