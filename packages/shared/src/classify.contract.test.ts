import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import classifySchema from '../schemas/classify.schema.json' with { type: 'json' }
// The classify wire payload. Its SHAPE is emitted by the production Pydantic
// models themselves (ClassifiedData / OrgChartOutput / EnrichedContact) — not
// hand-typed — so it cannot drift from what the IA actually sends; its CONTENT
// is real Société Générale data already committed in this repo.
import realClassify from '../schemas/__fixtures__/real-run-sg.classify.json' with { type: 'json' }

// #273 — the 4th (and last missing) per-step schema: `classify`. Same contract
// as its siblings: permissive (passthrough) but documents the branchable fields,
// validated against a REAL payload, and cross-checked from Python by
// `apps/ia/tests/test_shared_schemas.py` against these same files.
const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(classifySchema)

type Branchable = { root: string[]; items: Record<string, string[]> }
const branchable = (classifySchema as unknown as { 'x-bellum-branchable': Branchable })['x-bellum-branchable']

describe('classify JSON Schema (phase 3) — frozen contract (#273)', () => {
  it('validates a real classifier payload', () => {
    const ok = validate(realClassify)
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('documents the branchable blocks, legacy wire keys included', () => {
    const props = (classifySchema as { properties: Record<string, unknown> }).properties
    for (const key of [
      'contacts',
      // LEGACY wire keys — what the prompt + Pydantic actually emit today.
      'organigramme',
      'approach_order',
      // …and their camelCase zod counterparts, documented side by side.
      'orgChart',
      'approachOrder',
      'decisionChain',
      'uncoveredZones',
      'stakeholderMap',
      'buyingCommittee',
    ]) {
      expect(props[key]).toBeDefined()
    }
  })

  it('documents EVERY top-level key a real classifier payload produces (no drift)', () => {
    const documented = new Set(Object.keys((classifySchema as { properties: object }).properties))
    const undocumented = Object.keys(realClassify as Record<string, unknown>).filter(k => !documented.has(k))
    expect(undocumented).toEqual([])
  })

  it('documents EVERY key a real classified contact produces (no drift)', () => {
    const contactProps = (classifySchema as { definitions: { enrichedContact: { properties: object } } }).definitions
      .enrichedContact.properties
    const documented = new Set(Object.keys(contactProps))
    const rows = (realClassify as { contacts: Array<Record<string, unknown>> }).contacts
    const undocumented = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !documented.has(k))
    expect(undocumented).toEqual([])
  })

  it('constrains the deterministic triage axes to the deck taxonomy', () => {
    expect(validate({ contacts: [{ bucket: 'decideur', hierarchyLevel: 'c_level' }] })).toBe(true)
    expect(validate({ contacts: [{ bucket: 'not-a-bucket' }] })).toBe(false)
    expect(validate({ contacts: [{ hierarchyLevel: 'supreme_leader' }] })).toBe(false)
    expect(validate({ uncoveredZones: [{ zone: 'RSSI', importance: 'urgentissime' }] })).toBe(false)
    expect(validate({ stakeholderMap: [{ stance: 'enthusiastic' }] })).toBe(false)
  })
})

// THE guard the DoD asks for: the schemas are permissive (nothing is `required`,
// so an enrichment can add keys freely) — which means a DISAPPEARING field would
// sail through plain validation. `x-bellum-branchable` is the counterweight, and
// Python reads the exact same annotation
// (`app/contracts/shared_schemas.py::missing_branchable`), so the guard is
// literally identical on both sides of the monorepo.
describe('branchable-field guard — an amputated payload must FAIL (#273)', () => {
  const missingBranchable = (payload: Record<string, unknown>): string[] => {
    const missing = branchable.root.filter(k => !(k in payload))
    for (const [arrayKey, itemKeys] of Object.entries(branchable.items)) {
      const rows = payload[arrayKey]
      if (!Array.isArray(rows)) continue
      rows.forEach((row, i) => {
        if (row && typeof row === 'object') {
          missing.push(...itemKeys.filter(k => !(k in (row as object))).map(k => `${arrayKey}[${i}].${k}`))
        }
      })
    }
    return missing
  }

  it('the real payload carries every branched field', () => {
    expect(missingBranchable(realClassify as Record<string, unknown>)).toEqual([])
  })

  it('fails when a top-level branched block disappears', () => {
    const amputated = structuredClone(realClassify) as Record<string, unknown>
    delete amputated.decisionChain
    // Plain JSON-Schema validation still passes — that is exactly why the guard exists.
    expect(validate(amputated)).toBe(true)
    expect(missingBranchable(amputated)).toEqual(['decisionChain'])
  })

  it('fails when a guaranteed contact field disappears', () => {
    // `bucket` is a Pydantic computed_field: an analysis that stops emitting it
    // means the deterministic triage broke, and the front's filters go blank.
    const amputated = structuredClone(realClassify) as { contacts: Array<Record<string, unknown>> }
    delete amputated.contacts[0].bucket
    expect(missingBranchable(amputated as unknown as Record<string, unknown>)).toEqual(['contacts[0].bucket'])
  })
})
