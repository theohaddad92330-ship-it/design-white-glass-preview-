/**
 * #3755 — le service de la grille de qualification : versions, import, saisie
 * manuelle qui gagne, évaluation de l'analyse, instantané porté par le dossier.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import type { QualificationCriterion } from '@bellum/contracts'
import {
  AccountQualificationEntity,
  QualificationCriterionEntity,
  QualificationGridEntity,
} from '../../database/entities/qualification-grid.entity'
import { QualificationGridService, sanitizeAnalysisEvaluations } from './qualification-grid.service'
import type { QualificationEvaluatorPort } from './qualification-evaluator.client'
import type { QualificationSignals } from './qualification-signals'

type Row = Record<string, unknown>

function fakeRepo(rows: Row[], prefix: string) {
  let seq = 0
  const matches = (row: Row, where: Row | undefined): boolean =>
    !where || Object.entries(where).every(([k, v]) => row[k] === v)
  return {
    rows,
    find: jest.fn(async (opts: { where?: Row; order?: Record<string, 'ASC' | 'DESC'> } = {}) => {
      const found = rows.filter(r => matches(r, opts.where))
      const [key, dir] = Object.entries(opts.order ?? {})[0] ?? []
      if (key) found.sort((a, b) => ((a[key] as number) > (b[key] as number) ? 1 : -1) * (dir === 'DESC' ? -1 : 1))
      return found
    }),
    findOne: jest.fn(async (opts: { where?: Row; order?: Record<string, 'ASC' | 'DESC'> }) => {
      const found = rows.filter(r => matches(r, opts.where))
      const [key, dir] = Object.entries(opts.order ?? {})[0] ?? []
      if (key) found.sort((a, b) => ((a[key] as number) > (b[key] as number) ? 1 : -1) * (dir === 'DESC' ? -1 : 1))
      return found[0] ?? null
    }),
    create: jest.fn((v: Row) => ({ ...v })),
    save: jest.fn(async (v: Row | Row[]) => {
      const list = Array.isArray(v) ? v : [v]
      for (const item of list) {
        if (!item.id) {
          item.id = `${prefix}-${++seq}`
          rows.push(item)
        } else {
          const existing = rows.find(r => r.id === item.id)
          if (existing) Object.assign(existing, item)
          else rows.push(item)
        }
      }
      return v
    }),
    update: jest.fn(async (where: Row, patch: Row) => {
      for (const r of rows.filter(r => matches(r, where))) Object.assign(r, patch)
      return { affected: 1 }
    }),
  }
}

const ctx = { userId: 'u1', workspaceId: 'ws-1' }

const F1: QualificationCriterion = {
  code: 'F1',
  label: 'Présence géographique',
  kind: 'eliminatory',
  weight: null,
  category: 'Filtres',
  description_max: 'France',
  description_zero: 'Hors France',
  position: 0,
}
const S1: QualificationCriterion = {
  ...F1,
  code: 'S1',
  label: 'Tier du compte',
  kind: 'weighted',
  weight: 30,
  position: 1,
}
const S2: QualificationCriterion = { ...S1, code: 'S2', label: 'Douleur exprimée', weight: 50, position: 2 }
const S3: QualificationCriterion = { ...S1, code: 'S3', label: 'Staffing disponible', weight: 20, position: 3 }
const GRID = [F1, S1, S2, S3]

function build(
  opts: { evaluator?: QualificationEvaluatorPort; signals?: QualificationSignals; accounts?: Row[] } = {},
) {
  const grids = fakeRepo([], 'grid')
  const criteria = fakeRepo([], 'crit')
  const evaluations = fakeRepo([], 'eval')
  const accountRows = opts.accounts ?? [
    { id: 'acc-1', workspace_id: 'ws-1', company_name: 'Acme', headquarters: 'Paris', raw_analysis: {} },
  ]
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    getRepository: (entity: unknown) =>
      entity === QualificationGridEntity ? grids : entity === QualificationCriterionEntity ? criteria : evaluations,
  }
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params })
      if (/^\s*SELECT/i.test(sql)) {
        return accountRows.filter(r => r.id === params[0] && r.workspace_id === params[1])
      }
      return []
    }),
  }
  const service = new QualificationGridService(
    grids as never,
    criteria as never,
    evaluations as never,
    dataSource as never,
    opts.signals,
    opts.evaluator,
  )
  return { service, grids, criteria, evaluations, queries, dataSource }
}

const snapshotWrites = (queries: { sql: string; params: unknown[] }[]) =>
  queries.filter(q => q.sql.includes("'qualification'")).map(q => JSON.parse(q.params[0] as string))

describe('QualificationGridService — grille versionnée (#3755.1/.7)', () => {
  it('sans grille, rend null', async () => {
    const { service } = build()
    expect(await service.getActiveGrid(ctx.workspaceId)).toBeNull()
  })

  it('enregistrer crée une version ; modifier crée la suivante, l’ancienne reste inactive', async () => {
    const { service, grids } = build()
    const v1 = await service.saveGrid(ctx, { criteria: GRID })
    expect(v1.version).toBe(1)
    const v2 = await service.saveGrid(ctx, { criteria: [F1, { ...S1, weight: 50 }, { ...S2, weight: 30 }, S3] })
    expect(v2.version).toBe(2)
    expect(grids.rows.map(g => [g.version, g.active])).toEqual([
      [1, false],
      [2, true],
    ])
    const active = await service.getActiveGrid(ctx.workspaceId)
    expect(active?.version).toBe(2)
    expect(active?.criteria.find(c => c.code === 'S1')?.weight).toBe(50)
  })

  it('#3755.2 — refuse un total ≠ 100 en le NOMMANT', async () => {
    const { service } = build()
    await expect(service.saveGrid(ctx, { criteria: [F1, { ...S1, weight: 25 }, S2, S3] })).rejects.toThrow(
      'total 95/100',
    )
    await expect(service.saveGrid(ctx, { criteria: [F1, { ...S1, weight: 25 }, S2, S3] })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('importe un CSV et refuse un classeur au total faux', async () => {
    const { service } = build()
    const grid = await service.importGrid(ctx, {
      format: 'csv',
      content: 'Phase;ID;Critère;Poids_Max\nFiltres éliminatoires;F1;Présence géographique;\nScoring;S1;Tier;100\n',
    })
    expect(grid.criteria.map(c => [c.code, c.kind])).toEqual([
      ['F1', 'eliminatory'],
      ['S1', 'weighted'],
    ])
    await expect(
      service.importGrid(ctx, { format: 'csv', content: 'ID;Critère;Poids_Max\nS1;Tier;90\n' }),
    ).rejects.toThrow('total 90/100')
  })
})

describe('QualificationGridService — #4426.6 import d’une grille go/no-go réelle', () => {
  it('ignore la ligne TOTAL, écarte la ligne incomplète seule, et le rapport les compte', async () => {
    const { service } = build()
    const grid = await service.importGrid(ctx, {
      format: 'csv',
      content: [
        'Phase;ID;Categorie;Critere;Poids_Max;Description_Max_Points;Description_Zero_Point;Impact_Decision',
        'Phase 0 - Filter;F1;Géo;Présence en France;PASS/FAIL;France;Hors France;NO-GO Immédiat si FAIL',
        'Phase 1;S1;Strat;Tier;100;T1;Hors tier;',
        ';;;Sans identifiant;5;;;',
        ';TOTAL;;;100;;;',
      ].join('\n'),
    })
    expect(grid.criteria.map(c => [c.code, c.kind])).toEqual([
      ['F1', 'eliminatory'],
      ['S1', 'weighted'],
    ])
    expect(grid.import_report).toEqual({ ignored: 1, skipped: ['Sans identifiant'] })
  })
})

describe('QualificationGridService — évaluation d’un compte', () => {
  const evaluator = (evaluations: unknown): QualificationEvaluatorPort => ({
    evaluate: jest.fn(async () => ({ status: 'ok' as const, evaluations })),
  })

  it('sans grille active, l’analyse n’écrit RIEN (verdict inchangé, #3755.6)', async () => {
    const port = evaluator([])
    const { service, queries } = build({ evaluator: port })
    expect(await service.evaluateFromAnalysis('acc-1', 'ws-1')).toBe('no_grid')
    expect(port.evaluate).not.toHaveBeenCalled()
    expect(queries.filter(q => /UPDATE/i.test(q.sql))).toEqual([])
  })

  it('#3755.4 — un compte hors France → NO-GO « F1 Présence géographique », écrit avec sa version', async () => {
    const port = evaluator([
      { code: 'F1', status: 'fail', points: null, evidence: 'Siège à Montréal (Canada)' },
      { code: 'S2', status: 'scored', points: 40, evidence: 'Refonte annoncée' },
    ])
    const { service, queries } = build({ evaluator: port })
    await service.saveGrid(ctx, { criteria: GRID })
    expect(await service.evaluateFromAnalysis('acc-1', 'ws-1')).toBe('written')
    const [snapshot] = snapshotWrites(queries)
    expect(snapshot.verdict).toBe('NO-GO')
    expect(snapshot.eliminated_by).toEqual([{ code: 'F1', label: 'Présence géographique' }])
    expect(snapshot.grid_version).toBe(1)
  })

  it('#3755.3/.8 — critère interne et tier sans source : non évaluables, hors dénominateur', async () => {
    const port = evaluator([
      { code: 'F1', status: 'pass', points: null, evidence: 'Siège à Paris' },
      { code: 'S1', status: 'scored', points: 30, evidence: 'deviné' },
      { code: 'S2', status: 'scored', points: 40, evidence: 'Refonte annoncée' },
      { code: 'S3', status: 'scored', points: 20, evidence: 'deviné' },
    ])
    const { service, queries } = build({ evaluator: port })
    await service.saveGrid(ctx, { criteria: GRID })
    await service.evaluateFromAnalysis('acc-1', 'ws-1')
    const [snapshot] = snapshotWrites(queries)
    expect(snapshot.points).toBe(40)
    expect(snapshot.max).toBe(50)
    expect(snapshot.not_evaluable.map((c: { code: string }) => c.code)).toEqual(['S1', 'S3'])
    expect(snapshot.verdict).toBe('GO')
  })

  it('#3755.8 — le tier fourni par le port est transmis à l’évaluation', async () => {
    const port = evaluator([])
    const signals: QualificationSignals = {
      getTier: jest.fn(async () => 'Tier 1'),
      getDecisionLevel: jest.fn(async () => null),
    }
    const { service } = build({ evaluator: port, signals })
    await service.saveGrid(ctx, { criteria: GRID })
    await service.evaluateFromAnalysis('acc-1', 'ws-1')
    expect(port.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ signals: { tier: 'Tier 1', decision_level: null } }),
    )
  })

  it('#3755.5 — la saisie manuelle gagne, même si l’analyse repasse APRÈS', async () => {
    const port = evaluator([
      { code: 'F1', status: 'fail', points: null, evidence: 'Siège à Montréal' },
      { code: 'S2', status: 'scored', points: 40, evidence: 'Refonte annoncée' },
    ])
    const { service, queries } = build({ evaluator: port })
    await service.saveGrid(ctx, { criteria: GRID })
    await service.setManualEvaluation(ctx, 'acc-1', 'F1', { status: 'pass', evidence: 'Filiale à Lyon' })
    await service.evaluateFromAnalysis('acc-1', 'ws-1')
    const view = await service.getAccountQualification(ctx, 'acc-1')
    expect(view?.result.verdict).not.toBe('NO-GO')
    expect(view?.result.axes.find(a => a.code === 'F1')).toMatchObject({ status: 'pass', source: 'manual' })
    const last = snapshotWrites(queries).at(-1)
    expect(last.eliminated_by).toEqual([])
  })

  it('refuse un code inconnu de la grille, et un compte hors espace', async () => {
    const { service } = build()
    await service.saveGrid(ctx, { criteria: GRID })
    await expect(service.setManualEvaluation(ctx, 'acc-1', 'ZZ', { status: 'pass' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      service.setManualEvaluation({ ...ctx, workspaceId: 'ws-2' }, 'acc-1', 'F1', { status: 'pass' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('#3755.7 — un verdict garde la version qui l’a produit après une modification de grille', async () => {
    const port = evaluator([{ code: 'S2', status: 'scored', points: 40, evidence: 'Refonte annoncée' }])
    const { service } = build({ evaluator: port })
    await service.saveGrid(ctx, { criteria: GRID })
    await service.evaluateFromAnalysis('acc-1', 'ws-1')
    await service.saveGrid(ctx, { criteria: [F1, { ...S1, weight: 50 }, { ...S2, weight: 30 }, S3] })
    const view = await service.getAccountQualification(ctx, 'acc-1')
    expect(view?.evaluated_version).toBe(1)
    expect(view?.current_version).toBe(2)
    expect(view?.result.max).toBe(50)
  })

  it('le service IA indisponible n’écrit rien', async () => {
    const port: QualificationEvaluatorPort = {
      evaluate: jest.fn(async () => ({ status: 'unavailable' as const, error: 'down' })),
    }
    const { service, evaluations } = build({ evaluator: port })
    await service.saveGrid(ctx, { criteria: GRID })
    expect(await service.evaluateFromAnalysis('acc-1', 'ws-1')).toBe('unavailable')
    expect(evaluations.rows).toEqual([])
  })
})

/**
 * #3749 — le verdict de la grille, lu par la LISTE des comptes, pas
 * seulement par la fiche. Lecture pure de l'instantané déjà écrit
 * (`raw_analysis.qualification`, `readQualificationSnapshot`) — jamais un
 * recalcul : même mécanisme que `AccountAccessService.accessSummary`
 * (`access-summary`), un verdict par compte pour tout le portefeuille.
 */
