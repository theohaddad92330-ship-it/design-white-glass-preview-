import { checkMarketBrief, marketBriefSchema } from '@bellum/contracts'

import type { GridRow, GridWorkbook } from '../commercial-brief/xlsx-grid'
import { convertMarketWorkbook } from './market-engine'
import { MARKET_PLANS, type MarketPlan, type SheetPlan } from './market-plans'

/**
 * Le moteur de conversion des briefs de marché (lot L5), sur des classeurs SYNTHÉTIQUES : les vrais classeurs sont
 * gitignorés (sources du CEO), la CI ne les voit pas. Le JSON qu'ils produisent est tenu par
 * `demo-market-brief-coverage.spec.ts`.
 */

const row = (n: number, ...cells: string[]): GridRow => ({
  n,
  cells: new Map(cells.flatMap((text, i) => (text === '' ? [] : [[i + 1, text] as [number, string]]))),
  links: new Map(),
})
const at = (n: number, cells: Record<number, string>): GridRow => ({
  n,
  cells: new Map(Object.entries(cells).map(([col, text]) => [Number(col), text] as [number, string])),
  links: new Map(),
})

/** Un onglet tabulaire : titre (ligne 2), sous-titre (3), notes éventuelles (7), en-tête (8), données. */
const tableSheet = (
  name: string,
  headers: string[],
  data: string[][],
  opts: { subtitle?: string; notes?: string[] } = {},
) => ({
  name,
  badCells: 0,
  rows: [
    at(2, { 2: `${name} — TITRE` }),
    at(3, { 2: opts.subtitle ?? 'Sous-titre' }),
    ...(opts.notes ?? []).map((note, i) => at(7 + i, { 1: note })),
    row(8 + (opts.notes?.length ?? 0), ...headers),
    ...data.map((cells, i) => row(9 + (opts.notes?.length ?? 0) + i, ...cells)),
  ],
})

const cockpitSheet = (
  knowledge: [string, string, string][] = [['MARCHÉ — LE MARCHÉ', 'Un marché.', 'Il compte.']],
) => ({
  name: 'COCKPIT',
  badCells: 0,
  rows: [
    at(2, { 2: 'MARCHÉ TEST — VOICI TOUT CE QUE JE SAIS' }),
    at(3, { 2: 'sous-titre' }),
    at(7, { 2: 'A', 3: 'B' }),
    at(8, { 2: '10', 3: '20' }),
    at(9, { 2: 'a', 3: 'b' }),
    at(11, { 2: 'CE QUE JE SAIS — EN UNE PAGE' }),
    ...knowledge.map(([r, k, m], i) => at(13 + i, { 2: r, 3: k, 6: m })),
  ],
})

const workbook = (...sheets: GridWorkbook['sheets']): GridWorkbook => ({ created: new Date(0), sheets })

const plan = (sheets: SheetPlan[], over: Partial<MarketPlan> = {}): MarketPlan => ({
  slug: 'test',
  source: 'test.xlsx',
  titlePrefix: 'MARCHÉ TEST',
  zone: { label: 'Test (59)', scope: 'france', departments: ['59'], cantons: [], cities: [] },
  generatedAt: '2026-10-05T10:00:00+02:00',
  rewrites: [],
  sheets: [{ sheet: 'COCKPIT', cockpit: {} }, ...sheets],
  ...over,
})

const GUARDRAILS = tableSheet('GARDE-FOUS', ['POINT', "CE QU'IL FAUT SAVOIR"], [['Prix', 'Dominé par ADEO.']])
const withCockpit = (...sheets: GridWorkbook['sheets']): GridWorkbook => workbook(cockpitSheet(), ...sheets, GUARDRAILS)
const base: SheetPlan[] = [{ sheet: 'GARDE-FOUS', guardrails: { mine: () => true, elsewhere: () => false } }]

