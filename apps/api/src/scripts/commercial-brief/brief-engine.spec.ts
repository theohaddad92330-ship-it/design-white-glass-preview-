import { convertWorkbook } from './brief-engine'
import type { AccountPlan, SupplementPlan } from './plan-types'
import type { GridSheet, GridWorkbook } from './xlsx-grid'

/**
 * Moteur de conversion : ce que le chantier « démo clients » (04/10/2026) y ajoute —
 *  - un compte lu dans DEUX classeurs (Sanofi : QuickSort + Lyon) : le second est un
 *    SUPPLÉMENT dont chaque onglet est classé (section propre, lignes manquantes,
 *    identique à la base), jamais ignoré en silence ;
 *  - la fusion de deux onglets de personnes de même rôle « externe ».
 */

type RawRow = Record<number, string>
const sheet = (name: string, rows: RawRow[]): GridSheet => ({
  name,
  badCells: 0,
  // comme `readWorkbook` : une ligne vide n'existe pas, mais garde son numéro
  rows: rows
    .map((cells, i) => ({
      n: i + 1,
      cells: new Map(Object.entries(cells).map(([c, v]) => [Number(c), v])),
      links: new Map<number, string>(),
    }))
    .filter(row => row.cells.size > 0),
})
const workbook = (sheets: GridSheet[]): GridWorkbook => ({ created: new Date('2026-10-04T10:00:00Z'), sheets })

/** COCKPIT minimal : titre, sous-titre, bandeau de 2 indicateurs, une rubrique, un graphique. */
const cockpit = (title: string, kpiLabel: string): GridSheet =>
  sheet('COCKPIT', [
    { 2: `${title} — VOICI TOUT CE QUE JE SAIS` },
    { 2: 'Sous-titre du cockpit' },
    {},
    {},
    {},
    { 2: kpiLabel, 3: 'SECOND' },
    { 2: '12', 3: '34' },
    { 2: 'légende un', 3: 'légende deux' },
    {},
    { 2: 'CE QUE JE SAIS — EN UNE PAGE' },
    {},
    { 2: 'IDENTITÉ', 3: 'Un groupe de test.', 6: 'Il sert à tester.' },
    {},
    {},
    { 2: 'SITES PAR TYPE' },
    {},
    { 2: 'Libellé', 3: 'Valeur' },
    { 2: 'Industriel', 3: '12' },
  ])

const fiche = sheet('FICHE COMPTE', [
  { 1: 'FICHE COMPTE' },
  { 1: 'Identité' },
  { 1: 'CHAMP', 2: 'VALEUR', 3: 'FIABILITÉ' },
  { 1: 'Siège', 2: 'Tour Test, Paris', 3: 'Confirmé' },
])
const guardrails = (n = 1): GridSheet =>
  sheet('GARDE-FOUS', [
    { 1: 'GARDE-FOUS' },
    { 1: 'À lire' },
    { 1: 'POINT', 2: "CE QU'IL FAUT SAVOIR" },
    ...Array.from({ length: n }, (_, i) => ({ 1: `Point ${i + 1}`, 2: 'Détail.' })),
  ])
const projets = (rows: [string, string][]): GridSheet =>
  sheet('PROJETS', [
    { 1: 'PROJETS' },
    { 1: 'Programmes' },
    { 1: 'PROGRAMME', 2: 'SITE' },
    ...rows.map(([a, b]) => ({ 1: a, 2: b })),
  ])
const plan = (name: string, rows: [string, string][]): GridSheet =>
  sheet('PLAN D ACTION', [
    { 1: "PLAN D'ACTION" },
    { 1: 'Séquence' },
    { 1: 'QUAND', 2: 'ACTION' },
    ...rows.map(([a, b]) => ({ 1: a, 2: `${name} ${b}` })),
  ])

