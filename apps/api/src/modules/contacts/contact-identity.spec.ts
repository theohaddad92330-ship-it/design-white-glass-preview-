import {
  contactIdentityKeys,
  hasCompleteIdentity,
  isIdentifiablePerson,
  normalizeFullName,
  normalizeLinkedinUrl,
  normalizePhone,
  pickRicher,
  pickRicherName,
  sortByUsableIdentity,
} from './contact-identity'

describe('normalizeFullName', () => {
  it('strips accents so the same person from two sources collapses', () => {
    // The live bug: "Sébastien Chauffray" (web search) and "Sebastien Chauffray"
    // (Apollo) were two rows on the same account.
    expect(normalizeFullName('Sébastien Chauffray')).toBe(normalizeFullName('Sebastien Chauffray'))
  })

  it('is case-insensitive', () => {
    expect(normalizeFullName('JEAN DUPONT')).toBe(normalizeFullName('Jean Dupont'))
  })

  it('collapses repeated and surrounding whitespace', () => {
    expect(normalizeFullName('  Jean   Dupont ')).toBe('jean dupont')
  })

  it('treats hyphenated and spaced compound first names as one person', () => {
    expect(normalizeFullName('Jean-Pierre Dupont')).toBe(normalizeFullName('Jean Pierre Dupont'))
  })

  it('ignores punctuation (apostrophes, dots, commas)', () => {
    expect(normalizeFullName("Jean-Luc D'Arcy")).toBe(normalizeFullName('Jean Luc D Arcy'))
    expect(normalizeFullName('J. Dupont')).toBe('j dupont')
  })

  it('handles ligatures and cedillas', () => {
    expect(normalizeFullName('François Lœuvre')).toBe('francois loeuvre')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeFullName('')).toBe('')
    expect(normalizeFullName('   ')).toBe('')
    expect(normalizeFullName(null)).toBe('')
    expect(normalizeFullName(undefined)).toBe('')
  })

  it('keeps genuinely different people apart', () => {
    expect(normalizeFullName('Jean Dupont')).not.toBe(normalizeFullName('Jean Dupond'))
    expect(normalizeFullName('Marie Martin')).not.toBe(normalizeFullName('Marie Martinez'))
  })
})

describe('normalizeLinkedinUrl', () => {
  it('ignores protocol, subdomain, trailing slash, query and case', () => {
    const canonical = normalizeLinkedinUrl('https://www.linkedin.com/in/jean-dupont/')
    expect(normalizeLinkedinUrl('http://linkedin.com/in/jean-dupont')).toBe(canonical)
    expect(normalizeLinkedinUrl('https://fr.linkedin.com/in/Jean-Dupont?trk=abc')).toBe(canonical)
  })

  it('returns empty for blank or non-profile values', () => {
    expect(normalizeLinkedinUrl('')).toBe('')
    expect(normalizeLinkedinUrl(null)).toBe('')
  })
})

describe('normalizePhone', () => {
  // #2380.45 — deux sources donnent le même numéro sous deux formes : Pappers
  // en local ("01 02 03 04 05"), Apollo/Dropcontact en international
  // ("+33102030405"). Sans normalisation, le même humain porte deux numéros.
  it('collapses a French national number and its international form to the same key', () => {
    expect(normalizePhone('01 02 03 04 05')).toBe(normalizePhone('+33 1 02 03 04 05'))
  })

  it('ignores separators (spaces, dots, dashes, parentheses)', () => {
    expect(normalizePhone('06.12.34.56.78')).toBe(normalizePhone('06-12-34-56-78'))
    expect(normalizePhone('(0)6 12 34 56 78')).toBe(normalizePhone('0612345678'))
  })

  it("keeps a foreign number's own country code, never assumes +33", () => {
    expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
  })

  it('returns empty for blank or too-short input, never a fake number', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('4512')).toBe('')
  })

  it('keeps genuinely different numbers apart', () => {
    expect(normalizePhone('0612345678')).not.toBe(normalizePhone('0612345679'))
  })
})

