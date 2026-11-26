import { mapChat, mapMessage, matchContact, type BeeperMatchableContact } from './beeper-conversations'

const contact = (over: Partial<BeeperMatchableContact>): BeeperMatchableContact => ({
  id: 'k1',
  fullName: 'Claire Martin',
  accountId: 'a1',
  email: null,
  phone: null,
  linkedinUrl: null,
  ...over,
})

const chat = mapChat({
  id: 'c1',
  network: 'WhatsApp',
  title: 'Claire Martin',
  type: 'single',
  participants: {
    items: [
      { id: 'me', fullName: 'Moi', isSelf: true, phoneNumber: '+33 6 00 00 00 00' },
      {
        id: 'u2',
        fullName: 'Claire Martin',
        phoneNumber: '+33 6 12 34 56 78',
        email: 'Claire@Acme.fr',
        username: '@claire-martin',
      },
    ],
  },
})!

describe('beeper-conversations (#4406.2)', () => {
  it('projette un chat ; une absence reste nulle, jamais 0', () => {
    expect(chat).toMatchObject({ chatId: 'c1', network: 'WhatsApp', type: 'single', unreadCount: null })
    expect(chat.participants).toHaveLength(2)
    expect(mapChat({ network: 'x' })).toBeNull()
    expect(mapMessage({ id: 'm1', text: 'Bonjour', isSender: true })).toEqual({
      id: 'm1',
      senderName: null,
      isSender: true,
      timestamp: null,
      text: 'Bonjour',
    })
  })

  it('rattache par e-mail, puis téléphone, puis identifiant — jamais sur soi-même', () => {
    expect(matchContact(chat, [contact({ email: 'claire@acme.fr' })])?.matchedOn).toBe('email')
    expect(matchContact(chat, [contact({ phone: '06 12 34 56 78' })])?.matchedOn).toBe('phone')
    expect(
      matchContact(chat, [contact({ linkedinUrl: 'https://www.linkedin.com/in/claire-martin/' })])?.matchedOn,
    ).toBe('handle')
    // Le numéro de l'utilisateur lui-même ne rattache rien.
    expect(matchContact(chat, [contact({ phone: '+33600000000' })])).toBeNull()
  })

  it('ambiguïté → aucun rattachement (on ne devine pas), groupe → aucun', () => {
    expect(
      matchContact(chat, [
        contact({ id: 'k1', email: 'claire@acme.fr' }),
        contact({ id: 'k2', email: 'claire@acme.fr' }),
      ]),
    ).toBeNull()
    expect(matchContact({ ...chat, type: 'group' }, [contact({ email: 'claire@acme.fr' })])).toBeNull()
  })
})
