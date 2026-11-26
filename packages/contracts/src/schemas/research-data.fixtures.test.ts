import { describe, expect, it } from 'vitest'
import doctolib from '../fixtures/research.doctolib.json'
import sg from '../fixtures/research.societe-generale.json'
import { researchDataSchema } from './research-data.js'

// B2 — frozen reference fixtures. Two real-shaped Phase-1 outputs (Société
// Générale, Doctolib) that the research contract must keep parsing. Any change
// that drops or tightens a field these carry will fail here — the format is
// "branchable par Mattéo" only if it stays stable against known companies.
describe('research format — frozen fixtures (B2)', () => {
  const cases = [
    { name: 'Société Générale', fixture: sg, siren: '552120222', minSubs: 3 },
    { name: 'Doctolib', fixture: doctolib, siren: '794598813', minSubs: 2 },
  ]

  for (const c of cases) {
    describe(c.name, () => {
      it('parses against researchDataSchema', () => {
        expect(researchDataSchema.safeParse(c.fixture).success).toBe(true)
      })

      it('preserves the key fields the front/plan branch on', () => {
        const d = researchDataSchema.parse(c.fixture)
        expect(d.siren).toBe(c.siren)
        expect(Array.isArray(d.subsidiaries)).toBe(true)
        expect((d.subsidiaries as unknown[]).length).toBeGreaterThanOrEqual(c.minSubs)
        expect(Array.isArray(d.entitiesExhaustive)).toBe(true)
        expect(Array.isArray(d.angles)).toBe(true)
        expect(typeof d.priorityScore).toBe('number')
        // `confidence` (B4) rides through via `.passthrough()`.
        expect((d as Record<string, unknown>).confidence).toBeDefined()
      })
    })
  }
})
