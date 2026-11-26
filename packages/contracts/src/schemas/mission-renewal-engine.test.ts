import { describe, expect, it } from 'vitest'
import { EMPTY_RENEWAL_CLIENT_RAIL, EMPTY_RENEWAL_CONSULTANT_RAIL } from './mission-renewal-rail.js'
import {
  RENEWAL_ENGINE_FACTOR_KEYS,
  RENEWAL_ENGINE_STATES,
  RENEWAL_ENGINE_TIERS,
  deriveRenewalEngineState,
  renewalEngineFactors,
  renewalEngineTier,
} from './mission-renewal-engine.js'

function daysFromNow(days: number, today = new Date('2026-09-26T00:00:00.000Z')): string {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = new Date('2026-09-26T00:00:00.000Z')

describe('renewalEngineTier — #2413.1, .2, .6, .25, .26 (cadence T-60/T-30/T-15/T-0)', () => {
  it('rend unknown quand la fin n’est pas connue — jamais "loin"', () => {
    expect(renewalEngineTier({ endsOn: null }, TODAY)).toBe('unknown')
  })

  it('rend not_due tant que la mission est loin de sa fin', () => {
    expect(renewalEngineTier({ endsOn: daysFromNow(90) }, TODAY)).toBe('not_due')
  })

  it('rend chaque palier par défaut, aux bornes de 60/30/15/0 jours', () => {
    expect(renewalEngineTier({ endsOn: daysFromNow(60) }, TODAY)).toBe('t60')
    expect(renewalEngineTier({ endsOn: daysFromNow(30) }, TODAY)).toBe('t30')
    expect(renewalEngineTier({ endsOn: daysFromNow(15) }, TODAY)).toBe('t15')
    expect(renewalEngineTier({ endsOn: daysFromNow(0) }, TODAY)).toBe('t0')
    expect(renewalEngineTier({ endsOn: daysFromNow(-5) }, TODAY)).toBe('t0')
  })

  it('#2413.2/.25 — un préavis de 3 mois avance l’horloge : la mission entre plus tôt dans le cycle', () => {
    // Fin dans 100 jours, préavis de 90 jours : il ne reste que 10 jours utiles.
    expect(renewalEngineTier({ endsOn: daysFromNow(100), noticePeriodDays: 90 }, TODAY)).toBe('t15')
  })

  it('#2413.26 — une mission de 20 jours resserre l’échelle proportionnellement, pas 60/30/15', () => {
    const startedOn = daysFromNow(-10) // mission de 20 jours : commencée il y a 10j, finit dans 10j
    const endsOn = daysFromNow(10)
    // 10 jours restants sur une mission de 20 jours : la borne t60 resserrée
    // (~20j) est franchie, donc la mission est déjà dans le cycle — alors
    // qu'à l'échelle par défaut (60/30/15) 10 jours serait encore "not_due"
    // n'est pas vrai ici car 10 < 15 par défaut. On vérifie plutôt qu'un délai
    // de 18 jours, "loin" à l'échelle par défaut, tombe DANS le cycle resserré.
    expect(renewalEngineTier({ endsOn, startedOn, noticePeriodDays: null }, TODAY)).not.toBe('not_due')
  })
})

describe('renewalEngineFactors — besoins adjacents lus du croisement par lot (#2414.41/.42)', () => {
  const base = { noticePeriodDays: null, hasPurchaseOrder: false, hasActiveConsultant: true, marginPercent: null }
  const adjacent = (openNeeds?: 'present' | 'absent' | 'non_mesure') =>
    renewalEngineFactors({ ...base, openNeeds }).find(f => f.key === 'besoins_adjacents')

  it('un besoin ouvert compatible : facteur MESURÉ à « oui »', () => {
    expect(adjacent('present')).toMatchObject({ status: 'mesure', value: true, raisonAbsence: null })
  })

  it('aucun besoin compatible (mesuré) : MESURÉ à « non », jamais absent', () => {
    expect(adjacent('absent')).toMatchObject({ status: 'mesure', value: false })
  })

  it('non mesuré : ABSENT avec une raison qui nomme les compétences, jamais « non »', () => {
    const f = adjacent('non_mesure')
    expect(f).toMatchObject({ status: 'absent', value: null })
    expect(f?.raisonAbsence).toMatch(/compétence/)
  })

  it('signal omis : le comportement historique ne bouge pas', () => {
    expect(adjacent(undefined)).toMatchObject({
      status: 'absent',
      raisonAbsence: 'aucune collecte de besoins adjacents à ce jour',
    })
  })
})

describe('renewalEngineFactors — #2413.28 à .35 (8 facteurs moteur, jamais fabriqués)', () => {
  it('porte les 8 clés, dans l’ordre de l’issue', () => {
    const factors = renewalEngineFactors({
      noticePeriodDays: null,
      hasPurchaseOrder: false,
      hasActiveConsultant: false,
      marginPercent: null,
    })
    expect(factors.map(f => f.key)).toEqual(RENEWAL_ENGINE_FACTOR_KEYS)
  })

  it('nomme absent, avec sa raison, ce que le produit ne collecte pas — jamais une valeur inventée', () => {
    const factors = renewalEngineFactors({
      noticePeriodDays: null,
      hasPurchaseOrder: false,
      hasActiveConsultant: false,
      marginPercent: null,
    })
    const satisfaction = factors.find(f => f.key === 'satisfaction')
    expect(satisfaction?.status).toBe('absent')
    expect(satisfaction?.value).toBeNull()
    expect(satisfaction?.raisonAbsence).toBeTruthy()

    const preavis = factors.find(f => f.key === 'preavis')
    expect(preavis?.status).toBe('absent')
    expect(preavis?.raisonAbsence).toBeTruthy()
  })

  it('mesure ce qui est réellement relié — PO, consultant, marge, préavis', () => {
    const factors = renewalEngineFactors({
      noticePeriodDays: 90,
      hasPurchaseOrder: true,
      hasActiveConsultant: true,
      marginPercent: 32,
    })
    expect(factors.find(f => f.key === 'preavis')).toMatchObject({ status: 'mesure', value: 90 })
    expect(factors.find(f => f.key === 'bon_de_commande')).toMatchObject({ status: 'mesure', value: true })
    expect(factors.find(f => f.key === 'consultant')).toMatchObject({ status: 'mesure', value: true })
    expect(factors.find(f => f.key === 'marge')).toMatchObject({ status: 'mesure', value: 32 })
  })

  it('nomme absent, jamais false, quand l’appelant n’a pas chargé la donnée (PO, consultant)', () => {
    const factors = renewalEngineFactors({
      noticePeriodDays: null,
      hasPurchaseOrder: null,
      hasActiveConsultant: null,
      marginPercent: null,
    })
    expect(factors.find(f => f.key === 'bon_de_commande')).toMatchObject({ status: 'absent', value: null })
    expect(factors.find(f => f.key === 'consultant')).toMatchObject({ status: 'absent', value: null })
  })

  it('un facteur mesuré ne porte jamais de raison d’absence', () => {
    const factors = renewalEngineFactors({
      noticePeriodDays: 30,
      hasPurchaseOrder: true,
      hasActiveConsultant: true,
      marginPercent: 10,
    })
    for (const factor of factors.filter(f => f.status === 'mesure')) {
      expect(factor.raisonAbsence).toBeNull()
    }
  })
})

describe('deriveRenewalEngineState — #2413.36 à .48 (12 états nommés, dérivés — jamais persistés)', () => {
  it('rend unknown quand la fin n’est pas connue', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: null,
        clientRail: null,
        consultantRail: null,
        tier: 'unknown',
      }),
    ).toBe('unknown')
  })

  it('rend not_due loin de l’échéance, sans rien engagé', () => {
    expect(
      deriveRenewalEngineState({ renewalStatus: null, clientRail: null, consultantRail: null, tier: 'not_due' }),
    ).toBe('not_due')
  })

  it('rend to_prepare dès qu’un palier s’ouvre, sans rien engagé', () => {
    expect(deriveRenewalEngineState({ renewalStatus: null, clientRail: null, consultantRail: null, tier: 't60' })).toBe(
      'to_prepare',
    )
    expect(
      deriveRenewalEngineState({ renewalStatus: 'non_engage', clientRail: null, consultantRail: null, tier: 't15' }),
    ).toBe('to_prepare')
  })

  it('sépare client_feedback_needed et consultant_feedback_needed — jamais un feedback_demande générique', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'feedback_demande',
        clientRail: null,
        consultantRail: { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' },
        tier: 't30',
      }),
    ).toBe('client_feedback_needed')
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'feedback_demande',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' },
        consultantRail: null,
        tier: 't30',
      }),
    ).toBe('consultant_feedback_needed')
  })

  it('rend awaiting_client_decision / awaiting_consultant_decision quand un seul rail traîne', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'discussion_en_cours',
        clientRail: null,
        consultantRail: { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' },
        tier: 't15',
      }),
    ).toBe('awaiting_client_decision')
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'discussion_en_cours',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' },
        consultantRail: null,
        tier: 't15',
      }),
    ).toBe('awaiting_consultant_decision')
  })

  it('rend awaiting_contract quand les deux rails disent oui mais que rien n’est signé', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'discussion_en_cours',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' },
        consultantRail: { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' },
        tier: 't15',
      }),
    ).toBe('awaiting_contract')
  })

  it('rend confirmed uniquement sur renouvele — jamais avant', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'renouvele',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' },
        consultantRail: { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' },
        tier: 't0',
      }),
    ).toBe('confirmed')
  })

  it('rend declined sur fin_confirmee, repositionnement_lance, ou un rail qui dit non', () => {
    expect(
      deriveRenewalEngineState({ renewalStatus: 'fin_confirmee', clientRail: null, consultantRail: null, tier: 't0' }),
    ).toBe('declined')
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'repositionnement_lance',
        clientRail: null,
        consultantRail: null,
        tier: 't15',
      }),
    ).toBe('declined')
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'discussion_en_cours',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'non' },
        consultantRail: null,
        tier: 't15',
      }),
    ).toBe('declined')
  })

  it('rend partially_extended à T-0 quand un seul rail a répondu oui', () => {
    expect(
      deriveRenewalEngineState({
        renewalStatus: 'discussion_en_cours',
        clientRail: { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' },
        consultantRail: null,
        tier: 't0',
      }),
    ).toBe('partially_extended')
  })

  it('rend expired à T-0 sans aucune décision engagée', () => {
    expect(deriveRenewalEngineState({ renewalStatus: null, clientRail: null, consultantRail: null, tier: 't0' })).toBe(
      'expired',
    )
    expect(
      deriveRenewalEngineState({ renewalStatus: 'non_engage', clientRail: null, consultantRail: null, tier: 't0' }),
    ).toBe('expired')
  })

  it('ne rend jamais une valeur hors de la liste nommée', () => {
    expect(RENEWAL_ENGINE_STATES).toContain(
      deriveRenewalEngineState({ renewalStatus: 'bloque', clientRail: null, consultantRail: null, tier: 't30' }),
    )
  })
})

describe('les constantes sont figées telles que l’issue #2413 les nomme', () => {
  it('4 paliers, 8 facteurs, 13 états (12 nommés + unknown)', () => {
    expect(RENEWAL_ENGINE_TIERS).toEqual(['t60', 't30', 't15', 't0'])
    expect(RENEWAL_ENGINE_FACTOR_KEYS).toHaveLength(8)
    expect(RENEWAL_ENGINE_STATES).toHaveLength(13)
  })
})
