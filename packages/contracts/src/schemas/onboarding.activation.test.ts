import { describe, expect, it } from 'vitest'

import { ACTIVATION_STEP_KEYS, activationStepStatusSchema, onboardingActivationSchema } from './onboarding.js'

const VALID = {
  profile_completed: true,
  analysis_launched: true,
  dossier_viewed: false,
  contact_enriched: false,
  message_prepared: false,
  tool_connected: false,
  correction_made: false,
  colleague_invited: 'pending' as const,
  completed_count: 2,
  is_complete: false,
}

describe('onboardingActivationSchema', () => {
  // #2077.6 — le jalon « première correction ». Il ajoute une étape à la FIN
  // (GA-08 : un enum ne perd ni ne réordonne de valeur), et il se dérive d'un
  // fait réel et personnel : un retour structuré posé par CET utilisateur sur
  // un dossier (`account_feedback`). Rien n'est stocké, rien ne peut dériver.
  it('#2077.6 — porte le jalon « première correction »', () => {
    expect(onboardingActivationSchema.shape.correction_made).toBeDefined()
  })

  // #2077.9 — le jalon « premier collègue invité », AJOUTÉ À LA FIN (GA-08).
  it('#2077.9 — porte le jalon « premier collègue invité », ajouté à la fin', () => {
    expect(ACTIVATION_STEP_KEYS.at(-1)).toBe('colleague_invited')
    expect(onboardingActivationSchema.shape.colleague_invited).toBeDefined()
  })

  it('accepts a derived activation state', () => {
    expect(onboardingActivationSchema.parse(VALID)).toEqual(VALID)
  })

  it('exposes one boolean flag per activation step key, SAUF le jalon tri-état #2077.9', () => {
    const shape = onboardingActivationSchema.shape
    for (const key of ACTIVATION_STEP_KEYS) {
      expect(shape[key]).toBeDefined()
    }
    for (const key of ACTIVATION_STEP_KEYS.filter(k => k !== 'colleague_invited')) {
      expect(shape[key].parse(true)).toBe(true)
    }
    expect(ACTIVATION_STEP_KEYS).toHaveLength(8)
  })

  // #2077.9 — un booléen qui ne peut jamais passer à vrai ment : le contrat
  // porte un TROISIÈME état, `not_applicable`, plutôt qu'un booléen figé à faux.
  it('#2077.9 — colleague_invited porte trois états, jamais un booléen', () => {
    expect(activationStepStatusSchema.options).toEqual(['done', 'pending', 'not_applicable'])
    expect(onboardingActivationSchema.shape.colleague_invited.parse('not_applicable')).toBe('not_applicable')
    expect(onboardingActivationSchema.safeParse({ ...VALID, colleague_invited: true }).success).toBe(false)
  })

  it('rejects a completed_count outside 0..8 (no fabricated progress)', () => {
    expect(onboardingActivationSchema.safeParse({ ...VALID, completed_count: 9 }).success).toBe(false)
    expect(onboardingActivationSchema.safeParse({ ...VALID, completed_count: -1 }).success).toBe(false)
    expect(onboardingActivationSchema.safeParse({ ...VALID, completed_count: 1.5 }).success).toBe(false)
  })
})
