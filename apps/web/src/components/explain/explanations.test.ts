import { canExplainNumber, deriveCompleteness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  benchRateExplanation,
  commercialMarginExplanation,
  dsoExplanation,
  signedRevenueExplanation,
} from './explanations'

/**
 * Ce que ces tests protègent : la ligne COMPLÉTUDE, et le refus du geste.
 *
 * Un traducteur d'identité — la phrase exacte est l'affaire de l'i18n, pas de
 * la construction. Ce qui compte ici est le DÉNOMINATEUR et ce qui en sort.
 */
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key)

describe('benchRateExplanation — le littéral du §5.1', () => {
  const capacity = {
    periodMonth: '2026-09',
    capacityDays: 1000,
    committedDays: 900,
    availableDays: 100,
    unmeasured: 3,
    bench: { rate: 0.125, onBench: 7, measurability: { measurable: true, observed: 56, required: 5, missing: 0 } },
  }

  it('écrit le CALCUL comme la source : « 7 / 56 »', () => {
    expect(benchRateExplanation(capacity, [], t)?.calculation).toBe('7 / 56')
  })

  it('compte les consultants NON LUS dans le dénominateur, et les NOMME', () => {
    const completeness = benchRateExplanation(capacity, [], t)?.completeness
    expect(completeness).toMatchObject({ counted: 56, total: 59 })
    expect(completeness?.excluded?.[0]).toContain('excluded.bench_rate')
    // 56 sur 59 : la phrase dit « partiel », pas « complet ».
    expect(deriveCompleteness(completeness!).kind).toBe('partial')
  })

  it('N’AFFICHE PAS le geste quand le taux n’est pas mesurable', () => {
    const blind = { ...capacity, bench: { ...capacity.bench, rate: null } }
    expect(benchRateExplanation(blind, [], t)).toBeNull()
  })

  it('nomme la DÉCISION réellement codée sous le seuil de mesurabilité', () => {
    const thin = {
      ...capacity,
      bench: { rate: 0.5, onBench: 1, measurability: { measurable: false, observed: 2, required: 5, missing: 3 } },
    }
    expect(benchRateExplanation(thin, [], t)?.decision).toContain('decision.notMeasurable')
    // Au-dessus du seuil, aucune consigne n'est codée : rien ne s'affiche.
    expect(benchRateExplanation(capacity, [], t)?.decision).toBeNull()
  })
})

describe('commercialMarginExplanation — l’exemple du brief', () => {
  it('dit « sur les 9 missions qui portent un coût, 4 n’en ont pas »', () => {
    const explanation = commercialMarginExplanation({ marginPercent: 28, measured: 9, unmeasured: 4 }, [], t)
    expect(explanation?.completeness).toMatchObject({ counted: 9, total: 13 })
    expect(explanation?.completeness.excluded?.[0]).toContain('"count":4')
    const verdict = deriveCompleteness(explanation!.completeness)
    expect(verdict.kind).toBe('partial')
    if (verdict.kind === 'partial') expect(verdict.share).toBe(69)
  })

  it('ne montre AUCUNE exclusion quand toutes les missions portent un coût', () => {
    const explanation = commercialMarginExplanation({ marginPercent: 28, measured: 9, unmeasured: 0 }, [], t)
    expect(explanation?.completeness.excluded).toBeUndefined()
    expect(deriveCompleteness(explanation!.completeness).kind).toBe('complete')
  })

  it('N’AFFICHE PAS le geste sur une marge non mesurée', () => {
    expect(commercialMarginExplanation({ marginPercent: null, measured: 0, unmeasured: 12 }, [], t)).toBeNull()
  })
})

describe('dsoExplanation — deux exclusions qui ne se confondent pas', () => {
  const dso = {
    days: 62,
    measurability: { measurable: true, observed: 12, required: 10, missing: 0 },
    undatable: 3,
    disputed: 2,
  }

  it('compte les non datables ET les contestées, séparément', () => {
    const explanation = dsoExplanation(dso, [], t)
    expect(explanation?.completeness).toMatchObject({ counted: 12, total: 17 })
    expect(explanation?.completeness.excluded).toHaveLength(2)
  })

  it('⚠️ un compte de contestées NON LU rend le total INCONNU, jamais partiel', () => {
    // `disputed: null` veut dire « on n'a pas su compter ». Additionner sans lui
    // écrirait « calculé sur 12 sur 15 » — une population amputée qui se lit
    // comme une population complète.
    const explanation = dsoExplanation({ ...dso, disputed: null }, [], t)
    expect(explanation?.completeness.total).toBeNull()
    expect(deriveCompleteness(explanation!.completeness).kind).toBe('unknownTotal')
  })

  it('ZÉRO contestée est une MESURE : aucune ligne d’exclusion, mais le total la compte', () => {
    const explanation = dsoExplanation({ ...dso, disputed: 0 }, [], t)
    expect(explanation?.completeness.total).toBe(15)
    expect(explanation?.completeness.excluded).toHaveLength(1)
  })

  it('N’AFFICHE PAS le geste tant que le délai n’est pas mesurable', () => {
    expect(dsoExplanation({ ...dso, days: null }, [], t)).toBeNull()
  })
})

describe('signedRevenueExplanation — sans dénominateur, pas de geste', () => {
  const line = {
    kind: 'signed' as const,
    amountCents: 12_000_00,
    withoutAmount: 3,
    unavailableReason: null,
    sourceRows: 34,
  }

  it('compte les lignes chiffrées sur les lignes vues', () => {
    const explanation = signedRevenueExplanation(line, t)
    expect(explanation?.completeness).toMatchObject({ counted: 31, total: 34 })
  })

  it('⚠️ RETIRE le geste quand le total n’a pas été lu — pas de complétude devinée', () => {
    // Le champ est récent : un écran servi par une API antérieure reçoit `null`.
    // Expliquer sans pouvoir dire sur quoi est exactement ce qu'on interdit.
    expect(signedRevenueExplanation({ ...line, sourceRows: null }, t)).toBeNull()
  })

  it('N’AFFICHE PAS le geste sur un montant absent', () => {
    expect(signedRevenueExplanation({ ...line, amountCents: null }, t)).toBeNull()
  })

  it('ne pose AUCUN seuil — la source n’en chiffre pas pour le CA signé', () => {
    expect(signedRevenueExplanation(line, t)?.thresholds).toEqual([])
  })
})

describe('les quatre explications passent le juge du geste', () => {
  it('canExplainNumber les accepte toutes les quatre', () => {
    const built = [
      benchRateExplanation(
        {
          periodMonth: '2026-09',
          capacityDays: 1,
          committedDays: 1,
          availableDays: 0,
          unmeasured: 0,
          bench: { rate: 0.1, onBench: 7, measurability: { measurable: true, observed: 56, required: 5, missing: 0 } },
        },
        [],
        t,
      ),
      commercialMarginExplanation({ marginPercent: 28, measured: 9, unmeasured: 4 }, [], t),
      dsoExplanation(
        {
          days: 62,
          measurability: { measurable: true, observed: 12, required: 10, missing: 0 },
          undatable: 0,
          disputed: 0,
        },
        [],
        t,
      ),
      signedRevenueExplanation(
        { kind: 'signed', amountCents: 1, withoutAmount: 0, unavailableReason: null, sourceRows: 4 },
        t,
      ),
    ]
    expect(built.every(canExplainNumber)).toBe(true)
    // Et chacune porte une COMPLÉTUDE — le type l'impose, le test le constate.
    expect(built.every(explanation => explanation?.completeness !== undefined)).toBe(true)
  })
})
