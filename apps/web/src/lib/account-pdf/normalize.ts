import { z } from 'zod'
import { ACCOUNT_SCORE_GO_MIN, type Account, type AccountFactsBrief, type Contact } from '@bellum/contracts'
import { buildAccountPdfOrgPage, type AccountPdfOrgPage } from './orgPageData'

/**
 * Defensive parsing of `account.raw_analysis` into the typed shapes the PDF
 * layout actually consumes. Each list item is parsed via `safeParse`; invalid
 * entries are dropped rather than crashing the whole export.
 *
 * Why this exists: the IA service stores arrays of mixed objects in
 * `raw_analysis`. The previous PDF path called `JSON.stringify` on each item
 * as a fallback, producing unreadable raw JSON in the output.
 */

const techItemSchema = z.object({
  name: z.string(),
  usage: z.string().optional(),
  maturity: z.string().optional(),
  opportunity_for_esn: z.string().optional(),
})

const itChallengeSchema = z.object({
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  timeframe: z.string().optional(),
  description: z.string().optional(),
  esn_offer_match: z.string().optional(),
})

const painSchema = z.object({
  pain: z.string(),
  urgency: z.string().optional(),
  esn_offer: z.string().optional(),
  business_impact: z.string().optional(),
  urgency_justification: z.string().optional(),
})

const recentSignalSchema = z.object({
  date: z.string().optional(),
  type: z.string().optional(),
  signal: z.string(),
  source: z.string().optional(),
  sales_implication: z.string().optional(),
})

const competitorSchema = z.object({
  name: z.string(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
})

const angleSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  entry_point: z.string().optional(),
  is_recommended: z.boolean().optional(),
})

const planActionSchema = z.object({
  text: z.string().optional(),
  action: z.string().optional(),
  responsable: z.string().optional(),
  contact: z.string().optional(),
  outil: z.string().optional(),
  channel: z.string().optional(),
})

const planWeekSchema = z.object({
  week: z.number().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  timeframe: z.string().optional(),
  actions: z.array(planActionSchema).optional(),
  items: z.array(planActionSchema).optional(),
})

// The IA has emitted this block under both casings over time (`go_no_go` in the
// older shape, `goNoGo`/`globalScore` in the current one — see the real-run
// fixture `packages/shared/schemas/__fixtures__/real-run-sg.raw.json`). Accept
// both, exactly like the on-screen evaluation tab does.
const evaluationSchema = z.object({
  go_no_go: z.string().optional(),
  goNoGo: z.string().optional(),
  score_global: z.number().optional(),
  global_score: z.number().optional(),
  globalScore: z.number().optional(),
  justification: z.string().optional(),
  recommandation: z.string().optional(),
  recommendation: z.string().optional(),
})

const entryPointSchema = z.object({
  label: z.string(),
  target_profile: z.string().optional(),
  justification: z.string().optional(),
})

const ouvrirSchema = z.object({
  strategy: z.string().optional(),
  entry_points: z.array(entryPointSchema).optional(),
})

export type TechItem = z.infer<typeof techItemSchema>
export type ItChallenge = z.infer<typeof itChallengeSchema>
export type Pain = z.infer<typeof painSchema>
export type RecentSignal = z.infer<typeof recentSignalSchema>
export type Competitor = z.infer<typeof competitorSchema>
export type Angle = z.infer<typeof angleSchema>
export type PlanWeek = z.infer<typeof planWeekSchema>
type EntryPoint = z.infer<typeof entryPointSchema>

