import { describeOrionNeedHeader, parseOrionNeedRecord } from './orion-needs-csv'

/**
 * #4281.1 / #4282.5 — `24_MISSIONS_BESOINS` / `25_PIPELINE_CRM` STRUCTURÉS à
 * l'ingestion. L'en-tête réel n'est pas commité (le pack décrit des
 * entreprises et des personnes réelles) : le parseur lit l'en-tête par ALIAS,
 * et toute colonne non typée part dans `payload` — rien n'est perdu
 * (décision Louis 19/10 n°17). Données SYNTHÉTIQUES ci-dessous.
 */
const HEADER = [
  'besoin_id',
  'account_id',
  'Entreprise',
  'Intitulé',
  'Statut',
  'Date',
  'TJM',
  'Prescripteur',
  'Fonction prescripteur',
  'Lieu',
  'Commentaire',
  'canal',
]

function line(cells: string[]): string {
  return cells.join(';')
}

describe('#4281.1 — parseur des besoins historiques', () => {
  it('structure statut, date, TJM, prescripteur et technologies ; le reste va dans payload', () => {
    const parsed = parseOrionNeedRecord(
      HEADER,
      line([
        'B-001',
        'DF-0042',
        'Acme Industrie',
        'Consultant SAP FI/CO',
        'Clos gagné',
        '14/03/2024',
        '720 €',
        'Jeanne Martin',
        'DSI adjointe',
        'Lyon',
        'migration ECC vers S/4',
        'réseau',
      ]),
      '24_MISSIONS_BESOINS',
    )
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') return
    expect(parsed.row).toMatchObject({
      needId: 'B-001',
      sourceFile: '24_MISSIONS_BESOINS',
      accountSourceId: 'DF-0042',
      entreprise: 'Acme Industrie',
      title: 'Consultant SAP FI/CO',
      status: 'GAGNE',
      statusRaw: 'Clos gagné',
      needDate: '2024-03-14',
      tjmEur: 720,
      prescriberName: 'Jeanne Martin',
      prescriberTitle: 'DSI adjointe',
      location: 'Lyon',
      description: 'migration ECC vers S/4',
      technologies: ['SAP'],
    })
    expect(parsed.row.payload).toEqual({ canal: 'réseau' })
  })

  it('NON : un statut illisible reste INCONNU, une date ou un TJM illisibles restent null — et leur brut est gardé', () => {
    const parsed = parseOrionNeedRecord(
      HEADER,
      line(['B-002', '', 'Beta', 'Chef de projet Salesforce', 'qualif', 'T2 2023', 'selon profil', '', '', '', '', '']),
      '25_PIPELINE_CRM',
    )
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') return
    expect(parsed.row.status).toBe('INCONNU')
    expect(parsed.row.statusRaw).toBe('qualif')
    expect(parsed.row.needDate).toBeNull()
    expect(parsed.row.tjmEur).toBeNull()
    expect(parsed.row.accountSourceId).toBeNull()
    expect(parsed.row.payload).toEqual({ Date: 'T2 2023', TJM: 'selon profil' })
  })

  it('NON : colonnes en trop ou en moins, ou besoin sans intitulé ni description → refus nommé', () => {
    expect(parseOrionNeedRecord(HEADER, 'B-003;DF-1', '24_MISSIONS_BESOINS')).toEqual({
      kind: 'rejected',
      reason: 'colonnes: 2 au lieu de 12',
    })
    const empty = parseOrionNeedRecord(
      HEADER,
      line(['B-004', 'DF-1', 'X', '', 'gagné', '', '', '', '', '', '', '']),
      '24_MISSIONS_BESOINS',
    )
    expect(empty).toEqual({ kind: 'rejected', reason: 'besoin sans intitulé ni description (B-004)' })
  })

  it('sans colonne identifiant, l’identifiant est une empreinte STABLE de la ligne (ré-ingestion idempotente)', () => {
    const header = HEADER.slice(1)
    const record = line(['DF-1', 'X', 'Data engineer Databricks', 'en cours', '2025-01-02', '', '', '', '', '', ''])
    const a = parseOrionNeedRecord(header, record, '24_MISSIONS_BESOINS')
    const b = parseOrionNeedRecord(header, record, '24_MISSIONS_BESOINS')
    expect(a.kind === 'row' && b.kind === 'row' && a.row.needId === b.row.needId).toBe(true)
    expect(a.kind === 'row' && a.row.needId.startsWith('24_MISSIONS_BESOINS:')).toBe(true)
  })

  it('l’en-tête se décrit : colonnes typées et colonnes gardées brutes, nommées à l’opérateur', () => {
    const description = describeOrionNeedHeader(HEADER)
    expect(description.mapped.title).toBe('Intitulé')
    expect(description.mapped.prescriberTitle).toBe('Fonction prescripteur')
    expect(description.keptRaw).toEqual(['canal'])
  })

  it('pack V12 réel : « Intitulé Mission » et « Statut Mission » nourrissent le besoin, « Titre » / « Statut » en repli', () => {
    // Forme de l'en-tête 24_MISSIONS_BESOINS du pack V12 (import prod 04/11 : 1 278 lignes sur 1 336 écartées
    // « sans intitulé » car seule la colonne « Titre », remplie sur 58 lignes, était lue).
    const header = ['mission_id', 'Intitulé Mission', 'Statut Mission', 'Titre', 'Statut', 'account_id']
    const described = describeOrionNeedHeader(header)
    expect(described.mapped.title).toBe('Intitulé Mission')
    expect(described.mapped.statusRaw).toBe('Statut Mission')
    expect(described.keptRaw).toEqual(['Titre', 'Statut'])

    const main = parseOrionNeedRecord(
      header,
      line(['MS-1', 'Dev Java', 'gagné', '', '', 'DF-1']),
      '24_MISSIONS_BESOINS',
    )
    expect(main.kind === 'row' && main.row.title).toBe('Dev Java')
    expect(main.kind === 'row' && main.row.status).toBe('GAGNE')

    const fallback = parseOrionNeedRecord(
      header,
      line(['MS-2', '', '', 'Chef de projet SAP', 'perdu', 'DF-2']),
      '24_MISSIONS_BESOINS',
    )
    expect(fallback.kind === 'row' && fallback.row.title).toBe('Chef de projet SAP')
    expect(fallback.kind === 'row' && fallback.row.status).toBe('PERDU')
  })

  it('pack V12 : le bloc V4 sans en-tête (colonnes « Unnamed: 1…8 ») est lu par position, rien n’est écarté', () => {
    const header = [
      'mission_id',
      'Intitulé Mission',
      'Titre',
      'Entreprise',
      'TJM (€)',
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `Unnamed: ${n}`),
    ]
    const parsed = parseOrionNeedRecord(
      header,
      line([
        'MS-9',
        '',
        '',
        '',
        '',
        'Perdu',
        'NE-1',
        '2 (0 actives)',
        '550',
        'Expert Cloud',
        'ESN X',
        'Client Y',
        '2025-12-18',
      ]),
      '24_MISSIONS_BESOINS',
    )
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') return
    expect(parsed.row.title).toBe('Expert Cloud')
    expect(parsed.row.status).toBe('PERDU')
    expect(parsed.row.entreprise).toBe('Client Y')
    expect(parsed.row.tjmEur).toBe(550)
    expect(parsed.row.needDate).toBe('2025-12-18')
  })
})