const basePlan = (supplements?: readonly SupplementPlan[]): AccountPlan => ({
  slug: 'test',
  name: 'Test',
  titlePrefix: 'TEST',
  source: 'TEST.xlsx',
  headquarters: { champ: 'Siège', label: 'Tour Test', city: 'Paris' },
  exitedAliases: { aliases: [], nature: '', note: '' },
  rewrites: [],
  sheets: [
    { sheet: 'COCKPIT', cockpit: true },
    { sheet: 'FICHE COMPTE', fiche: true },
    { sheet: 'PROJETS', section: {} },
    { sheet: 'PLAN D ACTION', section: {} },
    { sheet: 'GARDE-FOUS', guardrails: true },
  ],
  supplements,
})

const base = workbook([
  cockpit('TEST', 'LIBELLÉ'),
  fiche,
  projets([
    ['Programme A', 'Paris'],
    ['Programme B', 'Lyon'],
  ]),
  plan('base', [['Semaine 1', 'a']]),
  guardrails(),
])

const second = (overrides: { projets?: GridSheet; plan?: GridSheet; extra?: GridSheet } = {}): GridWorkbook =>
  workbook([
    cockpit('TEST', 'LIBELLÉ LYON'),
    fiche,
    overrides.projets ?? projets([['Programme A', 'Paris']]),
    overrides.plan ?? plan('lyon', [['Semaine 1', 'x']]),
    guardrails(),
    ...(overrides.extra ? [overrides.extra] : []),
  ])

const supplement: SupplementPlan = {
  source: 'LYON.xlsx',
  cockpit: { key: 'cockpit-lyon', title: 'COCKPIT — vue Lyon' },
  sections: [{ sheet: 'PLAN D ACTION', key: 'plan-d-action-lyon', title: "PLAN D'ACTION — vue Lyon" }],
  missingRows: [{ sheet: 'PROJETS', into: 'projets' }],
  identical: { 'FICHE COMPTE': 'FICHE COMPTE', 'GARDE-FOUS': 'GARDE-FOUS' },
}

describe('convertWorkbook — compte lu dans deux classeurs (suppléments)', () => {
  it('sans supplément, la conversion est inchangée', () => {
    const { brief } = convertWorkbook(base, basePlan())
    expect(brief.sections.map(s => s.key)).toEqual(['fiche-compte', 'projets', 'plan-d-action', 'notes'])
  })

  it('met le COCKPIT du second classeur dans une section propre (indicateurs, rubriques, graphiques)', () => {
    const { brief } = convertWorkbook(base, basePlan([supplement]), [{ grid: second(), plan: supplement }])
    const section = brief.sections.find(s => s.key === 'cockpit-lyon')
    expect(section?.title).toBe('COCKPIT — vue Lyon')
    const rows = section?.rows ?? []
    expect(rows).toContainEqual({ bloc: 'Indicateur', libelle: 'LIBELLÉ LYON', valeur: 12, lecture: 'légende un' })
    expect(rows).toContainEqual({
      bloc: 'Rubrique',
      libelle: 'IDENTITÉ',
      valeur: 'Un groupe de test.',
      lecture: 'Il sert à tester.',
    })
    expect(rows).toContainEqual({ bloc: 'Graphique — SITES PAR TYPE', libelle: 'Industriel', valeur: 12 })
    // les KPI du compte restent ceux du classeur de base (6 au plus)
    expect(brief.kpis.map(k => k.label)).toEqual(['LIBELLÉ', 'SECOND'])
  })

  it('garde un onglet entier du second classeur dans sa propre section', () => {
    const { brief } = convertWorkbook(base, basePlan([supplement]), [{ grid: second(), plan: supplement }])
    expect(brief.sections.find(s => s.key === 'plan-d-action')?.rows).toHaveLength(1)
    const lyon = brief.sections.find(s => s.key === 'plan-d-action-lyon')
    expect(lyon?.title).toBe("PLAN D'ACTION — vue Lyon")
    expect(lyon?.rows).toEqual([{ quand: 'Semaine 1', action: 'lyon x' }])
  })

  it("n'ajoute à la section de base QUE les lignes absentes du premier classeur", () => {
    const grid = second({
      projets: projets([
        ['Programme A', 'Paris'],
        ['Programme C', 'Nantes'],
      ]),
    })
    const { brief, coverage } = convertWorkbook(base, basePlan([supplement]), [{ grid, plan: supplement }])
    const rows = brief.sections.find(s => s.key === 'projets')?.rows ?? []
    expect(rows.map(r => r.programme)).toEqual(['Programme A', 'Programme B', 'Programme C'])
    expect(coverage).toContainEqual(expect.objectContaining({ sheet: 'PROJETS (second classeur)', rows: 1 }))
  })

  it('ne redouble rien quand le second classeur est inclus dans le premier', () => {
    const { brief } = convertWorkbook(base, basePlan([supplement]), [{ grid: second(), plan: supplement }])
    expect(brief.sections.find(s => s.key === 'projets')?.rows).toHaveLength(2)
  })

  it('échoue si un onglet déclaré « identique » ne l’est pas', () => {
    const different = workbook([
      cockpit('TEST', 'X'),
      fiche,
      projets([['Programme A', 'Paris']]),
      plan('lyon', [['Semaine 1', 'x']]),
      guardrails(2),
    ])
    expect(() => convertWorkbook(base, basePlan([supplement]), [{ grid: different, plan: supplement }])).toThrow(
      /GARDE-FOUS.*identique/,
    )
  })

  it('échoue sur un onglet du second classeur que le plan ne classe pas', () => {
    const extra = sheet('EXTRA', [{ 1: 'EXTRA' }, { 1: 'x' }, { 1: 'A', 2: 'B' }, { 1: '1', 2: '2' }])
    expect(() =>
      convertWorkbook(base, basePlan([supplement]), [{ grid: second({ extra }), plan: supplement }]),
    ).toThrow(/onglet\(s\) non classé\(s\).*EXTRA/)
  })

  it('échoue si un supplément du plan n’a pas son classeur', () => {
    expect(() => convertWorkbook(base, basePlan([supplement]))).toThrow(/supplément/)
  })
})

