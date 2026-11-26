import { z } from 'zod'
import { ACCOUNT_SCORE_GO_MIN, ACCOUNT_SCORE_PRUDENT_MIN, type AccountVerdict } from './account-score.js'

/**
 * #3755 — LA GRILLE DE QUALIFICATION PROPRE À L'ESPACE.
 *
 * Une ESN a SA grille go/no-go : des filtres ÉLIMINATOIRES (PASS/FAIL — un FAIL
 * suffit à dire NO-GO) puis des critères PONDÉRÉS dont les poids font 100. Ce
 * fichier porte le contrat partagé : la forme d'un critère, l'import du classeur
 * (xlsx/csv, en-têtes FR ou EN), le contrôle du total, la fusion analyse/saisie
 * manuelle et le calcul du verdict.
 *
 * Doctrine tenue ici, pas ailleurs :
 *  - un critère NON ÉVALUABLE sort du dénominateur (GA-18/19) — jamais « 0 » ;
 *  - non évaluable ≠ FAIL : seul un FAIL explicite élimine ;
 *  - le score n'est JAMAIS une probabilité (c26) : des points sur un maximum
 *    évaluable, avec ses axes et la liste nommée de ce qui n'a pas été évalué ;
 *  - une correction manuelle gagne toujours, quelle que soit sa date ;
 *  - sans grille active, le verdict affiché est celui d'avant, à l'octet près.
 */

export const QUALIFICATION_CRITERION_KINDS = ['eliminatory', 'weighted'] as const
export type QualificationCriterionKind = (typeof QUALIFICATION_CRITERION_KINDS)[number]

export const QUALIFICATION_EVALUATION_STATUSES = ['pass', 'fail', 'scored', 'not_evaluable'] as const
export type QualificationEvaluationStatus = (typeof QUALIFICATION_EVALUATION_STATUSES)[number]

export const QUALIFICATION_EVALUATION_SOURCES = ['analysis', 'manual'] as const
export type QualificationEvaluationSource = (typeof QUALIFICATION_EVALUATION_SOURCES)[number]

/** La somme des poids pondérés d'une grille valide. */
export const QUALIFICATION_WEIGHT_TOTAL = 100

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/

export const qualificationCriterionSchema = z.object({
  code: z.string().trim().regex(CODE_RE),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(QUALIFICATION_CRITERION_KINDS),
  weight: z.number().positive().max(QUALIFICATION_WEIGHT_TOTAL).nullable(),
  category: z.string().trim().max(120).nullable(),
  description_max: z.string().trim().max(1000).nullable(),
  description_zero: z.string().trim().max(1000).nullable(),
  position: z.number().int().min(0),
})
export type QualificationCriterion = z.infer<typeof qualificationCriterionSchema>

/** Le total des poids pondérés — et, s'il ne vaut pas 100, le refus NOMMÉ. */
export function checkQualificationWeights(
  criteria: readonly Pick<QualificationCriterion, 'kind' | 'weight'>[],
): { ok: true; total: number } | { ok: false; total: number; message: string } {
  const raw = criteria.filter(c => c.kind === 'weighted').reduce((sum, c) => sum + (c.weight ?? 0), 0)
  // Les poids d'un classeur peuvent être décimaux (12,5) : on compare au centième.
  const total = Math.round(raw * 100) / 100
  if (total === QUALIFICATION_WEIGHT_TOTAL) return { ok: true, total }
  return { ok: false, total, message: `total ${total}/${QUALIFICATION_WEIGHT_TOTAL}` }
}

export const qualificationGridInputSchema = z
  .object({ criteria: z.array(qualificationCriterionSchema).min(1).max(60) })
  .superRefine((grid, ctx) => {
    const seen = new Set<string>()
    for (const c of grid.criteria) {
      const key = c.code.toUpperCase()
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `code en double : ${c.code}` })
      seen.add(key)
      if (c.kind === 'eliminatory' && c.weight !== null)
        ctx.addIssue({ code: 'custom', message: `${c.code} est éliminatoire : il ne porte pas de poids` })
      if (c.kind === 'weighted' && c.weight === null)
        ctx.addIssue({ code: 'custom', message: `${c.code} est pondéré : il lui faut un poids` })
    }
    if (!grid.criteria.some(c => c.kind === 'weighted')) return
    const total = checkQualificationWeights(grid.criteria)
    if (!total.ok) ctx.addIssue({ code: 'custom', message: total.message })
  })
export type QualificationGridInput = z.infer<typeof qualificationGridInputSchema>

