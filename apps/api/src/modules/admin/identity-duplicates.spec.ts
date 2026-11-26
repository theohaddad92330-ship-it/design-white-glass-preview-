import { findIdentityDuplicates, type IdentityCandidate } from './identity-duplicates'

const user = (over: Partial<IdentityCandidate> & { userId: string }): IdentityCandidate => ({
  email: null,
  fullName: null,
  workspaceIds: [],
  accountCount: 0,
  createdAt: null,
  ...over,
})

describe('doublons d’identité (IDENT-01)', () => {
  it('rapproche deux adresses que le fournisseur traite comme une seule', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'a', email: 'theo.haddad@gmail.com' }),
      user({ userId: 'b', email: 'theohaddad+bellum@gmail.com' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.reasons).toContain('same_email')
    expect(pairs[0]!.confidence).toBeGreaterThanOrEqual(0.95)
  })

  it('rapproche la même personne sur deux domaines (le cas observé)', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'pro', email: 'theo@bellum-ai.com', fullName: 'Théo Haddad' }),
      user({ userId: 'perso', email: 'theo@gmail.com', fullName: 'Theo HADDAD' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.reasons).toEqual(expect.arrayContaining(['same_local_part', 'same_name']))
  })

  it('ne rapproche PAS deux homonymes sans rapport d’adresse', () => {
    // La pire proposition possible : elle a l'air vraie, et un opérateur pressé
    // fusionnerait deux clients différents.
    const pairs = findIdentityDuplicates([
      user({ userId: 'a', email: 'martin.dupont@acme.fr', fullName: 'Martin Dupont' }),
      user({ userId: 'b', email: 'm.dupont@autre-societe.fr', fullName: 'Martin Dupont' }),
    ])
    expect(pairs).toEqual([])
  })

  it('désigne comme compte à garder celui qui porte le plus de dossiers', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'vide', email: 'theo@a.com', accountCount: 0 }),
      user({ userId: 'plein', email: 'theo@b.com', accountCount: 12 }),
    ])
    expect(pairs[0]!.keep.userId).toBe('plein')
    expect(pairs[0]!.absorb.userId).toBe('vide')
  })

  it('départage par ancienneté à égalité de dossiers', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'recent', email: 'theo@a.com', accountCount: 3, createdAt: '2026-08-01T00:00:00Z' }),
      user({ userId: 'ancien', email: 'theo@b.com', accountCount: 3, createdAt: '2026-02-01T00:00:00Z' }),
    ])
    expect(pairs[0]!.keep.userId).toBe('ancien')
  })

  it('dit quand les deux comptes partagent déjà un espace — rien n’est fragmenté', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'a', email: 'theo@a.com', workspaceIds: ['ws-1'] }),
      user({ userId: 'b', email: 'theo@b.com', workspaceIds: ['ws-1', 'ws-2'] }),
    ])
    expect(pairs[0]!.sharesWorkspace).toBe(true)
  })

  it('ne rend rien sur une base sans doublon', () => {
    expect(
      findIdentityDuplicates([
        user({ userId: 'a', email: 'alice@acme.fr', fullName: 'Alice Martin' }),
        user({ userId: 'b', email: 'bob@acme.fr', fullName: 'Bob Durand' }),
      ]),
    ).toEqual([])
  })

  it('ignore une adresse illisible plutôt que de la rapprocher de tout', () => {
    expect(
      findIdentityDuplicates([user({ userId: 'a', email: '@acme.fr' }), user({ userId: 'b', email: 'pasunemail' })]),
    ).toEqual([])
  })

  it('rend un ordre stable — la liste ne doit pas bouger sous l’opérateur', () => {
    const input = [
      user({ userId: 'z', email: 'theo@a.com' }),
      user({ userId: 'a', email: 'theo@b.com' }),
      user({ userId: 'm', email: 'alice@a.com', fullName: 'Alice Martin' }),
      user({ userId: 'n', email: 'alice@b.com', fullName: 'Alice Martin' }),
    ]
    expect(JSON.stringify(findIdentityDuplicates(input))).toBe(JSON.stringify(findIdentityDuplicates(input)))
  })

  // #4600 — une adresse PARTAGÉE n'est pas une identité. (Ici les adresses sont celles de la connexion, confirmées par
  // l'authentification : la règle « vérifiée » est déjà satisfaite, restent le nombre de porteurs et la boîte générique.)
  it('une adresse portée par trois comptes ou plus ne prouve l’identité de personne', () => {
    const pairs = findIdentityDuplicates([
      user({ userId: 'a', email: 'partage.interne@exemple-societe.test', fullName: 'Alice Bernard' }),
      user({ userId: 'b', email: 'partage.interne@exemple-societe.test', fullName: 'Hugo Lambert' }),
      user({ userId: 'c', email: 'partage.interne@exemple-societe.test', fullName: 'Zoé Petit' }),
    ])
    expect(pairs).toEqual([])
  })

  it('une boîte générique (contact@, info@) n’est pas une identité, même à deux comptes et sur deux domaines', () => {
    expect(
      findIdentityDuplicates([
        user({ userId: 'a', email: 'contact@exemple-societe.test' }),
        user({ userId: 'b', email: 'contact@exemple-societe.test' }),
      ]),
    ).toEqual([])
    expect(
      findIdentityDuplicates([
        user({ userId: 'a', email: 'info@exemple-societe.test' }),
        user({ userId: 'b', email: 'info@autre-societe.test' }),
      ]),
    ).toEqual([])
  })

  it('deux comptes qui partagent UNE adresse non générique restent rapprochés', () => {
    expect(
      findIdentityDuplicates([
        user({ userId: 'a', email: 'jeanne.durand@exemple-societe.test' }),
        user({ userId: 'b', email: 'jeanne.durand@exemple-societe.test' }),
      ]),
    ).toHaveLength(1)
  })
})
