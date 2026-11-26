import { describe, expect, it } from 'vitest'
import {
  buildAuditActiveLoad,
  buildAuditDeclaredSignals,
  commercialAuditContextSchema,
  type AuditSignalsInput,
  type ProfileContext,
} from '@bellum/contracts'
import { buildCommercialAudit, buildCommercialAuditContext } from './build-audit'

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — L'ARBITRAGE ARRIVE DANS L'AUDIT.
 *
 * Ce que le test de contrat ne peut pas garder : que `buildCommercialAudit`
 * APPELLE la dérivation (sinon c'est du code juste que personne n'appelle, le
 * défaut n°1 du dépôt), et que chaque grandeur « non établie » soit NOMMÉE dans
 * « Ce qui n'a pas pu être établi » avec la réponse qui manque — la liste
 * décrit l'ÉCRAN (GA-345), elle ne peut pas taire un bloc qu'il rend.
 */

const CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque'],
    decisionLevel: 'manager',
    entryStrategy: 'bottomUp',
  },
}

const COMPLETE: AuditSignalsInput = {
  weekly_sales_time_protected: '10 à 20 heures par semaine',
  protected_slot_capacity: 'Oui, je bloque des créneaux et ils tiennent',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
  go_to_market_channels: ['Direct client final', "Appels d'offres"],
}

const ACTIVE_LOAD_KEYS = ['activeLoadPartners', 'activeLoadSlots', 'activeLoadReserve', 'activeLoadDeferred']

function entryOf(audit: ReturnType<typeof buildCommercialAudit>, key: string) {
  return audit.unestablished.find(entry => entry.key === key)
}

describe("buildCommercialAudit — l'arbitrage de la charge active", () => {
  it('APPELLE la dérivation du contrat, sur le budget de fronts déjà lu — une seule dérivation', () => {
    const audit = buildCommercialAudit(CONTEXT, [], COMPLETE)
    const expected = buildAuditActiveLoad(COMPLETE, buildAuditDeclaredSignals(COMPLETE, 'bottomUp').frontsBudget)
    expect(audit.activeLoad).toEqual(expected)
    expect(audit.activeLoad.reserve).toMatchObject({ kind: 'reserve', rule: 'budgetMinusDoors', freeFronts: 1 })
  })

  it('profil complet : AUCUNE des quatre grandeurs n’entre dans la liste des non-établis', () => {
    const keys = buildCommercialAudit(CONTEXT, [], COMPLETE).unestablished.map(entry => entry.key)
    for (const key of ACTIVE_LOAD_KEYS) expect(keys, key).not.toContain(key)
  })

  it('une réponse manquante est NOMMÉE dans la liste, avec la porte « compléter mon profil »', () => {
    const audit = buildCommercialAudit(CONTEXT, [], { ...COMPLETE, weekly_sales_time_slots: [] })
    expect(entryOf(audit, 'activeLoadSlots')).toEqual({
      key: 'activeLoadSlots',
      reason: 'profileMissing',
      missingAnswers: ['weekly_sales_time_slots'],
    })
    const withoutDoors = buildCommercialAudit(CONTEXT, [], { ...COMPLETE, go_to_market_channels: ['Mixte'] })
    for (const key of ['activeLoadPartners', 'activeLoadReserve', 'activeLoadDeferred']) {
      expect(entryOf(withoutDoors, key), key).toEqual({
        key,
        reason: 'profileMissing',
        missingAnswers: ['go_to_market_channels'],
      })
    }
  })

  // #2067.2 — décision Louis du 18/09/2026 : la question « avec combien de
  // partenaires ? » existe. Une porte partenaire sans ce nombre se RÉPARE en
  // répondant — ce n'est plus « aucune source ne le produit ».
  it('#2067.2 — une porte partenaire sans le nombre : la question est NOMMÉE, et elle se répare en répondant', () => {
    const audit = buildCommercialAudit(CONTEXT, [], { ...COMPLETE, go_to_market_channels: ['Rang 2'] })
    expect(entryOf(audit, 'activeLoadPartners')).toEqual({
      key: 'activeLoadPartners',
      reason: 'profileMissing',
      missingAnswers: ['partners_regular_count'],
    })
    const answered = buildCommercialAudit(CONTEXT, [], {
      ...COMPLETE,
      go_to_market_channels: ['Rang 2'],
      partners_regular_count: '3',
    })
    expect(entryOf(answered, 'activeLoadPartners')).toBeUndefined()
    expect(answered.activeLoad.partners).toMatchObject({ kind: 'regularPartners', regular: '3' })
  })

  it('sans réponses lues, les quatre sont NOMMÉES — aucune ne vaut 0, aucune ne se tait', () => {
    const audit = buildCommercialAudit(CONTEXT, [])
    for (const key of ACTIVE_LOAD_KEYS) {
      const entry = entryOf(audit, key)
      expect(entry, key).toBeDefined()
      expect(entry && 'missingAnswers' in entry ? entry.missingAnswers.length : 0, key).toBeGreaterThan(0)
    }
  })

  it('le contrat porte la MÊME valeur que l’écran — lue sur `audit`, jamais redérivée', () => {
    const audit = buildCommercialAudit(CONTEXT, [], COMPLETE)
    const context = buildCommercialAuditContext(CONTEXT, [], COMPLETE)
    expect(context.activeLoad).toEqual(audit.activeLoad)
    expect(() => commercialAuditContextSchema.parse(context)).not.toThrow()
  })
})
