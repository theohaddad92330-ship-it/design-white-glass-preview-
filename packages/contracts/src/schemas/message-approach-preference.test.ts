import { describe, expect, it } from 'vitest'
import { MESSAGE_APPROACH_PREFERENCE_KEY, readMessageApproachPreference } from './message-approach-preference.js'
import { userPreferencesPatchSchema } from './reply-preferences.js'

// #4060 — la préférence « approche directe » : posée par un geste, lue sans deviner, refusée si inconnue.
describe('message approach preference (#4060)', () => {
  it('lit « direct » et rien d’autre', () => {
    expect(readMessageApproachPreference({ [MESSAGE_APPROACH_PREFERENCE_KEY]: 'direct' })).toBe('direct')
    expect(readMessageApproachPreference({ [MESSAGE_APPROACH_PREFERENCE_KEY]: 'agressif' })).toBeNull()
    expect(readMessageApproachPreference({})).toBeNull()
    expect(readMessageApproachPreference(null)).toBeNull()
  })

  it('la porte du sac accepte « direct » et refuse une valeur inconnue', () => {
    expect(userPreferencesPatchSchema.safeParse({ messageApproach: 'direct' }).success).toBe(true)
    expect(userPreferencesPatchSchema.safeParse({ messageApproach: 'agressif' }).success).toBe(false)
    expect(userPreferencesPatchSchema.safeParse({ messageApproach: null }).success).toBe(false)
  })
})
