import { describe, expect, it } from 'vitest'
import { normaliseEntities, splitEntitiesByActionable } from './entityData'

describe('normaliseEntities — actionable flag (Théo p.6)', () => {
  it('keeps every entity but tags actionable from the IA flag / getsPlay fallback', () => {
    const entities = [
      { name: 'SG Global Banking', type: 'BU', actionable: true },
      { name: '2009 KOALA FINANCE', type: 'SPV', actionable: false },
      { name: 'Société Générale Côte d’Ivoire', type: 'homonyme', getsPlay: false }, // legacy: no actionable → getsPlay
      { name: 'Entité sans flag', type: 'filiale' }, // no signal → benefit of the doubt (actionable)
    ]
    const byName = new Map(normaliseEntities(entities, null, null).map(e => [e.name, e]))

    // None are dropped anymore — they move to the secondary tab instead.
    expect(byName.size).toBe(4)
    expect(byName.get('SG Global Banking')?.actionable).toBe(true)
    expect(byName.get('2009 KOALA FINANCE')?.actionable).toBe(false)
    expect(byName.get('Société Générale Côte d’Ivoire')?.actionable).toBe(false)
    expect(byName.get('Entité sans flag')?.actionable).toBe(true)
  })

  it('carries the entity type + actionable through pappers subsidiaries too', () => {
    const subs = [
      { legal_name: 'SCI Saint-Pères', type: 'bruit', actionable: false },
      { legal_name: 'Boursorama', type: 'filiale', actionable: true },
    ]
    const byName = new Map(normaliseEntities(null, subs, 'Groupe X').map(e => [e.name, e]))
    expect(byName.get('SCI Saint-Pères')?.type).toBe('bruit')
    expect(byName.get('SCI Saint-Pères')?.actionable).toBe(false)
    expect(byName.get('Boursorama')?.actionable).toBe(true)
  })
})

describe('normaliseEntities — source + périmètre commercial/implantation/équipe (#2966, #2119.36-38, #2119.45)', () => {
  it('stamp la SOURCE : analyse BellumAI pour les entités, registre légal pour les filiales Pappers', () => {
    const byName = new Map(
      normaliseEntities(
        [{ name: 'DSI Groupe', type: 'BU' }],
        [{ legal_name: 'Boursorama', type: 'filiale' }],
        'Groupe X',
      ).map(e => [e.name, e]),
    )
    expect(byName.get('DSI Groupe')?.source).toBe('analysis')
    expect(byName.get('Boursorama')?.source).toBe('registry')
  })

  it('distingue périmètre commercial / implantation / équipe à partir du type déjà connu', () => {
    const byName = new Map(
      normaliseEntities(
        [
          { name: 'DSI Groupe', type: 'BU' },
          { name: 'EDF Saclay', type: 'site' },
          { name: 'Équipe Data', type: 'departement' },
        ],
        null,
        null,
      ).map(e => [e.name, e]),
    )
    expect(byName.get('DSI Groupe')?.scopeKind).toBe('commercial')
    expect(byName.get('EDF Saclay')?.scopeKind).toBe('implantation')
    expect(byName.get('Équipe Data')?.scopeKind).toBe('equipe')
  })
})

describe('splitEntitiesByActionable — default view vs secondary tab', () => {
  it('splits into actionable (default) and others (SPV / cédées / homonymes)', () => {
    const entities = [
      { name: 'SG Global Banking', type: 'BU', actionable: true },
      { name: 'Boursorama', type: 'filiale_strategique', actionable: true },
      { name: '2009 KOALA FINANCE', type: 'SPV', actionable: false },
      { name: 'SGTM Maroc', type: 'bruit', actionable: false },
    ]
    const { actionable, others } = splitEntitiesByActionable(normaliseEntities(entities, null, null))
    expect(actionable.map(e => e.name)).toEqual(['SG Global Banking', 'Boursorama'])
    expect(others.map(e => e.name)).toEqual(['2009 KOALA FINANCE', 'SGTM Maroc'])
  })

  it('returns empty buckets safely', () => {
    expect(splitEntitiesByActionable([])).toEqual({ actionable: [], others: [] })
  })
})

