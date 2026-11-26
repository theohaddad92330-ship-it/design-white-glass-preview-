import {
  findSharedEmailGroups,
  jaroWinkler,
  proposeContactDuplicates,
  PROPOSAL_THRESHOLD,
} from './contact-duplicate-proposals'

/**
 * #4114 — dédoublonnage flou des PERSONNES. Ce que ces tests savent dire NON :
 * homonymes de deux comptes (blocage par compte), deux Martin sans rien en commun,
 * une boîte partagée sous deux noms. Et ils prouvent qu'on PROPOSE sans rien écrire.
 */
const p = (id: string, fullName: string, extra: Record<string, string | boolean | null> = {}) => ({
  id,
  accountId: 'acc-1',
  fullName,
  email: null,
  phone: null,
  linkedinUrl: null,
  title: null,
  ...extra,
})

describe('jaroWinkler', () => {
  it('vaut 1 pour deux chaînes égales et 0 pour deux vides', () => {
    expect(jaroWinkler('martin', 'martin')).toBe(1)
    expect(jaroWinkler('', '')).toBe(0)
  })
  it('classe MARTHA/MARHTA au-dessus de 0,96 et deux noms distincts sous 0,7', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.96)
    expect(jaroWinkler('dupont', 'lefevre')).toBeLessThan(0.7)
  })
})

