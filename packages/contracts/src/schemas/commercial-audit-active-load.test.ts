import { describe, expect, it } from 'vitest'
import { PROTECTED_SLOT_CAPACITY, WEEKLY_SALES_TIME_SLOTS, WORKLOAD_VARIABILITY } from './onboarding.js'
import { buildAuditDeclaredSignals, type AuditSignalsInput } from './commercial-audit-signals.js'
import { auditActiveLoadSchema, buildAuditActiveLoad } from './commercial-audit-active-load.js'

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — L'ARBITRAGE DE LA CHARGE ACTIVE.
 *
 * Pour chacune des quatre grandeurs, trois témoins :
 *  - un profil COMPLET rend la valeur attendue ET la règle qui la produit ;
 *  - un profil SANS l'entrée rend « non établi », en NOMMANT la réponse qui
 *    manque — jamais un chiffre de repli, jamais 0 ;
 *  - un cas qui prouve que la dérivation sait dire NON (elle refuse de conclure
 *    là où une réponse ne permet pas de compter).
 */

/** Le budget de fronts est LU sur le signal déjà dérivé (#2050.14), jamais recalculé. */
function activeLoadOf(input: AuditSignalsInput) {
  return buildAuditActiveLoad(input, buildAuditDeclaredSignals(input).frontsBudget)
}

const NO_REGULAR_SLOT = WEEKLY_SALES_TIME_SLOTS[6]
const SLOTS_HOLD = PROTECTED_SLOT_CAPACITY[0]

/** Répondu à tout : 10 à 20 h protégées (3 fronts), deux portes directes, deux plages. */
const COMPLETE: AuditSignalsInput = {
  weekly_sales_time_protected: '10 à 20 heures par semaine',
  protected_slot_capacity: SLOTS_HOLD,
  workload_variability: WORKLOAD_VARIABILITY[0],
  weekly_sales_time_slots: [WEEKLY_SALES_TIME_SLOTS[4], WEEKLY_SALES_TIME_SLOTS[0]],
  go_to_market_channels: ["Appels d'offres", 'Direct client final'],
}

describe('#2067.2 — les partenaires à travailler', () => {
  it('profil complet sans porte partenaire : AUCUN partenaire dans la charge active, règle citée', () => {
    expect(activeLoadOf(COMPLETE).partners).toEqual({
      kind: 'noPartnerDoor',
      rule: 'partnerDoorsDeclared',
      doors: ['Direct client final', "Appels d'offres"],
    })
  })

  // #2067.2 — décision Louis du 18/09/2026 : la question « avec combien de
  // partenaires travailles-tu réellement aujourd'hui ? » existe désormais
  // (réguliers / ponctuels, `partners_regular_count` / `partners_occasional_count`).
  // L'ancien état `notAsked` (« aucune question ne le demande ») disparaît avec
  // le manque qu'il nommait.
  it('une porte partenaire ET la réponse : le NOMBRE de partenaires réguliers, règle citée', () => {
    const partners = activeLoadOf({
      ...COMPLETE,
      go_to_market_channels: ['Direct client final', 'Rang 2'],
      partners_regular_count: '2',
      partners_occasional_count: '4-5',
    }).partners
    expect(partners).toEqual({
      kind: 'regularPartners',
      rule: 'regularPartnersDeclared',
      regular: '2',
      occasional: '4-5',
      partnerDoors: ['Rang 2'],
    })
  })

  it('une porte partenaire SANS la réponse : non établi, la question NOMMÉE — jamais un nombre de repli', () => {
    const partners = activeLoadOf({ ...COMPLETE, go_to_market_channels: ['Direct client final', 'Rang 2'] }).partners
    expect(partners).toEqual({ kind: 'answerMissing', missingAnswers: ['partners_regular_count'] })
    // Les ponctuels seuls ne disent pas combien de partenaires sont dans la charge active.
    expect(
      activeLoadOf({ ...COMPLETE, go_to_market_channels: ['Rang 2'], partners_occasional_count: '3' }).partners,
    ).toEqual({ kind: 'answerMissing', missingAnswers: ['partners_regular_count'] })
  })

  it('SAIT DIRE NON — « Je ne sais pas » et une valeur hors catalogue ne deviennent pas un nombre', () => {
    for (const regular of ['Je ne sais pas', 'une dizaine']) {
      expect(
        activeLoadOf({ ...COMPLETE, go_to_market_channels: ['Rang 2'], partners_regular_count: regular }).partners,
      ).toEqual({ kind: 'answerMissing', missingAnswers: ['partners_regular_count'] })
    }
    // Un ponctuel inconnu n'empêche pas le nombre de réguliers : il est tu, pas inventé.
    expect(
      activeLoadOf({
        ...COMPLETE,
        go_to_market_channels: ['Rang 2'],
        partners_regular_count: '0',
        partners_occasional_count: 'Je ne sais pas',
      }).partners,
    ).toMatchObject({ kind: 'regularPartners', regular: '0', occasional: null })
  })

  it('portes non déclarées : non établi, la réponse manquante NOMMÉE', () => {
    expect(activeLoadOf({ ...COMPLETE, go_to_market_channels: undefined }).partners).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['go_to_market_channels'],
    })
  })

  it('SAIT DIRE NON — « Mixte » peut cacher un partenaire : on ne conclut pas « aucun »', () => {
    expect(activeLoadOf({ ...COMPLETE, go_to_market_channels: ['Direct client final', 'Mixte'] }).partners).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['go_to_market_channels'],
    })
  })
})

