import { describe, expect, it } from 'vitest'
import {
  MISSION_START_ITEMS,
  MISSION_AGREEMENT_REVALIDATE_AFTER_DAYS,
  computeMissionStartReadiness,
  missionStartCheckInputSchema,
  startGateApplies,
  type MissionStartDeclared,
} from './mission-start-readiness.js'

const NOW = new Date('2026-09-23T10:00:00Z')
const recent = '2026-09-20T10:00:00Z'
const declared = (key: MissionStartDeclared['key'], at = recent): MissionStartDeclared => ({
  key,
  confirmedAt: at,
  confirmedBy: 'u1',
  proof: 'mail du client du 20/09',
})
const fullData = { consultantAssigned: true, startDate: '2026-10-01', dailyRate: 650 }
const allDeclared = MISSION_START_ITEMS.filter(i => i.kind === 'declared').map(i => declared(i.key as never))

describe('#2409 — le catalogue minimal des prérequis de démarrage', () => {
  it('porte les deux accords (#2338) et reste sobre', () => {
    const keys = MISSION_START_ITEMS.map(i => i.key)
    expect(keys).toContain('client_agreement')
    expect(keys).toContain('consultant_agreement')
    expect(keys).toContain('contract_signed')
    expect(keys.length).toBeLessThanOrEqual(8)
  })
})

describe('#2338 — la porte ne vise que le passage au démarrage', () => {
  it('garde ready_to_start et le saut onboarding → active', () => {
    expect(startGateApplies('draft', 'ready_to_start')).toBe(true)
    expect(startGateApplies('onboarding', 'active')).toBe(true)
  })
  it('ne touche ni la création, ni une annulation, ni une mission déjà en cours', () => {
    expect(startGateApplies('draft', 'onboarding')).toBe(false)
    expect(startGateApplies('draft', 'cancelled')).toBe(false)
    expect(startGateApplies('ready_to_start', 'active')).toBe(false)
    expect(startGateApplies('paused', 'active')).toBe(false)
  })
})

describe('computeMissionStartReadiness', () => {
  it('une mission née sans aucun geste porte « accords à confirmer » et est bloquée', () => {
    const r = computeMissionStartReadiness({ declared: [], data: fullData, now: NOW })
    expect(r.agreementsPending).toBe(true)
    expect(r.verdict).toBe('blocked')
    expect(r.missing).toEqual(expect.arrayContaining(['client_agreement', 'consultant_agreement', 'contract_signed']))
  })

  it('un seul des deux accords ne suffit pas (TJM envoyé ≠ accepté)', () => {
    const r = computeMissionStartReadiness({ declared: [declared('client_agreement')], data: fullData, now: NOW })
    expect(r.agreementsPending).toBe(true)
    expect(r.missing).toContain('consultant_agreement')
    expect(r.missing).not.toContain('client_agreement')
  })

  it('tout est là → prêt', () => {
    const r = computeMissionStartReadiness({ declared: allDeclared, data: fullData, now: NOW })
    expect(r.verdict).toBe('ready')
    expect(r.missing).toEqual([])
    expect(r.agreementsPending).toBe(false)
  })

  it('une réserve manquante ne bloque pas → prêt avec réserve', () => {
    const r = computeMissionStartReadiness({
      declared: allDeclared.filter(d => d.key !== 'site_access'),
      data: { ...fullData, dailyRate: null },
      now: NOW,
    })
    expect(r.verdict).toBe('ready_with_reserves')
    expect(r.reserves).toEqual(expect.arrayContaining(['site_access', 'daily_rate']))
    expect(r.missing).toEqual([])
  })

  it('une donnée du dossier absente (date de début, consultant) → incomplet, nommée', () => {
    const r = computeMissionStartReadiness({
      declared: allDeclared,
      data: { consultantAssigned: false, startDate: null, dailyRate: 650 },
      now: NOW,
    })
    expect(r.verdict).toBe('incomplete')
    expect(r.missing).toEqual(['consultant_assigned', 'start_date'])
  })

  it(`#2338.9 — un accord vieux de plus de ${MISSION_AGREEMENT_REVALIDATE_AFTER_DAYS} jours repasse « à revalider »`, () => {
    const old = new Date(NOW.getTime() - (MISSION_AGREEMENT_REVALIDATE_AFTER_DAYS + 1) * 86_400_000).toISOString()
    const r = computeMissionStartReadiness({
      declared: [...allDeclared.filter(d => d.key !== 'consultant_agreement'), declared('consultant_agreement', old)],
      data: fullData,
      now: NOW,
    })
    expect(r.items.find(i => i.key === 'consultant_agreement')?.state).toBe('stale')
    expect(r.missing).toContain('consultant_agreement')
    expect(r.agreementsPending).toBe(true)
  })

  it('un geste déclaré garde son auteur, sa date et sa preuve', () => {
    const r = computeMissionStartReadiness({ declared: [declared('contract_signed')], data: fullData, now: NOW })
    expect(r.items.find(i => i.key === 'contract_signed')).toMatchObject({
      state: 'done',
      confirmedBy: 'u1',
      confirmedAt: recent,
      proof: 'mail du client du 20/09',
    })
  })
})

describe('#2409.7 — pas de case cochée sans preuve', () => {
  it('refuse une preuve vide et un item dérivé', () => {
    expect(missionStartCheckInputSchema.safeParse({ item: 'client_agreement', proof: '  ' }).success).toBe(false)
    expect(missionStartCheckInputSchema.safeParse({ item: 'start_date', proof: 'ok ok' }).success).toBe(false)
    expect(missionStartCheckInputSchema.safeParse({ item: 'client_agreement', proof: 'mail du 20/09' }).success).toBe(
      true,
    )
  })
})
