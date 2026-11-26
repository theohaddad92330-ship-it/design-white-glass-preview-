import { describe, expect, it } from 'vitest'
import {
  TALENT_PHOTO_MAX_BYTES,
  TALENT_RETENTION_MAX_MONTHS,
  addExperienceSchema,
  daysBeforePurge,
  isSkillSourceProven,
  isTalentPurgeDue,
  talentCompleteness,
  talentPhotoSchema,
  talentPipelineStatus,
  talentPurgeDate,
  talentRetentionSchema,
  talentSearchQuerySchema,
  upsertSkillSchema,
  validateSkillSchema,
} from './talent.js'

const NOW = new Date('2026-08-17T12:00:00.000Z')

function candidate(overrides: { lastContactAt?: string | null; createdAt?: string } = {}) {
  return {
    kind: 'candidate' as const,
    lastContactAt: overrides.lastContactAt ?? null,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

describe('talentRetentionSchema', () => {
  it('PLAFONNE à deux ans — un réglage qui accepte dix ans n’est pas une politique', () => {
    expect(() => talentRetentionSchema.parse({ months: 120 })).toThrow()
    expect(talentRetentionSchema.parse({ months: 24 }).months).toBe(24)
  })

  it('laisse une ESN être plus stricte que la loi', () => {
    expect(talentRetentionSchema.parse({ months: 6 }).months).toBe(6)
  })

  it('n’ARME PAS la purge par défaut', () => {
    // Effacer est irréversible : l'armer par surprise sur un espace existant
    // détruirait un vivier constitué.
    expect(talentRetentionSchema.parse({}).enabled).toBe(false)
    expect(talentRetentionSchema.parse({}).months).toBe(TALENT_RETENTION_MAX_MONTHS)
  })
})

describe('talentPurgeDate', () => {
  it('ne purge JAMAIS un consultant', () => {
    // Sa fiche est justifiée par un contrat de travail : la purger effacerait
    // l'historique de missions d'un salarié en poste.
    expect(talentPurgeDate({ kind: 'consultant', lastContactAt: null, createdAt: '2020-01-01' }, 24)).toBeNull()
  })

  it('compte à partir du DERNIER CONTACT, pas de la création', () => {
    // Recontacter quelqu'un remet le compteur à zéro — c'est précisément ce qui
    // justifie de garder son dossier.
    const recent = talentPurgeDate(
      candidate({ createdAt: '2020-01-01T00:00:00.000Z', lastContactAt: '2026-06-01T00:00:00.000Z' }),
      24,
    )
    expect(recent!.getFullYear()).toBeGreaterThanOrEqual(2028)
  })

  it('retombe sur la création quand aucun contact n’est connu', () => {
    // Ne rien faire garderait indéfiniment les dossiers les plus anciens —
    // exactement ceux que la règle vise.
    expect(talentPurgeDate(candidate({ createdAt: '2023-01-01T00:00:00.000Z' }), 24)).not.toBeNull()
  })

  it('applique le plafond même si l’appelant demande plus', () => {
    const asked = talentPurgeDate(candidate({ createdAt: '2024-01-01T00:00:00.000Z' }), 999)
    const capped = talentPurgeDate(candidate({ createdAt: '2024-01-01T00:00:00.000Z' }), 24)
    expect(asked?.getTime()).toBe(capped?.getTime())
  })

  it('rend null sur une date illisible plutôt que de purger au hasard', () => {
    expect(talentPurgeDate(candidate({ createdAt: 'jamais' }), 24)).toBeNull()
  })
})

describe('isTalentPurgeDue', () => {
  it('est dû pour un dossier de 2023 sans recontact', () => {
    expect(isTalentPurgeDue(candidate({ createdAt: '2023-01-01T00:00:00.000Z' }), 24, NOW)).toBe(true)
  })

  it('ne l’est pas quand la personne a été recontactée récemment', () => {
    expect(
      isTalentPurgeDue(candidate({ createdAt: '2020-01-01', lastContactAt: '2026-05-01T00:00:00.000Z' }), 24, NOW),
    ).toBe(false)
  })
})

describe('daysBeforePurge', () => {
  it('ne rend JAMAIS un nombre négatif', () => {
    // « -300 jours » sur une fiche se lit comme une donnée corrompue.
    expect(daysBeforePurge(candidate({ createdAt: '2020-01-01T00:00:00.000Z' }), 24, NOW)).toBe(0)
  })

  it('rend null quand la règle ne s’applique pas', () => {
    expect(daysBeforePurge({ kind: 'consultant', lastContactAt: null, createdAt: '2020-01-01' }, 24, NOW)).toBeNull()
  })
})

describe('upsertSkillSchema', () => {
  it('n’invente pas d’ancienneté — absent vaut null, jamais 0', () => {
    // « Zéro année » se lirait « n'a jamais pratiqué », l'inverse d'une
    // compétence listée.
    const parsed = upsertSkillSchema.parse({ skill: 'Kubernetes' })
    expect(parsed.years).toBeNull()
    expect(parsed.lastUsedYear).toBeNull()
    expect(parsed.level).toBe('autonome')
    expect(parsed.source).toBe('declared')
  })

  it('refuse une compétence vide', () => {
    expect(() => upsertSkillSchema.parse({ skill: '   ' })).toThrow()
  })
})

describe('talentSearchQuerySchema', () => {
  it('pagine par défaut sans tout charger', () => {
    const parsed = talentSearchQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.limit).toBe(25)
    expect(parsed.skills).toEqual([])
  })

  it('borne le nombre de compétences exigées', () => {
    const many = Array.from({ length: 11 }, (_, index) => `skill-${index}`)
    expect(() => talentSearchQuerySchema.parse({ skills: many })).toThrow()
  })

  // #3830 — une seule compétence arrive de l'URL (`?skills=Kubernetes`) en CHAÎNE
  // simple, pas en tableau : le contrat la refusait (400) et l'écran gardait
  // l'ancienne liste affichée (« 484 profils » constant).
  it('accepte une compétence unique de l’URL comme un tableau d’un élément', () => {
    expect(talentSearchQuerySchema.parse({ skills: 'Kubernetes' }).skills).toEqual(['Kubernetes'])
    expect(talentSearchQuerySchema.parse({ skills: ['Java', 'Kubernetes'] }).skills).toEqual(['Java', 'Kubernetes'])
  })

  it('accepte les chaînes de l’URL pour la pagination', () => {
    expect(talentSearchQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 })
  })

  it('accepte les six nouveaux critères du tiroir « Plus de filtres » (PDF-22 §01)', () => {
    const parsed = talentSearchQuerySchema.parse({
      minTjm: 400,
      sector: 'Banque',
      language: 'en',
      remotePreference: 'hybride',
      cvAvailable: 'true',
      onMission: 'yes',
    })
    expect(parsed).toMatchObject({
      minTjm: 400,
      sector: 'Banque',
      language: 'en',
      remotePreference: 'hybride',
      cvAvailable: true,
      onMission: 'yes',
    })
  })

  it('accepte le rayon (avec sa ville) et les années d’expérience minimum, tranchés le 31/08/2026', () => {
    const parsed = talentSearchQuerySchema.parse({ zone: 'Paris', radiusKm: 50, minYearsExperience: 5 })
    expect(parsed).toMatchObject({ zone: 'Paris', radiusKm: 50, minYearsExperience: 5 })
  })

  it('borne le rayon à 500 km — au-delà, ce n’est plus un rayon de recherche', () => {
    expect(() => talentSearchQuerySchema.parse({ radiusKm: 501 })).toThrow()
  })

  it('n’exige pas `zone` pour accepter `radiusKm` — c’est le SERVICE qui ignore le rayon sans centre', () => {
    expect(() => talentSearchQuerySchema.parse({ radiusKm: 50 })).not.toThrow()
  })

  it('#2182.23 / #2182.53 — accepte « sans mission depuis N mois », distinct du contact', () => {
    const parsed = talentSearchQuerySchema.parse({ noMissionMonths: '6' })
    expect(parsed.noMissionMonths).toBe(6)
  })

  it('borne « sans mission depuis N mois » comme la fraîcheur de contact — 1 à 60', () => {
    expect(() => talentSearchQuerySchema.parse({ noMissionMonths: 0 })).toThrow()
    expect(() => talentSearchQuerySchema.parse({ noMissionMonths: 61 })).toThrow()
  })

  it('#2182.51 — accepte le même vocabulaire que `consentState()` (`none`/`valid`/`expiring`/`expired`)', () => {
    for (const state of ['none', 'valid', 'expiring', 'expired'] as const) {
      expect(talentSearchQuerySchema.parse({ consentState: state }).consentState).toBe(state)
    }
    expect(() => talentSearchQuerySchema.parse({ consentState: 'inconnu' })).toThrow()
  })

  it('#2182.55 — accepte « preuves » comme au moins une compétence PROUVÉE (mission/entretien)', () => {
    const parsed = talentSearchQuerySchema.parse({ provenSkillsOnly: 'true' })
    expect(parsed.provenSkillsOnly).toBe(true)
  })

  it('#2182.55 — indifférent par défaut, comme les autres filtres tiroir', () => {
    expect(talentSearchQuerySchema.parse({}).provenSkillsOnly).toBeUndefined()
  })
})

