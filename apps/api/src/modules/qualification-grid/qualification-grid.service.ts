import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import ExcelJS from 'exceljs'
import { DataSource, Repository } from 'typeorm'
import {
  computeQualificationVerdict,
  isInternalQualificationCriterion,
  mergeQualificationEvaluations,
  parseQualificationGridCells,
  type QualificationGridImportReport,
  qualificationCriterionEvaluationSchema,
  qualificationGridInputSchema,
  qualificationManualInputSchema,
  readQualificationSnapshot,
  splitQualificationCsv,
  type AccountQualificationSnapshot,
  type AccountQualificationView,
  type QualificationCriterion,
  type QualificationCriterionEvaluation,
  type QualificationGrid,
} from '@bellum/contracts'
import {
  AccountQualificationEntity,
  QualificationCriterionEntity,
  QualificationGridEntity,
} from '../../database/entities/qualification-grid.entity'
import { QualificationEvaluatorClient, type QualificationEvaluatorPort } from './qualification-evaluator.client'
import {
  DECISION_LEVEL_CRITERION_RE,
  QUALIFICATION_SIGNALS,
  TIER_CRITERION_RE,
  type QualificationSignals,
} from './qualification-signals'

/**
 * #3755 — LA GRILLE DE QUALIFICATION DE L'ESPACE, ET L'ÉVALUATION D'UN COMPTE.
 *
 * Module autonome (craft rule 7) : il lit ses trois tables et la ligne du compte
 * (scopée `workspace_id`, GA-43), et n'écrit hors de chez lui qu'UNE clé —
 * `accounts.raw_analysis.qualification`, l'instantané du verdict avec la version
 * de grille qui l'a produit (#3235), pour que tous les écrans qui montrent le
 * badge s'accordent (GA-26). Sans grille active, il n'écrit RIEN : le verdict
 * affiché reste celui d'avant, à l'octet près (#3755.6).
 */
export type QualificationCtx = { readonly userId: string; readonly workspaceId: string }

export type QualificationEvaluationOutcome = 'no_grid' | 'skipped' | 'unavailable' | 'written'

type QualificationSignalValues = { tier: string | null; decision_level: string | null }

type AccountRow = {
  id: string
  company_name: string | null
  trade_name?: string | null
  sector?: string | null
  employees?: string | null
  revenue?: string | null
  headquarters?: string | null
  website?: string | null
  address?: string | null
  siren?: string | null
  raw_analysis: Record<string, unknown> | null
}

/** Les faits du dossier que l'évaluation lit — jamais le dossier entier. */
const DOSSIER_KEYS = [
  'description',
  'business_description',
  'activity_label',
  'corporate_purpose',
  'legal_form',
  'capital',
  'creation_date',
  'executives',
  'c_level',
  'subsidiaries',
  'branches',
  'sites',
  'headquarters',
  'recent_signals',
  'evaluation',
  'evaluation_compte',
] as const

/** Borne par fait : un dossier n'entre jamais entier dans le prompt. */
const MAX_FACT_CHARS = 6000

function toCriterion(row: QualificationCriterionEntity): QualificationCriterion {
  return {
    code: row.code,
    label: row.label,
    kind: row.kind,
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    category: row.category ?? null,
    description_max: row.description_max ?? null,
    description_zero: row.description_zero ?? null,
    position: row.position,
  }
}

/**
 * Ce que l'analyse rend, NETTOYÉ avant d'être stocké — exporté pour être testé.
 *
 * - une forme hors contrat ou un code hors grille est ignoré ;
 * - une évaluation SANS PREUVE n'en est pas une : « non évaluable » ;
 * - un critère interne (staffing, appétence, avant-vente, budget validé) est
 *   « non évaluable » quoi que le modèle ait écrit (#3755.3) ;
 * - le tier / le niveau décideur sans signal importé : « non évaluable » (#3755.8) ;
 * - chaque critère de la grille a une ligne — un absent est « non évaluable ».
 */
