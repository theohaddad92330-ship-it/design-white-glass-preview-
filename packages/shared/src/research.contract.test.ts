import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import researchSchema from '../schemas/research.schema.json' with { type: 'json' }
import doctolib from '../../contracts/src/fixtures/research.doctolib.json' with { type: 'json' }
import sg from '../../contracts/src/fixtures/research.societe-generale.json' with { type: 'json' }
// A REAL stored raw_analysis (Société Générale run, heavy blobs trimmed). The
// drift guard below asserts the schema documents every key a real run produces —
// so the contract page can be Mattéo's ultimate reference and never silently
// drift from reality. Re-dump this fixture whenever a new output field ships.
import realRun from '../schemas/__fixtures__/real-run-sg.raw.json' with { type: 'json' }
// A REAL topContacts[] payload (telemetry). The contact guard below asserts the
// payload always carries the fields the front (and the /contract ③ frontPayload
// table) rely on — so Mattéo's contact mapping never drifts either.
import realContacts from '../schemas/__fixtures__/real-run-sg.contacts.json' with { type: 'json' }

// The exact fields the front reads from each topContacts[] row (mirror of the
// /contract ③ table's `topContacts[].X` paths). If the telemetry stops sending
// one, the test fails — keeping the contact contract == reality.
const FRONT_CONTACT_FIELDS = [
  'fullName',
  'title',
  'entity',
  'family',
  'decisionRole',
  'priority',
  'sourceTag',
  'email',
  'phone',
  'linkedinUrl',
  'message',
  'bucket',
  'hierarchyLevel',
] as const

// #5 — the frozen cross-lang contract. The two canonical fixtures (Société
// Générale, Doctolib) must validate against the published research JSON Schema,
// so Mattéo can branch on it from any language. A field that drifts out of the
// schema (or a fixture that violates it) fails CI here.
const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(researchSchema)

describe('research JSON Schema — frozen contract (#5)', () => {
  for (const [name, fixture] of [
    ['Société Générale', sg],
    ['Doctolib', doctolib],
  ] as const) {
    it(`validates the ${name} fixture`, () => {
      const ok = validate(fixture)
      if (!ok) console.error(validate.errors)
      expect(ok).toBe(true)
    })
  }

  it('documents the branchable fields Mattéo relies on (stored snake_case keys)', () => {
    const props = (researchSchema as { properties: Record<string, unknown> }).properties
    for (const key of [
      'siren',
      'subsidiaries',
      'meaningful_subsidiaries',
      'subsidiaries_summary',
      'entities_exhaustive',
      'entity_zones',
      'priority_score',
      'priority_justification',
      'plan',
      'confidence',
      'sources',
    ]) {
      expect(props[key]).toBeDefined()
    }
  })

  // The drift guard: every top-level key a REAL stored run produces must be
  // documented in the schema. If the pipeline starts producing a new key, this
  // fails until the schema (the reference) is updated — keeping contract ==
  // reality, always. Re-dump the fixture when a new output field ships.
  it('documents EVERY top-level key a real stored run produces (no drift)', () => {
    const documented = new Set(Object.keys((researchSchema as { properties: object }).properties))
    const undocumented = Object.keys(realRun as Record<string, unknown>).filter(k => !documented.has(k))
    expect(undocumented).toEqual([])
  })

  // Contact drift guard: the telemetry topContacts[] payload must always carry
  // every field the front reads (the ③ frontPayload contact rows). Bucket /
  // hierarchyLevel are intentionally NOT here — they are derived front-side.
  it('the topContacts payload carries every field the front relies on (no drift)', () => {
    const contact = (realContacts as Array<Record<string, unknown>>)[0]
    const keys = new Set(Object.keys(contact ?? {}))
    const missing = FRONT_CONTACT_FIELDS.filter(f => !keys.has(f))
    expect(missing).toEqual([])
  })

  it('rejects a clearly malformed payload (wrong types)', () => {
    expect(validate({ priority_score: 'high', confidence: { score: 'bad' } })).toBe(false)
  })
})
