import {
  actionOutcomeCells,
  caseOutcomeCells,
  marketPatternCells,
  messageLearningCells,
  signalDealCells,
} from './shared-base-cells'

// P05.a (#3246, lot 09/10) — des comptages PAR ESPACE deviennent des cellules
// COMMUNES : secteur × taille, plus les cellules « tous secteurs » / « toutes
// tailles ». Le seuil des trois espaces s'applique à CHAQUE cellule.
describe('P05.a — actionOutcomeCells', () => {
  const row = (workspaceId: string, nafCode: string | null, employees: string | null, outcome: string, count = 1) => ({
    workspaceId,
    value: 'relance',
    nafCode,
    employees,
    outcome,
    count,
  })

  it('trois espaces du même segment : la cellule du segment ET ses agrégats sortent', () => {
    const cells = actionOutcomeCells([
      row('w1', '64.19Z', '250 à 499 salariés', 'meeting_booked', 2),
      row('w2', '64.11Z', '1 000 à 1 999 salariés', 'no_response'),
      row('w3', '64.30Z', '300', 'meeting_booked'),
    ])
    const segment = cells.find(cell => cell.sectorKey === 'naf_64' && cell.sizeBand === 'eti')
    expect(segment).toEqual({
      value: 'relance',
      sectorKey: 'naf_64',
      sizeBand: 'eti',
      positive: 3,
      judged: 4,
      contributingWorkspaces: 3,
    })
    expect(cells.find(cell => cell.sectorKey === 'all' && cell.sizeBand === 'all')?.judged).toBe(4)
    expect(cells).toHaveLength(4)
  })

  it('sait dire NON — un segment porté par deux espaces ne sort pas, le total à trois si', () => {
    const cells = actionOutcomeCells([
      row('w1', '64.19Z', '300', 'meeting_booked'),
      row('w2', '64.19Z', '300', 'meeting_booked'),
      row('w3', '62.01Z', '20', 'no_response'),
    ])
    expect(cells.find(cell => cell.sectorKey === 'naf_64')).toBeUndefined()
    expect(cells.map(cell => [cell.sectorKey, cell.sizeBand])).toEqual([['all', 'all']])
  })

  it('une issue qui ne juge pas l’approche n’est pas comptée ; un secteur inconnu ne fait pas de segment', () => {
    const cells = actionOutcomeCells([
      row('w1', null, null, 'meeting_booked'),
      row('w2', null, null, 'meeting_booked'),
      row('w3', null, null, 'meeting_booked'),
      row('w4', null, null, 'something_unknown'),
    ])
    expect(cells).toEqual([
      { value: 'relance', sectorKey: 'all', sizeBand: 'all', positive: 3, judged: 3, contributingWorkspaces: 3 },
    ])
  })

  it('un outcome commercial se classe par sa propre partition', () => {
    const cells = actionOutcomeCells(
      ['w1', 'w2', 'w3'].map(workspaceId => ({
        workspaceId,
        value: 'partenaire',
        nafCode: null,
        employees: null,
        outcome: 'declined',
        count: 1,
        source: 'commercial' as const,
      })),
    )
    expect(cells).toEqual([
      { value: 'partenaire', sectorKey: 'all', sizeBand: 'all', positive: 0, judged: 3, contributingWorkspaces: 3 },
    ])
  })
})

// P05.b (#3246, lot 09/10) — les cas gagnés / perdus, mutualisés par secteur,
// taille, position de groupe : des COMPTES, jamais un nom de client.
describe('P05.b — caseOutcomeCells', () => {
  const won = (workspaceId: string, count = 1) => ({
    workspaceId,
    nafCode: '62.01Z',
    employees: '300',
    groupRole: 'filiale',
    outcome: 'won' as const,
    count,
  })
  const lost = (workspaceId: string) => ({ ...won(workspaceId), outcome: 'lost' as const })

  it('trois espaces : une ligne par dimension connue, gagnés et perdus comptés', () => {
    const cells = caseOutcomeCells([won('w1', 2), won('w2'), lost('w3'), lost('w1')])
    expect(cells).toEqual([
      { dimension: 'sector', value: 'naf_62', won: 3, lost: 2, contributingWorkspaces: 3 },
      { dimension: 'size', value: 'eti', won: 3, lost: 2, contributingWorkspaces: 3 },
      { dimension: 'group_role', value: 'filiale', won: 3, lost: 2, contributingWorkspaces: 3 },
    ])
  })

  it('sait dire NON — deux espaces seulement : rien ne sort', () => {
    expect(caseOutcomeCells([won('w1'), won('w2'), lost('w2')])).toEqual([])
  })

  it('une dimension inconnue ne fait pas de ligne ; une position de groupe libre ne passe pas', () => {
    const rows = ['w1', 'w2', 'w3'].map(workspaceId => ({
      workspaceId,
      nafCode: null,
      employees: null,
      groupRole: 'Groupe Airbus',
      outcome: 'won' as const,
      count: 1,
    }))
    expect(caseOutcomeCells(rows)).toEqual([])
  })
})