export function sanitizeAnalysisEvaluations(
  criteria: readonly QualificationCriterion[],
  raw: unknown,
  signals: QualificationSignalValues,
): QualificationCriterionEvaluation[] {
  const byCode = new Map<string, QualificationCriterionEvaluation>()
  for (const item of Array.isArray(raw) ? raw : []) {
    const parsed = qualificationCriterionEvaluationSchema
      .omit({ source: true })
      .extend({ points: qualificationCriterionEvaluationSchema.shape.points.optional() })
      .safeParse(item)
    if (parsed.success)
      byCode.set(parsed.data.code, { ...parsed.data, points: parsed.data.points ?? null, source: 'analysis' })
  }
  return criteria.map(c => {
    const notEvaluable: QualificationCriterionEvaluation = {
      code: c.code,
      status: 'not_evaluable',
      points: null,
      evidence: null,
      source: 'analysis',
    }
    if (isInternalQualificationCriterion(c.label)) return notEvaluable
    if (TIER_CRITERION_RE.test(c.label) && signals.tier === null) return notEvaluable
    if (DECISION_LEVEL_CRITERION_RE.test(c.label) && signals.decision_level === null) return notEvaluable
    const e = byCode.get(c.code)
    if (!e || e.status === 'not_evaluable') return notEvaluable
    if (!e.evidence?.trim()) return notEvaluable
    if (c.kind === 'eliminatory' && e.status === 'scored') return notEvaluable
    if (c.kind === 'weighted' && e.status === 'scored' && e.points === null) return notEvaluable
    return e
  })
}

@Injectable()
export class QualificationGridService {
  private readonly logger = new Logger(QualificationGridService.name)

  constructor(
    @InjectRepository(QualificationGridEntity) private readonly grids: Repository<QualificationGridEntity>,
    @InjectRepository(QualificationCriterionEntity)
    private readonly criteria: Repository<QualificationCriterionEntity>,
    @InjectRepository(AccountQualificationEntity)
    private readonly evaluations: Repository<AccountQualificationEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(QUALIFICATION_SIGNALS) private readonly signals?: QualificationSignals,
    @Optional() @Inject(QualificationEvaluatorClient) private readonly evaluator?: QualificationEvaluatorPort,
  ) {}

  // ───────────────────────────── La grille ─────────────────────────────

  private async loadGrid(grid: QualificationGridEntity): Promise<QualificationGrid> {
    const rows = await this.criteria.find({ where: { grid_id: grid.id }, order: { position: 'ASC' } })
    return {
      id: grid.id,
      version: grid.version,
      active: grid.active,
      created_at: new Date(grid.created_at ?? Date.now()).toISOString(),
      criteria: rows.map(toCriterion),
    }
  }

  async getActiveGrid(workspaceId: string): Promise<QualificationGrid | null> {
    const grid = await this.grids.findOne({ where: { workspace_id: workspaceId, active: true } })
    return grid ? this.loadGrid(grid) : null
  }

