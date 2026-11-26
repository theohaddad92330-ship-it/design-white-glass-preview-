import { describe, expect, it } from 'vitest'
import type {
  BusinessCurrent,
  BusinessMonth,
  MonthlyClientMovement,
  TreasuryMonthView,
  TreasuryView,
} from '@/lib/business-metrics'
import type { BellumMargin } from '@/lib/costs'
import {
  LIBELLES_MOUVEMENT,
  ligneMouvementAffichee,
  messageMouvementsVides,
  pourcentageVariation,
  tuileAttrition,
  tuileBurn,
  tuileClients,
  tuileMarge,
  tuileMrr,
  tuileRunway,
} from './cockpit-business.logic'

/**
 * #1646.1 — les six tuiles du cockpit business, et #1646.4 — pourquoi le
 * tableau des mouvements par client est vide.
 *
 * Tout est pur : aucune horloge, aucune requête. C'est ici que « non mesuré »
 * pourrait s'écrire « 0 » ou « 0 % » par erreur — donc c'est ici que ça se
 * teste, comme `revenus.logic.test.ts` et `couts.logic.ts` le font déjà pour
 * les mêmes chiffres.
 */

// `Intl` sépare le nombre de son unité par une espace fine INSÉCABLE (U+202F) ;
// la nuance change selon la version d'ICU embarquée. Comparer des chaînes
// brutes ferait rougir ce fichier sur une autre machine sans qu'aucun calcul
// n'ait bougé — même remède que `revenus.logic.test.ts`.
function espacesNormales(texte: string | null): string | null {
  return texte === null ? null : texte.replace(/\s/g, ' ')
}

const AOUT: BusinessMonth = {
  month: '2026-08',
  mrrStartCents: 1_120_000,
  mrrNewCents: 90_000,
  mrrExpansionCents: 58_000,
  mrrContractionCents: 0,
  mrrChurnedCents: 20_000,
  mrrEndCents: 1_248_000,
  customersStart: 15,
  customersNew: 2,
  customersChurned: 1,
  customersEnd: 16,
  contractedRevenueCents: 320_000,
  contractedCustomers: 3,
  oneOffCents: 0,
  oneOffCustomers: 0,
  computedAt: '2026-09-01T02:00:00.000Z',
}

const PREMIER: BusinessMonth = {
  ...AOUT,
  month: '2026-05',
  mrrStartCents: null,
  mrrNewCents: null,
  mrrExpansionCents: null,
  mrrContractionCents: null,
  mrrChurnedCents: null,
  mrrEndCents: 1_000_000,
  customersStart: null,
  customersNew: null,
  customersChurned: null,
  customersEnd: 13,
}

const CURRENT: BusinessCurrent = {
  mrrCents: 1_300_000,
  customers: 17,
  contractedRevenueCents: 320_000,
  contractedCustomers: 3,
  oneOffCents: 0,
  oneOffCustomers: 0,
}

function treasuryMonth(month: string, burnCents: number | null): TreasuryMonthView {
  return {
    month,
    bankBalanceCents: 5_000_000,
    fixedExpensesCents: 400_000,
    variableExpensesCents: 100_000,
    collectedCents: 300_000,
    burnCents,
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: 'louis@bellum-it.com',
  }
}

const TREASURY_DEUX_MOIS: TreasuryView = {
  months: [treasuryMonth('2026-07', 300_000), treasuryMonth('2026-08', 240_000)],
  latestMonth: '2026-08',
  averageBurn: { measured: true, cents: 270_000, monthsUsed: 2 },
  runway: { measured: true, months: 18, averageBurnCents: 270_000 },
}

const TREASURY_VIDE: TreasuryView = {
  months: [],
  latestMonth: null,
  averageBurn: null,
  runway: null,
}

