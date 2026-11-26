import { describe, expect, it } from 'vitest'
import { ACTIVITY_MEASURES, type AuditSignalsInput, type ProfileContext } from '@bellum/contracts'
import { buildCommercialAudit, buildCommercialAuditContext } from './build-audit'

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — LE CHAÎNON, MESURÉ.
 *
 * Ce que ce fichier garde, et que le test de contrat ne peut pas garder : que
 * `buildCommercialAuditContext` APPELLE réellement la dérivation. Avant ce lot,
 * `funnel` était écrit `null` EN DUR à `build-audit.ts:525` pendant que
 * `funnelBreak` calculait juste la rupture sans aucun appelant hors de ses
 * propres tests — du code juste que personne n'appelle, le défaut n°1 du dépôt.
 *
 * ⚠️ Ce test doit savoir dire NON. Remettre `funnel: null` en dur, ou rendre
 * `declaredSignals` sans lire `answers`, le fait rougir en nommant la règle.
 */

const CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque'],
    decisionLevel: 'cLevel',
    // L'axe VISÉ — comparé à celui qui RÉPOND (#2043.10).
    entryStrategy: 'topDown',
  },
}

const ANSWERS: AuditSignalsInput = {
  activity_measures_tracked: ['Comptes travaillés', 'Contacts sollicités'],
  activity_reference_period: 'Le trimestre écoulé',
  ideal_client_current_state: ['Correspond au profil théorique'],
  ideal_client_accessibility: 'Hors réseau actuel, prospection à froid nécessaire',
  real_response_level: 'Niveau opérationnel',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  dossier_continuity_practices: [],
}

describe("l'audit LIT les réponses du questionnaire", () => {
  it('sans réponses lues, le bloc est ABSENT — pas vide, pas zéro', () => {
    const context = buildCommercialAuditContext(CONTEXT, [])
    expect(context.declaredSignals).toBeNull()
    expect(context.funnel).toBeNull()
  })

  it('#2049.15 — `funnel` n’est plus `null` en dur : il NOMME ce qui est compté et ce qui ne l’est pas', () => {
    const context = buildCommercialAuditContext(CONTEXT, [], ANSWERS)
    expect(context.funnel).not.toBeNull()
    expect(context.funnel).toHaveLength(ACTIVITY_MEASURES.length)
    // Les onze étapes, dans l'ordre de l'entonnoir, AUCUN nombre nulle part.
    expect(context.funnel?.map(stage => stage.count)).toEqual(ACTIVITY_MEASURES.map(() => null))
    expect(context.funnel?.slice(0, 3)).toEqual([
      { stage: 'Comptes travaillés', count: null, measurement: 'tracked' },
      { stage: 'Contacts sollicités', count: null, measurement: 'tracked' },
      { stage: 'Réponses obtenues', count: null, measurement: 'notTracked' },
    ])
    expect(context.declaredSignals?.funnelBreak).toMatchObject({ kind: 'break', stage: 'Réponses obtenues' })
  })

  it('#2043.10 — l’axe VISÉ vient du profil, l’axe RÉEL des réponses, et l’écart est nommé', () => {
    const context = buildCommercialAuditContext(CONTEXT, [], ANSWERS)
    expect(context.declaredSignals?.entryAxis).toMatchObject({
      kind: 'measured',
      axis: 'bottomUp',
      aimedEntryStrategy: 'topDown',
      divergesFromAim: true,
    })
  })

  it('#2042.15 / #2050.14 / #2051.16 — les trois autres signaux arrivent au contrat', () => {
    const signals = buildCommercialAuditContext(CONTEXT, [], ANSWERS).declaredSignals
    expect(signals?.startingPoint).toMatchObject({ kind: 'differsFromAmbition' })
    expect(signals?.frontsBudget).toMatchObject({ kind: 'measured', maxFronts: 1, source: 'protected' })
    expect(signals?.routineSeeds).toMatchObject({
      kind: 'measured',
      seeds: [{ practice: 'Une prochaine action datée sur chaque compte', alreadyHeld: false }],
    })
  })

  it('AUCUN pourcentage, AUCUNE probabilité ne sort de ce bloc', () => {
    const serialized = JSON.stringify(buildCommercialAuditContext(CONTEXT, [], ANSWERS).declaredSignals)
    expect(serialized).not.toMatch(/%/)
    expect(serialized).not.toMatch(/\d+\.\d+/)
  })
})

describe('« ce qui n’a pas pu être établi » VOIT ce bloc', () => {
  it('sans réponses lues, il est NOMMÉ comme réparable en répondant', () => {
    const audit = buildCommercialAudit(CONTEXT, [])
    expect(audit.unestablished).toContainEqual({ key: 'declaredSignals', reason: 'profileMissing' })
  })

  it('des réponses lues mais MUETTES ne sont pas « établies » — un bloc lu peut n’avoir rien dit', () => {
    const audit = buildCommercialAudit(CONTEXT, [], {})
    expect(audit.unestablished).toContainEqual({ key: 'declaredSignals', reason: 'profileMissing' })
    // …et le bloc existe quand même, chaque signal nommant son « non déclaré ».
    expect(audit.contextBlocks.declaredSignals?.funnelBreak.kind).toBe('notDeclared')
  })

  it('un seul signal déclaré suffit à ce que le bloc SORTE de la liste', () => {
    const audit = buildCommercialAudit(CONTEXT, [], { real_response_level: 'Niveau opérationnel' })
    expect(audit.unestablished.map(entry => entry.key)).not.toContain('declaredSignals')
  })
})
