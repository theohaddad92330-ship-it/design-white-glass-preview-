import {
  findAccountDuplicatePairs,
  findDuplicatePairs,
  findIncompleteRecords,
  findSetAsideAccountPairs,
  normalizeEmail,
  normalizeName,
} from './crm-duplicates'

/**
 * Fusionner deux fiches est irréversible côté CRM. Un faux positif détruit
 * l'historique d'un vrai client — d'où le soin porté à ce qui n'est PAS un
 * doublon.
 */
const record = (id: string, name: string | null, email: string | null, company: string | null) => ({
  id,
  name,
  email,
  company,
})

describe('findDuplicatePairs', () => {
  it('la même adresse vaut une quasi-certitude', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Claire Vasseur', 'claire@helios.example', 'Helios'),
      record('2', 'C. Vasseur', 'CLAIRE@Helios.example', 'Groupe Helios'),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.reason).toBe('same_email')
    expect(pairs[0]?.confidence).toBeGreaterThan(0.9)
  })

  it('deux homonymes chez DEUX sociétés différentes ne sont pas rapprochés', () => {
    // C'est la pire erreur possible dans un CRM commercial : fusionner deux
    // clients parce que leurs interlocuteurs s'appellent pareil.
    const pairs = findDuplicatePairs([
      record('1', 'Martin Dupont', null, 'ACME'),
      record('2', 'Martin Dupont', null, 'NovaSanté'),
    ])
    expect(pairs).toHaveLength(0)
  })

  it('deux homonymes chez la MÊME société sont proposés, avec une confiance moyenne', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Martin Dupont', null, 'ACME'),
      record('2', 'martin dupont', null, 'acme'),
    ])
    expect(pairs[0]?.reason).toBe('same_name_same_company')
    expect(pairs[0]?.confidence).toBeLessThan(0.9)
  })

  it('deux homonymes SANS société sont proposés avec une confiance basse', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Martin Dupont', null, null),
      record('2', 'MARTIN DUPONT', null, null),
    ])
    expect(pairs[0]?.reason).toBe('same_name_no_company')
    expect(pairs[0]?.confidence).toBeLessThan(0.5)
  })

  it('ne rapproche pas deux fiches vides', () => {
    expect(findDuplicatePairs([record('1', null, null, null), record('2', null, null, 'ACME')])).toHaveLength(0)
  })

  it('ne compte jamais deux fois la même paire', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Claire Vasseur', 'claire@helios.example', 'Helios'),
      record('2', 'Claire Vasseur', 'claire@helios.example', 'Helios'),
    ])
    expect(pairs).toHaveLength(1)
  })

  it('classe les plus sûrs en premier', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Martin Dupont', null, null),
      record('2', 'Martin Dupont', null, null),
      record('3', 'Claire V', 'c@x.example', null),
      record('4', 'Claire Vasseur', 'c@x.example', null),
    ])
    expect(pairs[0]?.reason).toBe('same_email')
  })

  it('ignore une adresse qui n’en est pas une', () => {
    const pairs = findDuplicatePairs([
      record('1', 'Paul', 'à compléter', 'ACME'),
      record('2', 'Jean', 'à compléter', 'NovaSanté'),
    ])
    expect(pairs).toHaveLength(0)
  })
})

describe('findIncompleteRecords', () => {
  it('ne signale que ce qui EMPÊCHE de travailler', () => {
    const incomplete = findIncompleteRecords([
      record('1', 'Claire Vasseur', 'claire@helios.example', 'Helios'),
      record('2', 'Karim', null, 'NovaSanté'),
      record('3', null, 'x@y.example', null),
    ])
    expect(incomplete.map(entry => entry.record.id)).toEqual(['2', '3'])
    expect(incomplete[0]?.missing).toEqual(['email'])
    expect(incomplete[1]?.missing).toEqual(['company', 'name'])
  })
})

describe('normalisation', () => {
  it('retire accents et ponctuation des noms', () => {
    expect(normalizeName('Émilie  CHARTIER-Dupré')).toBe('emilie chartier dupre')
  })

  it('rejette une chaîne qui n’a pas la forme d’une adresse', () => {
    expect(normalizeEmail('pas-une-adresse')).toBe('')
    expect(normalizeEmail(' JEAN@Acme.COM ')).toBe('jean@acme.com')
  })
})