describe('#2067.4 — les créneaux', () => {
  it('profil complet : les plages DÉCLARÉES, dans l’ordre du catalogue, et ce que la personne dit de leur tenue', () => {
    expect(activeLoadOf(COMPLETE).slots).toEqual({
      kind: 'slots',
      rule: 'declaredTimeSlots',
      slots: [WEEKLY_SALES_TIME_SLOTS[0], WEEKLY_SALES_TIME_SLOTS[4]],
      holding: SLOTS_HOLD,
    })
  })

  it('plages non déclarées : non établi, la réponse manquante NOMMÉE', () => {
    expect(activeLoadOf({ ...COMPLETE, weekly_sales_time_slots: [] }).slots).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['weekly_sales_time_slots'],
    })
  })

  it('SAIT DIRE NON — « au fil de l’eau » n’est jamais un créneau, et une plage hors catalogue ne se devine pas', () => {
    expect(activeLoadOf({ ...COMPLETE, weekly_sales_time_slots: [NO_REGULAR_SLOT] }).slots).toEqual({
      kind: 'noRegularSlot',
      rule: 'declaredTimeSlots',
    })
    expect(activeLoadOf({ ...COMPLETE, weekly_sales_time_slots: ['Le dimanche soir'] }).slots).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['weekly_sales_time_slots'],
    })
  })
})

describe('#2067.5 — la réserve', () => {
  it('profil complet : budget de 3 fronts moins 2 portes ouvertes = 1 front laissé libre, règle citée', () => {
    expect(activeLoadOf(COMPLETE).reserve).toEqual({
      kind: 'reserve',
      rule: 'budgetMinusDoors',
      freeFronts: 1,
      maxFronts: 3,
      doorCount: 2,
      erosionRisks: [],
    })
  })

  it('temps protégé non déclaré : non établi, la réponse manquante NOMMÉE — jamais un budget de repli', () => {
    const { weekly_sales_time_protected: _dropped, ...withoutTime } = COMPLETE
    expect(activeLoadOf(withoutTime).reserve).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['weekly_sales_time_protected'],
    })
    expect(activeLoadOf({}).reserve).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['weekly_sales_time_protected', 'go_to_market_channels'],
    })
  })

  it('SAIT DIRE NON — des portes qui remplissent le budget ne laissent AUCUNE réserve, jamais un nombre négatif', () => {
    const full = activeLoadOf({
      ...COMPLETE,
      weekly_sales_time_protected: '5 à 10 heures par semaine',
      go_to_market_channels: ['Direct client final', 'Rang 2', "Appels d'offres"],
    }).reserve
    expect(full).toEqual({ kind: 'noReserve', rule: 'budgetMinusDoors', maxFronts: 2, doorCount: 3, erosionRisks: [] })
  })

  it('l’érosion déclarée est CITÉE, jamais convertie en malus : le nombre ne bouge pas', () => {
    const eroded = activeLoadOf({
      ...COMPLETE,
      protected_slot_capacity: PROTECTED_SLOT_CAPACITY[1],
      workload_variability: WORKLOAD_VARIABILITY[2],
    }).reserve
    expect(eroded).toMatchObject({ kind: 'reserve', freeFronts: 1 })
    expect(eroded.kind === 'reserve' ? eroded.erosionRisks : []).toEqual([
      PROTECTED_SLOT_CAPACITY[1],
      WORKLOAD_VARIABILITY[2],
    ])
  })
})

