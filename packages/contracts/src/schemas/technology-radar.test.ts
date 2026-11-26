import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/technology-radar.json' with { type: 'json' }
import {
  RADAR_POCKETS,
  RADAR_TECHNOLOGIES,
  detectRadarTechnologies,
  resolveRadarTechnology,
  technologyRadarSchema,
} from './technology-radar.js'

describe('#4282 — contrat commun Laura / Découvrir du radar par technologie', () => {
  it('la liste fermée est EXACTEMENT celle de la fixture partagée avec l’IA', () => {
    expect(RADAR_TECHNOLOGIES).toEqual(fixture.technologies)
    expect(RADAR_POCKETS).toEqual(fixture.pockets)
  })

  it.each(fixture.phrases)('« $input » se résout pareil des deux côtés', ({ input, expected }) => {
    expect(resolveRadarTechnology(input)).toEqual(expected)
  })

  it.each(fixture.detect)('détection dans « $text »', ({ text, codes }) => {
    expect(detectRadarTechnologies(text)).toEqual(codes)
  })

  it('NON : un radar qui porterait une probabilité ou une source nommée est refusé par le schéma', () => {
    const base = {
      technology: { kind: 'closed', code: 'SAP', label: 'SAP' },
      generatedAt: '2026-10-19T10:00:00Z',
      accounts: [],
      historicalNeeds: [],
      prescribers: [],
      footprints: [],
      notEvaluated: [],
    }
    expect(technologyRadarSchema.safeParse(base).success).toBe(true)
    expect(technologyRadarSchema.safeParse({ ...base, probability: 0.4 }).success).toBe(false)
    expect(technologyRadarSchema.safeParse({ ...base, source: 'DataForge' }).success).toBe(false)
  })
})
