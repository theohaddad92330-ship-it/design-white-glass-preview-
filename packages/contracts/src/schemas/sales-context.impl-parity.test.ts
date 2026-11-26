import { describe, expect, it } from 'vitest'
import { salesContextSchema } from './sales-context.js'

/**
 * Cross-language lock: these are the EXACT dicts emitted by the IA
 * `build_sales_context` (apps/ia/app/services/sales_context.py) for representative
 * inputs. They must parse under the zod contract — including its certainty
 * superRefine (inferred ⇒ confidence ≤ 99 + evidence; user_* ⇒ 100; default ⇒ 0).
 * If the Python emit shape changes, regenerate these (the IA test dumps them) and
 * this test guarantees the new shape is still contract-valid.
 */
const PY_EMITS = {
  small_bank_cold: {
    salesContextVersion: 1,
    esnProfile: {
      stage: 'freelance',
      businessModel: { rankPosition: 'inconnu', staffingModel: 'inconnu', marginBand: 'inconnu', tjmBand: 'inconnu' },
      capacity: { benchAvailable: 'inconnu', deliveryCapacity: 'inconnu', seniorityBand: 'inconnu' },
      gtm: { model: 'founder_led', channels: [], salesTeamSize: 1 },
      references: { sectors: [], clients: [], cases: [] },
      tools: [],
    },
    account: { archetype: 'banque_assurance', derivation: 'inferred', confidence: 85, evidence: ['secteur: banque'] },
    relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
  },
  large_industry_active: {
    salesContextVersion: 1,
    esnProfile: {
      stage: 'grande',
      businessModel: { rankPosition: 'inconnu', staffingModel: 'inconnu', marginBand: 'inconnu', tjmBand: 'inconnu' },
      capacity: { benchAvailable: 'inconnu', deliveryCapacity: 'inconnu', seniorityBand: 'inconnu' },
      gtm: { model: 'inconnu', channels: [] },
      references: { sectors: [], clients: [], cases: [] },
      tools: [],
    },
    account: { archetype: 'industrie', derivation: 'inferred', confidence: 85, evidence: ['secteur: industrie'] },
    relationship: {
      state: 'client_actif',
      derivation: 'user_declared',
      confidence: 100,
      evidence: ['statut déclaré: active'],
    },
  },
  empty: {
    salesContextVersion: 1,
    esnProfile: {
      stage: 'petite',
      businessModel: { rankPosition: 'inconnu', staffingModel: 'inconnu', marginBand: 'inconnu', tjmBand: 'inconnu' },
      capacity: { benchAvailable: 'inconnu', deliveryCapacity: 'inconnu', seniorityBand: 'inconnu' },
      gtm: { model: 'inconnu', channels: [] },
      references: { sectors: [], clients: [], cases: [] },
      tools: [],
    },
    account: { archetype: 'inconnu', derivation: 'default', confidence: 0, evidence: [] },
    relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
  },
} as const

describe('IA build_sales_context output ⊨ zod contract', () => {
  for (const [name, emit] of Object.entries(PY_EMITS)) {
    it(`parses the Python emit: ${name}`, () => {
      expect(() => salesContextSchema.parse(emit)).not.toThrow()
    })
  }
})
