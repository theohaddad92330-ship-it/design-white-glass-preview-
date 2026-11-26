import { buildThreadAccountIndex, linkThreadToAccount, toAccountRef, type ContactAnchor } from './thread-account-link'

const contact = (
  email: string | null,
  accountId: string,
  accountName: string,
  contactId = 'contact-x',
): ContactAnchor => ({
  email,
  contactId,
  accountId,
  accountName,
})

const thread = (counterpart: string | null) => ({ counterpart })

describe('étiquette ESN du compte rattaché (#5003)', () => {
  it('le lien porte isEsn seulement quand le compte est une ESN', () => {
    const index = buildThreadAccountIndex([
      { ...contact('a@davidson.fr', 'acc-esn', 'Davidson'), accountIsEsn: true },
      contact('b@client.fr', 'acc-2', 'Client'),
    ])
    expect(toAccountRef(linkThreadToAccount(thread('a@davidson.fr'), index))).toEqual({
      id: 'acc-esn',
      name: 'Davidson',
      via: 'contact',
      isEsn: true,
    })
    expect(toAccountRef(linkThreadToAccount(thread('b@client.fr'), index))).toEqual({
      id: 'acc-2',
      name: 'Client',
      via: 'contact',
    })
  })
})

describe('rattachement d’un fil à son compte (MAIL-01)', () => {
  it('rattache sur l’adresse EXACTE d’un contact connu', () => {
    const index = buildThreadAccountIndex([contact('marie.dupont@acme.fr', 'acc-1', 'ACME', 'contact-1')])
    expect(linkThreadToAccount(thread('Marie.Dupont@ACME.fr'), index)).toEqual({
      accountId: 'acc-1',
      accountName: 'ACME',
      via: 'contact',
      // #2104.3 — l'adresse EXACTE désigne aussi la FICHE contact, pas
      // seulement le compte : un domaine ne le pourrait pas (plusieurs
      // personnes derrière le même domaine).
      contactId: 'contact-1',
    })
  })

  it('rattache sur le DOMAINE quand il n’appartient qu’à un compte, SANS désigner un contact', () => {
    // #2104.3 — un domaine dit à quel COMPTE ça appartient, jamais QUI
    // précisément : deux personnes peuvent le partager. `contactId` doit
    // rester absent ici, contrairement au rattachement par adresse exacte.
    const index = buildThreadAccountIndex([contact('marie@acme.fr', 'acc-1', 'ACME')])
    expect(linkThreadToAccount(thread('jean@acme.fr'), index)).toEqual({
      accountId: 'acc-1',
      accountName: 'ACME',
      via: 'domain',
    })
  })

  it('ne rattache RIEN quand deux comptes partagent le domaine', () => {
    // Se tromper de compte est pire que ne pas en proposer : la ligne
    // deviendrait un mensonge que l'utilisateur peut vérifier d'un clic.
    const index = buildThreadAccountIndex([
      contact('marie@groupe.fr', 'acc-1', 'Filiale Nord'),
      contact('jean@groupe.fr', 'acc-2', 'Filiale Sud'),
    ])
    expect(linkThreadToAccount(thread('paul@groupe.fr'), index)).toBeNull()
    // L'adresse exacte, elle, reste certaine.
    expect(linkThreadToAccount(thread('marie@groupe.fr'), index)?.accountId).toBe('acc-1')
  })

  it('ne rattache jamais sur un domaine grand public', () => {
    const index = buildThreadAccountIndex([contact('marie.dupont@gmail.com', 'acc-1', 'ACME')])
    expect(linkThreadToAccount(thread('quelquun.dautre@gmail.com'), index)).toBeNull()
    // Mais l'adresse exacte reste un lien certain, même chez Gmail.
    expect(linkThreadToAccount(thread('marie.dupont@gmail.com'), index)?.via).toBe('contact')
  })

  it('ignore un contact sans adresse plutôt que de rattacher au hasard', () => {
    const index = buildThreadAccountIndex([contact(null, 'acc-1', 'ACME'), contact('   ', 'acc-2', 'AUTRE')])
    expect(linkThreadToAccount(thread('inconnu@nulle-part.fr'), index)).toBeNull()
  })

  it('ne rattache rien pour un fil sans interlocuteur lisible', () => {
    const index = buildThreadAccountIndex([contact('marie@acme.fr', 'acc-1', 'ACME')])
    expect(linkThreadToAccount(thread(null), index)).toBeNull()
    expect(linkThreadToAccount(thread('pas-une-adresse'), index)).toBeNull()
  })

  it('deux contacts du MÊME compte sur un domaine ne le rendent pas ambigu', () => {
    const index = buildThreadAccountIndex([
      contact('marie@acme.fr', 'acc-1', 'ACME'),
      contact('jean@acme.fr', 'acc-1', 'ACME'),
    ])
    expect(linkThreadToAccount(thread('paul@acme.fr'), index)?.accountId).toBe('acc-1')
  })
})
