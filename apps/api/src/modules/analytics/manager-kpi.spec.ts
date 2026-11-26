import { FIXED_COST_FAMILIES_UNMEASURED } from '@bellum/contracts'
import {
  ACTIVE_WINDOW_DAYS,
  computeConsultantsRegisteredByRep,
  computeValidatedActionCadence,
  measureActiveCohortAtDay7,
  measureActiveCohortAtDay30,
  measureBellumGrossMargin,
  measureRetentionAtThreeMonths,
  type ApprovalRequestRecord,
  type CohortMember,
  type ConsultantRegistration,
} from './manager-kpi'

const DAY = 86_400_000
const NOW = new Date('2026-08-30T12:00:00.000Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY)

function member(userId: string, signedUpDaysAgo: number, lastActionDaysAgo: number | null): CohortMember {
  return {
    userId,
    signupAt: daysAgo(signedUpDaysAgo),
    lastActionAt: lastActionDaysAgo == null ? null : daysAgo(lastActionDaysAgo),
  }
}

describe('1 · cohorte des actifs à J+30', () => {
  it('rend « non mesuré », jamais 0 %, quand personne n’est arrivé dans la fenêtre', () => {
    // Dénominateur vide — le piège qui revient le plus souvent dans ce dépôt.
    const measure = measureActiveCohortAtDay30([], NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability).toMatchObject({ measurable: false, observed: 0 })
  })

  it('rend « non mesuré » sous le seuil minimal, même avec une cohorte non vide', () => {
    const users = [member('u1', 30, 1), member('u2', 32, 2), member('u3', 33, null)]
    const measure = measureActiveCohortAtDay30(users, NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability).toMatchObject({ measurable: false, observed: 3, required: 10, missing: 7 })
  })

  it('calcule le taux dès que la cohorte atteint le seuil', () => {
    // 10 arrivés dans la fenêtre [30j, 37j) ; 4 encore actifs (< 14j).
    const users = [
      ...Array.from({ length: 4 }, (_, i) => member(`active-${i}`, 30 + i * 0.5, 5)),
      ...Array.from({ length: 6 }, (_, i) => member(`inactive-${i}`, 30 + i * 0.5, 20)),
    ]
    const measure = measureActiveCohortAtDay30(users, NOW)
    expect(measure.measurability.measurable).toBe(true)
    expect(measure.value).toBeCloseTo(0.4)
  })

  it('un utilisateur jamais actif compte dans la cohorte, jamais comme actif', () => {
    const users = [
      ...Array.from({ length: 9 }, (_, i) => member(`seen-${i}`, 30 + i * 0.5, 5)),
      member('never', 31, null),
    ]
    const measure = measureActiveCohortAtDay30(users, NOW)
    expect(measure.measurability.observed).toBe(10)
    expect(measure.value).toBeCloseTo(0.9)
  })

  it('exclut un utilisateur arrivé trop récemment, même s’il est très actif', () => {
    const cohort = Array.from({ length: 10 }, (_, i) => member(`cohort-${i}`, 30 + i * 0.5, 5))
    const tooRecent = member('too-recent', 10, 1) // arrivé il y a 10 jours, pas 30
    const measure = measureActiveCohortAtDay30([...cohort, tooRecent], NOW)
    expect(measure.measurability.observed).toBe(10) // pas 11
  })

  it('exclut un utilisateur arrivé trop tôt (hors de la largeur de cohorte de 7 jours)', () => {
    const cohort = Array.from({ length: 10 }, (_, i) => member(`cohort-${i}`, 30 + i * 0.5, 5))
    const tooOld = member('too-old', 40, 1) // arrivé il y a 40 jours : hors [30, 37)
    const measure = measureActiveCohortAtDay30([...cohort, tooOld], NOW)
    expect(measure.measurability.observed).toBe(10)
  })

  it('respecte la fenêtre « actif » de 14 jours à la borne', () => {
    const cohort = Array.from({ length: 9 }, (_, i) => member(`cohort-${i}`, 30 + i * 0.5, 20))
    const onBoundary = member('boundary', 30, ACTIVE_WINDOW_DAYS) // exactement 14 jours : inclus (>=)
    const measure = measureActiveCohortAtDay30([...cohort, onBoundary], NOW)
    expect(measure.measurability.observed).toBe(10)
    expect(measure.value).toBeCloseTo(1 / 10)
  })
})

describe('#1946.14 — cohorte des actifs à J+7', () => {
  // La fenêtre de cohorte : arrivés il y a 7 à 13 jours (bornes déjà éprouvées
  // par le J+30 ci-dessus, même moteur).
  const cohorteJ7 = (actifDepuisJours: number | null, n = 10): CohortMember[] =>
    Array.from({ length: n }, (_, i) => member(`u-${i}`, 7 + i * 0.5, actifDepuisJours))

  it('rend « non mesuré », jamais 0 %, quand personne n’est arrivé dans la fenêtre', () => {
    const measure = measureActiveCohortAtDay7([], NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability).toMatchObject({ measurable: false, observed: 0 })
  })

  it('applique le MÊME seuil de mesurabilité que les deux autres repères', () => {
    const measure = measureActiveCohortAtDay7(cohorteJ7(2, 9), NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability).toMatchObject({ measurable: false, observed: 9, required: 10 })
  })

  it('calcule le taux dès que la cohorte atteint le seuil', () => {
    const users = [...cohorteJ7(2, 4).map((u, i) => ({ ...u, userId: `a-${i}` })), ...cohorteJ7(30, 6)]
    const measure = measureActiveCohortAtDay7(users, NOW)
    expect(measure.measurability.measurable).toBe(true)
    expect(measure.value).toBeCloseTo(0.4)
  })

  // ⚠️ LE TEST QUI PORTE LA CONCEPTION. Avec la fenêtre d'activité de 14 jours
  // des deux autres repères, un utilisateur arrivé il y a 10 jours dont la SEULE
  // action est celle de son inscription serait compté « encore actif » : le J+7
  // mesurerait « a fait au moins un geste un jour », c'est-à-dire l'activation,
  // et il vaudrait 100 % en permanence. La fenêtre d'activité ne dépasse donc
  // jamais le repère lui-même.
  it('#1946.14 — l’action du jour d’inscription ne compte JAMAIS comme un usage à J+7', () => {
    const users = Array.from({ length: 10 }, (_, i) => member(`signup-only-${i}`, 10, 10))
    const measure = measureActiveCohortAtDay7(users, NOW)
    expect(measure.measurability.measurable).toBe(true)
    expect(measure.value).toBe(0)
  })

  // Le témoin du cas voisin légitime : le J+30 garde sa fenêtre de 14 jours,
  // inchangée — le rétrécissement ne vaut que là où le repère est plus court.
  it('#1946.14 — ne déborde pas sur le J+30, dont la fenêtre d’activité reste 14 jours', () => {
    expect(ACTIVE_WINDOW_DAYS).toBe(14)
    const users = Array.from({ length: 10 }, (_, i) => member(`u-${i}`, 30 + i * 0.5, 13))
    expect(measureActiveCohortAtDay30(users, NOW).value).toBe(1)
  })
})

describe('2 · rétention à 3 mois', () => {
  it('rend « non mesuré », jamais 0 %, sur une cohorte vide', () => {
    const measure = measureRetentionAtThreeMonths([], NOW)
    expect(measure.value).toBeNull()
    expect(measure.measurability.measurable).toBe(false)
  })

  it('utilise le même moteur que J+30, à un horizon de 90 jours', () => {
    const stillActive = Array.from({ length: 3 }, (_, i) => member(`ret-active-${i}`, 90 + i, 5))
    const churned = Array.from({ length: 7 }, (_, i) => member(`ret-churned-${i}`, 90 + i, 60))
    const measure = measureRetentionAtThreeMonths([...stillActive, ...churned], NOW)
    expect(measure.measurability.measurable).toBe(true)
    expect(measure.value).toBeCloseTo(0.3)
  })

  it('la cohorte de rétention est plus large (30 jours) que celle du J+30 (7 jours)', () => {
    // Arrivé il y a 115 jours : entre dans la fenêtre de rétention [90, 120),
    // mais serait hors d'une fenêtre de 7 jours.
    const wideCohort = Array.from({ length: 10 }, (_, i) => member(`wide-${i}`, 90 + i * 3, 5))
    const measure = measureRetentionAtThreeMonths(wideCohort, NOW)
    expect(measure.measurability.observed).toBe(10)
  })
})

describe('3 · marge brute de BELLUM (pas celle de l’ESN cliente)', () => {
  it('refuse de mélanger les devises — « Bellum ne convertit rien »', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'usd', cents: 40_000 },
      untariffedCostLines: 0,
      paidAccounts: 20,
    })
    expect(result.marginRate).toBeNull()
    expect(result.blockedReason).toBe('currency_mismatch')
    expect(result.measurability.measurable).toBe(false)
  })

  it('rend « non mesuré », jamais 0 %, quand le revenu est nul sur la fenêtre', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 0 },
      variableCost: { currency: 'eur', cents: 0 },
      untariffedCostLines: 0,
      paidAccounts: 5, // l'échantillon suffit ; c'est le dénominateur qui est vide
    })
    expect(result.marginRate).toBeNull()
    expect(result.blockedReason).toBeNull()
  })

  it('rend « non mesuré » sous le seuil de comptes payants, même avec un revenu réel', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'eur', cents: 40_000 },
      untariffedCostLines: 0,
      paidAccounts: 2,
    })
    expect(result.marginRate).toBeNull()
    expect(result.measurability).toMatchObject({ measurable: false, observed: 2, required: 5 })
  })

  it('calcule (revenu − coût) ÷ revenu quand tout est mesurable', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'eur', cents: 25_000 },
      untariffedCostLines: 0,
      paidAccounts: 10,
    })
    expect(result.measurability.measurable).toBe(true)
    expect(result.marginRate).toBeCloseTo(0.75)
    expect(result.blockedReason).toBeNull()
  })

  it('signale un coût PLANCHER dès qu’une ligne n’a pas de prix', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'eur', cents: 25_000 },
      untariffedCostLines: 3,
      paidAccounts: 10,
    })
    expect(result.isFloor).toBe(true)
  })

  it('n’est jamais un plancher quand toutes les lignes de coût sont tarifées', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'eur', cents: 25_000 },
      untariffedCostLines: 0,
      paidAccounts: 10,
    })
    expect(result.isFloor).toBe(false)
  })

  it('porte toujours la liste des coûts FIXES exclus, importée telle quelle', () => {
    const result = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 100_000 },
      variableCost: { currency: 'eur', cents: 25_000 },
      untariffedCostLines: 0,
      paidAccounts: 10,
    })
    expect(result.fixedCostsExcluded).toBe(FIXED_COST_FAMILIES_UNMEASURED)
    expect(result.fixedCostsExcluded.length).toBeGreaterThan(0)
  })
})

