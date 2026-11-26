import { safeArray, safeString } from '../../helpers/safe'

/**
 * Reads the decision-structure block the analysis produces (prompt
 * `bellum_organigramme`). It is persisted under **`raw_analysis.org`** — the
 * array itself is `org.organigramme`, NOT a top-level `raw_analysis.organigramme`.
 * Nothing in the app used to read it, so six filled blocks were produced on
 * every run and thrown away.
 *
 * Pure and tolerant: unknown or malformed rows are dropped, never guessed.
 */

export type OrgUnit = {
  entity: string
  level: string | null
  contacts: string[]
  /** Roles the analysis could NOT cover with a known contact. This is real
   *  information (the zones left to cover) — never fill it with invented names. */
  missingRoles: string[]
}

type DecisionStep = {
  step: string
  actors: string[]
  duration: string | null
}

export type DecisionChain = {
  description: string | null
  steps: DecisionStep[]
  estimatedCycleLength: string | null
  budgetAuthority: string | null
}

export type ApproachStep = {
  step: number | null
  contact: string
  role: string | null
  whyFirst: string | null
  expectedOutcome: string | null
  unlocks: string | null
}

export type StakeholderStance = 'advocate' | 'neutral' | 'opponent' | 'unknown'

export type Stakeholder = {
  fullName: string
  stance: StakeholderStance
  reasoning: string | null
}

/**
 * One seat of the buying committee (`raw_analysis.org.buyingCommittee.members`).
 *
 * NOT a model output despite living in the org block: it is assembled by the pure
 * deterministic `assemble_buying_committee` (apps/ia/app/knowledge/buying_committee.py)
 * from the already-classified contacts — which is why the shape is stable enough
 * to render, even though no prompt schema declares it.
 */
export type CommitteeMember = {
  fullName: string
  title: string | null
  entity: string | null
  /** Committee seat key (economic_buyer, technical_buyer, champion…). */
  committeeRole: string | null
  /** FR label the assembler already resolved — displayed as-is, never re-derived. */
  roleLabel: string | null
  /** Power/Interest position, 0-4 each, and the resulting matrix quadrant. */
  power: number | null
  interest: number | null
  quadrant: string | null
  cadence: string | null
  engagementAction: string | null
  /** #2311.24 — le niveau de preuve du SIÈGE (named/probable/to_research/unknown). */
  evidenceLevel: string | null
  /** FR label déjà résolu par l'assembleur — affiché tel quel, jamais re-dérivé. */
  evidenceLevelLabel: string | null
  /** #3263.20 — même taxonomie fermée que `contact.source` (apollo/pappers/manual…).
   *  Raw value : le rendu doit le passer par `contactSourceLabel` (jamais un nom
   *  de fournisseur affiché tel quel — doctrine « nos fournisseurs ne se nomment
   *  jamais »). */
  source: string | null
}

export type BuyingCommittee = {
  members: CommitteeMember[]
  /** Core seats with nobody in them — a real gap, never filled with a guess. */
  missingRoles: string[]
  summary: string | null
}