describe('pourcentageVariation — jamais 0 % pour une absence', () => {
  it('calcule un pourcentage normal', () => {
    expect(pourcentageVariation(120, 100)).toBeCloseTo(20)
    expect(pourcentageVariation(80, 100)).toBeCloseTo(-20)
  })

  it('rend null si un terme manque — jamais 0', () => {
    expect(pourcentageVariation(null, 100)).toBeNull()
    expect(pourcentageVariation(100, null)).toBeNull()
    expect(pourcentageVariation(null, null)).toBeNull()
  })

  it('rend null si la référence n’est pas strictement positive — pas de division absurde', () => {
    expect(pourcentageVariation(100, 0)).toBeNull()
    expect(pourcentageVariation(100, -50)).toBeNull()
  })
})

describe('tuileMrr et tuileClients', () => {
  it('MRR : valeur formatée, delta vs le dernier mois figé', () => {
    const tuile = tuileMrr(CURRENT, AOUT)
    expect(espacesNormales(typeof tuile.value === 'string' ? tuile.value : null)).toBe('13 000 €')
    expect(tuile.delta).toBeCloseTo(((1_300_000 - 1_248_000) / 1_248_000) * 100)
    expect(tuile.period).toContain('Août 2026')
  })

  it('MRR : sans mois figé, delta non mesuré — jamais 0 %', () => {
    const tuile = tuileMrr(CURRENT, null)
    expect(tuile.delta).toBeNull()
    expect(tuile.period).not.toMatch(/^vs /)
  })

  it('Clients : compte brut, delta vs le dernier mois figé', () => {
    const tuile = tuileClients(CURRENT, AOUT)
    expect(tuile.value).toBe(17)
    expect(tuile.delta).toBeCloseTo(((17 - 16) / 16) * 100)
  })
})

describe('tuileAttrition — réutilise metriquesDerivees, ne le refait pas', () => {
  it('mesure le churn logo du dernier mois figé quand un mois précédent existe', () => {
    const tuile = tuileAttrition([PREMIER, AOUT])
    expect(tuile.value).not.toBeNull()
    expect(typeof tuile.value).toBe('string')
    expect(tuile.period).toContain('Août 2026')
  })

  it('un seul mois figé (aucun terme de comparaison) : « — », pas 0 %', () => {
    const tuile = tuileAttrition([PREMIER])
    expect(tuile.value).toBeNull()
    expect(tuile.period.length).toBeGreaterThan(10)
  })

  it('série vide : « — », pas 0 %', () => {
    const tuile = tuileAttrition([])
    expect(tuile.value).toBeNull()
  })

  it('le delta reste TOUJOURS non mesuré — documenté, pas silencieux', () => {
    expect(tuileAttrition([PREMIER, AOUT]).delta).toBeNull()
    expect(tuileAttrition([]).delta).toBeNull()
  })
})

describe('tuileMarge — réutilise lectureDeLaMarge, ne le refait pas', () => {
  it('aucune marge (panne) : valeur null, raison non vide, delta non mesuré', () => {
    const tuile = tuileMarge(null, 'Endpoint marge: 503 Service Unavailable')
    expect(tuile.value).toBeNull()
    expect(tuile.period.length).toBeGreaterThan(10)
    expect(tuile.delta).toBeNull()
  })

  it('marge bloquée par le mésappariement de devise : refus lisible, pas un 0 %', () => {
    const marge: BellumMargin = {
      measurability: { measurable: true, observed: 40, required: 30, missing: 0 },
      marginRate: null,
      blockedReason: 'currency_mismatch',
      fixedCostsExcluded: [],
      isFloor: false,
    }
    const tuile = tuileMarge(marge, null)
    expect(tuile.value).toBeNull()
    expect(tuile.period).toContain('EUR')
  })

  it('marge mesurée : le pourcentage arrondi de `lectureDeLaMarge`', () => {
    const marge: BellumMargin = {
      measurability: { measurable: true, observed: 40, required: 30, missing: 0 },
      marginRate: 0.42,
      blockedReason: null,
      fixedCostsExcluded: [],
      isFloor: false,
    }
    const tuile = tuileMarge(marge, null)
    expect(tuile.value).toBe('42 %')
    expect(tuile.delta).toBeNull()
  })
})

