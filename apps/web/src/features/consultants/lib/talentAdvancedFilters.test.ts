import { describe, expect, it } from 'vitest'
import { talentSearchQuerySchema } from '@bellum/contracts'
import { TALENT_ADVANCED_FILTERS_UNAVAILABLE } from './talentAdvancedFilters'

/**
 * Garde du tiroir « Plus de filtres » (manque A du 30/08, FERMÉE le
 * 31/08/2026 — PDF-22 §01 : les deux derniers critères, rayon et années
 * d'expérience, sont devenus de VRAIS critères serveur).
 *
 * Cette garde prouve maintenant l'INVERSE de sa version précédente :
 *  1. le registre est VIDE — plus rien à nommer comme hors d'atteinte ;
 *  2. le vrai schéma serveur ACCEPTE désormais `radiusKm` (avec `zone`) et
 *     `minYearsExperience` — si quelqu'un les retire un jour du schéma sans
 *     rouvrir ce fichier, ce test bascule au ROUGE, ce qui est le signal
 *     recherché : le registre et le schéma doivent bouger ENSEMBLE.
 */
describe('TALENT_ADVANCED_FILTERS_UNAVAILABLE', () => {
  it('est VIDE — les deux derniers critères ont rejoint le schéma serveur', () => {
    expect(TALENT_ADVANCED_FILTERS_UNAVAILABLE).toEqual([])
  })

  it('chaque entrée restante, s’il y en a, porte une raison non vide', () => {
    for (const entry of TALENT_ADVANCED_FILTERS_UNAVAILABLE) {
      expect(entry.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('sait dire OUI : le schéma accepte le rayon (avec sa ville) — 31/08/2026', () => {
    const base = { page: 1, limit: 25, skills: [] as string[] }
    expect(talentSearchQuerySchema.safeParse({ ...base, zone: 'Paris', radiusKm: 50 }).success).toBe(true)
  })

  it('sait dire OUI : le schéma accepte les années d’expérience minimum — 31/08/2026', () => {
    const base = { page: 1, limit: 25, skills: [] as string[] }
    expect(talentSearchQuerySchema.safeParse({ ...base, minYearsExperience: 5 }).success).toBe(true)
  })

  it('sait dire OUI : le schéma accepte toujours les quatre critères du premier lot', () => {
    const base = { page: 1, limit: 25, skills: [] as string[] }
    expect(talentSearchQuerySchema.safeParse({ ...base, minTjm: 400 }).success).toBe(true)
    expect(talentSearchQuerySchema.safeParse({ ...base, language: 'en' }).success).toBe(true)
    expect(talentSearchQuerySchema.safeParse({ ...base, cvAvailable: true }).success).toBe(true)
    expect(talentSearchQuerySchema.safeParse({ ...base, remotePreference: 'hybride' }).success).toBe(true)
  })
})
