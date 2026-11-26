import { describe, expect, it } from 'vitest'
import { generationActionType } from './engagement-tracking'

describe('generationActionType (#4181.4)', () => {
  it('regénérer un pitch d’appel n’ajoute AUCUNE ligne : l’ouverture a déjà consigné « Pitch d’appel préparé »', () => {
    expect(generationActionType('phone')).toBeNull()
  })

  it('SAIT DIRE NON : un message écrit (e-mail, LinkedIn) reste consigné à chaque génération', () => {
    expect(generationActionType('email')).toBe('plan_action_message_generated')
    expect(generationActionType('linkedin')).toBe('plan_action_message_generated')
  })
})
