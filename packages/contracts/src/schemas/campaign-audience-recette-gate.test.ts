import { describe, expect, it } from 'vitest'
import {
  buildCampaignAudience,
  campaignAudienceFiltersSchema,
  type AudienceCandidate,
} from './campaign-audience-builder.js'

/**
 * Épopée #2974 — GATE DE RECETTE (#2380.71-80).
 *
 * Six lots successifs (25-29/09) ont livré chaque scénario mono-contact
 * séparément, chacun couvert par un test unitaire de son propre module —
 * mais aucune gate ne les rejoue TOUS ENSEMBLE sur un seul lancement, comme
 * un commercial le vivrait réellement (lot campagnes-restes-29-09, #2974).
 * Ce fichier est cette gate : UN lancement, 50 contacts, qui exerce à la
 * fois #2380.71 (50 contacts d'un coup), #2380.72 (doublons), #2380.73
 * (3 owners distincts), #2380.74 (opt-out), #2380.75 (contact récent —
 * refroidissement), #2380.76 (coordonnées absentes), #2380.78 (contact
 * parti), et l'invariant #2380.80 (jamais enrôlé si refusé ou déjà
 * travaillé). #2380.77 (cible dynamique) et #2380.79 (2 espaces) sont
 * prouvés côté service (`campaign-audience.service.spec.ts`) — ce fichier
 * ne peut pas les exercer, la fonction pure n'a pas de notion d'espace.
 */

const NOW = new Date('2026-09-30T12:00:00Z')
const ME = 'u-me'

function candidate(over: Partial<AudienceCandidate> & { id: string }): AudienceCandidate {
  return {
    full_name: `Contact ${over.id}`,
    title: null,
    account_id: 'a-1',
    account_name: 'Acme',
    account_parked: false,
    entity: null,
    decision_role: null,
    seniority: null,
    location: null,
    family: null,
    priority: null,
    user_status: 'new',
    assigned_to: null,
    email: `${over.id}@acme.test`,
    phone: null,
    linkedin_url: null,
    identity_confirmed: true,
    last_enrichment_at: null,
    last_contacted_at: null,
    lifecycle_state: null,
    opted_out: false,
    erased: false,
    active_sequence: null,
    prior_sequences_count: 0,
    ...over,
  }
}

describe('gate de recette — audience de campagne (#2380.71-80)', () => {
  it('un lancement de 50 contacts rejoue ensemble doublons, 3 owners, opt-out, cooldown, coordonnées absentes, contact parti', () => {
    // #2380.71 — un lot RÉALISTE, pas trois candidats symboliques.
    const rest = Array.from({ length: 43 }, (_, i) =>
      candidate({ id: `rest-${i}`, assigned_to: i % 2 === 0 ? 'u-me' : 'u-collegue' }),
    )
    const pool: AudienceCandidate[] = [
      ...rest,
      // #2380.72 — deux contacts qui partagent le même e-mail : doublon PROPOSÉ, jamais fusionné.
      candidate({ id: 'dup-a', email: 'meme.personne@acme.test' }),
      candidate({ id: 'dup-b', email: 'meme.personne@acme.test' }),
      // #2380.73 — un troisième owner distinct (les 43 « rest » n'en couvrent que deux).
      candidate({ id: 'owner-3', assigned_to: 'u-tiers' }),
      // #2380.74 — opt-out : exclu, sa raison d'arrêt nommée, jamais deviné.
      candidate({ id: 'opted-out', opted_out: true, stop_reason: 'do_not_call' }),
      // #2380.75 — contacté il y a 2 jours < refroidissement (14 jours par défaut).
      candidate({ id: 'recent', last_contacted_at: '2026-09-28T12:00:00Z' }),
      // #2380.76 — aucune coordonnée pour le canal visé (email) : exclu, jamais un contact vide envoyé.
      candidate({ id: 'no-coords', email: null }),
      // #2380.78 — contact parti (cycle de vie « historique »).
      candidate({ id: 'left', lifecycle_state: 'historique' }),
    ]
    expect(pool).toHaveLength(50)

    const result = buildCampaignAudience(pool, campaignAudienceFiltersSchema.parse({ channel: 'email' }), {
      now: NOW,
      viewerId: ME,
    })

    // #2380.71 — le lancement lit bien les 50, aucun perdu en route.
    expect(result.preview.total).toBe(50)

    // #2380.72 — les deux doublons e-mail sont PROPOSÉS, pas fusionnés : les
    // deux restent dans le pool (éligibles ou exclus selon leurs autres faits),
    // et la paire est nommée dans `duplicates`.
    expect(result.duplicates).toEqual([{ key: 'email', contact_ids: ['dup-a', 'dup-b'] }])
    expect(result.eligible.find(e => e.contact_id === 'dup-a')?.duplicate_suspected).toBe(true)
    expect(result.eligible.find(e => e.contact_id === 'dup-b')?.duplicate_suspected).toBe(true)

    // #2380.73 — trois owners distincts sont bien représentés parmi les éligibles.
    const ownersSeen = new Set(result.eligible.map(e => pool.find(c => c.id === e.contact_id)?.assigned_to ?? 'u-me'))
    expect(ownersSeen).toEqual(new Set(['u-me', 'u-collegue', 'u-tiers']))

    // #2380.74 — l'opt-out sort avec sa raison nommée.
    expect(result.excluded.find(e => e.contact_id === 'opted-out')).toMatchObject({
      reason: 'opted_out',
      stop_reason: 'do_not_call',
    })

    // #2380.75 — le contact récent sort en cooldown, jamais une seconde relance trop tôt.
    expect(result.excluded.find(e => e.contact_id === 'recent')).toMatchObject({ reason: 'cooldown' })

    // #2380.76 — sans coordonnée pour le canal visé, exclu et compté.
    expect(result.excluded.find(e => e.contact_id === 'no-coords')).toMatchObject({ reason: 'missing_coordinates' })
    expect(result.preview.missing_coordinates).toBe(1)

    // #2380.78 — un contact parti ne fait jamais une ligne éligible.
    expect(result.excluded.find(e => e.contact_id === 'left')).toMatchObject({ reason: 'contact_left' })

    // #2380.80 — invariant : aucun contact refusé (opt-out) ni déjà écarté par
    // le cycle de vie (parti) ne se retrouve JAMAIS dans les éligibles, quel
    // que soit l'ordre d'évaluation des règles.
    const eligibleIds = new Set(result.eligible.map(e => e.contact_id))
    expect(eligibleIds.has('opted-out')).toBe(false)
    expect(eligibleIds.has('left')).toBe(false)
    expect(eligibleIds.has('recent')).toBe(false)
    expect(eligibleIds.has('no-coords')).toBe(false)

    // Le total se reconstitue exactement : éligibles + exclus = le pool entier.
    expect(result.eligible.length + result.excluded.length).toBe(50)
  })
})
