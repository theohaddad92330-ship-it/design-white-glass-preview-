import { describe, expect, it } from 'vitest'
import { campaignAudience, type CampaignAudienceRead } from './campaign-audience'

/**
 * #1935.25 — L'AUDIENCE D'UNE CAMPAGNE, ET CE QUI EN SORT.
 *
 * L'URL de la campagne ne porte que des IDENTIFIANTS. Entre la proposition de
 * Laura et le clic, une fiche a pu être écartée, fusionnée, supprimée. Sans
 * cette fonction, ces contacts-là disparaîtraient de l'audience sans que
 * personne sache pourquoi — c'est exactement le défaut qu'on refuse.
 *
 * Chaque test protège une lecture FAUSSE :
 *  · un contact écarté qui rejoint quand même la campagne ;
 *  · un contact absent qui disparaît en silence ;
 *  · une fiche NON LUE prise pour une fiche INTROUVABLE (« non mesuré » rendu
 *    comme un fait) ;
 *  · un motif vide déguisé en motif.
 */
function read(over: Partial<{ id: string; full_name: string; title: string | null; email: string | null }> = {}) {
  return {
    id: over.id ?? 'c-1',
    state: 'read' as const,
    contact: {
      id: over.id ?? 'c-1',
      full_name: over.full_name ?? 'Marie Dubois',
      title: over.title ?? 'Directrice des systèmes d’information',
      email: over.email ?? 'marie@nova.fr',
    },
  }
}

describe('campaignAudience', () => {
  it('garde les contacts lus et actifs, dans l’ordre des identifiants', () => {
    const audience = campaignAudience([
      read({ id: 'c-1', full_name: 'Marie Dubois' }),
      read({ id: 'c-2', full_name: 'Alain Roche' }),
    ])
    expect(audience.eligible.map(c => c.full_name)).toEqual(['Marie Dubois', 'Alain Roche'])
    expect(audience.dropped).toEqual([])
    expect(audience.pending).toBe(0)
  })

  it('NOMME un contact écarté avec son motif écrit, et il ne rejoint pas l’audience', () => {
    const audience = campaignAudience([
      {
        id: 'c-9',
        state: 'read',
        contact: {
          id: 'c-9',
          full_name: 'Sophie Marin',
          title: null,
          email: 'sophie@nova.fr',
          excluded_at: '2026-09-01T09:00:00.000Z',
          exclusion_reason: 'a quitté l’entreprise',
        },
      },
    ])
    expect(audience.eligible).toEqual([])
    expect(audience.dropped).toEqual([
      { id: 'c-9', fullName: 'Sophie Marin', reason: 'opted_out', detail: 'a quitté l’entreprise' },
    ])
  })

  it('un contact écarté SANS motif écrit porte `null`, jamais une chaîne vide déguisée en motif', () => {
    const audience = campaignAudience([
      {
        id: 'c-9',
        state: 'read',
        contact: {
          id: 'c-9',
          full_name: 'Sophie Marin',
          title: null,
          email: null,
          excluded_at: '2026-09-01T09:00:00.000Z',
          exclusion_reason: '   ',
        },
      },
    ])
    expect(audience.dropped[0]?.detail).toBeNull()
  })

  it('un contact introuvable est NOMMÉ par son identifiant — jamais par un nom inventé', () => {
    const audience = campaignAudience([{ id: 'c-404', state: 'missing' }])
    expect(audience.dropped).toEqual([{ id: 'c-404', fullName: null, reason: 'missing', detail: null }])
    expect(audience.eligible).toEqual([])
  })

  it('une fiche NON LUE n’est pas dite « introuvable » — les deux ne se confondent pas', () => {
    const audience = campaignAudience([{ id: 'c-7', state: 'unreadable' }])
    expect(audience.dropped[0]?.reason).toBe('unreadable')
  })

  it('compte les fiches encore en lecture, et ne conclut RIEN à leur place', () => {
    const audience = campaignAudience([read({ id: 'c-1' }), { id: 'c-2', state: 'pending' }])
    expect(audience.pending).toBe(1)
    expect(audience.eligible).toHaveLength(1)
    expect(audience.dropped).toEqual([])
  })

  it('sans aucun identifiant, il n’y a ni audience, ni écarté, ni attente', () => {
    const audience = campaignAudience([])
    expect(audience).toEqual({ eligible: [], dropped: [], pending: 0 })
  })

  it('n’attrape PAS ce qu’elle ne vise pas : `excluded_at` à `null` reste un contact éligible', () => {
    const reads: CampaignAudienceRead[] = [
      {
        id: 'c-3',
        state: 'read',
        contact: {
          id: 'c-3',
          full_name: 'Karim Haddad',
          title: null,
          email: null,
          excluded_at: null,
          exclusion_reason: null,
        },
      },
    ]
    const audience = campaignAudience(reads)
    expect(audience.eligible.map(c => c.id)).toEqual(['c-3'])
    expect(audience.dropped).toEqual([])
  })
})