describe('convertWorkbook — deux onglets d’externes', () => {
  const people = (name: string, rows: string[][]): GridSheet =>
    sheet(name, [{ 1: name }, { 1: 'Externes' }, { 1: 'NOM', 2: 'POSTE' }, ...rows.map(([n, p]) => ({ 1: n, 2: p }))])
  const grid = workbook([
    cockpit('TEST', 'LIBELLÉ'),
    fiche,
    people('EXTERNES', [
      ['Ada Lovelace', 'Dev'],
      ['Alan Turing', 'Math'],
    ]),
    people('PROFILS', [['Ada LOVELACE', 'Architecte']]),
    guardrails(),
  ])
  const externals = (mode: 'add' | 'merge'): AccountPlan => ({
    ...basePlan(),
    sheets: [
      { sheet: 'COCKPIT', cockpit: true },
      { sheet: 'FICHE COMPTE', fiche: true },
      {
        sheet: 'EXTERNES',
        people: {
          role: 'external',
          mode: 'add',
          map: (r, f) => ({ name: f.name(r.get('NOM')), function: r.get('POSTE') }),
        },
      },
      {
        sheet: 'PROFILS',
        people: { role: 'external', mode, map: (r, f) => ({ name: f.name(r.get('NOM')), function: r.get('POSTE') }) },
      },
      { sheet: 'GARDE-FOUS', guardrails: true },
    ],
  })

  it('fusionne la même personne vue dans deux onglets d’externes (mode merge)', () => {
    const { brief } = convertWorkbook(grid, externals('merge'))
    expect(brief.people.map(p => p.name)).toEqual(['Ada Lovelace', 'Alan Turing'])
    expect(brief.people[0]?.function).toBe('Dev')
  })

  it('garde les deux lignes en mode add (comportement historique)', () => {
    const { brief } = convertWorkbook(grid, externals('add'))
    expect(brief.people).toHaveLength(3)
  })
})

