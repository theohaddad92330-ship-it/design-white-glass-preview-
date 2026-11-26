import { describe, expect, it } from 'vitest'
import {
  checkQualificationWeights,
  computeQualificationVerdict,
  isInternalQualificationCriterion,
  mergeQualificationEvaluations,
  parseQualificationGridCells,
  parseQualificationGridCsv,
  qualificationGridInputSchema,
  readQualificationSnapshot,
  type QualificationCriterion,
  type QualificationCriterionEvaluation,
} from './qualification-grid.js'

const F1: QualificationCriterion = {
  code: 'F1',
  label: 'Présence géographique',
  kind: 'eliminatory',
  weight: null,
  category: 'Filtres',
  description_max: 'Siège ou établissement en France',
  description_zero: 'Aucune présence en France',
  position: 0,
}
const F2: QualificationCriterion = { ...F1, code: 'F2', label: 'Solvabilité', position: 1 }
const S1: QualificationCriterion = {
  code: 'S1',
  label: 'Tier du compte',
  kind: 'weighted',
  weight: 60,
  category: 'Stratégique',
  description_max: 'Tier 1',
  description_zero: 'Hors tiers',
  position: 2,
}
const S2: QualificationCriterion = { ...S1, code: 'S2', label: 'Staffing disponible', weight: 40, position: 3 }
const GRID = [F1, F2, S1, S2]

const ev = (e: Partial<QualificationCriterionEvaluation> & { code: string }): QualificationCriterionEvaluation => ({
  status: 'not_evaluable',
  points: null,
  evidence: null,
  source: 'analysis',
  ...e,
})

describe('#3755.2 — le total des poids pondérés est contrôlé', () => {
  it('accepte une grille à 100', () => {
    expect(checkQualificationWeights(GRID)).toEqual({ ok: true, total: 100 })
  })

  it('refuse une grille à 95 en NOMMANT le total', () => {
    const result = checkQualificationWeights([F1, { ...S1, weight: 55 }, S2])
    expect(result).toEqual({ ok: false, total: 95, message: 'total 95/100' })
  })

  it('le schéma d’entrée refuse un éliminatoire pondéré et un code en double', () => {
    expect(qualificationGridInputSchema.safeParse({ criteria: GRID }).success).toBe(true)
    expect(qualificationGridInputSchema.safeParse({ criteria: [{ ...F1, weight: 10 }, S1, S2] }).success).toBe(false)
    expect(qualificationGridInputSchema.safeParse({ criteria: [F1, F1, S1, S2] }).success).toBe(false)
    const bad = qualificationGridInputSchema.safeParse({ criteria: [F1, { ...S1, weight: 55 }, S2] })
    expect(bad.success).toBe(false)
    expect(JSON.stringify(bad.error?.issues)).toContain('total 95/100')
  })
})