/** Une grille telle que l'API la rend : sa version, ses critères dans l'ordre. */
export const qualificationGridSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  created_at: z.string(),
  criteria: z.array(qualificationCriterionSchema),
})
export type QualificationGrid = z.infer<typeof qualificationGridSchema>

export const qualificationCriterionEvaluationSchema = z.object({
  code: z.string(),
  status: z.enum(QUALIFICATION_EVALUATION_STATUSES),
  points: z.number().min(0).nullable(),
  evidence: z.string().max(2000).nullable(),
  source: z.enum(QUALIFICATION_EVALUATION_SOURCES),
})
export type QualificationCriterionEvaluation = z.infer<typeof qualificationCriterionEvaluationSchema>

/** Ce qu'un commercial saisit à la main pour un critère (#3755.5). */
export const qualificationManualInputSchema = z.object({
  status: z.enum(QUALIFICATION_EVALUATION_STATUSES),
  points: z.number().min(0).max(QUALIFICATION_WEIGHT_TOTAL).nullable().optional(),
  evidence: z.string().trim().max(2000).nullable().optional(),
})
export type QualificationManualInput = z.infer<typeof qualificationManualInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Critères internes — non évaluables depuis l'extérieur (#3755.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce que l'analyse ne PEUT PAS savoir depuis des sources publiques : la capacité
 * de l'ESN à staffer, l'envie de l'équipe, l'effort d'avant-vente, un budget
 * validé côté client. Le critère est marqué `not_evaluable` AVANT l'appel modèle,
 * pour qu'aucune note n'y soit devinée. Miroir Python :
 * `apps/ia/app/services/qualification_evaluation.py` (`INTERNAL_PATTERNS`).
 */
const INTERNAL_PATTERNS: readonly RegExp[] = [
  /staff/i,
  /app[ée]tence/i,
  /appetite/i,
  /avant[- ]vente/i,
  /pre[- ]?sales?/i,
  /budget\s+valid/i,
  /validated\s+budget/i,
]

export function isInternalQualificationCriterion(label: string): boolean {
  return INTERNAL_PATTERNS.some(re => re.test(label))
}

// ─────────────────────────────────────────────────────────────────────────────
// Import du classeur (#3755.1)
// ─────────────────────────────────────────────────────────────────────────────

type ColumnKey = 'phase' | 'code' | 'category' | 'label' | 'weight' | 'description_max' | 'description_zero' | 'impact'

const HEADER_ALIASES: Record<ColumnKey, readonly string[]> = {
  phase: ['phase', 'etape', 'stage', 'type'],
  code: ['id', 'code', 'identifiant', 'ref'],
  category: ['categorie', 'category', 'famille', 'axe'],
  label: ['critere', 'criterion', 'criteria', 'libelle', 'label', 'intitule'],
  weight: ['poids_max', 'poids', 'max_weight', 'weight', 'weight_max', 'points_max', 'max_points'],
  description_max: [
    'description_max',
    'description_max_points',
    'max_description',
    'description_maximum',
    'palier_max',
  ],
  description_zero: [
    'description_zero',
    'description_zero_point',
    'zero_description',
    'description_0',
    'palier_zero',
    'description_min',
  ],
  impact: ['impact', 'impact_decision', 'effet', 'effect'],
}

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

const ELIMINATORY_RE = /([ée]limin|filtre|filter|knock|no[-_ ]?go|pass\s*\/\s*fail)/i

/**
 * #4426.6 — `ignored` : les lignes de synthèse (TOTAL, Sous-total) ; `skipped` : les lignes réellement incomplètes,
 * écartées une à une (leur libellé ou leur code) — le rapport les nomme, le fichier n'est jamais refusé pour elles.
 */
export type QualificationGridImport =
  | { ok: true; criteria: QualificationCriterion[]; ignored: number; skipped: string[] }
  | { ok: false; error: string }

/** #4426.6 — ce que l'import dit de ce qu'il n'a PAS pris : lignes de synthèse ignorées, lignes incomplètes écartées. */
export type QualificationGridImportReport = { ignored: number; skipped: string[] }

const SUMMARY_ROW_RE = /^(sous[-\s]?)?total$/i

function parseWeight(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.').replace(/%$/, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? value : null
}

function cell(row: readonly string[], index: number | undefined): string {
  if (index === undefined) return ''
  return String(row[index] ?? '').trim()
}

