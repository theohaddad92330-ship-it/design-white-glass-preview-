import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_LOAD_BOUNDS,
  DEFAULT_MAX_OPEN_NEEDS,
  DEFAULT_MAX_RECRUITERS_SHOWN,
  MAX_OPEN_NEEDS_BOUNDS,
  MAX_RECRUITERS_SHOWN_BOUNDS,
  REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS,
  commercialLoadSettingsSchema,
  reverseMarketSettingsSchema,
  updateCommercialLoadSettingsSchema,
  updateReverseMarketSettingsSchema,
} from './workspace-capacity.js'

/**
 * #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Les trois réglages du marché inversé et les deux de la charge commerciale
 * vivent désormais dans UN schéma par sujet (GA-26). La ligne rouge du
 * premier : une capacité CONFIGURÉE, jamais une chance estimée — donc un
 * entier borné, jamais un pourcentage.
 */
describe('reverseMarketSettingsSchema — #2035.10', () => {
  it('porte les TROIS réglages du sujet, fusionnés en un seul schéma', () => {
    const parsed = reverseMarketSettingsSchema.parse({
      enabled: true,
      responseCapacityPerWeek: 8,
      maxRecruitersShown: 12,
    })
    expect(parsed).toEqual({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 12 })
  })

  it('`null` est un état valide pour la capacité — non renseigné, jamais zéro', () => {
    const parsed = reverseMarketSettingsSchema.parse({
      enabled: false,
      responseCapacityPerWeek: null,
      maxRecruitersShown: DEFAULT_MAX_RECRUITERS_SHOWN,
    })
    expect(parsed.responseCapacityPerWeek).toBeNull()
  })

  it('`maxRecruitersShown` n’est PAS nullable — la colonne est NOT NULL en production', () => {
    expect(() =>
      reverseMarketSettingsSchema.parse({ enabled: true, responseCapacityPerWeek: null, maxRecruitersShown: null }),
    ).toThrow()
  })

  it('refuse une capacité hors bornes plutôt que de la tronquer', () => {
    expect(() =>
      reverseMarketSettingsSchema.parse({ enabled: true, responseCapacityPerWeek: 0, maxRecruitersShown: 10 }),
    ).toThrow()
    expect(() =>
      reverseMarketSettingsSchema.parse({
        enabled: true,
        responseCapacityPerWeek: REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.max + 1,
        maxRecruitersShown: 10,
      }),
    ).toThrow()
  })

  it('refuse un nombre de recruteurs hors du CHECK SQL de la table de production (1-50)', () => {
    expect(() =>
      reverseMarketSettingsSchema.parse({
        enabled: true,
        responseCapacityPerWeek: null,
        maxRecruitersShown: MAX_RECRUITERS_SHOWN_BOUNDS.max + 1,
      }),
    ).toThrow()
  })

  it('refuse une valeur non entière — jamais un pourcentage de chances', () => {
    expect(() =>
      reverseMarketSettingsSchema.parse({ enabled: true, responseCapacityPerWeek: 0.5, maxRecruitersShown: 10 }),
    ).toThrow()
  })
})

describe('updateReverseMarketSettingsSchema — undefined ne touche pas, null efface', () => {
  it('accepte un patch partiel (seul `enabled` envoyé)', () => {
    const parsed = updateReverseMarketSettingsSchema.parse({ enabled: true })
    expect(parsed.enabled).toBe(true)
    expect(parsed.responseCapacityPerWeek).toBeUndefined()
    expect(parsed.maxRecruitersShown).toBeUndefined()
  })

  it('accepte le réglage de la vague 2 dans le MÊME patch que ceux de la vague 3', () => {
    const parsed = updateReverseMarketSettingsSchema.parse({ maxRecruitersShown: 25 })
    expect(parsed).toEqual({ maxRecruitersShown: 25 })
  })

  it('refuse un champ inconnu — `.strict()`', () => {
    expect(() => updateReverseMarketSettingsSchema.parse({ chanceDeReponse: 0.4 })).toThrow()
  })
})

describe('commercialLoadSettingsSchema — #2035.11, sur des colonnes réelles', () => {
  it('accepte les deux plafonds configurés', () => {
    const parsed = commercialLoadSettingsSchema.parse({
      maxTrackedAccounts: 40,
      maxOpenNeeds: 15,
      weeklyAvailableHours: null,
    })
    expect(parsed).toEqual({ maxTrackedAccounts: 40, maxOpenNeeds: 15, weeklyAvailableHours: null })
  })

  it('`null` est un état valide pour le plafond de dossiers suivis', () => {
    const parsed = commercialLoadSettingsSchema.parse({
      maxTrackedAccounts: null,
      maxOpenNeeds: DEFAULT_MAX_OPEN_NEEDS,
      weeklyAvailableHours: null,
    })
    expect(parsed.maxTrackedAccounts).toBeNull()
  })

  it('`maxOpenNeeds` n’est PAS nullable — la colonne de production est NOT NULL DEFAULT 15', () => {
    expect(() => commercialLoadSettingsSchema.parse({ maxTrackedAccounts: null, maxOpenNeeds: null })).toThrow()
  })

  it('refuse un plafond de dossiers hors bornes', () => {
    expect(() =>
      commercialLoadSettingsSchema.parse({
        maxTrackedAccounts: COMMERCIAL_LOAD_BOUNDS.max + 1,
        maxOpenNeeds: DEFAULT_MAX_OPEN_NEEDS,
      }),
    ).toThrow()
  })

  it('refuse un plafond de besoins hors du CHECK SQL de la table de production (1-100)', () => {
    expect(() =>
      commercialLoadSettingsSchema.parse({ maxTrackedAccounts: null, maxOpenNeeds: MAX_OPEN_NEEDS_BOUNDS.max + 1 }),
    ).toThrow()
  })
})

describe('updateCommercialLoadSettingsSchema — patch partiel, champs inconnus refusés', () => {
  it('accepte un seul plafond à la fois', () => {
    const parsed = updateCommercialLoadSettingsSchema.parse({ maxOpenNeeds: 20 })
    expect(parsed).toEqual({ maxOpenNeeds: 20 })
  })

  it('#3289.29 — le jour imposé à la cadence : un jour ouvré, ou null pour « non renseigné » ; jamais un week-end', () => {
    expect(updateCommercialLoadSettingsSchema.parse({ cadenceWeekday: 'tuesday' })).toEqual({
      cadenceWeekday: 'tuesday',
    })
    expect(updateCommercialLoadSettingsSchema.parse({ cadenceWeekday: null })).toEqual({ cadenceWeekday: null })
    expect(() => updateCommercialLoadSettingsSchema.parse({ cadenceWeekday: 'sunday' })).toThrow()
  })

  it('refuse un champ inconnu', () => {
    expect(() => updateCommercialLoadSettingsSchema.parse({ scoreDePriorite: 3 })).toThrow()
  })
})
