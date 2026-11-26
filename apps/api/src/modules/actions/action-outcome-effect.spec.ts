import { actionOutcomeEffect, contactStatusMayMove } from './action-outcome-effect'

describe('action-outcome-effect (#3416.4)', () => {
  it('une réponse positive et un rendez-vous obtenu font avancer le board du compte, comme le statut de contact', () => {
    expect(actionOutcomeEffect('positive')).toEqual({ contactStatus: 'replied', sprintEvent: 'positive_reply' })
    expect(actionOutcomeEffect('meeting_booked')).toEqual({ contactStatus: 'meeting', sprintEvent: 'meeting_booked' })
  })

  it('un refus et un silence sont des informations : statut de contact, aucun événement de board', () => {
    expect(actionOutcomeEffect('refused')).toEqual({ contactStatus: 'refused' })
    expect(actionOutcomeEffect('no_response')).toEqual({ contactStatus: 'silence' })
  })

  it('les issues sans équivalent de statut ne propagent rien — jamais un statut inventé', () => {
    for (const outcome of ['blocked_by_procurement', 'blocked_by_margin', 'technical_error', 'abandoned'] as const)
      expect(actionOutcomeEffect(outcome)).toBeNull()
    expect(actionOutcomeEffect(null)).toBeNull()
  })

  it('ne recule jamais : une issue plus faible n’écrase pas un statut plus avancé', () => {
    expect(contactStatusMayMove('contacted', 'replied')).toBe(true)
    expect(contactStatusMayMove('meeting', 'replied')).toBe(false)
    expect(contactStatusMayMove('replied', 'silence')).toBe(false)
    expect(contactStatusMayMove('refused', 'silence')).toBe(false)
    expect(contactStatusMayMove('replied', 'meeting')).toBe(true)
    expect(contactStatusMayMove(null, 'silence')).toBe(true)
  })
})