/**
 * Lit les cellules d'une feuille (première ligne d'en-têtes reconnue, peu importe
 * les lignes de titre au-dessus) et rend les critères — ou le refus NOMMÉ.
 * Un critère est éliminatoire quand sa phase ou son impact le dit (« Filtres
 * éliminatoires », « NO-GO si FAIL »), ou quand il n'a pas de poids.
 */
export function parseQualificationGridCells(rows: readonly (readonly string[])[]): QualificationGridImport {
  let headerIndex = -1
  let columns: Partial<Record<ColumnKey, number>> = {}
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const found: Partial<Record<ColumnKey, number>> = {}
    ;(rows[i] ?? []).forEach((value, col) => {
      const normalized = normalizeHeader(String(value ?? ''))
      for (const key of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
        if (found[key] === undefined && HEADER_ALIASES[key].includes(normalized)) found[key] = col
      }
    })
    if (found.code !== undefined && found.label !== undefined) {
      headerIndex = i
      columns = found
      break
    }
  }
  if (headerIndex < 0) return { ok: false, error: 'colonnes ID et Critère introuvables' }

  const criteria: QualificationCriterion[] = []
  let ignored = 0
  const skipped: string[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const code = cell(row, columns.code)
    const label = cell(row, columns.label)
    if (!code && !label) {
      // #4426.6 — « TOTAL » sans critère : une ligne de synthèse, ni un critère ni une erreur.
      if (row.some(value => SUMMARY_ROW_RE.test(String(value ?? '').trim()))) ignored += 1
      continue
    }
    if (SUMMARY_ROW_RE.test(code || label) && (!code || !label)) {
      ignored += 1
      continue
    }
    if (!code || !label) {
      skipped.push(code || label)
      continue
    }
    const weight = parseWeight(cell(row, columns.weight))
    const marker = `${cell(row, columns.phase)} ${cell(row, columns.impact)}`
    const eliminatory = weight === null || ELIMINATORY_RE.test(marker)
    criteria.push({
      code,
      label,
      kind: eliminatory ? 'eliminatory' : 'weighted',
      weight: eliminatory ? null : weight,
      category: cell(row, columns.category) || null,
      description_max: cell(row, columns.description_max) || null,
      description_zero: cell(row, columns.description_zero) || null,
      position: criteria.length,
    })
  }
  if (criteria.length === 0) return { ok: false, error: 'aucun critère lu' }
  const parsed = qualificationGridInputSchema.safeParse({ criteria })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'grille invalide' }
  return { ok: true, criteria: parsed.data.criteria, ignored, skipped }
}

/** Découpe un CSV (`,` `;` ou tabulation, guillemets doublés) en cellules. */
export function splitQualificationCsv(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '')
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const counts = {
    ';': firstLine.split(';').length,
    ',': firstLine.split(',').length,
    '\t': firstLine.split('\t').length,
  }
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',') as string
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(current)
      current = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++
      row.push(current)
      rows.push(row)
      row = []
      current = ''
    } else current += ch
  }
  if (current || row.length) {
    row.push(current)
    rows.push(row)
  }
  return rows
}

export function parseQualificationGridCsv(text: string): QualificationGridImport {
  return parseQualificationGridCells(splitQualificationCsv(text))
}

// ─────────────────────────────────────────────────────────────────────────────
// Fusion et verdict (#3755.3-.6)
// ─────────────────────────────────────────────────────────────────────────────

/** La saisie manuelle remplace l'évaluation de l'analyse, critère par critère —
 *  quelle que soit sa date (doctrine : une correction humaine gagne toujours). */
export function mergeQualificationEvaluations(
  analysis: readonly QualificationCriterionEvaluation[],
  manual: readonly QualificationCriterionEvaluation[],
): QualificationCriterionEvaluation[] {
  const byCode = new Map<string, QualificationCriterionEvaluation>()
  for (const e of analysis) byCode.set(e.code, e)
  for (const e of manual) byCode.set(e.code, { ...e, source: 'manual' })
  return [...byCode.values()]
}

export type QualificationAxis = {
  code: string
  label: string
  kind: QualificationCriterionKind
  category: string | null
  weight: number | null
  status: QualificationEvaluationStatus
  /** `null` pour un éliminatoire ou un critère non évaluable — jamais 0. */
  points: number | null
  evidence: string | null
  /** `null` quand rien n'a été évalué (ni l'analyse ni le commercial). */
  source: QualificationEvaluationSource | null
}

