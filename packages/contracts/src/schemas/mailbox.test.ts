import { describe, expect, it } from 'vitest'
import { countRepliesToTreat, mailDraftHasProof, REPLIES_TO_TREAT_REQUEST } from './mailbox.js'

/**
 * #2394.62 — « déposé dans ta messagerie » exige un message_id ET un thread_id
 * RÉELS, en plus de l'identifiant de brouillon déjà vérifié (#2394.35). Sans
 * les trois, rien ne prouve où le brouillon a atterri : l'affirmer quand même
 * serait exactement le NO-GO de #2394 (« annoncer un brouillon messagerie sans
 * preuve réelle »).
 */
describe('mailDraftHasProof', () => {
  it('les trois preuves présentes → un dépôt peut être affirmé', () => {
    expect(mailDraftHasProof({ draftId: 'd-1', messageId: 'm-1', threadId: 't-1' })).toBe(true)
  })

  it('draftId vide → aucune preuve, même avec message/thread', () => {
    expect(mailDraftHasProof({ draftId: '', messageId: 'm-1', threadId: 't-1' })).toBe(false)
  })

  it('messageId absent (`null`) → aucune preuve', () => {
    expect(mailDraftHasProof({ draftId: 'd-1', messageId: null, threadId: 't-1' })).toBe(false)
  })

  it('threadId absent (`null`) → aucune preuve', () => {
    expect(mailDraftHasProof({ draftId: 'd-1', messageId: 'm-1', threadId: null })).toBe(false)
  })
})

// F2-FIX — « réponses à traiter » : une seule définition, pour /briefing et /mailbox.

describe('réponses à traiter (F2-FIX)', () => {
  it('ne compte que les fils de réponse favorable, jamais un non-lu', () => {
    expect(countRepliesToTreat([{}, {}])).toBe(2)
    expect(countRepliesToTreat(undefined)).toBe(0)
    expect(countRepliesToTreat(null)).toBe(0)
  })

  it('la question posée à la messagerie est la même pour les deux écrans', () => {
    expect(REPLIES_TO_TREAT_REQUEST).toEqual({ intent: 'positive_reply', windowDays: 14, limit: 40 })
  })
})
