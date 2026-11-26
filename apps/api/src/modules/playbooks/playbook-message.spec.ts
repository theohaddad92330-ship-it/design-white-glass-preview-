import { PLAYBOOK_KEYS } from '@bellum/contracts'
import { playbookMessage } from './playbook-message'

/**
 * Ces trois messages sont les SEULS du produit qui atteignent un client sans
 * qu'un humain les ait relus. Ce que ces tests vérifient n'est donc pas le
 * style : c'est qu'aucun gabarit ne puisse laisser passer un trou, un jeton non
 * substitué ou une affirmation qu'on n'a pas les moyens de tenir.
 */

const FULL = {
  contactFirstName: 'Marie',
  consultantName: 'Karim Benali',
  accountName: 'ACME',
  subjectLabel: 'Refonte du SI RH',
  silenceDays: 12,
  endsOn: '2026-09-30',
}

describe('message d’un playbook', () => {
  it.each(PLAYBOOK_KEYS)('%s : produit un objet et un corps non vides', playbook => {
    const message = playbookMessage(playbook, FULL)
    expect(message.subject.trim().length).toBeGreaterThan(0)
    expect(message.body.trim().length).toBeGreaterThan(0)
  })

  it.each(PLAYBOOK_KEYS)('%s : ne laisse AUCUN gabarit non substitué', playbook => {
    for (const context of [FULL, {}]) {
      const message = playbookMessage(playbook, context)
      // Ni `{name}`, ni `undefined`, ni `null` : les trois façons dont un
      // gabarit trahit qu'il a été assemblé à la va-vite, et les trois que le
      // client verrait.
      for (const text of [message.subject, message.body]) {
        expect(text).not.toMatch(/[{}]/)
        expect(text).not.toMatch(/undefined|null|N\/A/)
      }
    }
  })

  it.each(PLAYBOOK_KEYS)('%s : reste correct quand on ne sait RIEN', playbook => {
    const message = playbookMessage(playbook, {})
    // Une variable absente retire sa phrase ; elle ne laisse pas un blanc, et
    // elle n'invente pas de valeur de remplissage.
    expect(message.body).toContain('Bonjour,')
    expect(message.body).not.toMatch(/ {2,}|—\s*$|«\s*»/)
  })

  it('appelle la personne par son prénom quand on le connaît, jamais sinon', () => {
    expect(playbookMessage('submission_no_reply', FULL).body).toContain('Bonjour Marie,')
    // Inventer « Bonjour Jean » sur une adresse générique se voit immédiatement.
    expect(playbookMessage('submission_no_reply', {}).body).toContain('Bonjour,')
  })

  it('nomme ce dont il est question, jamais la seule société', () => {
    // Un objet qui ne dit que le nom du client ressemble à un envoi de masse.
    const subject = playbookMessage('submission_no_reply', FULL).subject
    expect(subject).toContain('Karim Benali')
    expect(subject).not.toBe('ACME')
  })

  it('n’écrit jamais la durée du silence — ça se lit comme un reproche', () => {
    for (const playbook of PLAYBOOK_KEYS) {
      expect(playbookMessage(playbook, FULL).body).not.toContain('12')
    }
  })

  it('n’invente aucune urgence ni aucune échéance qu’on ne connaît pas', () => {
    const withDate = playbookMessage('mission_renewal', FULL).body
    expect(withDate).toContain('30/09/2026')
    const without = playbookMessage('mission_renewal', { subjectLabel: 'Refonte du SI RH' }).body
    // Sans date connue, la phrase d'échéance DISPARAÎT au lieu d'en supposer une.
    expect(without).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('bascule en anglais sans laisser de français résiduel', () => {
    const message = playbookMessage('proposal_no_reply', FULL, 'en')
    expect(message.body).toContain('Hi Marie,')
    expect(message.body).not.toMatch(/Bonjour|relance|proposition/)
  })

  it('ne met aucune pression : ni urgence, ni dernière chance', () => {
    for (const playbook of PLAYBOOK_KEYS) {
      for (const language of ['fr', 'en'] as const) {
        const body = playbookMessage(playbook, FULL, language).body.toLowerCase()
        for (const banned of ['urgent', 'dernière chance', 'last chance', 'immédiatement', 'asap']) {
          expect(body).not.toContain(banned)
        }
      }
    }
  })
})
