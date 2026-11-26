import { buildAuditActiveLoad, buildAuditDeclaredSignals, type AuditSignalsInput } from '@bellum/contracts'
import { DEMO_AUDIT_ACTIVE_LOAD_COVERAGE } from './demo-coverage'
import { DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — LA PARITÉ DÉMO DE « TA CHARGE ACTIVE,
 * ARBITRÉE » (craft rule n°9).
 *
 * Même raison d'être que `demo-audit-declared-signals-coverage.spec.ts` :
 * `demo-coverage.spec.ts` raisonne au niveau TABLE (`esn_profiles` est semée,
 * donc verte), et resterait verte si les colonnes que ce bloc lit étaient vides
 * et que la salle voyait quatre cartes « Non établi. ».
 *
 * ⚠️ Elle EXÉCUTE la vraie dérivation (`buildAuditActiveLoad`, sur le budget de
 * fronts que `buildAuditDeclaredSignals` tire du MÊME semis) — elle ne relit pas
 * le texte de la classification. Vider `weekly_sales_time_protected`,
 * `weekly_sales_time_slots` ou `go_to_market_channels` de
 * {@link DEMO_ESN_PROFILE} fait rougir la grandeur correspondante, en la nommant.
 *
 * #2067.2 (décision Louis du 18/09/2026 nuit) — LA DÉMO DÉCLARE SES
 * PARTENAIRES. {@link DEMO_ESN_PROFILE} déclare désormais DEUX portes
 * (`go_to_market_channels: ['Direct client final', 'Partenaires ESN']`) et un
 * nombre de partenaires réguliers/ponctuels (`partners_regular_count`,
 * `partners_occasional_count`) : la salle rend « partenaires réguliers » ET
 * leur nombre, au lieu de « aucun partenaire ». Deux portes pour un seul front
 * budgété change aussi la réserve (#2067.5) et le report (#2067.6) — ce ne
 * sont pas des régressions, c'est la MÊME dérivation qui recalcule sur les
 * nouvelles réponses. Un second test PROUVE que la dérivation sait encore dire
 * NON : retirer le canal partenaire de l'entrée (sans toucher au semis réel)
 * retombe sur `noPartnerDoor`.
 */
const DEMO_ANSWERS = DEMO_ESN_PROFILE as AuditSignalsInput
const load = buildAuditActiveLoad(DEMO_ANSWERS, buildAuditDeclaredSignals(DEMO_ANSWERS).frontsBudget)

describe('parité démo — l’arbitrage de la charge active', () => {
  it('la classification dit SEEDÉE, avec une raison substantielle', () => {
    expect(DEMO_AUDIT_ACTIVE_LOAD_COVERAGE.state).toBe('seede')
    expect(DEMO_AUDIT_ACTIVE_LOAD_COVERAGE.reason).toContain('buildAuditActiveLoad')
    expect(DEMO_AUDIT_ACTIVE_LOAD_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('AUCUNE des quatre grandeurs n’est « non établie » en démonstration', () => {
    const silent = Object.entries(load)
      .filter(([, quantity]) => quantity.kind === 'answerMissing')
      .map(([name]) => name)
    expect(silent).toEqual([])
  })

  it('#2067.2 — deux portes déclarées, dont une partenaire : partenaires réguliers ÉTABLIS, et leur nombre', () => {
    expect(load.partners).toEqual({
      kind: 'regularPartners',
      rule: 'regularPartnersDeclared',
      regular: DEMO_ESN_PROFILE.partners_regular_count,
      occasional: DEMO_ESN_PROFILE.partners_occasional_count,
      partnerDoors: ['Partenaires ESN'],
    })
  })

  it('#2067.2 — sait dire NON : sans le canal partenaire, la même dérivation retombe sur « aucun partenaire »', () => {
    // Entrée SYNTHÉTIQUE (le vrai semis n'est pas touché) : la preuve que la
    // dérivation n'affirme pas « partenaires » par défaut, seulement quand la
    // porte est déclarée.
    const withoutPartnerDoor: AuditSignalsInput = {
      ...DEMO_ANSWERS,
      go_to_market_channels: ['Direct client final'],
    }
    const withoutPartner = buildAuditActiveLoad(
      withoutPartnerDoor,
      buildAuditDeclaredSignals(withoutPartnerDoor).frontsBudget,
    )
    expect(withoutPartner.partners).toEqual({
      kind: 'noPartnerDoor',
      rule: 'partnerDoorsDeclared',
      doors: ['Direct client final'],
    })
  })

  it('#2067.4 — les deux plages semées, et ce que le semis dit de leur tenue', () => {
    expect(load.slots).toEqual({
      kind: 'slots',
      rule: 'declaredTimeSlots',
      slots: ['Tôt le matin, avant 9 h', 'En fin de journée, après 16 h'],
      holding: DEMO_ESN_PROFILE.protected_slot_capacity,
    })
  })

  it('#2067.5 / #2067.6 — un front budgété, deux portes : rien à garder en réserve, un élément à reporter, et l’érosion semée reste CITÉE', () => {
    expect(load.reserve).toMatchObject({ kind: 'noReserve', maxFronts: 1, doorCount: 2 })
    expect(load.reserve.kind === 'noReserve' ? load.reserve.erosionRisks : []).toEqual([
      DEMO_ESN_PROFILE.protected_slot_capacity,
      DEMO_ESN_PROFILE.workload_variability,
    ])
    expect(load.deferred).toEqual({
      kind: 'toDefer',
      rule: 'doorsMinusBudget',
      count: 1,
      maxFronts: 1,
      candidates: ['Direct client final', 'Partenaires ESN'],
    })
  })
})
