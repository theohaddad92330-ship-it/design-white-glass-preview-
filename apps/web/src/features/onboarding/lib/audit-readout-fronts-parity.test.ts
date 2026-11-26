import { describe, expect, it } from 'vitest'
import {
  PROTECTED_SLOT_CAPACITY,
  WEEKLY_SALES_TIME_BANDS,
  WORKLOAD_VARIABILITY,
  type AuditSignalsInput,
} from '@bellum/contracts'
import { buildCommercialAudit } from '@/features/commercial-audit/lib/build-audit'
import type { OnboardingAnswers } from '@/stores/onboardingStore'
import { buildAuditReadout } from './audit-readout'

/**
 * #2067 / #2050.14 — UN SEUL NOMBRE DE FRONTS, SUR LES DEUX ÉCRANS.
 *
 * Décision Louis du 18/09/2026 (reprise du lot H26) : le nombre de fronts de
 * L'AUDIT gagne — `frontsBudget` (jusqu'à 4, tiré du temps protégé déclaré,
 * l'érosion CITÉE et jamais retranchée). La relecture d'onboarding
 * (`buildAuditReadout`) calculait le sien (plafond 3, un front retiré par
 * érosion) : pour un même profil, les deux écrans pouvaient dire 1 et 3.
 *
 * Ce test prouve, profil par profil, que la relecture et l'audit rendent le
 * MÊME nombre — y compris sur les deux cas où les anciennes règles divergeaient
 * (érosion déclarée, plus de 20 heures).
 */
const PROFILES: AuditSignalsInput[] = [
  { weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[2] },
  // Divergeait : 3 fronts moins deux érosions = 1 à l'accueil, 3 à l'audit.
  {
    weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[4],
    protected_slot_capacity: PROTECTED_SLOT_CAPACITY[1],
    workload_variability: WORKLOAD_VARIABILITY[2],
  },
  // Divergeait : plafond 3 à l'accueil, 4 à l'audit.
  { weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[5] },
  // Le temps annoncé à défaut du protégé.
  { weekly_sales_time_declared: WEEKLY_SALES_TIME_BANDS[3] },
]

function welcomeFronts(answers: AuditSignalsInput): number | null {
  const row = buildAuditReadout(answers as unknown as OnboardingAnswers).rows.find(item => item.key === 'effort')
  return typeof row?.values?.count === 'number' ? row.values.count : null
}

function auditFronts(answers: AuditSignalsInput): number | null {
  const budget = buildCommercialAudit(null, [], answers).contextBlocks.declaredSignals?.frontsBudget
  return budget?.kind === 'measured' ? budget.maxFronts : null
}

describe('#2050.14 — la relecture d’onboarding et l’audit rendent le MÊME nombre de fronts', () => {
  it.each(PROFILES.map((profile, index) => [index, profile] as const))('profil n°%i', (_index, profile) => {
    const audit = auditFronts(profile)
    expect(audit).not.toBeNull()
    expect(welcomeFronts(profile)).toBe(audit)
  })

  it('l’érosion déclarée est CITÉE sous le nombre, jamais retranchée', () => {
    const eroded = PROFILES[1]
    const row = buildAuditReadout(eroded as unknown as OnboardingAnswers).rows.find(item => item.key === 'effort')
    expect(row?.values?.count).toBe(3)
    expect(row?.detail).toEqual([PROTECTED_SLOT_CAPACITY[1], WORKLOAD_VARIABILITY[2]])
  })

  it('SAIT DIRE NON — « aucune heure » reste un zéro déclaré, « je ne sais pas » reste non mesuré', () => {
    const none = buildAuditReadout({ weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[0] })
    expect(none.rows.find(item => item.key === 'effort')?.labelKey).toBe('review.readout.noTimeDeclared')
    const unknown = buildAuditReadout({ weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[6] })
    expect(unknown.rows.some(item => item.key === 'effort')).toBe(false)
    expect(unknown.unmeasured).toContain('effort')
  })
})
