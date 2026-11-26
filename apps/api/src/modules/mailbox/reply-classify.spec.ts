import type { MailMessage, MailThread } from '@bellum/contracts'
import { classifyReply, classifyThread } from './reply-classify'

function message(partial: Partial<MailMessage>): MailMessage {
  return {
    id: partial.id ?? 'm1',
    threadId: 't1',
    subject: null,
    from: null,
    to: [],
    cc: [],
    date: null,
    snippet: null,
    unread: false,
    hasAttachments: false,
    direction: 'inbound',
    ...partial,
  }
}

/**
 * #2381.4 — les onze classes de réponse, DÉTERMINISTES (lexique fixe sur
 * objet + extrait — jamais le corps complet, doctrine « métadonnées
 * seulement »). Un texte qui ne correspond à rien tombe sur `neutral`
 * (du contenu existe, rien de fort dedans) ou `unknown` (rien d'exploitable).
 */
describe('classifyReply — #2381.4', () => {
  it('absence du bureau → out_of_office (#2381.5, jamais une réponse commerciale)', () => {
    expect(classifyReply({ subject: 'Réponse automatique', snippet: 'Je suis actuellement absent du bureau.' })).toBe(
      'out_of_office',
    )
    expect(classifyReply({ subject: null, snippet: 'I am out of office until Monday.' })).toBe('out_of_office')
  })

  it('bounce (échec de remise), verrouillé avant tout le reste', () => {
    expect(classifyReply({ subject: 'Undelivered Mail Returned to Sender', snippet: null })).toBe('bounce')
    expect(classifyReply({ subject: null, snippet: 'Échec de la remise à jean@corp.fr' })).toBe('bounce')
  })

  it('opt-out déclaré dans la réponse', () => {
    expect(classifyReply({ subject: null, snippet: 'Merci de me désinscrire de cette liste.' })).toBe('opt_out')
    expect(classifyReply({ subject: null, snippet: 'Please unsubscribe me from this list.' })).toBe('opt_out')
  })

  it('mauvaise personne', () => {
    expect(
      classifyReply({ subject: null, snippet: "Ce n'est plus moi qu'il faut contacter, j'ai quitté l'entreprise." }),
    ).toBe('wrong_person')
    expect(classifyReply({ subject: null, snippet: 'Wrong person, I no longer work here.' })).toBe('wrong_person')
  })

  it('refus', () => {
    expect(classifyReply({ subject: null, snippet: "Ce n'est pas intéressé, merci." })).toBe('refusal')
    expect(classifyReply({ subject: null, snippet: 'We are not interested, thank you.' })).toBe('refusal')
  })

  it('plus tard (not_now)', () => {
    expect(classifyReply({ subject: null, snippet: 'Recontactez-moi plus tard, pas le bon moment.' })).toBe('not_now')
    expect(classifyReply({ subject: null, snippet: 'Maybe later, not the right time now.' })).toBe('not_now')
  })

  it('orientation vers un autre interlocuteur', () => {
    expect(classifyReply({ subject: null, snippet: 'Merci de contacter plutôt notre service achats.' })).toBe(
      'orientation',
    )
    expect(classifyReply({ subject: null, snippet: 'Please contact our procurement team instead.' })).toBe(
      'orientation',
    )
  })

  it('question', () => {
    expect(classifyReply({ subject: null, snippet: 'Pouvez-vous préciser votre offre ?' })).toBe('question')
  })

  it('positive — réutilise le lexique de `no-reply.ts` (GA-26, un seul endroit)', () => {
    expect(classifyReply({ subject: null, snippet: 'Oui, je suis intéressé, on peut en parler.' })).toBe('positive')
    expect(classifyReply({ subject: null, snippet: 'Sounds good, happy to chat.' })).toBe('positive')
  })

  it('neutral — du contenu réel, aucun signal fort', () => {
    expect(classifyReply({ subject: 'Re: présentation', snippet: 'Bonjour, bien reçu, je reviens vers vous.' })).toBe(
      'neutral',
    )
  })

  it('unknown — rien d’exploitable', () => {
    expect(classifyReply({ subject: null, snippet: null })).toBe('unknown')
    expect(classifyReply({ subject: '', snippet: '   ' })).toBe('unknown')
  })

  it('priorité : une auto-réponse d’absence l’emporte même si elle contient un mot positif au passage', () => {
    expect(
      classifyReply({
        subject: 'Absence du bureau',
        snippet: 'Je suis en congés, ravi de votre message, je reviendrai vers vous.',
      }),
    ).toBe('out_of_office')
  })
})

describe('classifyThread — #2381.3 (le fil, à partir du dernier message ENTRANT déjà transporté)', () => {
  it('null quand le dernier message du fil est SORTANT — rien à classifier', () => {
    const thread = {
      lastDirection: 'outbound',
      messages: [message({ direction: 'outbound', subject: 'Relance' })],
    } as Pick<MailThread, 'lastDirection' | 'messages'>
    expect(classifyThread(thread)).toBeNull()
  })

  it('null quand aucun message n’est transporté', () => {
    expect(classifyThread({ lastDirection: 'inbound', messages: [] })).toBeNull()
  })

  it('classe sur le DERNIER message entrant, pas le premier', () => {
    const thread = {
      lastDirection: 'inbound',
      messages: [
        message({ id: 'm1', direction: 'outbound', subject: 'Relance' }),
        message({ id: 'm2', direction: 'inbound', subject: null, snippet: 'Pas intéressé, merci.' }),
      ],
    } as Pick<MailThread, 'lastDirection' | 'messages'>
    expect(classifyThread(thread)).toBe('refusal')
  })
})