// P05.c (#3246, lot 09/10) — un type de signal suivi d'une affaire ouverte :
// des comptes, jamais une causalité, jamais un nom.
describe('P05.c — signalDealCells', () => {
  const row = (workspaceId: string, nafCode: string | null, signals: number, followedByDeal: number) => ({
    workspaceId,
    signalType: 'Budget',
    nafCode,
    signals,
    followedByDeal,
  })

  it('trois espaces : le total et le secteur partagé sortent, le type normalisé', () => {
    const cells = signalDealCells([row('w1', '64.19Z', 4, 1), row('w2', '64.11Z', 3, 2), row('w3', '64.30Z', 4, 1)])
    expect(cells).toEqual([
      { signalType: 'budget', sectorKey: 'all', signals: 11, followedByDeal: 4, contributingWorkspaces: 3 },
      { signalType: 'budget', sectorKey: 'naf_64', signals: 11, followedByDeal: 4, contributingWorkspaces: 3 },
    ])
  })

  it('sait dire NON — un secteur porté par deux espaces ne sort pas ; un type en texte libre non plus', () => {
    const cells = signalDealCells([row('w1', '64.19Z', 4, 1), row('w2', '64.11Z', 3, 2), row('w3', '62.01Z', 4, 1)])
    expect(cells.map(cell => cell.sectorKey)).toEqual(['all'])
    const libre = ['w1', 'w2', 'w3'].map(workspaceId => ({
      ...row(workspaceId, null, 2, 1),
      signalType: 'levée de fonds Série B',
    }))
    expect(signalDealCells(libre)).toEqual([])
  })
})

// #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — les signaux d'apprentissage des
// messages, comptés PAR ESPACE, deviennent des comptes COMMUNS par signal.
describe('#2877 GLOBAL — messageLearningCells', () => {
  const row = (workspaceId: string, signal: string, count: number) => ({ workspaceId, signal, count })

  it('trois espaces : le compte commun par signal sort, sans aucun identifiant d’espace', () => {
    const cells = messageLearningCells([
      row('w1', 'wrong_fact', 2),
      row('w2', 'wrong_fact', 1),
      row('w3', 'wrong_fact', 4),
      row('w1', 'approved_without_edit', 9),
    ])
    expect(cells).toEqual([{ signal: 'wrong_fact', count: 7, contributingWorkspaces: 3 }])
    expect(JSON.stringify(cells)).not.toMatch(/w[123]/)
  })

  it('sait dire NON — un signal hors vocabulaire fermé (un texte, un corps) ne sort jamais', () => {
    const libre = ['w1', 'w2', 'w3'].map(workspaceId => row(workspaceId, 'Bonjour Claire, suite à notre échange', 3))
    expect(messageLearningCells(libre)).toEqual([])
    const inconnu = ['w1', 'w2', 'w3'].map(workspaceId => row(workspaceId, 'tone_changed', 3))
    expect(messageLearningCells(inconnu)).toEqual([])
  })
})

// #4286.15.c (Louis 22/10/2026) — `market_pattern` : des recrutements repérés PAR ESPACE deviennent des
// tendances COMMUNES par famille de métier × secteur × taille × région, chacune à trois espaces au moins.
describe('#4286.15.c — marketPatternCells', () => {
  const hire = (workspaceId: string, title: string, overrides: Record<string, string | null> = {}) => ({
    workspaceId,
    jobTitle: title,
    nafCode: '64.19Z',
    employees: '1 000 à 1 999 salariés',
    address: '1 place de la Défense, 92400 Courbevoie',
    ...overrides,
  })

  it('trois espaces qui recrutent de la data dans le même segment : la cellule fine ET ses agrégats sortent', () => {
    const cells = marketPatternCells([
      hire('w1', 'Data Engineer'),
      hire('w1', 'Data Scientist senior'),
      hire('w2', 'Data Engineer (H/F)'),
      hire('w3', 'Data Engineer Spark'),
    ])
    expect(cells).toContainEqual({
      topic: 'data',
      sectorKey: 'naf_64',
      sizeBand: 'eti',
      regionKey: 'ile_de_france',
      observations: 4,
      contributingWorkspaces: 3,
    })
    expect(cells).toContainEqual(
      expect.objectContaining({ topic: 'data', sectorKey: 'all', sizeBand: 'all', regionKey: 'all', observations: 4 }),
    )
    expect(cells).toHaveLength(8)
  })

  it('sait dire NON — deux espaces seulement : rien ne sort, même avec beaucoup d’offres', () => {
    expect(
      marketPatternCells([hire('w1', 'Data Engineer'), hire('w1', 'Data Engineer'), hire('w2', 'Data Engineer')]),
    ).toEqual([])
  })

  it('sait dire NON — un intitulé hors référentiel ne fait aucune cellule ; aucun intitulé ni espace ne sort', () => {
    const cells = marketPatternCells([
      hire('w1', 'Comptable fournisseurs'),
      hire('w2', 'Comptable fournisseurs'),
      hire('w3', 'Comptable fournisseurs'),
    ])
    expect(cells).toEqual([])
    const out = JSON.stringify(
      marketPatternCells([hire('w1', 'Data Engineer'), hire('w2', 'Data Engineer'), hire('w3', 'Data Engineer')]),
    )
    expect(out).not.toMatch(/Engineer|w1|w2|w3|Courbevoie/)
  })

  it('un segment illisible (NAF, effectif, adresse) ne compte que dans « tous » — jamais deviné', () => {
    const cells = marketPatternCells([
      hire('w1', 'Data Engineer', { nafCode: null, employees: null, address: null }),
      hire('w2', 'Data Engineer', { nafCode: null, employees: null, address: null }),
      hire('w3', 'Data Engineer', { nafCode: null, employees: null, address: null }),
    ])
    expect(cells).toEqual([
      {
        topic: 'data',
        sectorKey: 'all',
        sizeBand: 'all',
        regionKey: 'all',
        observations: 3,
        contributingWorkspaces: 3,
      },
    ])
  })
})
