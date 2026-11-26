import { guestWarningMailto, parseGuestList, validatedSingleEmail } from './guest-list'

describe('parseGuestList', () => {
  it('accepte les séparateurs qu’on tape ou qu’on colle', () => {
    // Virgule, point-virgule, espace, retour à la ligne : on colle depuis un
    // mail, un tableur ou une signature.
    const parsed = parseGuestList('a@x.fr, b@y.fr; c@z.fr\nd@w.fr')
    expect(parsed.valid).toEqual(['a@x.fr', 'b@y.fr', 'c@z.fr', 'd@w.fr'])
    expect(parsed.invalid).toEqual([])
  })

  it('NOMME ce qui ne va pas plutôt que de le jeter', () => {
    // Une adresse écartée en silence fait envoyer une invitation à trois
    // personnes quand on en attendait quatre, sans rien dire.
    const parsed = parseGuestList('bon@x.fr, pas-une-adresse, autre@y.fr')
    expect(parsed.valid).toEqual(['bon@x.fr', 'autre@y.fr'])
    expect(parsed.invalid).toEqual(['pas-une-adresse'])
  })

  it('déduplique, casse comprise', () => {
    // Deux fois la même adresse enverrait deux invitations à la même personne.
    expect(parseGuestList('A@X.fr, a@x.fr').valid).toEqual(['a@x.fr'])
  })

  it('rend deux listes vides sur une saisie vide', () => {
    expect(parseGuestList('')).toEqual({ valid: [], invalid: [] })
    expect(parseGuestList('   ')).toEqual({ valid: [], invalid: [] })
  })

  it('ne signale pas deux fois la même erreur', () => {
    expect(parseGuestList('oops, oops').invalid).toEqual(['oops'])
  })
})

describe('validatedSingleEmail', () => {
  it('rend l’adresse normalisée quand elle est valide', () => {
    expect(validatedSingleEmail('Prenom.Nom@Exemple.fr')).toBe('prenom.nom@exemple.fr')
  })

  it('rend null sur une saisie vide', () => {
    expect(validatedSingleEmail('')).toBeNull()
    expect(validatedSingleEmail('   ')).toBeNull()
  })

  it('rend null sur une adresse invalide', () => {
    expect(validatedSingleEmail('pas-une-adresse')).toBeNull()
  })

  it('rend null quand plus d’une adresse est tapée — « UN destinataire », jamais un lot', () => {
    expect(validatedSingleEmail('a@x.fr, b@y.fr')).toBeNull()
  })
})

describe('guestWarningMailto', () => {
  it('encode le destinataire, le sujet et le corps', () => {
    const href = guestWarningMailto('a@x.fr', 'Sujet & test', 'Bonjour,\n\nligne 2.')
    expect(href).toBe('mailto:a%40x.fr?subject=Sujet%20%26%20test&body=Bonjour%2C%0A%0Aligne%202.')
  })
})
