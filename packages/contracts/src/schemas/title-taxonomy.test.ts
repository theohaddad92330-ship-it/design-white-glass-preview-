import { describe, expect, it } from 'vitest'
import {
  LEGACY_FAMILY_CONTACT_FAMILY,
  LEGACY_FAMILY_OFFER_DOMAIN,
  LEGACY_TITLE_FAMILIES,
  lookupTitle,
  normalizeTitleKey,
  TITLE_TAXONOMY,
} from './title-taxonomy.js'

/**
 * Le référentiel d'intitulés — 298 titres tirés du corpus de juin 2026.
 *
 * Le premier test est celui sans lequel tous les autres ne prouvent rien : une
 * table VIDE ferait passer chaque `lookupTitle(...) === null` au vert, et le
 * référentiel se lirait « aucun titre n'est connu » exactement comme s'il
 * n'avait jamais été branché.
 */
describe('title-taxonomy — le corpus est réellement là', () => {
  it('porte les 298 clés du corpus, et chacune a une forme canonique non vide', () => {
    expect(TITLE_TAXONOMY.size).toBe(298)
    for (const [key, entry] of TITLE_TAXONOMY) {
      expect(key).toBe(normalizeTitleKey(key))
      expect(entry.canonical.trim().length).toBeGreaterThan(0)
      expect(entry.families.length).toBeGreaterThanOrEqual(1)
      for (const family of entry.families) expect(LEGACY_TITLE_FAMILIES).toContain(family)
    }
  })

  it('couvre les dix familles du corpus, et chacune porte au moins un titre', () => {
    const seen = new Set<string>()
    for (const entry of TITLE_TAXONOMY.values()) for (const family of entry.families) seen.add(family)
    expect([...seen].sort()).toEqual([...LEGACY_TITLE_FAMILIES].sort())
  })

  it('déclare une correspondance pour CHAQUE famille — `null` compris, écrit à la main', () => {
    for (const family of LEGACY_TITLE_FAMILIES) {
      expect(Object.hasOwn(LEGACY_FAMILY_OFFER_DOMAIN, family)).toBe(true)
      expect(Object.hasOwn(LEGACY_FAMILY_CONTACT_FAMILY, family)).toBe(true)
    }
  })
})

describe('lookupTitle — reconnaître sans conclure', () => {
  it('reconnaît un titre à la casse et aux accents près', () => {
    expect(lookupTitle('INGENIEUR   SYSTEME')?.canonical).toBe('Ingénieur système')
    const cto = lookupTitle('  cto  ')
    expect(cto?.canonical).toBe('CTO')
    expect(cto?.legacyFamily).toBe('tech_engineering_it')
    expect(cto?.ambiguous).toBe(false)
  })

  it("rend `null` pour un titre inconnu — ce qui n'est pas un jugement sur le titre", () => {
    expect(lookupTitle('Grand Manitou des Serveurs')).toBeNull()
    expect(lookupTitle('')).toBeNull()
    expect(lookupTitle(null)).toBeNull()
    // ⚠️ « DSI » n'est PAS dans le corpus, et c'est le meilleur rappel de ce que
    // vaut cette table : 298 titres tirés d'un document de juin 2026, pas un
    // dictionnaire des intitulés français. Absent ≠ sans intérêt — les règles du
    // classifieur, elles, reconnaissent parfaitement un DSI.
    expect(lookupTitle('DSI')).toBeNull()
  })

  it("ne tranche PAS un titre ambigu sans domaine — il n'invente pas la première famille", () => {
    const found = lookupTitle('Directeur technique')
    expect(found?.ambiguous).toBe(true)
    expect(found?.legacyFamily).toBeNull()
  })

  it('le domaine du VENDEUR départage — et seulement lui', () => {
    expect(lookupTitle('Directeur technique', 'industrial_engineering')?.legacyFamily).toBe('industrial_operations')
    expect(lookupTitle('Directeur technique', 'esn_it')?.legacyFamily).toBe('tech_engineering_it')
    // Un domaine étranger aux deux candidates ne départage rien : on préfère
    // « je ne sais pas » à une famille tirée au sort.
    const foreign = lookupTitle('Directeur technique', 'finance')
    expect(foreign?.ambiguous).toBe(true)
    expect(foreign?.legacyFamily).toBeNull()
  })

  it('un titre NON ambigu ignore le domaine — il ne se laisse pas réécrire', () => {
    expect(lookupTitle('CTO', 'industrial_engineering')?.legacyFamily).toBe('tech_engineering_it')
  })
})
