import {
  DIRECT_IDENTIFIER_FAMILIES,
  findDirectIdentifierColumn,
  stripDirectIdentifiers,
} from './market-memory-identifiers'

describe('identifiants directs — liste fermée (décision Louis 02/11/2026)', () => {
  it('nomme les dix familles exclues', () => {
    expect(DIRECT_IDENTIFIER_FAMILIES).toEqual([
      'nom',
      'prenom',
      'nom_complet',
      'genre',
      'telephone',
      'email',
      'url_profil',
      'photo',
      'adresse_postale',
      'naissance_age',
    ])
  })

  it.each([
    'nom',
    'Prénom',
    'last_name',
    'full_name',
    'nom_complet',
    'genre',
    'civilite',
    'telephone',
    'phone',
    'email',
    'contact_email',
    'linkedin_url',
    'profile_url',
    'photo_url',
    'adresse',
    'code_postal',
    'date_naissance',
    'age',
  ])('reconnaît « %s » comme identifiant direct', column => {
    expect(findDirectIdentifierColumn([column])).toBe(column)
  })

  it.each([
    'nom_entreprise',
    'esn_nom',
    'client_nom',
    'techno',
    'poste',
    'tjm',
    'ville_mission',
    'client_actuel',
    'tarif',
    'date_debut',
  ])('laisse passer « %s »', column => {
    expect(findDirectIdentifierColumn([column])).toBeNull()
  })

  it('retire les identifiants À LA LECTURE : rien ne survit dans l’enregistrement', () => {
    const record = {
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'j@x.fr',
      telephone: '0102030405',
      linkedin: 'https://linkedin.com/in/jd',
      poste: 'Data Engineer',
      techno: 'Kafka',
    }
    const stripped = stripDirectIdentifiers(record)
    expect(stripped).toEqual({ poste: 'Data Engineer', techno: 'Kafka' })
    expect(JSON.stringify(stripped)).not.toMatch(/Dupont|j@x\.fr|0102030405|linkedin/)
  })
})