describe('contactIdentityKeys', () => {
  it('matches on email regardless of name spelling', () => {
    const a = contactIdentityKeys({ fullName: 'Sébastien Chauffray', email: 'S.Chauffray@payfit.com' })
    const b = contactIdentityKeys({ fullName: 'Seb Chauffray', email: 's.chauffray@payfit.com' })
    expect(a.some(k => b.includes(k))).toBe(true)
  })

  it('matches on phone regardless of name spelling or formatting', () => {
    const a = contactIdentityKeys({ fullName: 'Sébastien Chauffray', phone: '06 12 34 56 78' })
    const b = contactIdentityKeys({ fullName: 'Seb Chauffray', phone: '+33612345678' })
    expect(a.some(k => b.includes(k))).toBe(true)
  })

  it('matches on linkedin url regardless of name spelling', () => {
    const a = contactIdentityKeys({ fullName: 'Paul Onnen', linkedinUrl: 'https://linkedin.com/in/paulonnen' })
    const b = contactIdentityKeys({ fullName: 'P. Onnen', linkedinUrl: 'https://www.linkedin.com/in/paulonnen/' })
    expect(a.some(k => b.includes(k))).toBe(true)
  })

  it('matches a registry "NOM Prénom" against an Apollo "Prénom Nom"', () => {
    // Pappers assembles `nom` + `prenom`; Apollo emits first-then-last. Same human.
    const a = contactIdentityKeys({ fullName: 'DUPONT Jean' })
    const b = contactIdentityKeys({ fullName: 'Jean Dupont' })
    expect(a.some(k => b.includes(k))).toBe(true)
  })

  it('does not match two different people who share no identifier', () => {
    const a = contactIdentityKeys({ fullName: 'Jean Dupont' })
    const b = contactIdentityKeys({ fullName: 'Marie Martin' })
    expect(a.some(k => b.includes(k))).toBe(false)
  })

  it('returns no keys for an unidentifiable contact', () => {
    expect(contactIdentityKeys({ fullName: '   ' })).toEqual([])
  })

  it('namespaces keys so an email can never collide with a name', () => {
    const keys = contactIdentityKeys({ fullName: 'Jean Dupont', email: 'jean@x.fr' })
    expect(keys.every(k => k.includes(':'))).toBe(true)
  })

  // Apollo's People-Search tier returns `first_name` + an OBFUSCATED last name
  // ("Mo***y"), so every hit reaches us as a lone first name. Keying those on the
  // name alone would collapse every "Severine" of the account into one row —
  // the exact data destruction the identity guard exists to prevent. The Apollo
  // person id is the identifier that keeps them apart.
  it('keeps two obfuscated namesakes apart when each carries its Apollo id', () => {
    const a = contactIdentityKeys({ fullName: 'Severine', apolloId: '54a2617474686933187f271e' })
    const b = contactIdentityKeys({ fullName: 'Severine', apolloId: '61c0f8a9d3b24e0001a7c512' })
    expect(a.some(k => b.includes(k))).toBe(false)
  })

  it('matches the same Apollo person once the last name is revealed', () => {
    // Phase 2 stores "Severine" + id; the People-Match reveals "Severine Mondy".
    // Same id ⇒ same human, whatever the name grew into.
    const seed = contactIdentityKeys({ fullName: 'Severine', apolloId: '54a2617474686933187f271e' })
    const revealed = contactIdentityKeys({ fullName: 'Severine Mondy', apolloId: '54a2617474686933187f271e' })
    expect(seed.some(k => revealed.includes(k))).toBe(true)
  })

  it('drops the name key when the name is a lone token backed by an Apollo id', () => {
    // Otherwise `name:severine` would still be published and two namesakes would
    // merge through it, id or no id.
    const keys = contactIdentityKeys({ fullName: 'Severine', apolloId: '54a2617474686933187f271e' })
    expect(keys).toEqual(['apollo:54a2617474686933187f271e'])
  })

  it('does not publish a phone key for a too-short or blank number', () => {
    const keys = contactIdentityKeys({ fullName: 'Jean Dupont', phone: '00' })
    expect(keys.some(k => k.startsWith('tel:'))).toBe(false)
  })

  it('keeps the name key when a full name accompanies the Apollo id', () => {
    // A real two-token name still has to match the Pappers / web row for the same
    // person, which carries no Apollo id.
    const keys = contactIdentityKeys({ fullName: 'Severine Mondy', apolloId: '54a2617474686933187f271e' })
    expect(keys).toContain('apollo:54a2617474686933187f271e')
    expect(keys).toContain('name:severine mondy')
  })
})