describe('QualificationGridService — accountsSummary (#3749)', () => {
  function buildSummary(accountRows: Row[]) {
    const grids = fakeRepo([], 'grid')
    const criteria = fakeRepo([], 'crit')
    const evaluations = fakeRepo([], 'eval')
    const dataSource = {
      transaction: jest.fn(),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (/^\s*SELECT/i.test(sql) && /FROM accounts/.test(sql) && !/LIMIT 1/.test(sql)) {
          return accountRows.filter(r => r.workspace_id === params[0])
        }
        return []
      }),
    }
    return new QualificationGridService(grids as never, criteria as never, evaluations as never, dataSource as never)
  }

  it('rend le verdict de l’instantané déjà écrit, un par compte', async () => {
    const service = buildSummary([
      {
        id: 'acc-go',
        workspace_id: 'ws-1',
        status: 'active',
        raw_analysis: {
          qualification: {
            grid_id: 'g1',
            grid_version: 1,
            verdict: 'GO',
            eliminated_by: [],
            points: 90,
            max: 100,
            not_evaluable: [],
            evaluated_at: '2026-10-01T00:00:00.000Z',
          },
        },
      },
      { id: 'acc-sans-grille', workspace_id: 'ws-1', status: 'active', raw_analysis: {} },
    ])

    const summary = await service.accountsSummary('ws-1')

    expect(summary).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-go', verdict: 'GO' },
        { accountId: 'acc-sans-grille', verdict: null },
      ]),
    )
  })

  it('un compte supprimé ne fait aucune ligne', async () => {
    const service = buildSummary([{ id: 'acc-1', workspace_id: 'ws-1', status: 'deleted', raw_analysis: {} }])
    expect(await service.accountsSummary('ws-1')).toEqual([])
  })

  it('un instantané illisible rend null pour CE compte, sans faire tomber les autres', async () => {
    const service = buildSummary([
      {
        id: 'acc-illisible',
        workspace_id: 'ws-1',
        status: 'active',
        raw_analysis: { qualification: 'n’importe quoi' },
      },
      {
        id: 'acc-go',
        workspace_id: 'ws-1',
        status: 'active',
        raw_analysis: {
          qualification: {
            grid_id: 'g1',
            grid_version: 1,
            verdict: 'GO',
            eliminated_by: [],
            points: 90,
            max: 100,
            not_evaluable: [],
            evaluated_at: '2026-10-01T00:00:00.000Z',
          },
        },
      },
    ])
    const summary = await service.accountsSummary('ws-1')
    expect(summary).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-illisible', verdict: null },
        { accountId: 'acc-go', verdict: 'GO' },
      ]),
    )
  })
})

