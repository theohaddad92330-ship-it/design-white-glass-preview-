import {
  parseAvailabilityCsv,
  parseAvailabilityDate,
  parseAvailabilityRate,
  parseAvailabilityRows,
  mapAvailabilityColumn,
} from './availability-import'

describe('#2326.7/.9 — lecture du tableau de disponibilités', () => {
  it('rapproche nom, e-mail, date et taux sur des en-têtes FR', () => {
    const csv = ['Nom;E-mail;Date de disponibilité;TJM', 'Jean Dupont;jean.dupont@acme.fr;01/10/2026;650'].join('\n')
    const preview = parseAvailabilityCsv(csv)
    expect(preview.rows).toEqual([
      { line: 2, fullName: 'Jean Dupont', email: 'jean.dupont@acme.fr', availableFrom: '2026-10-01', tjm: 650 },
    ])
    expect(preview.skipped).toEqual([])
    expect(preview.mappedColumns).toEqual({
      Nom: 'fullName',
      'E-mail': 'email',
      'Date de disponibilité': 'availableFrom',
      TJM: 'tjm',
    })
  })

  it('rapproche des en-têtes EN, avec une colonne inconnue ignorée', () => {
    const csv = ['Name,Email,Available From,Rate,Notes', 'Ada Lovelace,ada@acme.fr,2026-11-03,700,VIP'].join('\n')
    const preview = parseAvailabilityCsv(csv)
    expect(preview.rows).toEqual([
      { line: 2, fullName: 'Ada Lovelace', email: 'ada@acme.fr', availableFrom: '2026-11-03', tjm: 700 },
    ])
    expect(preview.ignoredColumns).toEqual(['Notes'])
  })

  it('écarte une ligne sans nom ni e-mail — jamais un talent "Inconnu"', () => {
    const csv = ['Nom,Email,TJM', ',,650'].join('\n')
    const preview = parseAvailabilityCsv(csv)
    expect(preview.rows).toEqual([])
    expect(preview.skipped).toEqual([{ line: 2, reason: 'no_identity' }])
  })

  it('écarte une ligne identifiée mais sans date ni taux — rien à mettre à jour', () => {
    const csv = ['Nom,Email,TJM', 'Jean Dupont,jean@acme.fr,'].join('\n')
    const preview = parseAvailabilityCsv(csv)
    expect(preview.rows).toEqual([])
    expect(preview.skipped).toEqual([{ line: 2, reason: 'no_data' }])
  })

  it('écarte une ligne entièrement vide comme malformée', () => {
    const csv = ['Nom,Email,TJM', ',,'].join('\n')
    const preview = parseAvailabilityCsv(csv)
    expect(preview.skipped).toEqual([{ line: 2, reason: 'malformed' }])
  })

  it('rend `truncated` au-delà de la borne, sans planter', () => {
    const header = ['Nom,Email,TJM']
    const rows = Array.from({ length: 2001 }, (_, i) => `Personne ${i},p${i}@acme.fr,500`)
    const preview = parseAvailabilityCsv([...header, ...rows].join('\n'))
    expect(preview.truncated).toBe(true)
    expect(preview.rows).toHaveLength(2000)
  })

  it('parseAvailabilityDate accepte ISO et JJ/MM/AAAA, refuse le reste', () => {
    expect(parseAvailabilityDate('2026-10-01')).toBe('2026-10-01')
    expect(parseAvailabilityDate('01/10/2026')).toBe('2026-10-01')
    expect(parseAvailabilityDate('01-10-2026')).toBe('2026-10-01')
    expect(parseAvailabilityDate('bientôt')).toBeNull()
    expect(parseAvailabilityDate('32/13/2026')).toBeNull()
    expect(parseAvailabilityDate(null)).toBeNull()
  })

  it('parseAvailabilityRate accepte un entier positif borné, refuse le reste', () => {
    expect(parseAvailabilityRate('650')).toBe(650)
    expect(parseAvailabilityRate('650 €')).toBe(650)
    expect(parseAvailabilityRate('650,5')).toBe(651)
    expect(parseAvailabilityRate('0')).toBeNull()
    expect(parseAvailabilityRate('-10')).toBeNull()
    expect(parseAvailabilityRate('99999')).toBeNull()
    expect(parseAvailabilityRate('confidentiel')).toBeNull()
  })

  it('mapAvailabilityColumn ne devine jamais un en-tête inconnu', () => {
    expect(mapAvailabilityColumn('Compétences')).toBeNull()
  })

  it('parseAvailabilityRows lit des cellules déjà découpées (chemin XLSX)', () => {
    const preview = parseAvailabilityRows([
      ['Nom', 'Email', 'TJM'],
      ['Jean Dupont', 'jean@acme.fr', '650'],
    ])
    expect(preview.rows).toEqual([
      { line: 2, fullName: 'Jean Dupont', email: 'jean@acme.fr', availableFrom: null, tjm: 650 },
    ])
  })
})
