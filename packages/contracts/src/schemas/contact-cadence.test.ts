import { describe, expect, it } from 'vitest'
import { cadenceScenarioSchema, cadenceStepSchema, contactCadenceSchema } from './contact-cadence.js'

const validStep = {
  key: 'relance' as const,
  label: 'Relance',
  offset_days: 3,
  due_date: '2026-07-18',
  done: false,
  item_id: null,
}

const validScenario = {
  state: 'froid' as const,
  template: 'standard' as const,
  citation: { rule: 'methodo/cadence-froid', evidence: [] },
}

describe('contact-cadence contracts', () => {
  it('parses a valid cadence step', () => {
    // `body` (p12 — contenu de touche) est optionnel et se remplit à `null` par
    // défaut : un dossier antérieur (sans body) reste valide, la touche porte
    // juste pas de texte propre.
    expect(cadenceStepSchema.parse(validStep)).toEqual({ ...validStep, body: null })
  })

  it('carries a per-touch body when one is provided (p12)', () => {
    const withBody = { ...validStep, body: 'J+3 : voici le benchmark promis…' }
    expect(cadenceStepSchema.parse(withBody).body).toBe('J+3 : voici le benchmark promis…')
  })

  it('rejects an unknown step key', () => {
    expect(cadenceStepSchema.safeParse({ ...validStep, key: 'nurture' }).success).toBe(false)
  })

  it('rejects a due_date that is not a YYYY-MM-DD calendar date', () => {
    expect(cadenceStepSchema.safeParse({ ...validStep, due_date: '2026-07-18T00:00:00Z' }).success).toBe(false)
  })

  it('parses a full cadence response with a null next_step (sequence done)', () => {
    const parsed = contactCadenceSchema.parse({
      contact_id: '11111111-1111-1111-1111-111111111111',
      scenario: validScenario,
      contacted: true,
      anchor_date: '2026-07-15',
      scheduled: true,
      steps: [validStep],
      next_step: null,
    })
    expect(parsed.scheduled).toBe(true)
    expect(parsed.next_step).toBeNull()
  })

  it('allows a null anchor_date for a not-yet-contacted preview', () => {
    const parsed = contactCadenceSchema.parse({
      contact_id: '11111111-1111-1111-1111-111111111111',
      scenario: validScenario,
      contacted: false,
      anchor_date: null,
      scheduled: false,
      steps: [],
      next_step: null,
    })
    expect(parsed.contacted).toBe(false)
    expect(parsed.anchor_date).toBeNull()
  })

  it('requires the scenario that produced the schedule (never an implicit cadence)', () => {
    const parsed = contactCadenceSchema.safeParse({
      contact_id: '11111111-1111-1111-1111-111111111111',
      contacted: false,
      anchor_date: null,
      scheduled: false,
      steps: [],
      next_step: null,
    })
    expect(parsed.success).toBe(false)
  })

  it('carries the relationship state, its template and the cited rule', () => {
    const parsed = cadenceScenarioSchema.parse({
      state: 'client_actif',
      template: 'client_expansion',
      citation: { rule: 'methodo/cadence-client-actif', evidence: ['kanban: customer'] },
    })
    expect(parsed.template).toBe('client_expansion')
    expect(parsed.citation.evidence).toEqual(['kanban: customer'])
  })

  it('rejects a template that is not one of the written méthodo patterns', () => {
    expect(cadenceScenarioSchema.safeParse({ ...validScenario, template: 'agressive' }).success).toBe(false)
  })

  it('rejects a relationship state outside the annexe taxonomy', () => {
    expect(cadenceScenarioSchema.safeParse({ ...validScenario, state: 'chaud' }).success).toBe(false)
  })
})