describe('normaliseEntities — #4327.1 le vocabulaire du groupe nourrit les Périmètres', () => {
  const vocabulary = [
    { term: 'Fortuneo', kind: 'entity', truthStatus: 'registre' },
    { term: 'Suravenir', kind: 'entity', truthStatus: 'registre' },
    { term: 'Capgemini', kind: 'internal_competitor', truthStatus: 'fait' },
    { term: 'Projet X', kind: 'entity', truthStatus: 'hypothese' },
  ]
  it('une entité du vocabulaire (registre) absente de la liste y apparaît ; un concurrent ou une hypothèse, non', () => {
    const names = normaliseEntities([{ name: 'Arkéa Banque', type: 'filiale' }], null, 'Arkéa', vocabulary).map(
      e => e.name,
    )
    expect(names).toEqual(['Arkéa Banque', 'Fortuneo', 'Suravenir'])
  })
  it('une entité déjà listée par l’analyse n’est pas doublée et garde sa forme', () => {
    const list = normaliseEntities([{ name: 'fortuneo', type: 'BU', actionable: false }], null, 'Arkéa', vocabulary)
    expect(list.filter(e => e.name.toLowerCase() === 'fortuneo')).toHaveLength(1)
    expect(list.find(e => e.name === 'fortuneo')?.type).toBe('BU')
  })
  it('sans vocabulaire, la liste est identique à avant', () => {
    expect(normaliseEntities([{ name: 'A', type: 'filiale' }], null, 'Arkéa').map(e => e.name)).toEqual(['A'])
  })
  it('ne double pas la racine ni un terme qui n’est pas une entité (#4327.1)', () => {
    const names = normaliseEntities([{ name: 'Sopra Steria', type: 'filiale' }], null, 'Arkéa', [
      { term: 'Arkéa', kind: 'entity', truthStatus: 'registre' },
      { term: 'IAM', kind: 'acronym', truthStatus: 'registre' },
      { term: 'Sopra Steria', kind: 'entity', truthStatus: 'registre' },
    ]).map(row => row.name)
    expect(names).toEqual(['Sopra Steria'])
  })
})

describe('normaliseEntities — #4327 une filiale rendue par la source n’est jamais jetée', () => {
  it('garde la filiale (hors marque du groupe) même quand le nom du compte est inconnu', () => {
    const rows = normaliseEntities([], [{ name: 'Fortuneo', source: 'web' }], null)
    expect(rows.map(row => row.name)).toEqual(['Fortuneo'])
    expect(rows[0]?.source).toBe('web')
    expect(rows[0]?.parent).toBeNull()
  })
})

describe('normaliseEntities — les homonymes se nomment (#4327)', () => {
  it('deux entités de même nom situées ailleurs restent DEUX lignes ; un doublon sans lieu se replie', () => {
    const rows = normaliseEntities(
      [
        { name: 'Arkéa Services', type: 'filiale', region: 'Bretagne' },
        { name: 'Arkéa Services', type: 'filiale', region: 'Occitanie' },
        { name: 'arkéa services', type: 'filiale' },
      ],
      null,
      'Arkéa',
    )
    expect(rows.map(row => [row.name, row.region])).toEqual([
      ['Arkéa Services', 'Bretagne'],
      ['Arkéa Services', 'Occitanie'],
    ])
  })

  it('sait dire NON : même nom, même lieu = une seule ligne', () => {
    const rows = normaliseEntities(
      [
        { name: 'Fortuneo', type: 'filiale', region: 'Bretagne' },
        { name: 'Fortuneo', type: 'BU', region: 'bretagne' },
      ],
      null,
      'Arkéa',
    )
    expect(rows).toHaveLength(1)
  })
})

describe('normaliseEntities — #4327.2 une filiale déduite est ÉTIQUETÉE avec sa source, jamais omise', () => {
  it('une filiale nommée par le web garde D’OÙ elle vient (hôte de la source)', () => {
    const [row] = normaliseEntities(
      [],
      [{ name: 'Fortuneo', source: 'web', source_url: 'https://www.lesechos.fr/finance/fortuneo' }],
      'Arkéa',
    )
    expect(row?.source).toBe('web')
    expect(row?.sourceHost).toBe('lesechos.fr')
  })

  it('une filiale confirmée par le registre (SIREN) ne porte ni étiquette ni source web', () => {
    const [row] = normaliseEntities([], [{ name: 'Suravenir', siren: '330033127', source: 'registry' }], 'Arkéa')
    expect(row?.source).toBe('registry')
    expect(row?.sourceHost).toBeUndefined()
  })

  it('SAIT DIRE NON : une filiale sans AUCUNE source (ni SIREN ni origine) n’apparaît pas', () => {
    expect(normaliseEntities([], [{ name: 'Filiale fantôme', source: '' }], 'Arkéa')).toEqual([])
    expect(normaliseEntities([], [{ name: 'Filiale fantôme', source: 'rumeur' }], 'Arkéa')).toEqual([])
  })

  it('une URL illisible n’invente pas d’hôte : la filiale reste, sans source nommée', () => {
    const [row] = normaliseEntities([], [{ name: 'Fortuneo', source: 'web', source_url: 'pas une url' }], 'Arkéa')
    expect(row?.source).toBe('web')
    expect(row?.sourceHost).toBeUndefined()
  })
})
