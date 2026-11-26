import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  candidateZoneLabel,
  discoverZoneWideningSchema,
  needsZoneWidening,
  ZONE_AUTO_MAX_TIER,
  ZONE_TIERS,
  ZONE_TIERS_CONSTANTS,
  ZONE_WIDEN_MIN_RESULTS,
  zoneCeilingBefore,
  zoneRevertLabel,
  zoneStepBackLabel,
  zoneStepLabel,
  zoneTiersAfter,
  zoneWideningHeadline,
} from './zone-tiers.js'
import { discoverRegistryFiltersSchema, discoverResponseSchema } from './discover.js'

// ⚠️ c144 (Louis, 27/10/2026 au soir, ratifie #4640) : puis département, région — l'échelle AUTOMATIQUE
// s'arrête à la RÉGION, même à 0 compte. `france` reste NOMMABLE (ZONE_TIERS) mais n'est plus un élargissement
// automatique. Renverse c143 (lot DÉCOUVRIR-ZONE, le matin même) : l'arrêt à la région a été livré deux fois.
// Louis 02/11/2026 (QCM, #4429) : l'échelle est 25 km → 50 km → département → région ; AUCUN barreau 100 km.
describe('c144 — 50 km, puis des paliers nommés jusqu’à la région, et pas au-delà', () => {
  it('ville → 50 km → département → région : la France sort de l’échelle automatique, pas du vocabulaire', () => {
    expect(ZONE_TIERS).toEqual(['city', 'radius_50', 'department', 'region', 'france'])
    expect(ZONE_TIERS).not.toContain('radius_100') // DIT NON : aucun barreau 100 km dans l'échelle automatique
    expect(ZONE_AUTO_MAX_TIER).toBe('region')
    expect(zoneTiersAfter('city')).not.toContain('france')
    expect(zoneTiersAfter('region')).toEqual([])
    expect(zoneTiersAfter('france')).toEqual([])
    expect(
      discoverZoneWideningSchema.safeParse({ place: 'Lille', tier: 'france', exactCount: 0, widenedCount: 12 }).success,
    ).toBe(true)
    expect(Object.keys(ZONE_TIERS_CONSTANTS.headlines.fr)).not.toContain('exhausted')
  })

  it('chaque palier se NOMME, en fr et en en', () => {
    const base = { place: 'Lille', exactCount: 0, widenedCount: 12 } as const
    expect(zoneWideningHeadline({ ...base, tier: 'department', area: 'Nord' }, 'fr')).toBe(
      'Peu de comptes à Lille : recherche élargie au département (Nord)',
    )
    expect(zoneWideningHeadline({ ...base, tier: 'france' }, 'fr')).toBe(
      'Peu de comptes à Lille : recherche élargie à toute la France',
    )
    expect(zoneWideningHeadline({ ...base, tier: 'france' }, 'en')).toBe(
      'Few accounts in Lille: search widened to all of France',
    )
    expect(zoneStepLabel('department', 'fr')).toBe('le département')
    expect(zoneStepLabel('france', 'fr')).toBe('toute la France')
    expect(zoneStepLabel('france', 'en')).toBe('all of France')
  })

  it('un geste revient au palier d’avant — depuis le département, à 50 km', () => {
    expect(zoneCeilingBefore('department')).toBe('radius_50')
    expect(zoneCeilingBefore('france')).toBe('region')
    expect(zoneStepBackLabel('department', 'fr')).toBe('Revenir à 50 km')
    expect(zoneStepBackLabel('region', 'fr')).toBe('Revenir au département')
    expect(zoneStepBackLabel('france', 'fr')).toBe('Revenir à la grande région')
    expect(zoneStepBackLabel('region', 'en')).toBe('Back to the department')
  })

  // Lot S (01/11) — avec le barreau 50 km, le geste nomme le barreau RÉEL d'avant, jamais le rayon de départ (un
  // « Revenir à 25 km » laissait l'échelle rejouer 50 et 100 km : le bouton mentait).
  it('lot S — « Revenir à N km » nomme le barreau d’avant, et dit NON au rayon de départ', () => {
    expect(zoneStepBackLabel('department', 'fr')).toBe('Revenir à 50 km')
    expect(zoneStepBackLabel('department', 'en')).toBe('Back to 50 km')
    expect(zoneStepBackLabel('radius_50', 'fr')).toBeNull()
    expect(zoneStepBackLabel('region', 'fr')).toBe('Revenir au département')
  })

  // #4657 (recette prod 27/10) — « 3 ajoutés par l'élargissement » et aucune ligne ne portait son palier : une ligne
  // élargie NOMME son palier, son département s'y ajoute quand il est connu, et elle n'est JAMAIS muette.
  it('un compte élargi nomme son palier, sur la ligne, même sans département connu', () => {
    expect(candidateZoneLabel({ tier: 'france', area: 'Alpes-Maritimes' }, 'Lille', 'fr')).toBe(
      'Élargi à toute la France · Alpes-Maritimes',
    )
    expect(candidateZoneLabel({ tier: 'france' }, 'Lille', 'fr')).toBe('Élargi à toute la France')
    expect(candidateZoneLabel({ tier: 'department', area: 'Nord' }, 'Lille', 'fr')).toBe('Élargi au département · Nord')
    expect(candidateZoneLabel({ tier: 'region' }, 'Lille', 'fr')).toBe('Élargi à la région')
    expect(candidateZoneLabel({ tier: 'region', area: 'Oise' }, 'Lille', 'en')).toBe('Widened to the region · Oise')
  })

  it('le filtre Découvrir accepte 100 km (réglage manuel, hors échelle) et refuse au-delà', () => {
    expect(discoverRegistryFiltersSchema.parse({ city: 'Lille', radiusKm: 100 }).radiusKm).toBe(100)
    expect(discoverRegistryFiltersSchema.safeParse({ city: 'Lille', radiusKm: 150 }).success).toBe(false)
  })
})