export type AccountPdfData = {
  companyName: string
  priorityScore: number | null
  generatedAt: Date
  info: {
    sector: string | null
    employees: string | null
    revenue: string | null
    headquarters: string | null
    website: string | null
  }
  subsidiaries: string[]
  programNames: string[]
  technologyStack: TechItem[]
  itChallenges: ItChallenge[]
  pains: Pain[]
  recentSignals: RecentSignal[]
  competitors: Competitor[]
  angles: Angle[]
  planWeeks: PlanWeek[]
  strategy: { type: string; justification: string } | null
  ouvrir: { strategy: string; entryPoints: EntryPoint[] } | null
  evaluation: {
    decision: 'GO' | 'NO-GO' | 'A_QUALIFIER'
    score: number
    justification: string
    recommendation: string
  }
  contacts: Pick<Contact, 'id' | 'full_name' | 'title' | 'entity' | 'decision_role' | 'priority' | 'email'>[]
  /** Total réel des contacts du compte (le tableau ci-dessus est plafonné). */
  contactsTotal: number
  /**
   * La page « Organigramme de décision » — `null` quand le dossier ne porte
   * pas de graphe (`raw_analysis.org.orgGraph` absent) : la page est alors
   * OMISE du PDF (voir `AccountPdfDocument.tsx`), jamais rendue vide ou
   * inventée. Voir `orgPageData.ts`.
   */
  orgPage: AccountPdfOrgPage | null
  /**
   * #4073.1 (13/10/2026) — l'historique chez ce client (affaires, missions,
   * besoins récurrents, derniers échanges — métadonnées, jamais le corps),
   * MÊME lecteur que l'écran (#4072.3) et l'export CSV d'une liste (#4073).
   * `null` quand rien n'a été lu OU que le brief est vide : la section
   * n'existe pas plutôt que de se rendre sans aucune ligne.
   */
  facts: AccountFactsBrief | null
}

/**
 * #4073 — le PDF est un livrable commercial, pas un export de base : un compte
 * à ~1 200 contacts fabriquait un document de centaines de pages (onglet figé
 * puis échec). On garde les contacts UTILES d'abord, le total réel est dit.
 */
export const PDF_CONTACTS_LIMIT = 40
export const PDF_SIGNALS_LIMIT = 15
const PDF_FACTS_LIMIT = 10

/** #4292.13 — le plafond se NOMME : « 40 contacts sur 1 212 ». `null` quand rien n'est coupé
 *  (jamais « 40 sur 40 ») — la mention disparaît. */
export function pdfContactsCap(data: {
  contacts: readonly unknown[]
  contactsTotal: number
}): { shown: number; total: number; hidden: number } | null {
  const hidden = data.contactsTotal - data.contacts.length
  return hidden > 0 ? { shown: data.contacts.length, total: data.contactsTotal, hidden } : null
}

// Décideurs et prescripteurs d'abord ; les profils métier et les inconnus après.
const ROLE_RANK: Record<string, number> = {
  economic: 0,
  technical: 0,
  sponsor: 0,
  influencer: 1,
  champion: 1,
  procurement: 2,
  purchasing: 2,
  blocker: 3,
  user: 4,
  operational: 4,
}

