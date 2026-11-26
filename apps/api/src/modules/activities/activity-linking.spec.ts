import {
  bareEmail,
  buildLinkIndex,
  displayNameOf,
  emailDomain,
  isPublicEmailDomain,
  phoneKey,
  resolveActivityLink,
  resolveDirection,
  type LinkableAccount,
  type LinkableContact,
} from './activity-linking'

const ACME = 'a0000000-0000-4000-8000-000000000001'
const OTHER = 'a0000000-0000-4000-8000-000000000002'
const MARIE = 'c0000000-0000-4000-8000-000000000001'
const PAUL = 'c0000000-0000-4000-8000-000000000002'

const CONTACTS: LinkableContact[] = [
  { id: MARIE, accountId: ACME, email: 'marie.dupont@acme.fr', phone: '+33 6 12 34 56 78' },
  { id: PAUL, accountId: OTHER, email: 'paul@perso.gmail.com', mobile: '0798765432' },
]
const ACCOUNTS: LinkableAccount[] = [
  { id: ACME, domain: 'acme.fr' },
  { id: OTHER, domain: 'gmail.com' },
]

const index = buildLinkIndex(CONTACTS, ACCOUNTS)

describe('bareEmail', () => {
  it('extrait l’adresse d’un en-tête nommé', () => {
    expect(bareEmail('"Dupont, Marie" <Marie.Dupont@ACME.fr>')).toBe('marie.dupont@acme.fr')
  })

  it('laisse passer une adresse nue', () => {
    expect(bareEmail('marie@acme.fr')).toBe('marie@acme.fr')
  })

  it('rend null sur ce qui n’est pas une adresse', () => {
    expect(bareEmail('Marie Dupont')).toBeNull()
    expect(bareEmail(null)).toBeNull()
  })
})

describe('displayNameOf', () => {
  it('rend le nom quand il y en a un', () => {
    expect(displayNameOf('"Marie Dupont" <marie@acme.fr>')).toBe('Marie Dupont')
  })

  it('rend null plutôt que de recopier l’adresse — « marie@acme.fr — marie@acme.fr » a l’air cassé', () => {
    expect(displayNameOf('marie@acme.fr')).toBeNull()
  })
})

describe('emailDomain', () => {
  it('nettoie un chevron traînant', () => {
    expect(emailDomain('marie@acme.fr>')).toBe('acme.fr')
  })

  it('refuse un domaine sans point — un hôte local ne rattache rien', () => {
    expect(emailDomain('root@localhost')).toBeNull()
  })
})

describe('phoneKey', () => {
  it('reconnaît le même numéro sous trois formats', () => {
    expect(phoneKey('+33 6 12 34 56 78')).toBe(phoneKey('0612345678'))
    expect(phoneKey('0033612345678')).toBe(phoneKey('0612345678'))
  })

  it('refuse un numéro trop court — six chiffres se répètent trop souvent', () => {
    expect(phoneKey('3949')).toBeNull()
    expect(phoneKey('01 23 45')).toBeNull()
  })
})

describe('isPublicEmailDomain', () => {
  it('reconnaît les boîtes grand public, casse indifférente', () => {
    expect(isPublicEmailDomain('Gmail.com')).toBe(true)
    expect(isPublicEmailDomain('orange.fr')).toBe(true)
  })

  it('ne classe pas un domaine d’entreprise', () => {
    expect(isPublicEmailDomain('acme.fr')).toBe(false)
  })
})