describe('4 · cadence d’actions validées par semaine', () => {
  function approval(state: ApprovalRequestRecord['state'], decidedDaysAgo: number | null): ApprovalRequestRecord {
    return { state, decidedAt: decidedDaysAgo == null ? null : daysAgo(decidedDaysAgo) }
  }

  it('rend des semaines à ZÉRO — un vrai zéro, pas « non mesuré » — quand rien n’a été validé', () => {
    const weeks = computeValidatedActionCadence([], NOW, 4)
    expect(weeks).toHaveLength(4)
    expect(weeks.every(week => week.validated === 0)).toBe(true)
  })

  it('ne compte que les demandes APPROUVÉES, jamais les autres états', () => {
    // 10 jours : dans une semaine COMPLÈTE, jamais dans la semaine en cours,
    // quel que soit le jour de la semaine où tourne le test.
    const approvals = [
      approval('approved', 10),
      approval('pending', 10),
      approval('rejected', 10),
      approval('expired', 10),
    ]
    const weeks = computeValidatedActionCadence(approvals, NOW, 3)
    const total = weeks.reduce((sum, w) => sum + w.validated, 0)
    expect(total).toBe(1)
  })

  it('ignore une demande approuvée sans date de décision', () => {
    const weeks = computeValidatedActionCadence([{ state: 'approved', decidedAt: null }], NOW, 2)
    expect(weeks.reduce((sum, w) => sum + w.validated, 0)).toBe(0)
  })

  it('exclut la semaine EN COURS, même si elle contient une validation', () => {
    const thisWeek = approval('approved', 1) // décidée hier : dans la semaine en cours
    const weeks = computeValidatedActionCadence([thisWeek], NOW, 4)
    expect(weeks.reduce((sum, w) => sum + w.validated, 0)).toBe(0)
    // La dernière semaine rendue se termine avant "maintenant".
    expect(new Date(weeks[weeks.length - 1]!.weekEnd).getTime()).toBeLessThanOrEqual(NOW.getTime())
  })

  it('range chaque validation dans SA semaine, pas dans une voisine', () => {
    const approvals = [approval('approved', 8), approval('approved', 9), approval('approved', 15)]
    const weeks = computeValidatedActionCadence(approvals, NOW, 3)
    expect(weeks.map(w => w.validated)).toEqual([0, 1, 2])
  })

  it('borne le nombre de semaines à [1, 52]', () => {
    expect(computeValidatedActionCadence([], NOW, 0)).toHaveLength(1)
    expect(computeValidatedActionCadence([], NOW, 999)).toHaveLength(52)
  })
})

