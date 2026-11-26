import { describe, expect, it } from 'vitest'
import {
  consultantAvailabilitySchema,
  CONSULTANT_AVAILABILITIES,
  talentPositioningAgreementSchema,
  tjmMetadataSchema,
  tjmObservedFreshness,
  TJM_HISTORICAL_AFTER_DAYS,
} from './consultant.js'

/**
 * #2186.5 / #2186.7 — les quatre états de disponibilité DÉCLARÉE ne se
 * distinguent qu'ici : « en mission » (une affectation ailleurs, déclarée par
 * la personne) était conflaté avec « indisponible » (pas mobilisable, pour
 * n'importe quelle autre raison) sous la même valeur d'enum.
 *
 * `a_confirmer` (la disponibilité déclarée mais périmée, #2186.14) n'entre PAS
 * dans cette liste : c'est une valeur purement calculée à la lecture
 * (`effectiveDeclaredAvailability`, `apps/api/.../declared-availability.ts`),
 * jamais écrite en base — l'inverse ferait dépendre un « à confirmer » d'une
 * écriture que personne n'a faite, alors que le §2186.14 exige qu'il
 * apparaisse SEUL, sans geste humain.
 */
describe('consultantAvailabilitySchema — #2186.5/.7 en_mission distinct d’indisponible', () => {
  it('accepte `en_mission`, ajoutée EN FIN (GA-08)', () => {
    expect(consultantAvailabilitySchema.safeParse('en_mission').success).toBe(true)
    expect(CONSULTANT_AVAILABILITIES[CONSULTANT_AVAILABILITIES.length - 1]).toBe('en_mission')
  })

  it('garde les cinq valeurs historiques, dans leur ORDRE d’origine', () => {
    expect(CONSULTANT_AVAILABILITIES.slice(0, 5)).toEqual([
      'immediate',
      'sous_1_mois',
      'sous_3_mois',
      'indisponible',
      'inconnu',
    ])
  })
})

/**
 * #2948 (#2329.12/.13/.14/.16) — devise, source, contexte, date et
 * confidentialité d'un TJM. L'unité (#2329.11) n'a pas de champ : voir le
 * docblock de `tjmMetadataSchema`.
 */
describe('tjmMetadataSchema — #2329.11-.16', () => {
  const VALID = {
    currency: 'EUR',
    source: 'Déclaré par le consultant',
    context: null,
    observed_at: '2026-06-01',
    confidential: true,
  }

  it('accepte les cinq axes renseignés', () => {
    expect(tjmMetadataSchema.safeParse(VALID).success).toBe(true)
  })

  it('`currency` : un code ISO 4217 à trois lettres majuscules, jamais deviné', () => {
    expect(tjmMetadataSchema.safeParse({ ...VALID, currency: null }).success).toBe(true)
    expect(tjmMetadataSchema.safeParse({ ...VALID, currency: 'euro' }).success).toBe(false)
    expect(tjmMetadataSchema.safeParse({ ...VALID, currency: 'EU' }).success).toBe(false)
  })

  it('refuse un objet incomplet — pas de complétion silencieuse d’un axe manquant', () => {
    const { confidential: _confidential, ...incomplete } = VALID
    expect(tjmMetadataSchema.safeParse(incomplete).success).toBe(false)
  })
})

/**
 * #2948 (#2329.42/.44) — un TJM d'une ANCIENNE mission est un CONTEXTE
 * HISTORIQUE, jamais la condition actuelle. Seuil délibérément DISTINCT de
 * `AVAILABILITY_REVALIDATION_DAYS` (60 jours) : voir le docblock de
 * `tjmObservedFreshness`.
 */
describe('tjmObservedFreshness — #2329.42/.44', () => {
  const NOW = new Date('2026-09-27T00:00:00.000Z')

  it('dit `unknown` — jamais deviné — quand la date manque ou est illisible', () => {
    expect(tjmObservedFreshness(null, NOW)).toBe('unknown')
    expect(tjmObservedFreshness(undefined, NOW)).toBe('unknown')
    expect(tjmObservedFreshness('pas une date', NOW)).toBe('unknown')
  })

  it('reste `recent` juste sous le seuil, bascule `historical` juste au-dessus', () => {
    const justUnder = new Date(NOW.getTime() - (TJM_HISTORICAL_AFTER_DAYS - 1) * 86_400_000).toISOString()
    const justOver = new Date(NOW.getTime() - (TJM_HISTORICAL_AFTER_DAYS + 1) * 86_400_000).toISOString()
    // C'est le test qui dit NON : une mission d'il y a huit mois ne se
    // présente jamais comme une condition actuelle.
    expect(tjmObservedFreshness(justUnder, NOW)).toBe('recent')
    expect(tjmObservedFreshness(justOver, NOW)).toBe('historical')
  })

  it('est pure — jamais l’horloge système, seulement `now`', () => {
    const observed = '2026-01-01'
    expect(tjmObservedFreshness(observed, new Date('2026-01-02'))).toBe('recent')
    expect(tjmObservedFreshness(observed, new Date('2027-01-02'))).toBe('historical')
  })
})

/**
 * #2948 (#2329.45-.51) — l'accord à 7 conditions, tranche TJM validé + CV
 * validé + autres processus connus (DÉRIVÉ, jamais un état stocké deux fois).
 * Disponibilité confirmée et compte autorisé vivent ailleurs sur la fiche.
 */
describe('talentPositioningAgreementSchema — #2329.45-.51', () => {
  it('accepte l’état ordinaire — rien confirmé, rien connu', () => {
    expect(
      talentPositioningAgreementSchema.safeParse({
        tjmValidatedAt: null,
        cvValidatedAt: null,
        otherProcessesKnown: false,
      }).success,
    ).toBe(true)
  })

  it('REFUSE un champ en trop — « mission comprise »/« intérêt réel » n’ont pas leur place ici', () => {
    // C'est le test qui dit NON : ces deux axes sont des faits PAR
    // OPPORTUNITÉ, jamais des faits globaux sur la personne (voir le docblock).
    expect(
      talentPositioningAgreementSchema.safeParse({
        tjmValidatedAt: null,
        cvValidatedAt: null,
        otherProcessesKnown: false,
        missionUnderstood: true,
      }).success,
    ).toBe(false)
  })
})
