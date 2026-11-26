import { isPlaceholderEmail, refusePlaceholderEmail } from './placeholder-email'

describe('isPlaceholderEmail', () => {
  it.each([
    'prenom.nom@exemple-societe.test',
    'nom.prenom@exemple-societe.test',
    'prenom@exemple-societe.test',
    'nom@exemple-societe.test',
    'firstname.lastname@exemple-societe.test',
    'first.last@exemple-societe.test',
    'name.surname@exemple-societe.test',
    'votre.nom@exemple-societe.test',
    'votre.prenom@exemple-societe.test',
    'prenom_nom@exemple-societe.test',
    'prenom-nom@exemple-societe.test',
    'firstname_lastname@exemple-societe.test',
    'FirstName.LastName@Exemple-Societe.test',
    ' prenom.nom@exemple-societe.test ',
    'prenom.nom+tag@exemple-societe.test',
  ])('refuse le gabarit %s', value => {
    expect(isPlaceholderEmail(value)).toBe(true)
  })

  it.each([
    'jeanne.durand@exemple-societe.test',
    'nomade@exemple-societe.test',
    'contact@exemple-societe.test',
    'prenomade.nom@exemple-societe.test',
    'a.b@exemple-societe.test',
    '',
    null,
    undefined,
    'pas-une-adresse',
  ])('laisse passer %s', value => {
    expect(isPlaceholderEmail(value)).toBe(false)
  })
})

describe('refusePlaceholderEmail', () => {
  it('rend la raison et jamais une adresse devinée', () => {
    const out = refusePlaceholderEmail('prenom.nom@exemple-societe.test')
    expect(out).toEqual({ email: null, refused: 'placeholder_local_part' })
  })

  it('garde une vraie adresse telle quelle', () => {
    expect(refusePlaceholderEmail('jeanne.durand@exemple-societe.test')).toEqual({
      email: 'jeanne.durand@exemple-societe.test',
      refused: null,
    })
  })

  it('une absence reste une absence', () => {
    expect(refusePlaceholderEmail(null)).toEqual({ email: null, refused: null })
    expect(refusePlaceholderEmail('  ')).toEqual({ email: null, refused: null })
  })
})

// #4599 — la preuve EXACTE côté API : le filtre de liste `placeholderEmail` compte les gabarits en base, là où l'écran
// ne montre que 25 lignes sur 67 224. Le motif SQL a UNE source (la liste de mots de la garde d'écriture, GA-26).
describe('placeholderEmailSqlPattern (#4599)', () => {
  const { placeholderEmailSqlPattern } = jest.requireActual('./placeholder-email') as {
    placeholderEmailSqlPattern: () => string
  }
  const matches = (email: string) => new RegExp(placeholderEmailSqlPattern(), 'i').test(email)

  it('reconnaît les gabarits FR et EN, avec séparateurs et sous-adresse', () => {
    for (const email of [
      'prenom.nom@acme.fr',
      'Prénom.Nom@acme.fr',
      'firstname_lastname@acme.com',
      'votre-nom@acme.com',
      'nom+tag@acme.com',
    ]) {
      expect(matches(email)).toBe(true)
    }
  })

  it('SAIT DIRE NON : une vraie adresse, même proche d’un mot-remplaçant, ne passe pas', () => {
    for (const email of ['jean.nom@acme.fr', 'nomade@acme.fr', 'prenom.dupont@acme.fr', 'marie.curie@acme.fr']) {
      expect(matches(email)).toBe(false)
    }
  })
})
