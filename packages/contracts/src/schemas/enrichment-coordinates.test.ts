import { describe, expect, it } from 'vitest'
import {
  enrichmentCoordinateStatesSchema,
  foldEnrichmentCoordinateStates,
  newlyFoundCoordinates,
  settleStalePendingCoordinates,
} from './enrichment-coordinates.js'

const AT = '2026-10-07T10:00:00.000Z'

describe('intégration J1 — la forme servie au client (#3822)', () => {
  it('ne sert jamais une source nommée : une clé hors coordonnée est retirée', () => {
    const parsed = enrichmentCoordinateStatesSchema.parse({
      phone: { state: 'unknown', sources_queried: 0, at: AT, source: 'apollo' },
      fullenrich: { state: 'found', sources_queried: 1, at: AT },
    })
    expect(parsed).toEqual({ phone: { state: 'unknown', sources_queried: 0, at: AT } })
  })

  it('refuse un état hors des quatre (pas de cinquième état « error »)', () => {
    expect(
      enrichmentCoordinateStatesSchema.safeParse({ email: { state: 'error', sources_queried: 0, at: AT } }).success,
    ).toBe(false)
  })
})

describe('E1 — état PAR COORDONNÉE après une tentative (#3698, #3822)', () => {
  it('« introuvable chez N sources » : N = sources qui ont RÉPONDU, jamais celles en panne', () => {
    const states = foldEnrichmentCoordinateStates(
      [
        { source: 'apollo', coordinate: 'phone', outcome: 'not_found' },
        { source: 'fullenrich', coordinate: 'phone', outcome: 'not_found' },
        { source: 'lusha', coordinate: 'phone', outcome: 'error' },
      ],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(states.phone).toEqual({ state: 'not_found', sources_queried: 2, at: AT })
    // Rien demandé pour l'e-mail ni LinkedIn : aucun état inventé.
    expect(states.email).toBeUndefined()
    expect(states.linkedin).toBeUndefined()
  })

  it('une source qui compte deux fois ne compte qu’une fois', () => {
    const states = foldEnrichmentCoordinateStates(
      [
        { source: 'apollo', coordinate: 'email', outcome: 'not_found' },
        { source: 'apollo', coordinate: 'email', outcome: 'not_found' },
      ],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(states.email?.sources_queried).toBe(1)
  })

  it('présent sur la fiche ⇒ trouvé, quelle que soit la réponse des sources', () => {
    const states = foldEnrichmentCoordinateStates(
      [{ source: 'apollo', coordinate: 'email', outcome: 'found' }],
      { email: 'a@b.fr', phone: null, linkedin_url: 'https://www.linkedin.com/in/x' },
      AT,
    )
    expect(states.email?.state).toBe('found')
    expect(states.linkedin?.state).toBe('found')
  })

  it('un mobile ATTENDU (webhook) est « en attente », jamais « introuvable »', () => {
    const states = foldEnrichmentCoordinateStates(
      [
        { source: 'apollo', coordinate: 'phone', outcome: 'not_found' },
        { source: 'apollo_reveal', coordinate: 'phone', outcome: 'pending' },
      ],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(states.phone?.state).toBe('pending')
  })

  it('un timeout n’est pas un échec : « inconnu », pas « introuvable » (doctrine)', () => {
    const states = foldEnrichmentCoordinateStates(
      [
        { source: 'apollo', coordinate: 'phone', outcome: 'not_found' },
        { source: 'fullenrich', coordinate: 'phone', outcome: 'unknown' },
      ],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(states.phone?.state).toBe('unknown')
  })

  it('toutes les sources en panne ⇒ inconnu (on ne sait rien)', () => {
    const states = foldEnrichmentCoordinateStates(
      [{ source: 'apollo', coordinate: 'phone', outcome: 'error' }],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(states.phone).toEqual({ state: 'unknown', sources_queried: 0, at: AT })
  })

  it('les sources ne sont jamais nommées dans l’état (doctrine : on ne nomme pas nos fournisseurs)', () => {
    const states = foldEnrichmentCoordinateStates(
      [{ source: 'fullenrich', coordinate: 'phone', outcome: 'not_found' }],
      { email: null, phone: null, linkedin_url: null },
      AT,
    )
    expect(JSON.stringify(states)).not.toContain('fullenrich')
  })
})

describe('E1 — le débit : seulement une coordonnée MANQUANTE trouvée', () => {
  it('dit OUI quand un téléphone absent arrive', () => {
    expect(newlyFoundCoordinates({ phone: null, email: 'a@b.fr' }, { phone: '+33 6 11 22 33 44' })).toEqual(['phone'])
  })

  it('dit NON quand une valeur déjà présente est seulement rafraîchie', () => {
    expect(newlyFoundCoordinates({ email: 'old@b.fr' }, { email: 'new@b.fr' })).toEqual([])
  })

  it('dit NON quand rien n’arrive', () => {
    expect(newlyFoundCoordinates({ email: null, phone: null }, {})).toEqual([])
    expect(newlyFoundCoordinates({ email: null }, { email: '  ' })).toEqual([])
  })

  it('LinkedIn seul ne se facture jamais (champ gratuit du même appel)', () => {
    expect(newlyFoundCoordinates({ linkedin_url: null }, { linkedin_url: 'https://www.linkedin.com/in/x' })).toEqual([])
  })
})

describe('une recherche de téléphone a une FIN (settleStalePendingCoordinates)', () => {
  // Décision Louis 31/10 : 15 min suffisent pour dire « introuvable » (et non 6 h).
  const now = Date.parse(AT) + 20 * 60_000
  it('à 14 min, « en recherche » dure encore ; à 15 min, la recherche a une fin', () => {
    const states = { phone: { state: 'pending' as const, sources_queried: 2, at: AT } }
    expect(settleStalePendingCoordinates(states, Date.parse(AT) + 14 * 60_000)).toBe(states)
    expect(settleStalePendingCoordinates(states, Date.parse(AT) + 15 * 60_000)?.phone?.state).toBe('not_found')
  })
  it('« en recherche » récent reste en recherche', () => {
    const states = {
      phone: { state: 'pending' as const, sources_queried: 2, at: new Date(now - 60_000).toISOString() },
    }
    expect(settleStalePendingCoordinates(states, now)).toBe(states)
  })
  it('au-delà du délai, avec des sources qui ont répondu : introuvable', () => {
    const out = settleStalePendingCoordinates({ phone: { state: 'pending', sources_queried: 2, at: AT } }, now)
    expect(out?.phone?.state).toBe('not_found')
  })
  it('au-delà du délai, sans réponse : inconnu (un timeout n’est pas un échec)', () => {
    const out = settleStalePendingCoordinates({ phone: { state: 'pending', sources_queried: 0, at: AT } }, now)
    expect(out?.phone?.state).toBe('unknown')
  })
  it('ne touche ni found, ni un autre canal, ni null', () => {
    const states = { email: { state: 'found' as const, sources_queried: 1, at: AT } }
    expect(settleStalePendingCoordinates(states, now)).toBe(states)
    expect(settleStalePendingCoordinates(null, now)).toBeNull()
  })
})
