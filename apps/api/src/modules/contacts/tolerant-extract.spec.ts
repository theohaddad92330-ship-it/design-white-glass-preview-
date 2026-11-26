import { extractContact } from './tolerant-extract'

describe('extractContact', () => {
  it('trouve une adresse quelle que soit la clé qui la porte', () => {
    // C'est tout l'intérêt : on ne connaît pas le contrat de ces fournisseurs.
    expect(extractContact({ data: { email: 'marc@acme.fr' } }).email).toBe('marc@acme.fr')
    expect(extractContact({ results: [{ contact: { email_address: 'marc@acme.fr' } }] }).email).toBe('marc@acme.fr')
    expect(extractContact({ any: { deeply: { nested: ['marc@acme.fr'] } } }).email).toBe('marc@acme.fr')
  })

  it('ne retient QUE ce qui est une adresse — la clé ne fait pas foi', () => {
    expect(extractContact({ email: 'non renseigné' }).email).toBeUndefined()
    expect(extractContact({ email: 'marc(at)acme.fr' }).email).toBeUndefined()
  })

  it('écarte une adresse marquée comme devinée', () => {
    // Une adresse construite par motif est exactement ce qu'un commercial ne
    // doit pas envoyer — et ce pour quoi il aurait payé un crédit.
    expect(extractContact({ pattern_email: 'm.dupuis@acme.fr' }).email).toBeUndefined()
    expect(extractContact({ data: { guess: { email: 'm.dupuis@acme.fr' } } }).email).toBeUndefined()
    expect(extractContact({ catch_all: ['contact@acme.fr'] }).email).toBeUndefined()
  })

  it('n’accepte pas en écho une valeur qu’on a envoyée', () => {
    const payload = { request: { email: 'connu@acme.fr' }, data: {} }
    expect(extractContact(payload, { sent: ['connu@acme.fr'] }).email).toBeUndefined()
  })

  it('préfère une adresse sur le domaine du compte', () => {
    const payload = { a: 'perso@gmail.com', b: 'marc@acme.fr' }
    expect(extractContact(payload, { expectedDomain: 'acme.fr' }).email).toBe('marc@acme.fr')
    expect(extractContact(payload, { expectedDomain: 'www.acme.fr' }).email).toBe('marc@acme.fr')
  })

  it('accepte une autre adresse À DÉFAUT, plutôt que rien', () => {
    expect(extractContact({ a: 'perso@gmail.com' }, { expectedDomain: 'acme.fr' }).email).toBe('perso@gmail.com')
  })

  it('reconnaît un numéro exploitable et rejette le reste', () => {
    expect(extractContact({ phone: '+33 1 42 68 53 00' }).phone).toBe('+33 1 42 68 53 00')
    // Un poste interne n'est pas un moyen d'appeler quelqu'un.
    expect(extractContact({ phone: '4512' }).phone).toBeUndefined()
    // Un identifiant à rallonge non plus.
    expect(extractContact({ ref: 'ID-20250814' }).phone).toBeUndefined()
    expect(extractContact({ ref: '12345678901234567890' }).phone).toBeUndefined()
  })

  it('rend un objet vide sur une réponse vide, nulle ou hostile', () => {
    expect(extractContact(null)).toEqual({})
    expect(extractContact({})).toEqual({})
    expect(extractContact('bonjour')).toEqual({})
    expect(extractContact({ error: 'quota exceeded' })).toEqual({})
  })

  it('borne la profondeur — une réponse hostile ne fait pas tourner le serveur', () => {
    let deep: unknown = 'marc@acme.fr'
    for (let i = 0; i < 40; i += 1) deep = { nested: deep }
    expect(extractContact(deep).email).toBeUndefined()
  })

  it('borne le nombre de nœuds parcourus', () => {
    const huge = { list: Array.from({ length: 20_000 }, () => 'texte quelconque') }
    const started = Date.now()
    expect(extractContact(huge)).toEqual({})
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