describe('talentPhotoSchema', () => {
  const PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

  it('accepte une image encodée en data URI', () => {
    expect(talentPhotoSchema.parse({ photoUrl: PIXEL }).photoUrl).toBe(PIXEL)
  })

  it('accepte `null` — le retrait explicite d’une photo', () => {
    expect(talentPhotoSchema.parse({ photoUrl: null }).photoUrl).toBeNull()
  })

  it('refuse une URL ordinaire — jamais un chemin scrapé, seulement un dépôt', () => {
    expect(() => talentPhotoSchema.parse({ photoUrl: 'https://exemple.test/photo.png' })).toThrow()
  })

  it('refuse un type MIME hors image (svg, pdf…) — vecteur d’attaque XSS potentiel', () => {
    expect(() => talentPhotoSchema.parse({ photoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).toThrow()
  })

  it('refuse une charge au-delà de la borne', () => {
    const tooLarge = `data:image/png;base64,${'A'.repeat(TALENT_PHOTO_MAX_BYTES)}`
    expect(() => talentPhotoSchema.parse({ photoUrl: tooLarge })).toThrow()
  })
})

/**
 * `talentCompleteness` — la colonne « Complétude » qui remplace la colonne
 * « Score » nue de la maquette (PDF-22 §01, « à jeter »).
 */
describe('talentCompleteness', () => {
  const FULL = {
    fullName: 'Camille Roussel',
    skillCount: 5,
    staffing: { availability: 'available' as const, loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 640,
    hasCv: true,
  }

  it('rend 100/100 quand les cinq axes sont remplis', () => {
    const result = talentCompleteness(FULL)
    expect(result).toEqual({
      score: 100,
      max: 100,
      axes: [
        { key: 'identity', score: 100 },
        { key: 'skills', score: 100 },
        { key: 'availability', score: 100 },
        { key: 'rate', score: 100 },
        { key: 'cv', score: 100 },
      ],
    })
  })

  it('rend 0/100 sur une fiche entièrement vide — jamais `null`, l’axe est toujours évaluable', () => {
    const result = talentCompleteness({
      fullName: null,
      skillCount: 0,
      staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
      tjm: null,
      hasCv: false,
    })
    expect(result.score).toBe(0)
    expect(result.axes.every(axis => axis.score === 0)).toBe(true)
  })

  it('nomme précisément quel axe manque — un nom vide ne compte pas comme rempli', () => {
    const result = talentCompleteness({ ...FULL, fullName: '   ' })
    expect(result.axes.find(axis => axis.key === 'identity')?.score).toBe(0)
    expect(result.score).toBe(80)
  })

  it('un « inconnu » de disponibilité compte comme incomplet, pas comme mesuré', () => {
    const result = talentCompleteness({
      ...FULL,
      staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    })
    expect(result.axes.find(axis => axis.key === 'availability')?.score).toBe(0)
  })
})

/**
 * `isSkillSourceProven` — #2185.35 : les ANNÉES d'une compétence ne
 * s'affichent QUE si prouvées, jamais sur une simple déclaration.
 */
describe('isSkillSourceProven', () => {
  it('rend VRAI pour une compétence prouvée en mission ou en entretien', () => {
    expect(isSkillSourceProven('mission')).toBe(true)
    expect(isSkillSourceProven('interview')).toBe(true)
  })

  it('rend FAUX pour une déclaration ou une lecture de CV — ce sont des affirmations, pas des preuves', () => {
    expect(isSkillSourceProven('declared')).toBe(false)
    expect(isSkillSourceProven('cv')).toBe(false)
  })

  it('rend FAUX sans source connue', () => {
    expect(isSkillSourceProven(null)).toBe(false)
    expect(isSkillSourceProven(undefined)).toBe(false)
  })
})

/**
 * `talentPipelineStatus` — #2185.4/#2185.12-18 : LE statut affiché en hero de
 * la fiche, et l'action principale qui en dépend (§ ACTION PRINCIPALE
 * DYNAMIQUE de l'issue #2185). Cinq états, tous dérivés de champs déjà sur
 * `TalentRow` — aucune nouvelle lecture, aucune probabilité.
 *
 * « Besoin compatible » n'est PAS un sixième état dérivé ici : le classer
 * exigerait de lancer le matching inverse (`InverseMatchPanel`), un geste
 * coûteux et volontairement MANUEL (jamais déclenché à l'ouverture d'une
 * fiche) — l'automatiser romprait la doctrine de coût du dépôt.
 */
describe('talentPipelineStatus', () => {
  const BASE = {
    fullName: 'Camille Roussel',
    skillCount: 5,
    declaredAvailability: 'immediate',
    staffing: { availability: 'available' as const, loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 640,
    hasCv: true,
    submissions: { open: 0, total: 0 },
    reviewStatus: 'qualified' as const,
  }

  it('rend « incomplete » tant que la fiche attend sa relecture — avant tout autre calcul', () => {
    expect(talentPipelineStatus({ ...BASE, reviewStatus: 'needs_review' })).toBe('incomplete')
  })

  it('rend « incomplete » sous le seuil des trois axes remplis (ENRICHED_MIN_AXES)', () => {
    expect(talentPipelineStatus({ ...BASE, fullName: null, skillCount: 0, tjm: null, hasCv: false })).toBe('incomplete')
  })

  it('rend « in_mission » quand l’affectation DÉRIVÉE l’emporte sur le déclaratif', () => {
    expect(
      talentPipelineStatus({
        ...BASE,
        staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2027-01-01', assignments: 1 },
      }),
    ).toBe('in_mission')
  })

  it('rend « availability_to_verify » quand aucune affectation n’est connue', () => {
    expect(
      talentPipelineStatus({
        ...BASE,
        staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
      }),
    ).toBe('availability_to_verify')
  })

  it('rend « availability_to_verify » sur la contradiction déclaré/dérivé — même garde que TalentAvailabilityBadge', () => {
    expect(
      talentPipelineStatus({
        ...BASE,
        declaredAvailability: 'immediate',
        staffing: { availability: 'partial', loadPercent: 50, freeFrom: null, assignments: 1 },
      }),
    ).toBe('availability_to_verify')
  })

  it('rend « positioned » quand un positionnement court, disponibilité confirmée', () => {
    expect(talentPipelineStatus({ ...BASE, submissions: { open: 1, total: 3 } })).toBe('positioned')
  })

  it('rend « available » par défaut — disponibilité confirmée, rien en cours', () => {
    expect(talentPipelineStatus(BASE)).toBe('available')
  })
})

describe('addExperienceSchema (#2328.22/.23)', () => {
  it('accepte une expérience vide — tout est optionnel, rien n’est inventé', () => {
    const result = addExperienceSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.entreprise).toBeNull()
      expect(result.data.clientMasked).toBe(false)
      expect(result.data.technologies).toEqual([])
    }
  })

  it('refuse un client masqué SANS raison — un masquage sans pourquoi serait inventé', () => {
    const result = addExperienceSchema.safeParse({ clientMasked: true })
    expect(result.success).toBe(false)
  })

  it('accepte un client masqué AVEC sa raison', () => {
    const result = addExperienceSchema.safeParse({
      clientMasked: true,
      clientMaskedReason: 'NDA — le CV cite « client confidentiel du secteur bancaire »',
    })
    expect(result.success).toBe(true)
  })

  it('rend les dix champs nommés — pas un bloc plat', () => {
    const result = addExperienceSchema.safeParse({
      entreprise: 'Acme SSII',
      clientFinal: 'Grand Groupe',
      secteur: 'Banque',
      role: 'Tech Lead',
      dateDebut: '2022-01-01',
      dateFin: '2023-06-30',
      contexte: 'Migration cloud',
      realisations: 'Réduction de 30% des coûts',
      technologies: ['kubernetes'],
      responsabilites: 'Pilotage technique',
      preuve: 'CV, section « expériences »',
    })
    expect(result.success).toBe(true)
  })
})

describe('validateSkillSchema — expérience/projet source (#2328.9/.10)', () => {
  it('accepte une expérience source seule', () => {
    const result = validateSkillSchema.safeParse({
      validatedBy: 'recruiter',
      sourceExperienceId: '11111111-1111-4111-8111-111111111111',
    })
    expect(result.success).toBe(true)
  })

  it('refuse un projet source SANS expérience — un projet ne prouve rien seul', () => {
    const result = validateSkillSchema.safeParse({ validatedBy: 'recruiter', sourceProject: 'Migration cloud' })
    expect(result.success).toBe(false)
  })

  it('accepte un projet source avec son expérience', () => {
    const result = validateSkillSchema.safeParse({
      validatedBy: 'recruiter',
      sourceExperienceId: '11111111-1111-4111-8111-111111111111',
      sourceProject: 'Migration cloud',
    })
    expect(result.success).toBe(true)
  })
})