describe('#3755.1 — import du classeur (colonnes FR/EN)', () => {
  const header = ['Phase', 'ID', 'Catégorie', 'Critère', 'Poids_Max', 'Description_Max', 'Description_Zero', 'Impact']
  it('lit les filtres éliminatoires et les critères pondérés', () => {
    const result = parseQualificationGridCells([
      ['Matrice exFabrica'],
      header,
      [
        'Phase 1 — Filtres éliminatoires',
        'F1',
        'Géographie',
        'Présence géographique',
        '',
        'France',
        'Hors France',
        'NO-GO si FAIL',
      ],
      ['Phase 2 — Scoring', 'S1', 'Stratégique', 'Tier du compte', '60', 'Tier 1', 'Hors tier', ''],
      ['Phase 2 — Scoring', 'S2', 'Interne', 'Staffing disponible', '40', 'Équipe prête', 'Personne', ''],
      ['', '', '', '', '', '', '', ''],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.criteria.map(c => [c.code, c.kind, c.weight, c.position])).toEqual([
      ['F1', 'eliminatory', null, 0],
      ['S1', 'weighted', 60, 1],
      ['S2', 'weighted', 40, 2],
    ])
    expect(result.criteria[0]?.description_zero).toBe('Hors France')
  })

  it('accepte les en-têtes anglais', () => {
    const result = parseQualificationGridCells([
      ['Stage', 'Code', 'Category', 'Criterion', 'Max_Weight', 'Max_Description', 'Zero_Description'],
      ['Knock-out filters', 'F1', 'Geo', 'Geographic presence', '', 'France', 'Outside'],
      ['Scoring', 'S1', 'Strat', 'Tier', '100', 'T1', 'none'],
    ])
    expect(result.ok && result.criteria.map(c => c.kind)).toEqual(['eliminatory', 'weighted'])
  })

  it('refuse un classeur dont le total vaut 95 — le refus nomme le total', () => {
    const result = parseQualificationGridCells([
      header,
      ['Scoring', 'S1', 'x', 'Tier', '55', '', '', ''],
      ['Scoring', 'S2', 'x', 'Staffing', '40', '', '', ''],
    ])
    expect(result).toEqual({ ok: false, error: 'total 95/100' })
  })

  it('refuse un classeur sans colonne ID ni Critère', () => {
    expect(
      parseQualificationGridCells([
        ['A', 'B'],
        ['1', '2'],
      ]).ok,
    ).toBe(false)
  })

  it('lit un CSV au point-virgule avec guillemets', () => {
    const csv = 'Phase;ID;Critère;Poids_Max\n"Filtres éliminatoires";F1;"Présence; France";\nScoring;S1;Tier;100\n'
    const result = parseQualificationGridCsv(csv)
    expect(result.ok && result.criteria.map(c => c.label)).toEqual(['Présence; France', 'Tier'])
  })
})

// #4426.6 — le fichier réel du pack client : lignes PASS/FAIL, ligne TOTAL, en-têtes à underscores.
describe('#4426.6 — grille go/no-go : synthèse ignorée, filtres éliminatoires, ligne incomplète écartée seule', () => {
  const header = [
    'Phase',
    'ID',
    'Categorie',
    'Critere',
    'Poids_Max',
    'Description_Max_Points',
    'Description_Zero_Point',
    'Impact_Decision',
  ]
  const rows = [
    header,
    [
      'Phase 0 - Filter',
      'F1',
      'Géographie',
      'Présence en France',
      'PASS/FAIL',
      'France',
      'Hors France',
      'NO-GO Immédiat si FAIL',
    ],
    ['Phase 1 - Scoring', 'S1', 'Stratégique', 'Tier du compte', '60', 'Tier 1', 'Hors tier', ''],
    ['Phase 1 - Scoring', 'S2', 'Budget', 'Budget annoncé', '40', 'Budget validé', 'Aucun', ''],
    ['', '', '', 'Critère sans identifiant', '5', '', '', ''],
    ['', 'TOTAL', '', '', '100', '', '', ''],
  ]

  it('un poids PASS/FAIL devient un critère ÉLIMINATOIRE, jamais converti en points', () => {
    const result = parseQualificationGridCells(rows)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.criteria.map(c => [c.code, c.kind, c.weight])).toEqual([
      ['F1', 'eliminatory', null],
      ['S1', 'weighted', 60],
      ['S2', 'weighted', 40],
    ])
    expect(result.criteria[0]).toMatchObject({ description_max: 'France', description_zero: 'Hors France' })
  })

  it('la ligne TOTAL est une ligne de synthèse : ignorée et comptée, pas une erreur', () => {
    const result = parseQualificationGridCells(rows)
    expect(result.ok && result.ignored).toBe(1)
  })

  it.each(['TOTAL', 'Total', 'Sous-total'])('« %s » (en colonne ID ou Phase, sans critère) est ignoré', word => {
    const result = parseQualificationGridCells([
      header,
      ['Scoring', 'S1', '', 'Tier', '100', '', '', ''],
      [word, '', '', '', '100', '', '', ''],
      ['', word, '', '', '100', '', '', ''],
    ])
    expect(result.ok && result.ignored).toBe(2)
  })

  it('une ligne réellement incomplète écarte CETTE ligne, jamais tout le fichier — et se nomme', () => {
    const result = parseQualificationGridCells(rows)
    expect(result.ok && result.skipped).toEqual(['Critère sans identifiant'])
  })

  it('sait dire NON : un critère nommé « Total des points » reste un critère', () => {
    const result = parseQualificationGridCells([
      header,
      ['Scoring', 'S1', '', 'Total des points engagés', '100', '', '', ''],
    ])
    expect(result.ok && result.criteria.map(c => c.code)).toEqual(['S1'])
  })
})