describe('moteur de conversion des briefs de marché', () => {
  it('lit un classeur minimal et rend un brief valide au contrat', () => {
    const { brief } = convertMarketWorkbook(
      withCockpit(),
      plan(base, { zone: { label: 'Lille (59)', scope: 'france', departments: ['59'], cantons: [], cities: [] } }),
    )
    expect(marketBriefSchema.safeParse(brief).success).toBe(true)
    expect(brief.kpis).toHaveLength(2)
    expect(brief.guardrails).toEqual([{ point: 'Prix', detail: 'Dominé par ADEO.' }])
  })

  it('refuse un onglet non mappé et un onglet du plan absent du classeur', () => {
    expect(() => convertMarketWorkbook(withCockpit(tableSheet('EXTRA', ['A', 'B'], [])), plan(base))).toThrow(
      /non mappé.*EXTRA/,
    )
    expect(() => convertMarketWorkbook(withCockpit(), plan([...base, { sheet: 'FANTOME', section: {} }]))).toThrow(
      /absent.*FANTOME/,
    )
  })

  it('refuse une colonne lue par personne et non déclarée retirée — jamais ignorée en silence', () => {
    const grid = withCockpit(tableSheet('CLIENTS X', ['ENTREPRISE', 'E-MAILS'], [['ADEO', '3']]))
    expect(() => convertMarketWorkbook(grid, plan([...base, { sheet: 'CLIENTS X', clients: true }]))).toThrow(
      /ni lue\(s\) ni déclarée\(s\).*E-MAILS/,
    )
    const { skipped } = convertMarketWorkbook(
      grid,
      plan([...base, { sheet: 'CLIENTS X', clients: true, dropped: { 'E-MAILS': 'comptage' } }]),
    )
    expect(Object.keys(skipped).some(reason => reason.includes('colonne retirée [CLIENTS X] E-MAILS'))).toBe(true)
  })

  describe('grille de prix', () => {
    const grille = tableSheet(
      'GRILLE',
      ['MÉTIER', 'BESOINS', 'PRIX MÉDIAN', 'JUNIOR (0-2)', 'CONFIRMÉ (3-4)', 'SENIOR (5-10)', 'FOURCHETTE'],
      [
        ['Dev', '79', '502', '435 € (n=16)', '505 € (n=38)', '578 € (n=2)', '405-800 €'],
        ['Data', '35', '532', '—', '502 € (n=20)', '570 € (n=11)', '455-610 €'],
      ],
      {
        subtitle: '231 besoins localisés à Lille 2021-2024',
        notes: ['Grille dominée par ADEO : 190 besoins sur 231.'],
      },
    )
    const run = () =>
      convertMarketWorkbook(withCockpit(grille), plan([...base, { sheet: 'GRILLE', priceGrid: { currency: 'EUR' } }]))

    it('lit « 435 € (n=16) » et la fourchette, nomme la source du fichier et le client dominant', () => {
      const grid = run().brief.price_grid
      expect(grid?.sample_size).toBe(231)
      expect(grid?.period).toBe('2021-2024')
      expect(grid?.source_kind).toBe('provided_file')
      expect(grid?.top_client).toEqual({ name: 'ADEO', n: 190 })
      expect(grid?.rows[0]).toMatchObject({
        family: 'Dev',
        needs: 79,
        median: 502,
        junior: { amount: 435, n: 16 },
        range: { min: 405, max: 800 },
      })
    })

    it('n < 3 : la cellule est ABSENTE, jamais un zéro, et le rapport le compte', () => {
      const { brief, skipped } = run()
      expect(brief.price_grid?.rows[0]).not.toHaveProperty('senior')
      expect(brief.price_grid?.rows[1]).not.toHaveProperty('junior')
      expect(brief.price_grid?.rows[1]?.senior).toEqual({ amount: 570, n: 11 })
      expect(Object.keys(skipped).some(reason => reason.includes('n < 3'))).toBe(true)
      expect(checkMarketBrief(brief).filter(v => v.code === 'PRICE_CELL_UNDERSAMPLED')).toEqual([])
    })

    it('un client à 82 % de l’échantillon doit être nommé par un garde-fou (ici « ADEO » l’est)', () => {
      expect(checkMarketBrief(run().brief).filter(v => v.code === 'PRICE_GRID_CONCENTRATED_UNSAID')).toEqual([])
    })

    it('refuse une cellule de prix illisible plutôt que de la deviner', () => {
      const bad = tableSheet(
        'GRILLE',
        ['MÉTIER', 'BESOINS', 'PRIX MÉDIAN', 'JUNIOR (0-2)', 'CONFIRMÉ (3-4)', 'SENIOR (5-10)', 'FOURCHETTE'],
        [['Dev', '5', '500', 'environ 400', '—', '—', '405-800 €']],
        { subtitle: '5 besoins localisés 2021-2024' },
      )
      expect(() =>
        convertMarketWorkbook(withCockpit(bad), plan([...base, { sheet: 'GRILLE', priceGrid: { currency: 'EUR' } }])),
      ).toThrow(/cellule de prix illisible/)
    })
  })

  it('galaxie : « 0 besoin chiffré » est omis, jamais affiché « 0 »', () => {
    const galaxie = tableSheet(
      'GALAXIE',
      ['ENSEIGNE', 'PROFILS EN POSTE', 'EXTERNES', 'BESOINS CHIFFRÉS'],
      [
        ['ADEO', '70', '48', '196'],
        ['Decathlon', '68', '42', '0'],
      ],
    )
    const { brief } = convertMarketWorkbook(
      workbook(
        cockpitSheet(),
        { ...galaxie, rows: galaxie.rows.map(r => (r.n === 2 ? at(2, { 2: 'LA GALAXIE MULLIEZ' }) : r)) },
        GUARDRAILS,
      ),
      plan([...base, { sheet: 'GALAXIE', group: { name: 'Galaxie Mulliez' } }]),
    )
    expect(brief.groups?.[0]?.members).toEqual([
      { name: 'ADEO', profiles: 70, externals: 48, needs: 196 },
      { name: 'Decathlon', profiles: 68, externals: 42 },
    ])
  })

  it('personnes EN CLAIR (D5) : nom, poste, employeur, e-mails, mobile, LinkedIn ; les e-mails multiples restent ensemble', () => {
    const externes = tableSheet(
      'EXTERNES X',
      ['NOM', 'POSTE', 'ENTREPRISE', 'VILLE', 'FAMILLE', 'E-MAIL', 'MOBILE', 'LINKEDIN'],
      [
        [
          'Jean DUPONT',
          'Développeur',
          'ACSSI',
          'Lille',
          'Développement logiciel',
          'j.dupont@acssi.fr | jd@gmail.com',
          '+33 6 87 55 00 69',
          'https://www.linkedin.com/in/jdupont',
        ],
      ],
    )
    const { brief } = convertMarketWorkbook(
      withCockpit(externes),
      plan([...base, { sheet: 'EXTERNES X', people: true }]),
    )
    expect(brief.people).toEqual([
      {
        name: 'Jean DUPONT',
        function: 'Développeur',
        entity: 'ACSSI',
        department: 'Développement logiciel',
        city: 'Lille',
        email: 'j.dupont@acssi.fr | jd@gmail.com',
        mobile: '+33 6 87 55 00 69',
        linkedin: 'https://www.linkedin.com/in/jdupont',
        role: 'external',
      },
    ])
  })

  it('un libellé de métropole (« Greater Lille Metropolitan ») n’est pas une ville : écarté et compté', () => {
    const clients = tableSheet(
      'CLIENTS X',
      ['ENTREPRISE', 'VILLES'],
      [['Kiabi', 'Greater Lille Metropolitan | Lille | Tourcoing']],
    )
    const { brief, skipped } = convertMarketWorkbook(
      withCockpit(clients),
      plan([...base, { sheet: 'CLIENTS X', clients: true }]),
    )
    expect(brief.clients?.[0]?.cities).toEqual(['Lille', 'Tourcoing'])
    expect(Object.keys(skipped).some(reason => reason.includes('Greater Lille Metropolitan'))).toBe(true)
  })

  describe('règles de texte des briefs', () => {
    it('refuse un nom d’ESN prospect non neutralisé', () => {
      const clients = tableSheet('CLIENTS X', ['ENTREPRISE', 'SECTEUR'], [['ADEO', 'Retail, comme le dit Meedz']])
      expect(() =>
        convertMarketWorkbook(withCockpit(clients), plan([...base, { sheet: 'CLIENTS X', clients: true }])),
      ).toThrow(/ESN prospect/)
    })

    it('refuse un fournisseur de données nommé, sauf réécriture déclarée', () => {
      const knowledge = cockpitSheet([['MARCHÉ — MÉMOIRE', 'Quatre comptes DataForge à siège suisse.', 'Sens.']])
      const grid = workbook(knowledge, GUARDRAILS)
      expect(() => convertMarketWorkbook(grid, plan(base))).toThrow(/fournisseur nommé/)
      const { brief } = convertMarketWorkbook(
        grid,
        plan(base, {
          rewrites: [
            { sheet: 'COCKPIT', find: 'DataForge', replace: 'mémoire marché', why: 'fournisseur jamais nommé' },
          ],
        }),
      )
      expect(brief.what_i_know[0]?.known).toBe('Quatre comptes mémoire marché à siège suisse.')
    })

    it('une réécriture dont la source a changé (périmée) fait échouer', () => {
      expect(() =>
        convertMarketWorkbook(
          withCockpit(),
          plan(base, { rewrites: [{ sheet: 'COCKPIT', find: 'absent du classeur', replace: '', why: 'test' }] }),
        ),
      ).toThrow(/périmée/)
    })
  })

  describe('classeur partagé entre deux zones', () => {
    const shared = {
      mine: (l: string) => l.startsWith('MARCHÉ'),
      elsewhere: (l: string) => l.startsWith('AUTRE'),
    }

    it('une rubrique laissée à l’autre zone n’entre pas, et le rapport la compte', () => {
      const grid = workbook(
        cockpitSheet([
          ['MARCHÉ — A', 'a', 'b'],
          ['AUTRE — B', 'c', 'd'],
        ]),
        GUARDRAILS,
      )
      const { brief, skipped } = convertMarketWorkbook(
        grid,
        plan(base, { sheets: [{ sheet: 'COCKPIT', cockpit: { knowledge: shared } }, ...base] }),
      )
      expect(brief.what_i_know.map(k => k.rubric)).toEqual(['MARCHÉ — A'])
      expect(Object.keys(skipped).some(reason => reason.includes('autre zone'))).toBe(true)
    })

    it('une rubrique qui n’est à aucune zone fait échouer — jamais perdue en silence', () => {
      const grid = workbook(cockpitSheet([['ORPHELINE', 'a', 'b']]), GUARDRAILS)
      expect(() =>
        convertMarketWorkbook(
          grid,
          plan(base, { sheets: [{ sheet: 'COCKPIT', cockpit: { knowledge: shared } }, ...base] }),
        ),
      ).toThrow(/n'est attribué à aucune zone/)
    })
  })

  it('besoins : les lignes localisées hors zone vont en `-non-retenus` avec leur motif, rien n’est perdu', () => {
    const besoins = tableSheet(
      'BESOINS X',
      ['BESOIN', 'LOCALISATION'],
      [
        ['Data Architect', 'Annecy'],
        ['Web Analyst', 'Paris'],
        ['QA', ''],
      ],
    )
    const { brief } = convertMarketWorkbook(
      withCockpit(besoins),
      plan([...base, { sheet: 'BESOINS X', needs: { inZone: l => /annecy|lyon/i.test(l) } }]),
    )
    const keys = brief.sections.map(s => s.key)
    expect(keys).toContain('besoins-x')
    expect(keys).toContain('besoins-x-non-retenus')
    expect(brief.sections.find(s => s.key === 'besoins-x')?.rows).toEqual([
      { besoin: 'Data Architect', localisation: 'Annecy' },
    ])
    expect(brief.sections.find(s => s.key === 'besoins-x-non-retenus')?.rows).toEqual([
      { besoin: 'Web Analyst', localisation: 'Paris', motif: 'Localisation « Paris », hors de la zone' },
      { besoin: 'QA', motif: 'Localisation non renseignée dans le classeur' },
    ])
  })

  it('une ville déclarée à la zone que le classeur ne cite jamais fait échouer — rien d’inventé', () => {
    expect(() =>
      convertMarketWorkbook(
        withCockpit(),
        plan(base, {
          zone: { label: 'X (59)', scope: 'france', departments: ['59'], cantons: [], cities: ['Atlantide'] },
        }),
      ),
    ).toThrow(/Atlantide.*absente du classeur/)
  })

  it('compte nommé (ABB Suisse) : la phrase est vérifiée dans la source, il entre dans les clients de la zone', () => {
    const suisse = tableSheet(
      'MARCHE SUISSE',
      ['SUJET', 'CE QUE JE SAIS', 'CE QUE ÇA VEUT DIRE POUR TOI'],
      [['Compte structuré', 'ABB Suisse : 3 business areas.', 'Dossier livré séparément.']],
    )
    const sheets: SheetPlan[] = [
      ...base,
      { sheet: 'MARCHE SUISSE', knowledge: true, accountNamed: { name: 'ABB Suisse', row: 'Compte structuré' } },
    ]
    const { brief } = convertMarketWorkbook(withCockpit(suisse), plan(sheets))
    expect(brief.clients).toEqual([{ name: 'ABB Suisse', cities: [], reading: 'ABB Suisse : 3 business areas.' }])
    const renamed = tableSheet(
      'MARCHE SUISSE',
      ['SUJET', 'CE QUE JE SAIS', 'CE QUE ÇA VEUT DIRE POUR TOI'],
      [['Compte structuré', 'Un autre compte.', 'Sens.']],
    )
    expect(() => convertMarketWorkbook(withCockpit(renamed), plan(sheets))).toThrow(/ne nomme plus/)
  })

  describe('les quatre plans', () => {
    it('couvrent quatre zones distinctes, deux classeurs partagés, un seul scope par zone (D4)', () => {
      expect(MARKET_PLANS.map(p => p.slug)).toEqual([
        'lille',
        'nantes-saint-nazaire',
        'lyon-axe-geneve',
        'suisse-romande',
      ])
      expect(MARKET_PLANS.filter(p => p.source === 'META_MARCHE_LYON_SUISSE.xlsx')).toHaveLength(2)
      for (const p of MARKET_PLANS) {
        if (p.zone.scope === 'france') expect(p.zone.cantons).toEqual([])
        else expect(p.zone.departments).toEqual([])
      }
      expect(MARKET_PLANS.find(p => p.slug === 'lyon-axe-geneve')?.zone.departments).toEqual([
        '69',
        '01',
        '38',
        '73',
        '74',
      ])
      expect(MARKET_PLANS.find(p => p.slug === 'suisse-romande')?.zone.cantons).toEqual(['GE', 'VD'])
    })

    it('chaque plan nomme tous les onglets de son classeur : Lyon et Suisse se répartissent les 14 onglets de META', () => {
      const META = [
        'COCKPIT',
        'CLIENTS LYON',
        'SECTEURS LYON',
        'COMPETENCES LYON',
        'ESN LYON',
        'EXTERNES LYON',
        'COMPTES STRUCTURES LYON',
        'BESOINS CLIENTS LYON',
        'ANCIENS SANOFI LYON',
        'AXE LYON-GENEVE',
        'MARCHE SUISSE',
        'REGLES SUISSE',
        'CIBLES ABB SUISSE',
        'GARDE-FOUS',
      ]
      for (const slug of ['lyon-axe-geneve', 'suisse-romande']) {
        const p = MARKET_PLANS.find(candidate => candidate.slug === slug)
        expect(p?.sheets.map(s => s.sheet).sort()).toEqual([...META].sort())
      }
    })

    it('la tuile « règles » de la Suisse romande est nommée « règles locales » (recette 06/10/2026)', () => {
      const suisse = MARKET_PLANS.find(p => p.slug === 'suisse-romande')
      expect(suisse?.rewrites.some(r => r.sheet === 'COCKPIT' && r.replace === 'SUISSE — RÈGLES LOCALES')).toBe(true)
    })

    it('chaque onglet ignoré porte sa raison', () => {
      for (const p of MARKET_PLANS) {
        for (const s of p.sheets.filter(candidate => 'skip' in candidate)) expect(s.skip?.length).toBeGreaterThan(20)
      }
    })
  })
})
