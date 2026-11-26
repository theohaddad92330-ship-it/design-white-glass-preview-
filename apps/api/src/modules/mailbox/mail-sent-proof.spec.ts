import type { MailMessage, MailThread } from '@bellum/contracts'
import { latestSentProofByThread } from './mail-sent-proof'

/**
 * #4016 L13c — « Envoyé » DÉTECTÉ dans la boîte de l'utilisateur comme vraie
 * preuve d'envoi. Le détecteur ne lit que des MÉTADONNÉES (direction, date) :
 * jamais le corps (c'est la doctrine « le corps ne sort pas »).
 */
function message(overrides: Partial<MailMessage>): MailMessage {
  return {
    id: 'm1',
    threadId: 't1',
    subject: 'Bonjour',
    from: 'moi@bellum.fr',
    to: ['contact@acme.fr'],
    cc: [],
    date: '2026-10-10T09:00:00.000Z',
    snippet: null,
    unread: false,
    hasAttachments: false,
    direction: 'outbound',
    ...overrides,
  }
}

const thread = (threadId: string, contactId: string | null): Pick<MailThread, 'threadId' | 'contactId'> => ({
  threadId,
  contactId,
})

describe('#4016 L13c — latestSentProofByThread', () => {
  it('rend la date du DERNIER message sortant du fil, pour un contact résolu', () => {
    const proofs = latestSentProofByThread([thread('t1', 'c1')] as MailThread[], [
      message({ id: 'a', date: '2026-10-08T09:00:00.000Z' }),
      message({ id: 'b', date: '2026-10-10T09:00:00.000Z' }),
      message({ id: 'c', direction: 'inbound', date: '2026-10-11T09:00:00.000Z' }),
    ])
    expect(proofs).toEqual([{ contactId: 'c1', threadId: 't1', sentAt: new Date('2026-10-10T09:00:00.000Z') }])
  })

  it('un fil sans message sortant ne prouve rien', () => {
    const proofs = latestSentProofByThread([thread('t1', 'c1')] as MailThread[], [message({ direction: 'inbound' })])
    expect(proofs).toEqual([])
  })

  it('un contact NON résolu avec certitude ne prouve rien (jamais deviné)', () => {
    expect(latestSentProofByThread([thread('t1', null)] as MailThread[], [message({})])).toEqual([])
  })

  it('un message sortant SANS date lisible ne prouve rien — pas de « maintenant » inventé', () => {
    expect(
      latestSentProofByThread([thread('t1', 'c1')] as MailThread[], [
        message({ date: null }),
        message({ date: 'pas une date' }),
      ]),
    ).toEqual([])
  })

  it("ne mélange pas les fils : le message d'un AUTRE fil ne prouve rien pour celui-ci", () => {
    expect(latestSentProofByThread([thread('t2', 'c2')] as MailThread[], [message({ threadId: 't1' })])).toEqual([])
  })
})