describe('sanitizeAnalysisEvaluations', () => {
  it('une évaluation sans preuve n’est pas une évaluation : non évaluable', () => {
    const out = sanitizeAnalysisEvaluations(GRID, [{ code: 'S2', status: 'scored', points: 30, evidence: '' }], {
      tier: null,
      decision_level: null,
    })
    expect(out.find(e => e.code === 'S2')?.status).toBe('not_evaluable')
  })

  it('ignore un code hors grille et une forme hors contrat', () => {
    const out = sanitizeAnalysisEvaluations(GRID, [{ code: 'X9', status: 'pass', evidence: 'x' }, 'n’importe quoi'], {
      tier: null,
      decision_level: null,
    })
    expect(out.map(e => e.code).sort()).toEqual(['F1', 'S1', 'S2', 'S3'])
    expect(out.every(e => e.status === 'not_evaluable')).toBe(true)
  })

  it('le type est AccountQualificationEntity côté stockage (garde de compilation)', () => {
    const row: Partial<AccountQualificationEntity> = { analysis_evaluations: [] }
    expect(row.analysis_evaluations).toEqual([])
  })
})

describe('QualificationGridService — #4426.4 onglet choisi', () => {
  it('lit l’onglet nommé du classeur, pas le premier', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Synthèse').addRow(['Texte libre'])
    const grille = workbook.addWorksheet('Grille')
    grille.addRow(['ID', 'Critère', 'Poids_Max'])
    grille.addRow(['S1', 'Tier', 100])
    const content = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
    const { service } = build()
    const grid = await service.importGrid(ctx, { format: 'xlsx', content, sheet: 'Grille' })
    expect(grid.criteria.map(c => c.code)).toEqual(['S1'])
  })
})