describe('findAccountDuplicatePairs — #3490', () => {
  const account = (id: string, name: string | null) => ({ id, name })

  it('« Société Générale » et « Societe Generale » se PROPOSENT en fusion', () => {
    const pairs = findAccountDuplicatePairs([account('a', 'Société Générale'), account('b', 'Societe Generale')])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ reason: 'same_name', confidence: 0.85 })
  })

  it('la casse et la ponctuation ne séparent pas deux comptes', () => {
    expect(findAccountDuplicatePairs([account('a', 'KLESIA'), account('b', ' klesia. ')])).toHaveLength(1)
  })

  it('SAIT DIRE NON : « ACME » et « ACME Services » sont deux entités, jamais proposées', () => {
    expect(findAccountDuplicatePairs([account('a', 'ACME'), account('b', 'ACME Services')])).toEqual([])
    expect(findAccountDuplicatePairs([account('a', 'KLESIA'), account('b', 'KLESIA ADP')])).toEqual([])
  })

  // #3490 (recette Y20) — la paire SG restait absente avec 67 comptes examinés : les
  // variantes de saisie d'un MÊME nom ne se rapprochaient pas toutes.
  it.each([
    ['Société Générale S.A.', 'Societe Generale'],
    ['SOCIETE GENERALE SA', 'Société Générale'],
    ['Société Générale', 'Société Générale'.normalize('NFD')],
    ['Société\u00a0Générale', 'Societe Generale'],
    ['Crédit Agricole S.A.', 'Credit Agricole'],
    ['Bouygues Telecom SAS', 'BOUYGUES TELECOM'],
    ['L’Oréal', "L'Oreal"],
    ['Œuvres & Co', 'Oeuvres et Co'],
  ])('« %s » et « %s » sont le même nom', (left, right) => {
    expect(findAccountDuplicatePairs([account('a', left), account('b', right)])).toHaveLength(1)
  })

  it('SAIT DIRE NON : une forme juridique ne rapproche pas deux noms distincts, ni ne vide un nom', () => {
    expect(findAccountDuplicatePairs([account('a', 'Orange SA'), account('b', 'Engie SA')])).toEqual([])
    expect(findAccountDuplicatePairs([account('a', 'SA'), account('b', 'sa.')])).toHaveLength(1)
    expect(findAccountDuplicatePairs([account('a', 'SA'), account('b', 'Engie SA')])).toEqual([])
    expect(findAccountDuplicatePairs([account('a', 'ACME SAS'), account('b', 'ACME Services')])).toEqual([])
  })

  it('deux comptes sans nom ne sont pas rapprochés', () => {
    expect(findAccountDuplicatePairs([account('a', null), account('b', '  ')])).toEqual([])
  })

  it('un seul compte, ou deux noms distincts : aucune paire', () => {
    expect(findAccountDuplicatePairs([account('a', 'Orange')])).toEqual([])
    expect(findAccountDuplicatePairs([account('a', 'Orange'), account('b', 'Engie')])).toEqual([])
  })
})

/**
 * #3490 (recette Y22) — « Société Générale » / « Societe Generale » n'était pas proposée et
 * l'écran ne disait pas pourquoi : l'un des deux comptes était archivé ou rattaché, donc hors
 * de la comparaison. Ces paires-là ne se PROPOSENT pas (proposer de rattacher ce qui l'est
 * déjà ferait revenir un doublon réglé) mais se DISENT : elles se calculent à part.
 */
describe('findSetAsideAccountPairs — la paire écartée se dit', () => {
  const active = { id: 'a1', name: 'Société Générale', setAside: null }
  const archived = { id: 'a2', name: 'Societe Generale', setAside: 'archived' as const }
  const merged = { id: 'a3', name: 'SOCIÉTÉ GÉNÉRALE S.A.', setAside: 'merged' as const }

  it('les deux formes se rapprochent quand l’une est archivée et l’autre active', () => {
    const [pair] = findSetAsideAccountPairs([active, archived])
    expect(pair).toMatchObject({
      left: { id: 'a1', status: 'active' },
      right: { id: 'a2', status: 'archived' },
    })
  })

  it('une forme rattachée est dite « rattachée », pas « archivée »', () => {
    const [pair] = findSetAsideAccountPairs([merged, active])
    expect([pair?.left.status, pair?.right.status].sort()).toEqual(['active', 'merged'])
  })

  it('deux comptes ACTIFS ne sont pas une paire écartée : ils se proposent ailleurs', () => {
    expect(findSetAsideAccountPairs([active, { id: 'a4', name: 'Societe Generale', setAside: null }])).toEqual([])
  })

  it('SAIT DIRE NON : « ACME » archivé et « ACME Services » actif ne se rapprochent pas', () => {
    expect(
      findSetAsideAccountPairs([
        { id: 'x', name: 'ACME', setAside: 'archived' as const },
        { id: 'y', name: 'ACME Services', setAside: null },
      ]),
    ).toEqual([])
  })

  it('deux noms vides ne se rapprochent pas, et la liste est bornée', () => {
    expect(
      findSetAsideAccountPairs([
        { id: 'e1', name: '  ', setAside: 'archived' as const },
        { id: 'e2', name: null, setAside: null },
      ]),
    ).toEqual([])
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      name: 'Orange',
      setAside: i === 0 ? ('archived' as const) : null,
    }))
    expect(findSetAsideAccountPairs(many, 3)).toHaveLength(3)
  })
})