describe('convertWorkbook — ESN avec lignes non ESN, prix multiples', () => {
  const table = (name: string, header: string[], rows: string[][]): GridSheet =>
    sheet(name, [
      { 1: name },
      { 1: 'Sous-titre' },
      Object.fromEntries(header.map((h, i) => [i + 1, h])),
      ...rows.map(r => Object.fromEntries(r.map((v, i) => [i + 1, v]))),
    ])
  const grid = workbook([
    cockpit('TEST', 'LIBELLÉ'),
    fiche,
    table(
      'PRESTATAIRES',
      ['PRESTATAIRE', 'PREUVE'],
      [
        ['Aubay', 'Cas publié'],
        ['Ageas', 'Partenaire tiers'],
      ],
    ),
    table('GRILLE', ['MÉTIER', 'JUNIOR', 'SENIOR'], [['Dev', '435 € (n=18)', '550 € (n=12)']]),
    guardrails(),
  ])
  const withEsn = (section: boolean): AccountPlan => ({
    ...basePlan(),
    sheets: [
      { sheet: 'COCKPIT', cockpit: true },
      { sheet: 'FICHE COMPTE', fiche: true },
      {
        sheet: 'PRESTATAIRES',
        ...(section ? { section: {} } : {}),
        esn: {
          map: r =>
            r.get('PRESTATAIRE') === 'Ageas'
              ? { rest: 'Partenaire tiers : pas une ESN' }
              : { name: r.get('PRESTATAIRE') as string, evidence_level: 'observed', proof: r.get('PREUVE') as string },
        },
      },
      {
        sheet: 'GRILLE',
        prices: {
          map: r => [
            {
              label: `${r.get('MÉTIER')} junior`,
              amount_eur_per_day: 435,
              channel: 'framework' as const,
              note: r.get('JUNIOR'),
            },
            {
              label: `${r.get('MÉTIER')} senior`,
              amount_eur_per_day: 550,
              channel: 'framework' as const,
              note: r.get('SENIOR'),
            },
          ],
        },
      },
      { sheet: 'GARDE-FOUS', guardrails: true },
    ],
  })

  it('une ligne `rest` n’est pas une ESN et reste lisible dans « non retenus » (sans section)', () => {
    const { brief } = convertWorkbook(grid, withEsn(false))
    expect(brief.esn.map(e => e.name)).toEqual(['Aubay'])
    const rest = brief.sections.find(s => s.key === 'prestataires-non-retenus')
    expect(rest?.rows).toEqual([
      { prestataire: 'Ageas', preuve: 'Partenaire tiers', motif: 'Partenaire tiers : pas une ESN' },
    ])
  })

  it('avec la section de l’onglet, la ligne non ESN y reste (pas de doublon « non retenus »)', () => {
    const { brief } = convertWorkbook(grid, withEsn(true))
    expect(brief.sections.some(s => s.key === 'prestataires-non-retenus')).toBe(false)
    expect(brief.sections.find(s => s.key === 'prestataires')?.rows).toHaveLength(2)
  })

  it('des sites nommés par la fiche compte s’ajoutent au siège dérivé (classeur sans onglet de sites)', () => {
    const { brief, coverage } = convertWorkbook(base, {
      ...basePlan(),
      derivedSites: tables => {
        const text =
          tables
            .get('FICHE COMPTE')
            ?.rows.map(r => r.get('VALEUR'))
            .join(' ') ?? ''
        if (!text.includes('Tour Test')) throw new Error('phrase absente')
        return [{ name: 'Annexe', city: 'Lille', kind: 'secondary' }]
      },
    })
    expect(brief.sites.map(s => [s.name, s.kind])).toEqual([
      ['Tour Test', 'headquarters'],
      ['Annexe', 'secondary'],
    ])
    expect(coverage).toContainEqual(expect.objectContaining({ sheet: '(dérivés)', field: 'sites', rows: 1 }))
  })

  it('une ligne peut porter plusieurs prix', () => {
    const { brief } = convertWorkbook(grid, withEsn(false))
    expect(brief.prices.map(p => [p.label, p.amount_eur_per_day, p.channel])).toEqual([
      ['Dev junior', 435, 'framework'],
      ['Dev senior', 550, 'framework'],
    ])
  })
})