describe('resolveActivityLink', () => {
  it('rattache par l’adresse exacte — compte ET contact', () => {
    expect(resolveActivityLink(['"Marie" <marie.dupont@acme.fr>'], index)).toEqual({
      accountId: ACME,
      contactId: MARIE,
      reason: 'contact_email',
    })
  })

  it('rattache par le numéro, quel qu’en soit le format', () => {
    expect(resolveActivityLink(['0033612345678'], index)).toEqual({
      accountId: ACME,
      contactId: MARIE,
      reason: 'contact_phone',
    })
  })

  it('rattache un inconnu du domaine au COMPTE, jamais à une personne', () => {
    // Savoir qu'un message vient de @acme.fr ne dit pas de qui. Nommer un
    // contact ici serait une invention, et elle se retrouverait dans la fiche
    // de quelqu'un qui n'a rien écrit.
    expect(resolveActivityLink(['inconnu@acme.fr'], index)).toEqual({
      accountId: ACME,
      contactId: null,
      reason: 'account_domain',
    })
  })

  it('ne rattache RIEN par un domaine grand public, même déclaré sur un compte', () => {
    // `gmail.com` est le domaine du compte OTHER dans cette fixture — une
    // situation réelle quand un compte a été créé depuis une adresse perso.
    // Le rattacher collerait tous les particuliers du carnet à ce compte.
    expect(resolveActivityLink(['quelqun@gmail.com'], index)).toEqual({
      accountId: null,
      contactId: null,
      reason: null,
    })
  })

  it('préfère l’adresse exacte au domaine, même si le domaine vient en premier', () => {
    expect(resolveActivityLink(['inconnu@acme.fr', 'marie.dupont@acme.fr'], index).contactId).toBe(MARIE)
  })

  it('ignore l’utilisateur lui-même — un mail interne ne rattache pas sa propre ESN', () => {
    const selfIndex = buildLinkIndex(
      [{ id: MARIE, accountId: ACME, email: 'moi@mon-esn.fr' }],
      [{ id: ACME, domain: 'mon-esn.fr' }],
    )
    expect(resolveActivityLink(['moi@mon-esn.fr'], selfIndex, new Set(['moi@mon-esn.fr']))).toEqual({
      accountId: null,
      contactId: null,
      reason: null,
    })
  })

  it('rend un lien vide quand rien ne correspond', () => {
    expect(resolveActivityLink(['personne@inconnu.io'], index)).toEqual({
      accountId: null,
      contactId: null,
      reason: null,
    })
  })

  it('supporte un lot sans handle exploitable', () => {
    expect(resolveActivityLink([null, undefined, 'Marie Dupont'], index).reason).toBeNull()
  })
})

describe('resolveDirection', () => {
  const self = new Set(['moi@esn.fr', 'collegue@esn.fr'])

  it('sortant quand ça part de nous vers l’extérieur', () => {
    expect(resolveDirection('moi@esn.fr', ['client@acme.fr'], self)).toBe('outbound')
  })

  it('entrant quand ça vient de l’extérieur', () => {
    expect(resolveDirection('client@acme.fr', ['moi@esn.fr'], self)).toBe('inbound')
  })

  it('INTERNE quand tout le monde est de la maison', () => {
    // Une réunion de préparation entre collègues ne doit pas repousser la date
    // de relance du client : c'est le seul intérêt de cette troisième valeur.
    expect(resolveDirection('moi@esn.fr', ['collegue@esn.fr'], self)).toBe('internal')
  })

  it('reste sortant si un seul destinataire est externe', () => {
    expect(resolveDirection('moi@esn.fr', ['collegue@esn.fr', 'client@acme.fr'], self)).toBe('outbound')
  })

  it('traite un expéditeur illisible comme entrant', () => {
    expect(resolveDirection(null, [], self)).toBe('inbound')
  })
})

describe('buildLinkIndex', () => {
  it('n’indexe PAS un domaine grand public déclaré sur un compte', () => {
    expect(buildLinkIndex([], [{ id: ACME, domain: 'Hotmail.com' }]).byDomain.size).toBe(0)
  })

  it('garde le premier contact quand deux partagent une adresse', () => {
    const built = buildLinkIndex(
      [
        { id: MARIE, accountId: ACME, email: 'partage@acme.fr' },
        { id: PAUL, accountId: OTHER, email: 'partage@acme.fr' },
      ],
      [],
    )
    expect(built.byEmail.get('partage@acme.fr')?.id).toBe(MARIE)
  })
})