// #4429.1 — LES paliers de zone : une seule définition, lue par Découvrir, Laura et l'analyse.
describe('#4429.1 — paliers de zone', () => {
  // Louis, 25/10/2026 : « élargir d'abord sur 100 km autour, puis toute la grande région » — règle FINALE du 27/10 :
  // le département s'intercale, et la France reste le dernier barreau (voir le bloc DÉCOUVRIR-ZONE ci-dessus).
  it('ville stricte → 50 km → département → région, dans cet ordre, et pas au-delà (c144)', () => {
    expect(zoneTiersAfter('city')).toEqual(['radius_50', 'department', 'region'])
  })

  it('aucun saut : le premier barreau après la ville est 50 km (lot S, 01/11), jamais le département ni la France', () => {
    expect(zoneTiersAfter('city')[0]).toBe('radius_50')
    expect(zoneTiersAfter('radius_50')[0]).toBe('department')
    expect(zoneTiersAfter('city')[0]).not.toBe('france')
  })

  it('chaque barreau se nomme, et un geste revient au précédent', () => {
    expect(zoneStepLabel('radius_50', 'fr')).toBe('50 km')
    expect(zoneStepLabel('region', 'fr')).toBe('la grande région')
    expect(zoneStepLabel('region', 'en')).toBe('the wider region')
    // 50 km n'a pas de barreau d'avant (la ville seule : `zoneStrict`) : le geste dit « Toulouse seule ».
    expect(zoneCeilingBefore('radius_50')).toBeNull()
    expect(zoneStepBackLabel('radius_50', 'fr')).toBeNull()
    expect(zoneCeilingBefore('department')).toBe('radius_50')
    expect(zoneStepBackLabel('department', 'en')).toBe('Back to 50 km')
    expect(zoneStepBackLabel('department', 'fr')).toBe('Revenir à 50 km')
  })

  it('élargit sous 25 résultats — et dit NON à partir de 25', () => {
    expect(ZONE_WIDEN_MIN_RESULTS).toBe(25)
    expect(needsZoneWidening(0)).toBe(true)
    expect(needsZoneWidening(24)).toBe(true)
    expect(needsZoneWidening(25)).toBe(false)
    expect(needsZoneWidening(42)).toBe(false)
  })

  it("l'élargissement s'ÉCRIT au-dessus de la liste, en fr et en en", () => {
    const radius50 = { place: 'Toulouse', tier: 'radius_50', exactCount: 3, widenedCount: 5 } as const
    expect(zoneWideningHeadline(radius50, 'fr')).toBe('Peu de comptes à Toulouse : recherche élargie à 50 km')
    expect(candidateZoneLabel({ tier: 'radius_50', distanceKm: 31.2 }, 'Toulouse', 'fr')).toBe(
      'Élargi à 50 km · à 31 km de Toulouse',
    )
    const radius = { place: 'Toulouse', tier: 'radius_50', exactCount: 3, widenedCount: 12 } as const
    expect(zoneWideningHeadline(radius, 'en')).toBe('Few accounts in Toulouse: search widened to 50 km')
    const region = { ...radius, tier: 'region', area: 'Occitanie' } as const
    expect(zoneWideningHeadline(region, 'fr')).toBe(
      'Peu de comptes à Toulouse : recherche élargie à la région (Occitanie)',
    )
    // Une aire inconnue ne se nomme pas : le gabarit sans parenthèse.
    expect(zoneWideningHeadline({ ...radius, tier: 'region' }, 'fr')).toBe(
      'Peu de comptes à Toulouse : recherche élargie à la région',
    )
    expect(zoneRevertLabel('Toulouse', 'fr')).toBe('Revenir à Toulouse seule')
    expect(zoneRevertLabel('Toulouse', 'en')).toBe('Back to Toulouse only')
  })

  it('étiquette chaque compte élargi — les exacts ne portent rien', () => {
    expect(candidateZoneLabel({ tier: 'radius_50', distanceKm: 37.6 }, 'Toulouse', 'fr')).toBe(
      'Élargi à 50 km · à 38 km de Toulouse',
    )
    // #4433.3 — sans distance MESURÉE, jamais « à moins de 25 km » : on dit le critère d'entrée, pas une proximité.
    expect(candidateZoneLabel({ tier: 'radius_50' }, 'Toulouse', 'fr')).toBe("Ajouté par l'élargissement de zone")
    expect(candidateZoneLabel({ tier: 'radius_50' }, 'Toulouse', 'en')).toBe('Added by the zone widening')
    // Une distance mesurée HORS du rayon du palier n'est pas une proximité : on ne l'écrit pas non plus.
    expect(candidateZoneLabel({ tier: 'radius_50', distanceKm: 590 }, 'Toulouse', 'fr')).toBe(
      "Ajouté par l'élargissement de zone",
    )
    expect(candidateZoneLabel({ tier: 'region', area: 'Haute-Garonne' }, 'Toulouse', 'fr')).toBe(
      'Élargi à la région · Haute-Garonne',
    )
    expect(candidateZoneLabel({ tier: 'radius_50', distanceKm: 12 }, 'Toulouse', 'en')).toBe(
      'Widened to 50 km · 12 km from Toulouse',
    )
    expect(candidateZoneLabel({ tier: 'city' }, 'Toulouse', 'fr')).toBeNull()
    // #4657 — une aire non connue ne s'invente pas : le palier seul, jamais une ligne muette.
    expect(candidateZoneLabel({ tier: 'region' }, 'Toulouse', 'fr')).toBe('Élargi à la région')
  })

  it('le palier ville ne voyage jamais comme un élargissement', () => {
    expect(
      discoverZoneWideningSchema.safeParse({ place: 'Toulouse', tier: 'city', exactCount: 2, widenedCount: 0 }).success,
    ).toBe(false)
    expect(
      discoverZoneWideningSchema.safeParse({ place: 'Toulouse', tier: 'radius_50', exactCount: 2, widenedCount: 9 })
        .success,
    ).toBe(true)
    // Lot S (01/11, recette) : 50 km REVIENT comme barreau (25 → 50 → département → région). 25 km reste le
    // rayon par défaut de la ville, jamais un barreau : `radius_25` ne voyage pas.
    expect(
      discoverZoneWideningSchema.safeParse({ place: 'Toulouse', tier: 'radius_50', exactCount: 2, widenedCount: 9 })
        .success,
    ).toBe(true)
    for (const old of ['radius_25']) {
      expect(
        discoverZoneWideningSchema.safeParse({ place: 'Toulouse', tier: old, exactCount: 2, widenedCount: 9 }).success,
      ).toBe(false)
    }
    // Les barreaux franchis voyagent, dans l'ordre ; la ville n'en est jamais un.
    expect(
      discoverZoneWideningSchema.safeParse({
        place: 'Toulouse',
        tier: 'region',
        steps: ['radius_50', 'region'],
        exactCount: 2,
        widenedCount: 9,
      }).success,
    ).toBe(true)
    expect(
      discoverZoneWideningSchema.safeParse({
        place: 'Toulouse',
        tier: 'region',
        steps: ['city'],
        exactCount: 2,
        widenedCount: 9,
      }).success,
    ).toBe(false)
  })

  // Le service IA ne peut pas importer ce paquet (racine Railway `apps/ia`) : le JSON est le point de
  // rencontre, et `apps/ia/tests/test_4429_zone_tiers.py` vérifie que le Python dit ce que dit le JSON.
  it('le JSON partagé dit EXACTEMENT ce que dit ce fichier', () => {
    const snapshot = JSON.parse(readFileSync(new URL('./zone-tiers.constants.json', import.meta.url), 'utf8'))
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(ZONE_TIERS_CONSTANTS)))
    expect(snapshot.tiers.length).toBeGreaterThan(0)
  })

  // 2710N — « je me suis arrêté à la région » est un FAIT du service (TENTÉ), distinct de `tier` (TROUVÉ).
  it('autoCapReached : optionnel, et une phrase NEUVE quand le barreau parcouru n’a rien ajouté', () => {
    const base = { place: 'Lille', tier: 'region', area: 'Hauts-de-France', exactCount: 3, widenedCount: 0 } as const
    expect(discoverZoneWideningSchema.safeParse(base).success).toBe(true)
    expect(discoverZoneWideningSchema.parse({ ...base, autoCapReached: true }).autoCapReached).toBe(true)
    const stopped = { ...base, autoCapReached: true }
    expect(zoneWideningHeadline(stopped, 'fr')).toBe(
      "Peu de comptes à Lille : cherché jusqu'à Hauts-de-France, sans compte de plus.",
    )
    expect(zoneWideningHeadline(stopped, 'en')).toBe(
      'Few accounts in Lille: searched up to Hauts-de-France, with no further account.',
    )
    expect(zoneWideningHeadline({ ...stopped, area: undefined }, 'fr')).toBe(
      "Peu de comptes à Lille : cherché jusqu'à la région, sans compte de plus.",
    )
    // DIT NON : le barreau GAGNANT garde sa phrase, arrêt dit ou non — et sans l'arrêt, rien n'est « cherché jusqu'à ».
    expect(zoneWideningHeadline({ ...stopped, tier: 'department', area: 'Nord', widenedCount: 2 }, 'fr')).toBe(
      'Peu de comptes à Lille : recherche élargie au département (Nord)',
    )
    expect(zoneWideningHeadline(base, 'fr')).toBe(
      'Peu de comptes à Lille : recherche élargie à la région (Hauts-de-France)',
    )
  })

  it('le contrat Découvrir porte le palier jusqu’à l’écran (jamais retiré par un parse)', () => {
    const zoneWidening = {
      place: 'Toulouse',
      tier: 'radius_50',
      steps: ['radius_50'],
      exactCount: 3,
      widenedCount: 9,
    }
    const parsed = discoverResponseSchema.parse({ candidates: [], query: {}, degraded: [], zoneWidening })
    expect(parsed.zoneWidening).toEqual(zoneWidening)
    expect(discoverRegistryFiltersSchema.parse({ city: 'Toulouse', zoneStrict: true }).zoneStrict).toBe(true)
    expect(discoverRegistryFiltersSchema.parse({ city: 'Toulouse', zoneCeiling: 'region' }).zoneCeiling).toBe('region')
    expect(discoverRegistryFiltersSchema.parse({ city: 'Toulouse', zoneCeiling: 'department' }).zoneCeiling).toBe(
      'department',
    )
    // La France est le dernier barreau : la plafonner à la France, c'est ne rien plafonner — refusé.
    expect(discoverRegistryFiltersSchema.safeParse({ city: 'Toulouse', zoneCeiling: 'france' }).success).toBe(false)
  })
})

// #4432.3 — la carte de classement de Laura porte la zone cherchée (le lot la transmet au dossier) et
// l'étiquette de palier de chaque compte élargi.
describe('#4432.3 — la carte account_ranking porte la zone cherchée', () => {
  it('garde search_zone et zone_label (jamais retirés par la validation)', async () => {
    const { replyBlockSchema } = await import('./reply-blocks.js')
    const parsed = replyBlockSchema.parse({
      type: 'account_ranking',
      axes: ['Région : Occitanie'],
      search_zone: { regions: ['Occitanie'] },
      items: [{ name: 'SAFRAN', why: ['Aéronautique'], zone_label: 'Haute-Garonne' }],
    })
    expect(parsed).toMatchObject({ search_zone: { regions: ['Occitanie'] }, items: [{ zone_label: 'Haute-Garonne' }] })
  })
})