describe('pickRicher', () => {
  it('prefers a real value over null/empty', () => {
    expect(pickRicher(null, 'CTO')).toBe('CTO')
    expect(pickRicher('', 'CTO')).toBe('CTO')
    expect(pickRicher('CTO', null)).toBe('CTO')
  })

  it('keeps the incumbent when the candidate is blank', () => {
    expect(pickRicher('CTO', '   ')).toBe('CTO')
  })

  it('prefers the more specific (longer) title over a terse one', () => {
    // Pappers lands first with a legal role; Apollo later brings the operational
    // title. The richer one should win instead of being dropped.
    expect(pickRicher('CTO', 'Chief Technology Officer')).toBe('Chief Technology Officer')
  })

  it('does not swap when the candidate is merely a longer restatement of nothing', () => {
    expect(pickRicher('Directeur des Systèmes d’Information', '-')).toBe('Directeur des Systèmes d’Information')
  })

  it('returns null when both are empty', () => {
    expect(pickRicher(null, undefined)).toBeNull()
  })
})

describe('pickRicherName', () => {
  // The production incident: the dedup merge ranked survivors by filled-field
  // count and never looked at the NAME, so "Sébastien Chauffray" was deleted in
  // favour of "Sebastien Chauffray". De-accenting is a lossy one-way transform:
  // between two spellings that normalise to the same key, the one that still
  // carries its diacritics is the source-faithful one.
  it('keeps the accented spelling over the stripped one', () => {
    expect(pickRicherName('Sebastien Chauffray', 'Sébastien Chauffray')).toBe('Sébastien Chauffray')
    expect(pickRicherName('Sébastien Chauffray', 'Sebastien Chauffray')).toBe('Sébastien Chauffray')
  })

  it('counts diacritics, so the most-accented variant wins', () => {
    expect(pickRicherName('Frederic Mazzella', 'Frédéric Mazzella')).toBe('Frédéric Mazzella')
    // Partial accenting from one source must not beat full accenting from another.
    expect(pickRicherName('Frédéric Mazzella', 'Frédéric Mazzélla')).toBe('Frédéric Mazzélla')
  })

  it('never substitutes a DIFFERENT person, however accented', () => {
    // The two names do not normalise to the same key — this is not a spelling
    // variant, it is someone else. Refusing here is what stops a merge bug from
    // becoming a data-corruption bug.
    expect(pickRicherName('Jean Dupont', 'Jérôme Grivet')).toBe('Jean Dupont')
  })

  it('keeps the incumbent when neither carries more information', () => {
    // Casing is a separate axis and guessing it is not our job: stay stable.
    expect(pickRicherName('Frédéric BOMMARITO', 'Frédéric Bommarito')).toBe('Frédéric BOMMARITO')
  })

  it('falls back to a real value when one side is blank', () => {
    expect(pickRicherName('', 'Jérôme Grivet')).toBe('Jérôme Grivet')
    expect(pickRicherName('Jérôme Grivet', '   ')).toBe('Jérôme Grivet')
  })

  it('never invents an accent that neither spelling carried', () => {
    // Both sources say "Sebastien". We return one of them verbatim — we do not
    // reconstruct "Sébastien" from a dictionary of French first names.
    expect(pickRicherName('Sebastien Chauffray', 'Sebastien Chauffray')).toBe('Sebastien Chauffray')
  })
})

