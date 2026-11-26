import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import contactsSchema from '../schemas/contacts.schema.json' with { type: 'json' }
import planSchema from '../schemas/plan.schema.json' with { type: 'json' }
// REAL payloads (Société Générale run, télémétrie/blob stocké). Un schéma qui
// dérive de la réalité fait échouer le test → contrat == réalité, toujours.
import realContacts from '../schemas/__fixtures__/real-run-sg.contacts.json' with { type: 'json' }
import realPlan from '../schemas/__fixtures__/real-run-sg.plan.json' with { type: 'json' }

// #273 — un JSON Schema par étape du pipeline exporté depuis @bellum/shared,
// consommable cross-lang (TS ici, Python via jsonschema). Source de vérité zod =
// @bellum/contracts. Chaque schéma est permissif (passthrough) mais documente les
// champs branchables et valide une fixture RÉELLE.
const ajv = new Ajv({ allErrors: true, strict: false })

describe('contacts JSON Schema (phase 2/3) — frozen contract (#273)', () => {
  const validate = ajv.compile(contactsSchema)

  it('validates every row of a real topContacts[] payload', () => {
    for (const contact of realContacts as Array<Record<string, unknown>>) {
      const ok = validate(contact)
      if (!ok) console.error(validate.errors)
      expect(ok).toBe(true)
    }
  })

  it('documents the branchable contact fields (deterministic triage axes)', () => {
    const props = (contactsSchema as { properties: Record<string, unknown> }).properties
    for (const key of ['fullName', 'decisionRole', 'bucket', 'hierarchyLevel', 'sourceTag', 'priority', 'message']) {
      expect(props[key]).toBeDefined()
    }
  })

  it('constrains the enum axes (bucket / hierarchyLevel) to the deck taxonomy', () => {
    // A bucket outside the 6 deck values must be rejected.
    expect(validate({ bucket: 'not-a-bucket' })).toBe(false)
    expect(validate({ bucket: 'decideur' })).toBe(true)
    expect(validate({ hierarchyLevel: 'c_level' })).toBe(true)
  })
})

describe('plan JSON Schema (phase 4) — frozen contract (#273)', () => {
  const validate = ajv.compile(planSchema)

  it('validates a real stored plan sub-object', () => {
    const ok = validate(realPlan)
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('documents the branchable plan blocks (camelCase + legacy snake keys)', () => {
    const props = (planSchema as { properties: Record<string, unknown> }).properties
    for (const key of [
      'actionPlan',
      'evaluation',
      'competitiveStrategy',
      'contactMessages',
      'offersToPropose',
      'quick_wins',
      'if_no_response',
      'prioritySubAccounts',
    ]) {
      expect(props[key]).toBeDefined()
    }
  })

  it('documents EVERY top-level key a real plan produces (no drift)', () => {
    const documented = new Set(Object.keys((planSchema as { properties: object }).properties))
    // `_api_metrics` is internal telemetry, not a branchable contract field.
    const undocumented = Object.keys(realPlan as Record<string, unknown>).filter(
      k => k !== '_api_metrics' && !documented.has(k),
    )
    expect(undocumented).toEqual([])
  })
})
