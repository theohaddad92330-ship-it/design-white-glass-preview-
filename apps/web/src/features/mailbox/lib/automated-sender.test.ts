import { describe, expect, it } from 'vitest'
import { isAutomatedSender } from './automated-sender'

// #4405.1 — un fil système (no-reply) n'a personne à qui répondre : « Préparer une réponse » ne se propose pas.
describe('isAutomatedSender', () => {
  it.each([
    'noreply@github.com',
    'no-reply@accounts.google.com',
    'Do Not Reply <do-not-reply@stripe.com>',
    'donotreply@bank.fr',
    'mailer-daemon@googlemail.com',
    'notifications@linear.app',
  ])('%s est un expéditeur système', address => {
    expect(isAutomatedSender(address)).toBe(true)
  })

  it.each(['marie.dupont@acme.fr', 'Marie <marie@acme.fr>', 'reply-team@acme.fr', null, undefined, ''])(
    '%s est un humain (ou inconnu) : rien n’est caché',
    address => {
      expect(isAutomatedSender(address)).toBe(false)
    },
  )
})