describe('isIdentifiablePerson', () => {
  // Production leftovers: rows whose whole name is "Frederic", "Gerard",
  // "Gaelle"… A lone first name identifies nobody — and merging it into
  // "Frederic Mazzella" would be a guess (two Frédérics in one company is
  // ordinary). The prudent rule is to never create the row in the first place.
  it('rejects a lone first name with no other identifier', () => {
    expect(isIdentifiablePerson({ fullName: 'Frederic' })).toBe(false)
    expect(isIdentifiablePerson({ fullName: 'Sebastien' })).toBe(false)
  })

  it('accepts a full name', () => {
    expect(isIdentifiablePerson({ fullName: 'Frederic Mazzella' })).toBe(true)
  })

  it('accepts a single token backed by a hard identifier', () => {
    // An email or a LinkedIn profile IS an identity; the thin name is then just
    // a display label, and the row is still uniquely resolvable.
    expect(isIdentifiablePerson({ fullName: 'Frederic', email: 'f.mazzella@blablacar.com' })).toBe(true)
    expect(
      isIdentifiablePerson({ fullName: 'Frederic', linkedinUrl: 'https://linkedin.com/in/fredericmazzella' }),
    ).toBe(true)
  })

  it('rejects a nameless, identifier-less contact', () => {
    expect(isIdentifiablePerson({ fullName: '  ' })).toBe(false)
  })

  it('counts a hyphenated compound first name as one token, not two', () => {
    // "Jean-François" alone is still only a first name.
    expect(isIdentifiablePerson({ fullName: 'Jean-François' })).toBe(false)
    expect(isIdentifiablePerson({ fullName: 'Jean-François Dupouy' })).toBe(true)
  })

  // Apollo's search tier obfuscates the last name, so EVERY hit arrives as a lone
  // first name and this guard silently rejected all of them — an account was left
  // with only its registry mandataires (9 contacts at Dassault Aviation for 1379
  // people Apollo actually held). The Apollo person id is a hard identifier: it
  // resolves the real human through a People-Match, exactly like a LinkedIn URL.
  it('accepts a lone first name backed by an Apollo person id', () => {
    expect(isIdentifiablePerson({ fullName: 'Severine', apolloId: '54a2617474686933187f271e' })).toBe(true)
  })

  it('still rejects a blank name even with an Apollo id', () => {
    // The id resolves a person, but a row with nothing to display is not a
    // contact — and Apollo always sends the first name alongside the id.
    expect(isIdentifiablePerson({ fullName: '   ', apolloId: '54a2617474686933187f271e' })).toBe(false)
  })
})

describe('hasCompleteIdentity — ce qui rend un contact utilisable', () => {
  it('un nom en deux mots est une identité complète', () => {
    expect(hasCompleteIdentity({ fullName: 'Claire Vasseur' })).toBe(true)
  })

  it('un prénom seul ne l’est PAS, même avec un identifiant fournisseur', () => {
    // Mesuré sur un run réel : les douze premiers contacts de Société Générale
    // étaient des prénoms seuls, parce que l'offre de recherche Apollo masque le
    // nom de famille. Un identifiant rend la ligne stockable ; il ne la rend pas
    // utilisable par un commercial.
    expect(hasCompleteIdentity({ fullName: 'Willy', apolloId: 'abc123' })).toBe(false)
    expect(hasCompleteIdentity({ fullName: 'Vlad', linkedinUrl: 'https://linkedin.com/in/vlad' })).toBe(false)
  })

  it('une adresse professionnelle vaut identité complète', () => {
    // Elle porte presque toujours le patronyme, et elle permet d'écrire.
    expect(hasCompleteIdentity({ fullName: 'Willy', email: 'willy.marchand@example.com' })).toBe(true)
  })

  it('un nom composé reste un seul prénom', () => {
    expect(hasCompleteIdentity({ fullName: 'Jean-François' })).toBe(false)
  })

  it('un nom vide n’est pas une identité', () => {
    expect(hasCompleteIdentity({ fullName: '   ' })).toBe(false)
    expect(hasCompleteIdentity({})).toBe(false)
  })
})

describe('sortByUsableIdentity — l’ordre, pas un filtre', () => {
  it('remonte les identités complètes sans rien retirer', () => {
    const rows = [
      { full_name: 'Willy', email: null },
      { full_name: 'Claire Vasseur', email: null },
      { full_name: 'Vlad', email: null },
      { full_name: 'Marc Aubriot', email: null },
    ]
    expect(sortByUsableIdentity(rows).map(r => r.full_name)).toEqual([
      'Claire Vasseur',
      'Marc Aubriot',
      'Willy',
      'Vlad',
    ])
    // Rien n'est perdu : un prénom + un titre reste une piste.
    expect(sortByUsableIdentity(rows)).toHaveLength(4)
  })

  it('préserve l’ordre d’entrée à complétude égale — c’est déjà celui de la priorité', () => {
    const rows = [{ full_name: 'Claire Vasseur' }, { full_name: 'Marc Aubriot' }, { full_name: 'Sophie Ledran' }]
    expect(sortByUsableIdentity(rows).map(r => r.full_name)).toEqual([
      'Claire Vasseur',
      'Marc Aubriot',
      'Sophie Ledran',
    ])
  })

  it('ne modifie pas le tableau reçu', () => {
    const rows = [{ full_name: 'Willy' }, { full_name: 'Claire Vasseur' }]
    sortByUsableIdentity(rows)
    expect(rows.map(r => r.full_name)).toEqual(['Willy', 'Claire Vasseur'])
  })

  it('rend une liste vide sans broncher', () => {
    expect(sortByUsableIdentity([])).toEqual([])
  })
})
