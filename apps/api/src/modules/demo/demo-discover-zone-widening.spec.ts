import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_ZONE_WIDENING_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4429.4 — « et en démonstration, Découvrir “Toulouse” montre quoi ? » (craft rule n°9)
 *
 * La salle n'a que deux comptes toulousains : comme le vrai chemin (`discover.py`,
 * `_widen_by_zone_tiers`), la ville seule rend moins de 10 comptes, la recherche s'élargit, le
 * BANDEAU dit le palier et chaque compte ajouté porte son étiquette. Lit la VRAIE réponse scriptée.
 */
type Row = { name: string; city: string | null; zone?: { tier: string; area?: string } }
type Response = {
  candidates: Row[]
  zoneWidening?: {
    place: string
    tier: string
    steps?: string[]
    area?: string
    exhausted?: true
    autoCapReached?: boolean
    exactCount: number
    widenedCount: number
  }
}

const run = (filters: Record<string, unknown>) => demoDiscoverResponse(filters) as unknown as Response

describe('#4429.4 — Découvrir « Toulouse » en démonstration', () => {
  // c144 (Louis, 27/10/2026 au soir ; 02/11 : 25 → 50 km, plus de 100 km) : 50 km, puis département, région — l'automatique s'ARRÊTE à la région, même
  // sous le seuil. La salle n'a que deux comptes toulousains : le département ajoute Blagnac, la région n'ajoute rien.
  // 2710N — la démo dit la VÉRITÉ : le palier annoncé est celui que porte une ligne rendue (le département), jamais la
  // région « tentée » ; l'arrêt à la région est un fait à part (`autoCapReached`), qui fait sortir la ligne d'arrêt.
  it('annonce le département (Blagnac) et DIT que la recherche s’est arrêtée à la région', () => {
    const response = run({ city: 'Toulouse', includeOutOfTarget: true })
    expect(response.zoneWidening).toEqual({
      place: 'Toulouse',
      tier: 'department',
      // Le barreau région n'a rien ajouté : il n'est pas annoncé (#4627), seul `autoCapReached` dit qu'il a été tenté.
      steps: ['radius_50', 'department'],
      area: 'Haute-Garonne',
      exactCount: 2,
      widenedCount: response.candidates.length - 2,
      autoCapReached: true,
    })
    expect(response.zoneWidening?.exhausted).toBeUndefined()
    const [first, second, ...rest] = response.candidates
    expect([first?.city, second?.city]).toEqual(['Toulouse', 'Toulouse'])
    expect(first?.zone).toBeUndefined()
    expect(rest[0]).toMatchObject({ city: 'Blagnac', zone: { tier: 'department', area: 'Haute-Garonne' } })
    // DIT NON : la démo n'annonce pas la région (aucune ligne n'y est), ni la France.
    expect(response.zoneWidening?.tier).not.toBe('region')
    expect(response.candidates.some(row => row.zone?.tier === 'region' || row.zone?.tier === 'france')).toBe(false)
    expect(response.zoneWidening?.steps).not.toContain('region')
    expect(response.zoneWidening?.steps).not.toContain('france')
    expect(response.candidates.length).toBeLessThan(10)
    // Le contrat le porte jusqu'à l'écran (jamais retiré par un parse).
    expect(discoverResponseSchema.safeParse(response).success).toBe(true)
    expect(discoverResponseSchema.parse(response).zoneWidening?.autoCapReached).toBe(true)
  })

  it('dit NON : « Revenir à Toulouse seule », un département ou aucune ville ne s’élargissent pas', () => {
    expect(run({ city: 'Toulouse', zoneStrict: true, includeOutOfTarget: true }).zoneWidening).toBeUndefined()
    expect(run({ department: '31', includeOutOfTarget: true }).zoneWidening).toBeUndefined()
    expect(run({ includeOutOfTarget: true }).zoneWidening).toBeUndefined()
  })

  it('dit NON au saut : « Revenir au palier d’avant » borne l’échelle', () => {
    // « Revenir à 50 km » : la salle n'a rien à 50 km — aucun palier.
    expect(run({ city: 'Toulouse', zoneCeiling: 'radius_50', includeOutOfTarget: true }).zoneWidening).toBeUndefined()
    const capped = run({ city: 'Toulouse', zoneCeiling: 'department', includeOutOfTarget: true }).zoneWidening
    expect(capped?.tier).toBe('department')
    expect(capped?.area).toBe('Haute-Garonne')
    expect(capped?.steps).toEqual(['radius_50', 'department'])
    // Borné au département par l'utilisateur : la région n'a pas été tentée, l'arrêt à la région ne se dit pas.
    expect(capped?.autoCapReached).toBeUndefined()
  })

  // Louis 02/11 : le web envoie 25 km avec une ville — l'échelle part de là (50 km, département, région) ; un rayon
  // choisi à la main (50 ou 100 km) est la maille voulue, et AUCUN barreau 100 km n'existe dans l'échelle.
  it('au rayon de départ (25 km), l’échelle est 50 km puis le département, jamais 100 km', () => {
    const response = run({ city: 'Toulouse', radiusKm: 25, includeOutOfTarget: true })
    expect(response.zoneWidening?.steps).toEqual(['radius_50', 'department'])
    expect(response.zoneWidening?.tier).toBe('department')
    expect(response.zoneWidening?.autoCapReached).toBe(true)
    expect(JSON.stringify(response.zoneWidening)).not.toContain('radius_100')
    expect(run({ city: 'Toulouse', radiusKm: 100, includeOutOfTarget: true }).zoneWidening).toBeUndefined()
  })

  it('est classé « seedé » avec sa raison', () => {
    expect(DEMO_DISCOVER_ZONE_WIDENING_COVERAGE.state).toBe('seede')
  })
})