function selectUsefulContacts(contacts: Contact[]): Contact[] {
  const rank = (c: Contact): number => (c.decision_role ? (ROLE_RANK[c.decision_role] ?? 5) : 5)
  // priority : 1 = le plus prioritaire ; absent en dernier (jamais « 0 »).
  const prio = (c: Contact): number => (typeof c.priority === 'number' ? c.priority : Number.MAX_SAFE_INTEGER)
  return [...contacts].sort((a, b) => rank(a) - rank(b) || prio(a) - prio(b)).slice(0, PDF_CONTACTS_LIMIT)
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** `asRecord`, but nullable — so callers can chain `?? next` over candidate paths. */
function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function parseList<T>(items: unknown, schema: z.ZodType<T>): T[] {
  return asArray(items)
    .map(item => schema.safeParse(item))
    .filter((r): r is z.ZodSafeParseSuccess<T> => r.success)
    .map(r => r.data)
}

function parseStringList(items: unknown): string[] {
  return asArray(items).filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function parseEvaluation(
  raw: Record<string, unknown>,
  plan: Record<string, unknown>,
  fallbackScore: number,
): AccountPdfData['evaluation'] {
  // Same sources and precedence as the evaluation tab (`evaluationViewData.ts`):
  // later spreads win. Real runs put this under `plan.evaluation`; `evaluation`
  // and `evaluation_compte` at the root are older/alternate shapes.
  const evalObj = {
    ...asRecord(raw['evaluation']),
    ...asRecord(plan['evaluation']),
    ...asRecord(raw['evaluation_compte']),
  }
  const parsed = evaluationSchema.safeParse(evalObj)
  const data = parsed.success ? parsed.data : {}
  // `priority_score` is the account's own column and is what the screen shows
  // first; the evaluation block only supplies a score when that column is unset.
  const evalScore = data.score_global ?? data.global_score ?? data.globalScore
  const score = fallbackScore || evalScore || 0
  const goRaw = (data.go_no_go ?? data.goNoGo)?.toUpperCase()
  /**
   * Repli à deux verdicts (l'export n'en imprime que deux), mais la COUPURE est
   * celle du contrat (GA-56) : un PDF qui conclut « GO » sur un compte que
   * l'écran affiche « PRUDENT » est le pire des deux, parce qu'il part chez le
   * client.
   *
   * ⚠️ TROISIÈME cas, ajouté le 31/08/2026 — **un verdict ne se conclut pas
   * d'un silence.** Un compte JAMAIS ÉVALUÉ a un score de 0, et la ligne
   * précédente en concluait « NO-GO » : le document qui part chez le client
   * annonçait un refus argumenté là où personne n'avait rien jugé. C'est la
   * pire forme du défaut, parce qu'elle est indistinguable d'un vrai NO-GO.
   *
   * L'écran, lui, avait déjà la branche — `evaluationViewData.ts` rend
   * « À QUALIFIER » quand le score vaut 0. Le PDF ne l'avait pas : deux
   * dérivations du même verdict, dont une seule connaissait le cas. Elles
   * disent désormais la même chose.
   *
   * Ce n'est pas un troisième verdict : c'est l'ABSENCE de verdict, nommée.
   */
  const evaluated = goRaw === 'GO' || goRaw === 'NO-GO' || score > 0
  const decision: 'GO' | 'NO-GO' | 'A_QUALIFIER' = !evaluated
    ? 'A_QUALIFIER'
    : goRaw === 'GO' || goRaw === 'NO-GO'
      ? goRaw
      : score >= ACCOUNT_SCORE_GO_MIN
        ? 'GO'
        : 'NO-GO'
  return {
    decision,
    score,
    justification: data.justification ?? '',
    recommendation: data.recommandation ?? data.recommendation ?? '',
  }
}

function parsePriorityJustification(value: unknown): string {
  if (typeof value === 'string') return value
  const obj = asRecord(value)
  return asString(obj['overall'])
}

function capFacts(brief: AccountFactsBrief): AccountFactsBrief {
  return {
    ...brief,
    deals: brief.deals.slice(0, PDF_FACTS_LIMIT),
    missions: brief.missions.slice(0, PDF_FACTS_LIMIT),
    recurringNeeds: brief.recurringNeeds.slice(0, PDF_FACTS_LIMIT),
    exchanges: brief.exchanges.slice(0, PDF_FACTS_LIMIT),
  }
}

export function buildAccountPdfData(
  account: Account,
  contacts: Contact[],
  factsBrief: AccountFactsBrief | null = null,
): AccountPdfData {
  const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
  const hasFacts =
    !!factsBrief &&
    factsBrief.deals.length +
      factsBrief.missions.length +
      factsBrief.recurringNeeds.length +
      factsBrief.exchanges.length >
      0

  const fallbackScore =
    typeof account.priority_score === 'number' ? account.priority_score : Number(account.priority_score ?? 0) || 0

  /*
   * The plan-related blocks live UNDER `raw_analysis.plan`, not at its root —
   * see the real-run fixture `packages/shared/schemas/__fixtures__/real-run-sg.raw.json`
   * (`plan.actionPlan.phases`, `plan.evaluation`). Reading only the root keys is
   * why exported PDFs used to come out with no action plan, no evaluation and no
   * strategy on every real account. The resolution order below mirrors the
   * account-detail screens (`plan/planViewData.ts`, `evaluation/evaluationViewData.ts`)
   * so the PDF and the screen agree; the older root-level keys are kept last as
   * back-compat for accounts analysed before the shape changed.
   */
  const plan = asRecordOrNull(raw['plan']) ?? raw
  const actionPlan =
    asRecordOrNull(plan['actionPlan']) ??
    asRecordOrNull(plan['action_plan']) ??
    asRecordOrNull(raw['actionPlan']) ??
    asRecordOrNull(raw['action_plan']) ??
    plan

  const evaluation = parseEvaluation(raw, plan, fallbackScore)
  const evalJustification = evaluation.justification || parsePriorityJustification(account.priority_justification)

  const weeksSource =
    actionPlan['phases'] ??
    actionPlan['weeks'] ??
    raw['planWeeks'] ??
    asRecord(raw['planHebdomadaire'])['weeks'] ??
    asRecord(raw['plan_hebdomadaire'])['weeks'] ??
    raw['weeks'] ??
    raw['plan_weeks']
  const planWeeks = parseList(weeksSource, planWeekSchema)

  const strategyType = asString(actionPlan['strategy'] ?? raw['strategyType'] ?? raw['strategy_type'])
  const strategyJustification = asString(
    actionPlan['justification'] ?? raw['strategyJustification'] ?? raw['strategy_justification'],
  )
  const strategy =
    strategyType || strategyJustification ? { type: strategyType, justification: strategyJustification } : null

  // `comment_ouvrir_compte` is a plain string in real runs, and an object with
  // `strategy` / `entry_points` in the richer shape. Handle both, like the
  // evaluation tab does — the string form used to be dropped silently.
  const ouvrirRaw = raw['comment_ouvrir_compte']
  const ouvrirParsed = ouvrirSchema.safeParse(asRecord(ouvrirRaw))
  const ouvrirData = ouvrirParsed.success ? ouvrirParsed.data : {}
  const ouvrirStrategy = typeof ouvrirRaw === 'string' ? ouvrirRaw : (ouvrirData.strategy ?? '')
  const ouvrirEntryPoints = ouvrirData.entry_points ?? []
  const ouvrir =
    ouvrirStrategy || ouvrirEntryPoints.length ? { strategy: ouvrirStrategy, entryPoints: ouvrirEntryPoints } : null

  return {
    companyName: account.company_name || 'Compte',
    priorityScore: account.priority_score,
    generatedAt: new Date(),
    info: {
      sector: account.sector,
      employees: account.employees,
      revenue: account.revenue,
      headquarters: account.headquarters,
      website: account.website,
    },
    subsidiaries: parseStringList(account.subsidiaries),
    // Two casings genuinely reach `raw_analysis`: the persisted analysis shape is
    // snake_case (`packages/contracts/src/schemas/analysis/account-analysis.ts`,
    // and the real-run fixture), while the raw research payload the IA emits is
    // camelCase (`packages/contracts/src/schemas/research-data.ts`). Read both.
    programNames: parseStringList(raw['program_names'] ?? raw['programNames']),
    technologyStack: parseList(raw['technology_stack'] ?? raw['technologyStack'], techItemSchema),
    itChallenges: parseList(account.it_challenges, itChallengeSchema),
    pains: parseList(raw['pains'], painSchema),
    recentSignals: parseList(account.recent_signals, recentSignalSchema).slice(0, PDF_SIGNALS_LIMIT),
    competitors: parseList(raw['competitors'], competitorSchema),
    angles: parseList(raw['angles'], angleSchema),
    planWeeks,
    strategy,
    ouvrir,
    evaluation: { ...evaluation, justification: evalJustification },
    contactsTotal: contacts.length,
    contacts: selectUsefulContacts(contacts).map(c => ({
      id: c.id,
      full_name: c.full_name,
      title: c.title,
      entity: c.entity,
      decision_role: c.decision_role,
      priority: c.priority,
      email: c.email,
    })),
    orgPage: buildAccountPdfOrgPage(raw, contacts),
    facts: hasFacts && factsBrief ? capFacts(factsBrief) : null,
  }
}