describe('5 · consultants enregistrés par commercial', () => {
  function registration(userId: string, createdDaysAgo: number): ConsultantRegistration {
    return { userId, createdAt: daysAgo(createdDaysAgo) }
  }

  const window = { from: daysAgo(30), to: NOW }

  it('rend une liste VIDE — un vrai zéro — quand personne n’a rien enregistré', () => {
    expect(computeConsultantsRegisteredByRep([], window)).toEqual([])
  })

  it('compte par commercial (par `user_id`), pas globalement', () => {
    const rows = [registration('rep-a', 5), registration('rep-a', 10), registration('rep-b', 3)]
    const result = computeConsultantsRegisteredByRep(rows, window)
    expect(result).toEqual([
      { userId: 'rep-a', registered: 2 },
      { userId: 'rep-b', registered: 1 },
    ])
  })

  it('exclut les fiches hors fenêtre', () => {
    const rows = [registration('rep-a', 5), registration('rep-a', 45)] // 45j : hors la fenêtre de 30j
    const result = computeConsultantsRegisteredByRep(rows, window)
    expect(result).toEqual([{ userId: 'rep-a', registered: 1 }])
  })

  it('ne complète PAS à zéro les commerciaux absents de la table (D438)', () => {
    // Aucune notion d'effectif d'espace n'entre dans ce calcul : un commercial
    // sans consultant enregistré est absent de la liste, jamais prouvé à zéro.
    const result = computeConsultantsRegisteredByRep([registration('rep-a', 5)], window)
    expect(result.find(row => row.userId === 'rep-b')).toBeUndefined()
  })
})