  /** Enregistrer = une NOUVELLE version ; l'ancienne reste, inactive (#3755.7). */
  async saveGrid(ctx: QualificationCtx, input: unknown): Promise<QualificationGrid> {
    const parsed = qualificationGridInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map(i => i.message).join(' ; '))
    }
    const saved = await this.dataSource.transaction(async manager => {
      const grids = manager.getRepository(QualificationGridEntity)
      const criteria = manager.getRepository(QualificationCriterionEntity)
      const previous = await grids.find({ where: { workspace_id: ctx.workspaceId }, order: { version: 'DESC' } })
      const version = (previous[0]?.version ?? 0) + 1
      await grids.update({ workspace_id: ctx.workspaceId, active: true }, { active: false })
      const grid = grids.create({
        workspace_id: ctx.workspaceId,
        version,
        active: true,
        created_by: ctx.userId,
        created_at: new Date(),
      })
      await grids.save(grid)
      await criteria.save(
        parsed.data.criteria.map((c, index) =>
          criteria.create({
            grid_id: grid.id,
            code: c.code,
            label: c.label,
            kind: c.kind,
            weight: c.weight === null ? null : String(c.weight),
            category: c.category,
            description_max: c.description_max,
            description_zero: c.description_zero,
            position: index,
          }),
        ),
      )
      return grid
    })
    return this.loadGrid(saved)
  }

  /** Import du classeur : xlsx (base64) ou csv (texte). Le refus nomme sa cause (« total 95/100 »). */
  async importGrid(
    ctx: QualificationCtx,
    file: { format: 'xlsx' | 'csv'; content: string; sheet?: string },
  ): Promise<QualificationGrid & { import_report: QualificationGridImportReport }> {
    const cells =
      file.format === 'csv' ? splitQualificationCsv(file.content) : await this.readXlsx(file.content, file.sheet)
    const parsed = parseQualificationGridCells(cells)
    if (!parsed.ok) throw new BadRequestException(parsed.error)
    // #4426.6 — le rapport nomme ce qui n'a pas été pris : synthèse ignorée, lignes incomplètes écartées.
    const grid = await this.saveGrid(ctx, { criteria: parsed.criteria })
    return { ...grid, import_report: { ignored: parsed.ignored, skipped: parsed.skipped } }
  }

  private async readXlsx(base64: string, sheet?: string): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(Buffer.from(base64, 'base64') as unknown as ExcelJS.Buffer)
    } catch {
      throw new BadRequestException('classeur illisible')
    }
    const cells: string[][] = []
    const worksheet = (sheet ? workbook.getWorksheet(sheet) : undefined) ?? workbook.worksheets[0]
    worksheet?.eachRow({ includeEmpty: false }, row => {
      const values = row.values as unknown[]
      const line: string[] = []
      for (let i = 1; i < values.length; i++) {
        const value = values[i]
        const text =
          value && typeof value === 'object' && 'result' in value
            ? (value as { result: unknown }).result
            : value && typeof value === 'object' && 'richText' in value
              ? (value as { richText: { text: string }[] }).richText.map(r => r.text).join('')
              : value
        line.push(text === null || text === undefined ? '' : String(text).trim())
      }
      cells.push(line)
    })
    return cells
  }

  // ───────────────────────── L'évaluation d'un compte ─────────────────────────

  private async readAccount(accountId: string, workspaceId: string): Promise<AccountRow | null> {
    const rows: AccountRow[] = await this.dataSource.query(
      `SELECT id, company_name, trade_name, sector, employees, revenue, headquarters, website, address, siren, raw_analysis
         FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [accountId, workspaceId],
    )
    return rows[0] ?? null
  }

  private async requireAccount(accountId: string, workspaceId: string): Promise<AccountRow> {
    const account = await this.readAccount(accountId, workspaceId)
    if (!account) throw new NotFoundException('Compte introuvable')
    return account
  }

  /**
   * #3749 — le verdict de la grille pour TOUT le portefeuille, une lecture.
   *
   * La fiche compte lisait déjà le verdict (`getAccountQualification`) ; la
   * LISTE des comptes ne le lisait nulle part. Même mécanisme que
   * `AccountAccessService.accessSummary` : l'instantané déjà écrit
   * (`raw_analysis.qualification`, `readQualificationSnapshot`), jamais un
   * recalcul (GA-26) — ce service n'écrit qu'UNE clé, il n'en lit pas deux
   * façons. Un compte sans grille évaluée, ou dont l'instantané est illisible,
   * vaut `null` : jamais un verdict deviné, et un compte ne fait pas tomber
   * les autres (même garde que `accessSummary`).
   */
  async accountsSummary(
    workspaceId: string,
  ): Promise<{ accountId: string; verdict: 'GO' | 'PRUDENT' | 'NO-GO' | null }[]> {
    const rows: { id: string; status: string | null; raw_analysis: Record<string, unknown> | null }[] =
      await this.dataSource.query(`SELECT id, status, raw_analysis FROM accounts WHERE workspace_id = $1`, [
        workspaceId,
      ])
    return rows
      .filter(row => row.status !== 'deleted')
      .map(row => {
        try {
          return { accountId: row.id, verdict: readQualificationSnapshot(row.raw_analysis)?.verdict ?? null }
        } catch (error) {
          this.logger.error('accountsSummary: instantané illisible sur un compte', {
            error,
            tags: { workspaceId, accountId: row.id },
          })
          return { accountId: row.id, verdict: null }
        }
      })
  }

  private async gridById(gridId: string, active: QualificationGrid): Promise<QualificationGrid> {
    if (gridId === active.id) return active
    const grid = await this.grids.findOne({ where: { id: gridId } })
    return grid ? this.loadGrid(grid) : active
  }

  private async rowFor(
    workspaceId: string,
    accountId: string,
    grid: QualificationGrid,
  ): Promise<AccountQualificationEntity> {
    const existing = await this.evaluations.findOne({
      where: { workspace_id: workspaceId, account_id: accountId, grid_id: grid.id },
    })
    return (
      existing ??
      this.evaluations.create({
        workspace_id: workspaceId,
        account_id: accountId,
        grid_id: grid.id,
        grid_version: grid.version,
        analysis_evaluations: [],
        manual_evaluations: [],
        evaluated_at: null,
      })
    )
  }

  /** La qualification d'un compte, ou `null` sans grille active (l'écran ne montre rien de plus). */
  async getAccountQualification(ctx: QualificationCtx, accountId: string): Promise<AccountQualificationView | null> {
    const active = await this.getActiveGrid(ctx.workspaceId)
    if (!active) return null
    await this.requireAccount(accountId, ctx.workspaceId)
    const row =
      (await this.evaluations.findOne({
        where: { workspace_id: ctx.workspaceId, account_id: accountId, grid_id: active.id },
      })) ??
      (await this.evaluations.findOne({
        where: { workspace_id: ctx.workspaceId, account_id: accountId },
        order: { updated_at: 'DESC' },
      }))
    // #3755.7 — le verdict se lit sur la version qui l'a produit, pas sur la grille du jour.
    const grid = row ? await this.gridById(row.grid_id, active) : active
    const merged = row ? mergeQualificationEvaluations(row.analysis_evaluations, row.manual_evaluations) : []
    return {
      grid,
      evaluated_version: row?.grid_version ?? null,
      current_version: active.version,
      evaluated_at: row?.evaluated_at ? new Date(row.evaluated_at).toISOString() : null,
      result: computeQualificationVerdict(grid.criteria, merged),
    }
  }

  /** #3755.5 — la saisie du commercial pour UN critère. Elle gagne toujours. */
  async setManualEvaluation(
    ctx: QualificationCtx,
    accountId: string,
    code: string,
    input: unknown,
  ): Promise<AccountQualificationView | null> {
    await this.requireAccount(accountId, ctx.workspaceId)
    const active = await this.getActiveGrid(ctx.workspaceId)
    if (!active) throw new BadRequestException('Aucune grille de qualification active')
    const criterion = active.criteria.find(c => c.code === code)
    if (!criterion) throw new BadRequestException(`Critère inconnu de la grille : ${code}`)
    const parsed = qualificationManualInputSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Saisie invalide')
    const { status } = parsed.data
    const points = parsed.data.points ?? null
    if (criterion.kind === 'eliminatory' && status === 'scored') {
      throw new BadRequestException(`${code} est éliminatoire : PASS, FAIL ou non évaluable`)
    }
    if (criterion.kind === 'weighted' && status === 'scored' && (points === null || points > (criterion.weight ?? 0))) {
      throw new BadRequestException(`${code} : points entre 0 et ${criterion.weight}`)
    }
    const row = await this.rowFor(ctx.workspaceId, accountId, active)
    const manual: QualificationCriterionEvaluation = {
      code,
      status,
      points: status === 'scored' ? points : null,
      evidence: parsed.data.evidence?.trim() || null,
      source: 'manual',
    }
    row.manual_evaluations = [...row.manual_evaluations.filter(e => e.code !== code), manual]
    row.updated_by = ctx.userId
    row.updated_at = new Date()
    await this.evaluations.save(row)
    await this.writeSnapshot(ctx.workspaceId, accountId, active, row)
    return this.getAccountQualification(ctx, accountId)
  }

  /** Retirer la saisie manuelle d'un critère — l'évaluation de l'analyse reprend la main. */
  async clearManualEvaluation(
    ctx: QualificationCtx,
    accountId: string,
    code: string,
  ): Promise<AccountQualificationView | null> {
    await this.requireAccount(accountId, ctx.workspaceId)
    const active = await this.getActiveGrid(ctx.workspaceId)
    if (!active) return null
    const row = await this.rowFor(ctx.workspaceId, accountId, active)
    row.manual_evaluations = row.manual_evaluations.filter(e => e.code !== code)
    row.updated_by = ctx.userId
    row.updated_at = new Date()
    await this.evaluations.save(row)
    await this.writeSnapshot(ctx.workspaceId, accountId, active, row)
    return this.getAccountQualification(ctx, accountId)
  }

  /**
   * #3755.3 — l'analyse évalue chaque critère avec sa preuve. Appelée en fin
   * d'analyse (hors chemin critique) et à la demande depuis la fiche. Ne jette
   * jamais : un échec rend `unavailable` et n'écrit rien.
   */
  async evaluateFromAnalysis(accountId: string, workspaceId: string | null): Promise<QualificationEvaluationOutcome> {
    if (!workspaceId) return 'skipped'
    try {
      const active = await this.getActiveGrid(workspaceId)
      if (!active) return 'no_grid'
      if (!this.evaluator) return 'skipped'
      const account = await this.readAccount(accountId, workspaceId)
      if (!account?.company_name) return 'skipped'

      const signals: QualificationSignalValues = {
        tier: (await this.signals?.getTier(accountId, workspaceId)) ?? null,
        decision_level: (await this.signals?.getDecisionLevel(accountId, workspaceId)) ?? null,
      }
      const result = await this.evaluator.evaluate({
        accountName: account.company_name,
        dossier: this.dossierOf(account),
        criteria: active.criteria,
        signals,
      })
      if (result.status !== 'ok') return 'unavailable'

      const row = await this.rowFor(workspaceId, accountId, active)
      row.analysis_evaluations = sanitizeAnalysisEvaluations(active.criteria, result.evaluations, signals)
      row.evaluated_at = new Date()
      row.updated_at = new Date()
      await this.evaluations.save(row)
      await this.writeSnapshot(workspaceId, accountId, active, row)
      return 'written'
    } catch (err) {
      this.logger.warn('Qualification non évaluée (non bloquant)', { accountId, error: (err as Error).name })
      return 'unavailable'
    }
  }

  private dossierOf(account: AccountRow): Record<string, unknown> {
    const dossier: Record<string, unknown> = {}
    for (const key of [
      'trade_name',
      'sector',
      'employees',
      'revenue',
      'headquarters',
      'website',
      'address',
      'siren',
    ] as const) {
      const value = account[key]
      if (value) dossier[key] = value
    }
    const raw = account.raw_analysis ?? {}
    const plan = raw['plan']
    const facts: Record<string, unknown> = { ...raw }
    if (plan && typeof plan === 'object' && (plan as Record<string, unknown>)['evaluation']) {
      facts['evaluation'] = facts['evaluation'] ?? (plan as Record<string, unknown>)['evaluation']
    }
    for (const key of DOSSIER_KEYS) {
      const value = facts[key]
      if (value === null || value === undefined) continue
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      dossier[key] = text.length > MAX_FACT_CHARS ? `${text.slice(0, MAX_FACT_CHARS)}…` : value
    }
    return dossier
  }

  /** L'instantané du verdict, avec sa version, dans `raw_analysis.qualification` (#3755.7). */
  private async writeSnapshot(
    workspaceId: string,
    accountId: string,
    grid: QualificationGrid,
    row: AccountQualificationEntity,
  ): Promise<void> {
    const result = computeQualificationVerdict(
      grid.criteria,
      mergeQualificationEvaluations(row.analysis_evaluations, row.manual_evaluations),
    )
    const snapshot: AccountQualificationSnapshot = {
      grid_id: grid.id,
      grid_version: grid.version,
      verdict: result.verdict,
      eliminated_by: result.eliminated_by,
      points: result.points,
      max: result.max,
      not_evaluable: result.not_evaluable,
      evaluated_at: new Date().toISOString(),
    }
    await this.dataSource.query(
      `UPDATE accounts
          SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('qualification', $1::jsonb)
        WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(snapshot), accountId, workspaceId],
    )
  }
}