describe('proposeContactDuplicates', () => {
  it('propose deux fiches de même e-mail, casse différente', () => {
    const out = proposeContactDuplicates([
      p('a', 'Marie Durand', { email: 'Marie.Durand@acme.fr', emailVerified: true }),
      p('b', 'Marie Durand', { email: 'marie.durand@ACME.fr', emailVerified: true }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.reasons).toContain('même e-mail')
    expect(out[0]?.score).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD)
  })

  it('propose « Jean-François Martin » vs « JF Martin » du même compte', () => {
    const out = proposeContactDuplicates([p('a', 'Jean-François Martin'), p('b', 'JF Martin')])
    expect(out).toHaveLength(1)
    expect(out[0]?.reasons).toContain('nom proche (initiales compatibles)')
  })

  it('propose l’ordre inversé « MARTIN Jean » / « Jean Martin » et les accents', () => {
    expect(proposeContactDuplicates([p('a', 'MARTIN Jean'), p('b', 'Jean Martin')])).toHaveLength(1)
    expect(proposeContactDuplicates([p('a', 'Sébastien Chauffray'), p('b', 'Sebastien Chauffray')])).toHaveLength(1)
  })

  // LOIC-FIX2 O.5 (recette 20/10, OGF) — « Cottet Alain » et « Alain COTTET » sur le même compte : la casse et
  // l'ordre prénom/nom ne font pas deux personnes. On PROPOSE (jamais fusion automatique).
  it('LOIC-FIX2 O.5 — propose « Cottet Alain » / « Alain COTTET » : ordre et casse ne comptent pas', () => {
    const out = proposeContactDuplicates([p('a', 'Cottet Alain'), p('b', 'Alain COTTET')])
    expect(out).toHaveLength(1)
    expect(out[0]?.reasons).toContain('même nom')
    expect(out[0]?.score).toBeGreaterThanOrEqual(PROPOSAL_THRESHOLD)
  })

  it('LOIC-FIX2 O.5 — SAIT DIRE NON : « Cottet Alain » / « Alain Dupont » ne sont pas rapprochés', () => {
    expect(proposeContactDuplicates([p('a', 'Cottet Alain'), p('b', 'Alain Dupont')])).toHaveLength(0)
  })

  it('LOIC-FIX2 O.5 — deux comptes différents ne se rapprochent jamais, même nom inversé', () => {
    expect(
      proposeContactDuplicates([p('a', 'Cottet Alain'), p('b', 'Alain COTTET', { accountId: 'acc-2' })]),
    ).toHaveLength(0)
  })

  it('propose un nom proche + même poste, avec la raison lisible', () => {
    const out = proposeContactDuplicates([
      p('a', 'Catherine Lemaire', { title: 'DSI' }),
      p('b', 'Katherine Lemaire', { title: 'dsi' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.reasons).toEqual(expect.arrayContaining(['nom proche', 'même poste']))
  })

  it('rapproche un téléphone national et son E.164, et une URL LinkedIn normalisée', () => {
    expect(
      proposeContactDuplicates([
        p('a', 'Paul Roux', { phone: '01 02 03 04 05' }),
        p('b', 'Paul Roux', { phone: '+33102030405' }),
      ])[0]?.reasons,
    ).toContain('même téléphone')
    expect(
      proposeContactDuplicates([
        p('a', 'Paul Roux', { linkedinUrl: 'https://www.linkedin.com/in/proux/' }),
        p('b', 'P. Roux', { linkedinUrl: 'http://fr.linkedin.com/in/PRoux?x=1' }),
      ])[0]?.reasons,
    ).toContain('même profil LinkedIn')
  })

  it('NE propose PAS des homonymes sur deux comptes différents', () => {
    const out = proposeContactDuplicates([
      { ...p('a', 'Jean Martin'), accountId: 'acc-1' },
      { ...p('b', 'Jean Martin'), accountId: 'acc-2' },
    ])
    expect(out).toEqual([])
  })

  it('NE propose PAS deux personnes sans rien de commun, ni deux prénoms différents', () => {
    expect(proposeContactDuplicates([p('a', 'Jean Martin'), p('b', 'Julie Martin')])).toEqual([])
    expect(proposeContactDuplicates([p('a', 'Jean Martin'), p('b', 'Jean Bernard')])).toEqual([])
  })

  it('NE propose PAS une boîte partagée portée par deux noms sans rapport', () => {
    const out = proposeContactDuplicates([
      p('a', 'Alice Bernard', { email: 'contact@acme.fr' }),
      p('b', 'Hugo Lambert', { email: 'contact@acme.fr' }),
    ])
    expect(out).toEqual([])
  })

  it('NE propose PAS un nom seulement approché sans identifiant ni poste communs', () => {
    expect(proposeContactDuplicates([p('a', 'Sylvain Roue'), p('b', 'Sylvie Roure')])).toEqual([])
  })

  it('ne traite pas un intitulé de poste comme un nom de personne', () => {
    const long = 'Responsable des systèmes d’information d’une filiale de transport'
    expect(
      proposeContactDuplicates([p('a', long, { title: 'DSI' }), p('b', `${long} (SNCF Réseau)`, { title: 'DSI' })]),
    ).toEqual([])
  })

  it('ne rapproche pas un prénom seul d’un nom complet sans autre preuve', () => {
    expect(proposeContactDuplicates([p('a', 'Sébastien'), p('b', 'Sébastien Chauffray')])).toEqual([])
  })

  it('ne mute pas l’entrée, trie par score décroissant, ordre des fiches stable', () => {
    const input = [
      p('a', 'Jean Martin'),
      p('b', 'JF Martin'),
      p('c', 'Marie Durand', { email: 'm@acme.fr' }),
      p('d', 'Marie Durand', { email: 'M@acme.fr' }),
    ]
    const snapshot = JSON.stringify(input)
    const out = proposeContactDuplicates(input)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(out.map(x => x.score)).toEqual([...out.map(x => x.score)].sort((x, y) => y - x))
    expect(out[0]?.leftId < (out[0]?.rightId ?? '')).toBe(true)
  })

  it('écarte les paires déjà refusées par un humain', () => {
    const rows = [p('a', 'Marie Durand', { email: 'm@acme.fr' }), p('b', 'Marie Durand', { email: 'M@acme.fr' })]
    expect(proposeContactDuplicates(rows, { rejectedPairs: new Set(['a|b']) })).toEqual([])
  })
})

/**
 * #4600 — une adresse ne vaut preuve d'identité que VÉRIFIÉE, UNIQUE et NON générique. Huit fiches d'un même compte
 * portant la même adresse donnaient 28 « même personne » : UNE cause, rendue 8×7/2 fois.
 */
describe('#4600 — l’adresse partagée n’est pas une identité', () => {
  const shared = 'partage.interne@exemple-societe.test'
  const eight = Array.from({ length: 8 }, (_, i) =>
    p(
      `c${i}`,
      [
        'Alice Bernard',
        'Hugo Lambert',
        'Zoé Petit',
        'Marc Roux',
        'Lina Fabre',
        'Omar Benali',
        'Sara Collin',
        'Paul Meyer',
      ][i] ?? 'X',
      {
        email: shared,
        emailVerified: false,
      },
    ),
  )

  it('huit fiches, une adresse non vérifiée : AUCUNE paire, UN seul groupe de huit', () => {
    expect(proposeContactDuplicates(eight)).toEqual([])
    const groups = findSharedEmailGroups(eight)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.contactIds).toHaveLength(8)
    expect(groups[0]?.reason).toBe('unverified')
  })

  it('une adresse non vérifiée portée par deux fiches ne les déclare pas « même personne »', () => {
    const rows = [
      p('a', 'Alice Bernard', { email: 'a.b@exemple-societe.test', emailVerified: false }),
      p('b', 'Hugo Lambert', { email: 'a.b@exemple-societe.test', emailVerified: true }),
    ]
    expect(proposeContactDuplicates(rows)).toEqual([])
  })

  it('trois fiches ou plus : même vérifiée, l’adresse cesse d’être un indice — un groupe, pas des paires', () => {
    const rows = eight.slice(0, 3).map(r => ({ ...r, emailVerified: true }))
    expect(proposeContactDuplicates(rows)).toEqual([])
    expect(findSharedEmailGroups(rows)).toEqual([
      { email: shared, contactIds: ['c0', 'c1', 'c2'], reason: 'shared_by_many' },
    ])
  })

  it('une boîte générique, même vérifiée et à deux fiches, n’est pas une identité', () => {
    const rows = [
      p('a', 'Alice Bernard', { email: 'recrutement@exemple-societe.test', emailVerified: true }),
      p('b', 'Alice Bernard', { email: 'recrutement@exemple-societe.test', emailVerified: true }),
    ]
    expect(proposeContactDuplicates(rows).flatMap(x => x.reasons)).not.toContain('même e-mail')
    expect(findSharedEmailGroups(rows)[0]?.reason).toBe('generic_mailbox')
  })

  it('une adresse VÉRIFIÉE et UNIQUE à deux fiches reste décisive : la proposition est là, aucun groupe', () => {
    const rows = [
      p('a', 'Marie Durand', { email: 'm.durand@exemple-societe.test', emailVerified: true }),
      p('b', 'M. Durand', { email: 'm.durand@exemple-societe.test', emailVerified: true }),
    ]
    expect(proposeContactDuplicates(rows)[0]?.reasons).toContain('même e-mail')
    expect(findSharedEmailGroups(rows)).toEqual([])
  })

  it('le blocage par compte tient : la même adresse sur deux comptes ne fait pas un groupe', () => {
    const rows = [
      { ...p('a', 'Alice Bernard', { email: shared, emailVerified: false }), accountId: 'acc-1' },
      { ...p('b', 'Hugo Lambert', { email: shared, emailVerified: false }), accountId: 'acc-2' },
    ]
    expect(findSharedEmailGroups(rows)).toEqual([])
  })
})

describe('proposeContactDuplicates — initiale du nom et prénoms en virgules (doublon de persona)', () => {
  it('propose « Prénom N. » ≡ « Prénom NOM » au même employeur', () => {
    const out = proposeContactDuplicates([p('a', 'Claire Fontaine'), p('b', 'Claire F.')])
    expect(out).toHaveLength(1)
    expect(out[0]?.reasons).toContain('nom proche (initiale du nom)')
  })
  it('propose un nom à prénoms en virgules comme la même personne', () => {
    const out = proposeContactDuplicates([p('a', 'Claire, Anne FONTAINE'), p('b', 'Claire Fontaine')])
    expect(out).toHaveLength(1)
  })
  it('ne propose PAS deux personnes de même prénom et même initiale chez deux employeurs', () => {
    const out = proposeContactDuplicates([p('a', 'Claire Fontaine'), { ...p('b', 'Claire F.'), accountId: 'acc-2' }])
    expect(out).toEqual([])
  })
  it('ne propose PAS, au même employeur, une initiale différente', () => {
    expect(proposeContactDuplicates([p('a', 'Claire Fontaine'), p('b', 'Claire M.')])).toEqual([])
  })
  it('ne propose PAS un prénom différent avec la même initiale', () => {
    expect(proposeContactDuplicates([p('a', 'Claire Fontaine'), p('b', 'Marc F.')])).toEqual([])
  })
})
