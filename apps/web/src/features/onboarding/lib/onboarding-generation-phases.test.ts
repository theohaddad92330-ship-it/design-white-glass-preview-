import { describe, expect, it } from 'vitest'
import { derivePhaseStatuses, GENERATION_PHASES, stepOfPhase } from './onboarding-generation-phases'

describe('#2089.29/.30 — six phases, dérivées des deux signaux réels', () => {
  it('avant tout départ, les six phases sont « en attente »', () => {
    const statuses = derivePhaseStatuses({ verify: 'idle', buildProfile: 'idle' })
    for (const phase of GENERATION_PHASES) {
      expect(statuses[phase.code]).toBe('pending')
    }
  })

  it('vérification en cours : seule la phase 1 est « en cours », les 5 autres restent en attente', () => {
    const statuses = derivePhaseStatuses({ verify: 'pending', buildProfile: 'idle' })
    expect(statuses.verify).toBe('inProgress')
    expect(statuses.buildProfile).toBe('pending')
    expect(statuses.persist).toBe('pending')
  })

  it('vérification réussie + génération en cours : phase 1 « terminé », 2-6 « en cours » ENSEMBLE', () => {
    const statuses = derivePhaseStatuses({ verify: 'success', buildProfile: 'pending' })
    expect(statuses.verify).toBe('done')
    for (const code of ['buildProfile', 'market', 'offer', 'plan', 'persist'] as const) {
      expect(statuses[code]).toBe('inProgress')
    }
  })

  it('tout réussi : les six phases sont « terminé »', () => {
    const statuses = derivePhaseStatuses({ verify: 'success', buildProfile: 'success' })
    for (const phase of GENERATION_PHASES) {
      expect(statuses[phase.code]).toBe('done')
    }
  })

  it('la vérification échoue : SEULE la phase 1 est en erreur — casse le mapping pour vérifier', () => {
    const statuses = derivePhaseStatuses({ verify: 'error', buildProfile: 'idle' })
    expect(statuses.verify).toBe('error')
    expect(statuses.persist).toBe('pending')
    // Le test suivant DOIT échouer si `buildProfile` passe à tort en erreur
    // alors qu'il n'a jamais démarré.
    expect(statuses.buildProfile).not.toBe('error')
  })

  it('la génération échoue APRÈS une vérification réussie : phase 1 reste « terminé », 2-6 en erreur', () => {
    const statuses = derivePhaseStatuses({ verify: 'success', buildProfile: 'error' })
    expect(statuses.verify).toBe('done')
    expect(statuses.persist).toBe('error')
  })

  it('une phase 2-6 en erreur se relance par `buildProfile`, jamais en rejouant `verify`', () => {
    expect(stepOfPhase('market')).toBe('buildProfile')
    expect(stepOfPhase('persist')).toBe('buildProfile')
    expect(stepOfPhase('verify')).toBe('verify')
  })
})
