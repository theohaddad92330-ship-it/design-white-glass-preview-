import { describe, expect, it } from 'vitest'
import {
  CRM_COUNTER_DEFINITIONS,
  CRM_COUNTER_KEYS,
  crmCounterSchema,
  crmCountersResponseSchema,
  measuredCounter,
  securedMonthlyRevenueOf,
  unmeasuredCounter,
} from './crm-counters.js'

/**
 * #4193 (épopée #4191, lot L2) — UN compteur, UNE source, UNE définition écrite.
 */
describe('crmCounterSchema', () => {
  it('accepte un compteur mesuré, zéro réel compris', () => {
    expect(crmCounterSchema.safeParse(measuredCounter(0, 'needs_open')).success).toBe(true)
    expect(crmCounterSchema.safeParse(measuredCounter(7, 'needs_open')).success).toBe(true)
  })

  it('un compteur non mesuré porte value=null, jamais 0', () => {
    const counter = unmeasuredCounter('missions_active')
    expect(counter).toEqual({ value: null, measured: false, definition_key: 'missions_active' })
    expect(crmCounterSchema.safeParse(counter).success).toBe(true)
  })

  it('refuse un non mesuré qui porte 0, et un mesuré sans valeur', () => {
    expect(crmCounterSchema.safeParse({ value: 0, measured: false, definition_key: 'x' }).success).toBe(false)
    expect(crmCounterSchema.safeParse({ value: null, measured: true, definition_key: 'x' }).success).toBe(false)
  })

  it('refuse une valeur négative ou fractionnaire', () => {
    expect(crmCounterSchema.safeParse({ value: -1, measured: true, definition_key: 'x' }).success).toBe(false)
    expect(crmCounterSchema.safeParse({ value: 1.5, measured: true, definition_key: 'x' }).success).toBe(false)
  })
})

describe('définitions', () => {
  it('chaque compteur a une définition écrite non vide', () => {
    for (const key of CRM_COUNTER_KEYS) {
      expect(CRM_COUNTER_DEFINITIONS[key].trim().length).toBeGreaterThan(10)
    }
  })

  it('« Pistes » (intake), signaux et déductions sont trois compteurs distincts', () => {
    expect(CRM_COUNTER_KEYS).toContain('leads_to_qualify')
    expect(CRM_COUNTER_KEYS).toContain('buying_signals')
    expect(CRM_COUNTER_KEYS).toContain('generic_deductions')
  })
})

describe('crmCountersResponseSchema', () => {
  const counters = Object.fromEntries(CRM_COUNTER_KEYS.map(key => [key, measuredCounter(1, key)]))
  it('lit une réponse complète', () => {
    const parsed = crmCountersResponseSchema.safeParse({
      scope: { kind: 'workspace', outsideAnyPortfolio: null },
      counters,
      secured_revenue_month: {
        measured: true,
        amounts: [{ currency: 'EUR', amountCents: 100 }],
        definition_key: 'secured_revenue_month',
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une réponse à qui il manque un compteur', () => {
    const { needs_open: _omitted, ...rest } = counters
    expect(
      crmCountersResponseSchema.safeParse({
        scope: { kind: 'workspace', outsideAnyPortfolio: null },
        counters: rest,
        secured_revenue_month: { measured: false, amounts: null, definition_key: 'secured_revenue_month' },
      }).success,
    ).toBe(false)
  })
})

describe('securedMonthlyRevenueOf', () => {
  it('undefined sans prévisionnel, null sans ligne chiffrable, sinon le scénario downside', () => {
    expect(securedMonthlyRevenueOf(undefined)).toBeUndefined()
    expect(securedMonthlyRevenueOf({ scenarios: [] } as never)).toBeNull()
    expect(
      securedMonthlyRevenueOf({
        scenarios: [{ scenario: 'downside', amounts: [{ currency: 'EUR', amountCents: 5 }] }],
      } as never),
    ).toEqual([{ currency: 'EUR', amountCents: 5 }])
  })
})