describe('#2067.6 — les éléments à reporter', () => {
  it('profil complet dont les portes dépassent le budget : combien reporter, et PARMI QUOI — le choix reste à la personne', () => {
    const deferred = activeLoadOf({
      ...COMPLETE,
      weekly_sales_time_protected: '5 à 10 heures par semaine',
      go_to_market_channels: ['Référencements', 'Direct client final', 'Rang 2', "Appels d'offres"],
    }).deferred
    expect(deferred).toEqual({
      kind: 'toDefer',
      rule: 'doorsMinusBudget',
      count: 2,
      maxFronts: 2,
      candidates: ['Direct client final', 'Rang 2', "Appels d'offres", 'Référencements'],
    })
  })

  it('portes non déclarées : non établi, la réponse manquante NOMMÉE', () => {
    expect(activeLoadOf({ ...COMPLETE, go_to_market_channels: [] }).deferred).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['go_to_market_channels'],
    })
  })

  it('SAIT DIRE NON — tenir dans le budget ne reporte rien, et « Mixte » ne se compte pas', () => {
    expect(activeLoadOf(COMPLETE).deferred).toEqual({
      kind: 'nothingToDefer',
      rule: 'doorsMinusBudget',
      maxFronts: 3,
      doorCount: 2,
    })
    expect(activeLoadOf({ ...COMPLETE, go_to_market_channels: ['Mixte'] }).deferred).toEqual({
      kind: 'answerMissing',
      missingAnswers: ['go_to_market_channels'],
    })
  })

  it('« Aucune heure » est un zéro DÉCLARÉ : tout ce qui est ouvert se reporte', () => {
    expect(
      activeLoadOf({ ...COMPLETE, weekly_sales_time_protected: 'Aucune heure dans une semaine ordinaire' }).deferred,
    ).toMatchObject({ kind: 'toDefer', count: 2, maxFronts: 0 })
  })
})

describe('le contrat — ce que les quatre grandeurs ne portent JAMAIS', () => {
  const cases: AuditSignalsInput[] = [
    COMPLETE,
    {},
    { ...COMPLETE, go_to_market_channels: ['Rang 3', 'Mixte'] },
    { ...COMPLETE, go_to_market_channels: ['Rang 3'], partners_regular_count: '6-10' },
  ]

  it('chaque sortie est valide au contrat', () => {
    for (const input of cases) expect(() => auditActiveLoadSchema.parse(activeLoadOf(input))).not.toThrow()
  })

  it('aucune probabilité, aucun pourcentage, aucun taux (doctrine refusée six fois)', () => {
    for (const input of cases) {
      const serialized = JSON.stringify(activeLoadOf(input))
      expect(serialized).not.toMatch(/%|probab|chance|rate|taux/i)
    }
  })

  it('le contrat REFUSE une réserve « non établie » qui porterait un chiffre de repli', () => {
    const named = { kind: 'answerMissing', missingAnswers: ['go_to_market_channels'] }
    // Le témoin : la forme honnête passe — c'est bien le chiffre ajouté qui est refusé.
    expect(() => auditActiveLoadSchema.shape.reserve.parse(named)).not.toThrow()
    expect(() => auditActiveLoadSchema.shape.reserve.parse({ ...named, freeFronts: 0 })).toThrow()
    // Et une absence qui ne nomme rien n'en est pas une.
    expect(() => auditActiveLoadSchema.shape.reserve.parse({ ...named, missingAnswers: [] })).toThrow()
  })

  it('sans aucune réponse lue, les quatre sont non établies — aucune ne vaut 0', () => {
    const load = buildAuditActiveLoad(null, null)
    expect(Object.values(load).map(quantity => quantity.kind)).toEqual([
      'answerMissing',
      'answerMissing',
      'answerMissing',
      'answerMissing',
    ])
  })
})