describe('GA-144 — un dénominateur vide ne devient jamais un pourcentage', () => {
  it('lit bien les trois indicateurs qui divisent (cohorte J+30, rétention, marge Bellum)', () => {
    // Preuve que la garde n'est pas vide (`expect.anything()` ne garde rien).
    const cohort = measureActiveCohortAtDay30([], NOW)
    const retention = measureRetentionAtThreeMonths([], NOW)
    const margin = measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: 0 },
      variableCost: { currency: 'eur', cents: 0 },
      untariffedCostLines: 0,
      paidAccounts: 0,
    })
    for (const measure of [cohort, retention, { value: margin.marginRate, measurability: margin.measurability }]) {
      expect(measure.value).toBeNull()
      expect(measure.measurability.measurable).toBe(false)
    }
  })

  it('sait dire NON : une division naïve, sans le garde, PRODUIRAIT un zéro trompeur', () => {
    // Ce que ce fichier REFUSE de faire, écrit une fois pour que la garde
    // puisse le reconnaître si quelqu'un le réintroduit :
    const naiveRate = (numerator: number, denominator: number): number => numerator / denominator
    // Un dénominateur nul donnerait NaN, pas 0 — donc la version encore plus
    // trompeuse est `0 / denominator` avec un dénominateur RÉEL nul ailleurs :
    expect(Number.isNaN(naiveRate(0, 0))).toBe(true) // ce que le code naïf produirait
    // …alors que les fonctions réelles de ce fichier refusent avant d'y arriver :
    const cohort = measureActiveCohortAtDay30([], NOW)
    expect(cohort.value).not.toBe(0)
    expect(cohort.value).toBeNull()
  })
})
