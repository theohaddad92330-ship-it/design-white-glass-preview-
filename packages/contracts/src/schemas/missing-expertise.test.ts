import { describe, expect, it } from 'vitest'
import {
  MISSING_EXPERTISE_THRESHOLDS,
  detectMissingExpertise,
  unaddressedRevenueCents,
  type RefusedNeed,
} from './missing-expertise.js'

/**
 * Le détecteur d'expertise manquante — PDF4ATS §8.4.
 *
 * « Trois besoins refusés sur la même compétence en un trimestre, et personne ne
 * fait le lien. » Le dépôt compte les refus par MOTIF (`unstaffableByReason`) et
 * jamais par COMPÉTENCE : la donnée existe, l'axe d'agrégation non.
 */

function need(over: Partial<RefusedNeed> = {}): RefusedNeed {
  return {
    needId: '11111111-1111-4111-8111-111111111111',
    title: 'Ingénieur plateforme',
    canonicalSkills: ['kubernetes'],
    refusedAt: '2026-08-01T09:00:00.000Z',
    targetDayRateCents: 62_000,
    startOn: '2026-09-01',
    durationMonths: 12,
    ...over,
  }
}

describe('detectMissingExpertise — le seuil des trois refus', () => {
  it('ne dit rien à DEUX refus sur la même compétence', () => {
    const found = detectMissingExpertise(
      [need({ needId: 'a' }), need({ needId: 'b' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toEqual([])
  })

  it('signale à TROIS refus sur la même compétence canonique', () => {
    const found = detectMissingExpertise(
      [need({ needId: 'a' }), need({ needId: 'b' }), need({ needId: 'c' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.skill).toBe('kubernetes')
    expect(found[0]?.refusedCount).toBe(3)
  })

  it('regroupe des ALIAS sur la compétence canonique — c’est tout l’intérêt', () => {
    // « k8s », « kube » et « kubernetes » sont la même absence dans le vivier.
    // Comptés séparément, aucun n'atteint jamais trois.
    const found = detectMissingExpertise(
      [
        need({ needId: 'a', canonicalSkills: ['kubernetes'] }),
        need({ needId: 'b', canonicalSkills: ['kubernetes'] }),
        need({ needId: 'c', canonicalSkills: ['kubernetes'] }),
      ],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found.map(f => f.skill)).toEqual(['kubernetes'])
  })

  it('ne mélange PAS deux compétences différentes pour atteindre trois', () => {
    const found = detectMissingExpertise(
      [
        need({ needId: 'a', canonicalSkills: ['kubernetes'] }),
        need({ needId: 'b', canonicalSkills: ['terraform'] }),
        need({ needId: 'c', canonicalSkills: ['kafka'] }),
      ],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toEqual([])
  })

  it('compte un besoin sur CHACUNE de ses compétences, jamais deux fois sur la même', () => {
    const shared = ['kubernetes', 'terraform']
    const found = detectMissingExpertise(
      [
        need({ needId: 'a', canonicalSkills: shared }),
        need({ needId: 'b', canonicalSkills: shared }),
        need({ needId: 'c', canonicalSkills: [...shared, 'kubernetes'] }),
      ],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found.map(f => f.skill).sort()).toEqual(['kubernetes', 'terraform'])
    expect(found.every(f => f.refusedCount === 3)).toBe(true)
  })

  it('ne regarde QUE la fenêtre de 90 jours', () => {
    const found = detectMissingExpertise(
      [need({ needId: 'a', refusedAt: '2026-01-05T09:00:00.000Z' }), need({ needId: 'b' }), need({ needId: 'c' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toEqual([])
  })

  it('écarte un refus SANS date plutôt que de le placer aujourd’hui', () => {
    const found = detectMissingExpertise(
      [need({ needId: 'a', refusedAt: null }), need({ needId: 'b' }), need({ needId: 'c' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toEqual([])
  })

  it('ignore un besoin sans compétence lisible — il ne prouve aucune absence', () => {
    const found = detectMissingExpertise(
      [need({ needId: 'a', canonicalSkills: [] }), need({ needId: 'b' }), need({ needId: 'c' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(found).toEqual([])
  })
})

describe('unaddressedRevenueCents — un montant est une PROMESSE', () => {
  it('chiffre à partir des TJM cibles RÉELLEMENT saisis', () => {
    // 620 €/j sur septembre 2026 (22 jours ouvrés) = 13 640 €.
    const result = unaddressedRevenueCents([
      need({ targetDayRateCents: 62_000, startOn: '2026-09-01', durationMonths: 1 }),
    ])
    expect(result.amountCents).toBe(62_000 * 22)
    expect(result.countedNeeds).toBe(1)
  })

  it('COMPTE À PART un besoin sans TJM, il n’entre pas dans le calcul', () => {
    const result = unaddressedRevenueCents([
      need({ targetDayRateCents: 62_000, startOn: '2026-09-01', durationMonths: 1 }),
      need({ needId: 'b', targetDayRateCents: null }),
    ])
    expect(result.amountCents).toBe(62_000 * 22)
    expect(result.countedNeeds).toBe(1)
    expect(result.withoutRate).toBe(1)
  })

  it('COMPTE À PART un besoin sans durée — on ne devine pas douze mois', () => {
    const result = unaddressedRevenueCents([need({ durationMonths: null })])
    expect(result.amountCents).toBeNull()
    expect(result.withoutDuration).toBe(1)
  })

  it('COMPTE À PART un besoin sans date de début — sans calendrier, pas de jours ouvrés', () => {
    const result = unaddressedRevenueCents([need({ startOn: null })])
    expect(result.amountCents).toBeNull()
    expect(result.withoutDuration).toBe(1)
  })

  it('rend `null` et JAMAIS zéro quand aucun besoin n’est chiffrable', () => {
    // Zéro euro se lirait « il n'y a rien à gagner » — l'inverse du message.
    const result = unaddressedRevenueCents([need({ targetDayRateCents: null }), need({ needId: 'b', startOn: null })])
    expect(result.amountCents).toBeNull()
    expect(result.countedNeeds).toBe(0)
  })

  it('n’invente JAMAIS une moyenne de marché pour combler un TJM absent', () => {
    const withRate = unaddressedRevenueCents([need({ durationMonths: 1, startOn: '2026-09-01' })])
    const withOneMissing = unaddressedRevenueCents([
      need({ durationMonths: 1, startOn: '2026-09-01' }),
      need({ needId: 'b', targetDayRateCents: null, durationMonths: 1, startOn: '2026-09-01' }),
    ])
    // Le second besoin n'ajoute RIEN au montant : il est compté à part.
    expect(withOneMissing.amountCents).toBe(withRate.amountCents)
  })

  it('cumule les TJM cibles saisis — la première moitié de la phrase du §8.4', () => {
    const result = unaddressedRevenueCents([
      need({ targetDayRateCents: 62_000 }),
      need({ needId: 'b', targetDayRateCents: 60_000 }),
      need({ needId: 'c', targetDayRateCents: 64_000 }),
    ])
    expect(result.cumulativeDayRateCents).toBe(186_000)
  })

  it('rend `null` pour le TJM cumulé quand AUCUN n’est saisi', () => {
    expect(unaddressedRevenueCents([need({ targetDayRateCents: null })]).cumulativeDayRateCents).toBeNull()
  })
})

describe('MISSING_EXPERTISE_THRESHOLDS — un réglage vit à un seul endroit', () => {
  it('porte les deux seuils du §8.4', () => {
    expect(MISSING_EXPERTISE_THRESHOLDS).toEqual({ refusalsOnSameSkill: 3, windowDays: 90 })
  })

  it('le seuil de refus est LU — quatre ne devient pas le nouveau trois', () => {
    const three = detectMissingExpertise(
      [need({ needId: 'a' }), need({ needId: 'b' }), need({ needId: 'c' })],
      new Date('2026-08-20T00:00:00.000Z'),
    )
    expect(three).toHaveLength(MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill - 2)
  })

  it('la fenêtre est LUE — un refus au 89e jour compte, au 91e non', () => {
    const now = new Date('2026-08-20T00:00:00.000Z')
    const day = 86_400_000
    const inside = new Date(now.getTime() - 89 * day).toISOString()
    const outside = new Date(now.getTime() - 91 * day).toISOString()
    expect(
      detectMissingExpertise(
        [need({ needId: 'a', refusedAt: inside }), need({ needId: 'b' }), need({ needId: 'c' })],
        now,
      ),
    ).toHaveLength(1)
    expect(
      detectMissingExpertise(
        [need({ needId: 'a', refusedAt: outside }), need({ needId: 'b' }), need({ needId: 'c' })],
        now,
      ),
    ).toHaveLength(0)
  })
})