describe('tuileBurn et tuileRunway', () => {
  it('Burn : dernier mois saisi, delta vs le mois précédent', () => {
    const tuile = tuileBurn(TREASURY_DEUX_MOIS)
    expect(espacesNormales(typeof tuile.value === 'string' ? tuile.value : null)).toBe('2 400 €')
    expect(tuile.delta).toBeCloseTo(((240_000 - 300_000) / 300_000) * 100)
  })

  it('Burn : aucun mois saisi — « — », pas 0 €, delta non mesuré', () => {
    const tuile = tuileBurn(TREASURY_VIDE)
    expect(tuile.value).toBe('—')
    expect(tuile.delta).toBeNull()
  })

  it('Burn : un seul mois saisi — pas de terme de comparaison pour le delta', () => {
    const uneSeule: TreasuryView = { ...TREASURY_DEUX_MOIS, months: [treasuryMonth('2026-08', 240_000)] }
    expect(tuileBurn(uneSeule).delta).toBeNull()
  })

  it('Runway : réutilise `libelleRunway`, delta toujours non mesuré', () => {
    const tuile = tuileRunway(TREASURY_DEUX_MOIS)
    expect(tuile.value).toBe('18 mois')
    expect(tuile.delta).toBeNull()
  })

  it('Runway non mesurable : la raison de `libelleRunway`, pas un tiret muet', () => {
    const tuile = tuileRunway(TREASURY_VIDE)
    expect(tuile.value).toBeNull()
    expect(tuile.period.length).toBeGreaterThan(5)
  })
})

describe('ligneMouvementAffichee — #1646.6, le tableau réel', () => {
  it('formate le montant et le mois, et nomme un client connu', () => {
    const ligne = ligneMouvementAffichee({
      client: 'Acme ESN',
      nature: 'expansion',
      montantCents: 5_000,
      month: '2026-08',
    })
    expect(ligne.client).toBe('Acme ESN')
    expect(ligne.nature).toBe('expansion')
    expect(espacesNormales(ligne.montant)).toBe('50 €')
    expect(ligne.date).toContain('Août 2026')
  })

  it('un client `null` (aucun espace ni profil connu) devient un texte NOMMÉ, jamais un id brut', () => {
    const ligne = ligneMouvementAffichee({ client: null, nature: 'nouveau', montantCents: 1_000, month: '2026-08' })
    expect(ligne.client).toBe('Client non identifié')
  })
})

describe('messageMouvementsVides — trois refus, trois phrases DISTINCTES', () => {
  it('aucun mois figé du tout', () => {
    expect(messageMouvementsVides(null, [])).toMatch(/aucun mois figé/i)
  })

  it('le dernier mois figé est le PREMIER de la série — pas de terme de comparaison', () => {
    expect(messageMouvementsVides(PREMIER, [])).toMatch(/premier mois/i)
  })

  it('un mois avec un précédent, mesuré, sans aucun mouvement — MESURÉ, pas « non mesurable »', () => {
    const message = messageMouvementsVides(AOUT, [])
    expect(message).toMatch(/aucun mouvement mesuré/i)
    expect(message).not.toMatch(/non mesurable|premier mois|aucun mois figé/i)
  })

  it('des lignes existent → pas de message, on rend le tableau', () => {
    const lignes: MonthlyClientMovement[] = [
      { client: 'Acme ESN', nature: 'nouveau', montantCents: 1_000, month: '2026-08' },
    ]
    expect(messageMouvementsVides(AOUT, lignes)).toBeNull()
  })
})

describe('LIBELLES_MOUVEMENT — les quatre natures de #1646.4, et rien d’autre', () => {
  it('couvre exactement nouveau / expansion / contraction / attrition', () => {
    expect(Object.keys(LIBELLES_MOUVEMENT).sort()).toEqual(['attrition', 'contraction', 'expansion', 'nouveau'].sort())
  })

  it('chaque libellé est un texte non vide', () => {
    for (const libelle of Object.values(LIBELLES_MOUVEMENT)) {
      expect(libelle.length).toBeGreaterThan(0)
    }
  })
})