export type OrgStructureData = {
  units: OrgUnit[]
  decisionChain: DecisionChain | null
  approachOrder: ApproachStep[]
  stakeholders: Stakeholder[]
  /** The buying committee, when the analysis placed at least one member. */
  committee: BuyingCommittee | null
  /** True when the analysis produced nothing usable — the caller shows an
   *  honest empty state instead of a blank screen. */
  isEmpty: boolean
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringList(value: unknown): string[] {
  return safeArray(value)
    .map(entry => safeString(entry))
    .filter(entry => entry.length > 0)
}

function nullable(value: unknown): string | null {
  const text = safeString(value)
  return text.length > 0 ? text : null
}

function normalizeUnits(value: unknown): OrgUnit[] {
  return safeArray(value).flatMap(raw => {
    // The prompt's first array entry is a prose instruction, not a unit.
    const record = readRecord(raw)
    if (!record) return []
    const entity = safeString(record['entity'])
    if (!entity) return []
    return [
      {
        entity,
        level: nullable(record['level']),
        contacts: stringList(record['contacts']),
        missingRoles: stringList(record['missingRoles'] ?? record['missing_roles']),
      },
    ]
  })
}

function normalizeDecisionChain(value: unknown): DecisionChain | null {
  const record = readRecord(value)
  if (!record) return null
  const steps: DecisionStep[] = safeArray(record['steps']).flatMap(raw => {
    const stepRecord = readRecord(raw)
    if (!stepRecord) return []
    const step = safeString(stepRecord['step'])
    if (!step) return []
    return [{ step, actors: stringList(stepRecord['actors']), duration: nullable(stepRecord['duration']) }]
  })
  const chain: DecisionChain = {
    description: nullable(record['description']),
    steps,
    estimatedCycleLength: nullable(record['estimatedCycleLength'] ?? record['estimated_cycle_length']),
    budgetAuthority: nullable(record['budgetAuthority'] ?? record['budget_authority']),
  }
  const hasContent =
    chain.description !== null ||
    chain.steps.length > 0 ||
    chain.estimatedCycleLength !== null ||
    chain.budgetAuthority !== null
  return hasContent ? chain : null
}

function normalizeApproachOrder(value: unknown): ApproachStep[] {
  return safeArray(value)
    .flatMap(raw => {
      const record = readRecord(raw)
      if (!record) return []
      const contact = safeString(record['contact'])
      if (!contact) return []
      const step = record['step']
      return [
        {
          step: typeof step === 'number' ? step : null,
          contact,
          role: nullable(record['role']),
          whyFirst: nullable(record['why_first'] ?? record['whyFirst']),
          expectedOutcome: nullable(record['expected_outcome'] ?? record['expectedOutcome']),
          unlocks: nullable(record['unlocks']),
        },
      ]
    })
    .sort((a, b) => (a.step ?? Number.MAX_SAFE_INTEGER) - (b.step ?? Number.MAX_SAFE_INTEGER))
}

const STANCES: StakeholderStance[] = ['advocate', 'neutral', 'opponent', 'unknown']

function normalizeStakeholders(value: unknown): Stakeholder[] {
  return safeArray(value).flatMap(raw => {
    const record = readRecord(raw)
    if (!record) return []
    const fullName = safeString(record['fullName'] ?? record['full_name'])
    if (!fullName) return []
    const rawStance = safeString(record['stance']).toLowerCase()
    return [
      {
        fullName,
        stance: STANCES.includes(rawStance as StakeholderStance) ? (rawStance as StakeholderStance) : 'unknown',
        reasoning: nullable(record['reasoning']),
      },
    ]
  })
}

function boundedLevel(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 4 ? value : null
}

/** Read the deterministic buying committee. A member with no identity at all is
 *  dropped rather than rendered as an anonymous seat; `null` when nothing is
 *  placeable, so the section stays hidden instead of showing an empty committee. */
function normalizeCommittee(value: unknown): BuyingCommittee | null {
  const record = readRecord(value)
  if (!record) return null
  const members = safeArray(record['members']).flatMap((raw): CommitteeMember[] => {
    const member = readRecord(raw)
    if (!member) return []
    const fullName = safeString(member['fullName'])
    const title = nullable(member['title'])
    if (!fullName && !title) return []
    return [
      {
        fullName,
        title,
        entity: nullable(member['entity']),
        committeeRole: nullable(member['committeeRole']),
        roleLabel: nullable(member['roleLabel']),
        power: boundedLevel(member['power']),
        interest: boundedLevel(member['interest']),
        quadrant: nullable(member['quadrant']),
        cadence: nullable(member['cadence']),
        engagementAction: nullable(member['engagementAction']),
        evidenceLevel: nullable(member['evidenceLevel']),
        evidenceLevelLabel: nullable(member['evidenceLevelLabel']),
        source: nullable(member['source']),
      },
    ]
  })
  const missingRoles = stringList(record['missingRoles'])
  if (members.length === 0 && missingRoles.length === 0) return null
  return { members, missingRoles, summary: nullable(record['summary']) }
}

/** Build the view data from a whole `raw_analysis`. Tolerates the block sitting
 *  at `raw_analysis.org` (real shape) or already unwrapped. */
export function buildOrgStructureData(rawAnalysis: unknown): OrgStructureData {
  const root = readRecord(rawAnalysis) ?? {}
  const org = readRecord(root['org']) ?? root

  const units = normalizeUnits(org['organigramme'] ?? org['orgChart'])
  const decisionChain = normalizeDecisionChain(org['decisionChain'] ?? org['decision_chain'])
  const approachOrder = normalizeApproachOrder(org['approach_order'] ?? org['approachOrder'])
  const stakeholders = normalizeStakeholders(org['stakeholderMap'] ?? org['stakeholder_map'])
  const committee = normalizeCommittee(org['buyingCommittee'] ?? org['buying_committee'])

  return {
    units,
    decisionChain,
    approachOrder,
    stakeholders,
    committee,
    isEmpty:
      units.length === 0 &&
      decisionChain === null &&
      approachOrder.length === 0 &&
      stakeholders.length === 0 &&
      committee === null,
  }
}

// NOT read here, deliberately: `org.uncoveredZones`. It is the SAME semantic unit
// as the "Zones blanches" tab (a strategic area with no identified contact), but
// produced by the `bellum_organigramme` LLM prompt, while that tab is computed
// deterministically from the account's own contact rows (coverage.service.ts).
// Rendering both would put two "zones blanches" lists from two sources on the same
// dossier with no way for a rep to know which to trust. The deterministic one wins
// and keeps the name. `uncoveredZones` keeps being produced and persisted — it has
// a live consumer in the operator app (dashboard-manager) — it just doesn't get a
// second, contradictory customer-facing surface.