export type QualificationVerdict = {
  /** `null` quand rien n'est évaluable ET qu'aucun filtre n'élimine. */
  verdict: Exclude<AccountVerdict, 'EXPLORER'> | null
  eliminated_by: { code: string; label: string }[]
  /** Points obtenus sur les critères pondérés ÉVALUÉS. */
  points: number
  /** Somme des poids des critères pondérés ÉVALUÉS — le dénominateur. */
  max: number
  ratio: number | null
  axes: QualificationAxis[]
  not_evaluable: { code: string; label: string }[]
}

function normalizedStatus(
  kind: QualificationCriterionKind,
  status: QualificationEvaluationStatus,
): QualificationEvaluationStatus {
  if (kind === 'eliminatory' && status === 'scored') return 'not_evaluable'
  return status
}

export function computeQualificationVerdict(
  criteria: readonly QualificationCriterion[],
  evaluations: readonly QualificationCriterionEvaluation[],
): QualificationVerdict {
  const byCode = new Map(evaluations.map(e => [e.code, e]))
  const axes: QualificationAxis[] = []
  const eliminatedBy: { code: string; label: string }[] = []
  const notEvaluable: { code: string; label: string }[] = []
  let points = 0
  let max = 0

  for (const c of [...criteria].sort((a, b) => a.position - b.position)) {
    const e = byCode.get(c.code)
    const status = e ? normalizedStatus(c.kind, e.status) : 'not_evaluable'
    let axisPoints: number | null = null
    if (c.kind === 'weighted' && status !== 'not_evaluable') {
      const weight = c.weight ?? 0
      axisPoints = status === 'pass' ? weight : status === 'fail' ? 0 : Math.min(Math.max(e?.points ?? 0, 0), weight)
      points += axisPoints
      max += weight
    }
    if (c.kind === 'eliminatory' && status === 'fail') eliminatedBy.push({ code: c.code, label: c.label })
    if (status === 'not_evaluable') notEvaluable.push({ code: c.code, label: c.label })
    axes.push({
      code: c.code,
      label: c.label,
      kind: c.kind,
      category: c.category,
      weight: c.weight,
      status,
      points: axisPoints,
      evidence: e?.evidence ?? null,
      source: e?.source ?? null,
    })
  }

  const ratio = max > 0 ? points / max : null
  let verdict: QualificationVerdict['verdict'] = null
  if (eliminatedBy.length > 0) verdict = 'NO-GO'
  else if (ratio !== null) {
    // Mêmes seuils que le /10 (`accountVerdictFromScore`), appliqués au ratio.
    if (ratio * 10 >= ACCOUNT_SCORE_GO_MIN - 1e-9) verdict = 'GO'
    else if (ratio * 10 >= ACCOUNT_SCORE_PRUDENT_MIN - 1e-9) verdict = 'PRUDENT'
    else verdict = 'NO-GO'
  }
  return { verdict, eliminated_by: eliminatedBy, points, max, ratio, axes, not_evaluable: notEvaluable }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instantané porté par le dossier (`raw_analysis.qualification`) — #3755.7
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le verdict de la grille, tel qu'il a été calculé, avec la VERSION de grille
 * qui l'a produit (#3235) : une grille modifiée ensuite ne réécrit pas un
 * verdict déjà rendu. Écrit par l'API (`QualificationGridService`), lu par
 * tous les écrans qui montrent le badge, pour qu'ils s'accordent (GA-26).
 */
export const accountQualificationSnapshotSchema = z.object({
  grid_id: z.string(),
  grid_version: z.number().int().positive(),
  verdict: z.enum(['GO', 'PRUDENT', 'NO-GO']).nullable(),
  eliminated_by: z.array(z.object({ code: z.string(), label: z.string() })),
  points: z.number(),
  max: z.number(),
  not_evaluable: z.array(z.object({ code: z.string(), label: z.string() })),
  evaluated_at: z.string(),
})
export type AccountQualificationSnapshot = z.infer<typeof accountQualificationSnapshotSchema>

/** Lit `raw_analysis.qualification` sans jamais lever — `null` si absent ou illisible. */
export function readQualificationSnapshot(rawAnalysis: unknown): AccountQualificationSnapshot | null {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') return null
  const parsed = accountQualificationSnapshotSchema.safeParse((rawAnalysis as Record<string, unknown>)['qualification'])
  return parsed.success ? parsed.data : null
}

/** La réponse de `GET /qualification-grid/accounts/:id` — `null` sans grille active. */
export type AccountQualificationView = {
  grid: QualificationGrid
  /** La version de grille qui a produit l'évaluation — peut être antérieure à `current_version`. */
  evaluated_version: number | null
  current_version: number
  evaluated_at: string | null
  result: QualificationVerdict
}