describe('#3755.3 — critères internes : non évaluables de l’extérieur', () => {
  it('reconnaît staffing, appétence, effort avant-vente, budget validé', () => {
    expect(isInternalQualificationCriterion('Staffing disponible')).toBe(true)
    expect(isInternalQualificationCriterion("Appétence de l'équipe")).toBe(true)
    expect(isInternalQualificationCriterion('Effort avant-vente')).toBe(true)
    expect(isInternalQualificationCriterion('Budget validé')).toBe(true)
    expect(isInternalQualificationCriterion('Présence géographique')).toBe(false)
  })
})

describe('#3755.5 — la correction manuelle gagne toujours', () => {
  it('remplace l’évaluation de l’analyse, quelle que soit sa date', () => {
    const merged = mergeQualificationEvaluations(
      [ev({ code: 'S1', status: 'scored', points: 10, evidence: 'Tier 3' })],
      [ev({ code: 'S1', status: 'scored', points: 50, evidence: 'Corrigé', source: 'manual' })],
    )
    expect(merged).toEqual([ev({ code: 'S1', status: 'scored', points: 50, evidence: 'Corrigé', source: 'manual' })])
  })
})

describe('#3755.4/.6 — verdict de la grille', () => {
  it('un éliminatoire en FAIL → NO-GO avec le filtre NOMMÉ', () => {
    const verdict = computeQualificationVerdict(GRID, [
      ev({ code: 'F1', status: 'fail', evidence: 'Siège à Montréal' }),
      ev({ code: 'S1', status: 'scored', points: 60, evidence: 'Tier 1' }),
    ])
    expect(verdict.verdict).toBe('NO-GO')
    expect(verdict.eliminated_by).toEqual([{ code: 'F1', label: 'Présence géographique' }])
  })

  it('non évaluable ≠ FAIL, et sort du dénominateur — jamais compté 0', () => {
    const verdict = computeQualificationVerdict(GRID, [
      ev({ code: 'F1', status: 'pass', evidence: 'Siège à Paris' }),
      ev({ code: 'S1', status: 'scored', points: 45, evidence: 'Tier 2' }),
    ])
    expect(verdict.eliminated_by).toEqual([])
    expect(verdict.points).toBe(45)
    expect(verdict.max).toBe(60)
    expect(verdict.ratio).toBeCloseTo(0.75)
    expect(verdict.verdict).toBe('GO')
    expect(verdict.not_evaluable.map(c => c.code)).toEqual(['F2', 'S2'])
    expect(verdict.axes.find(a => a.code === 'S2')?.points).toBeNull()
  })

  it('reprend les seuils GO 7 / PRUDENT 5 appliqués au ratio', () => {
    const at = (points: number): string | null =>
      computeQualificationVerdict([S1, S2], [ev({ code: 'S1', status: 'scored', points, evidence: 'x' })]).verdict
    expect(at(42)).toBe('GO') // 0,70
    expect(at(30)).toBe('PRUDENT') // 0,50
    expect(at(29)).toBe('NO-GO')
  })

  it('rien d’évaluable → aucun verdict (jamais un 0/0 présenté comme NO-GO)', () => {
    const verdict = computeQualificationVerdict(GRID, [])
    expect(verdict.verdict).toBeNull()
    expect(verdict.ratio).toBeNull()
  })

  it('borne les points au poids du critère', () => {
    const verdict = computeQualificationVerdict(
      [S1, S2],
      [ev({ code: 'S1', status: 'scored', points: 600, evidence: 'x' })],
    )
    expect(verdict.points).toBe(60)
  })
})

describe('#3755.7 — l’instantané porté par le dossier', () => {
  it('se lit sans jamais lever, et rend null quand il est absent ou illisible', () => {
    expect(readQualificationSnapshot(null)).toBeNull()
    expect(readQualificationSnapshot({})).toBeNull()
    expect(readQualificationSnapshot({ qualification: { verdict: 'GO' } })).toBeNull()
    const snapshot = {
      grid_id: 'g',
      grid_version: 3,
      verdict: 'NO-GO',
      eliminated_by: [{ code: 'F1', label: 'Présence géographique' }],
      points: 0,
      max: 0,
      not_evaluable: [],
      evaluated_at: '2026-10-06T00:00:00.000Z',
    }
    expect(readQualificationSnapshot({ qualification: snapshot })?.grid_version).toBe(3)
  })
})
