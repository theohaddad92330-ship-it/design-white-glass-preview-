import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { summarizeKnownContacts } from './knownRelationshipFacts'

let seq = 0
const contact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: `c-${++seq}`,
    account_id: 'a-1',
    user_id: 'u-1',
    full_name: 'Jean Dupont',
    title: null,
    entity: null,
    decision_role: null,
    priority: 0,
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'new',
    source: null,
    raw_data: null,
    apollo_enrichment: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Contact

describe('summarizeKnownContacts — #1607.5', () => {
  it('« no_contacts » quand le compte n’a aucun contact connu', () => {
    expect(summarizeKnownContacts([])).toEqual({ status: 'no_contacts' })
  })

  it('« not_enriched » quand aucun contact n’a JAMAIS été enrichi — non mesuré, pas zéro', () => {
    const result = summarizeKnownContacts([contact({ apollo_enrichment: null }), contact({ apollo_enrichment: null })])
    expect(result).toEqual({ status: 'not_enriched', contactCount: 2 })
  })

  it('« enriched_no_presence » quand l’enrichissement n’a trouvé AUCUN rôle courant', () => {
    const result = summarizeKnownContacts([
      contact({
        apollo_enrichment: { employment_history: [{ organization_name: 'Ancien Employeur', current: false }] },
      }),
    ])
    expect(result).toEqual({ status: 'enriched_no_presence', enrichedCount: 1 })
  })

  it('« has_presence » avec le rôle ET la date de début, quand connus', () => {
    const c = contact({
      full_name: 'Marie Curie',
      apollo_enrichment: {
        employment_history: [
          { organization_name: 'Ancien', current: false },
          { organization_name: 'Ce Compte', title: 'DSI', start_date: '2019-03-01', current: true },
        ],
      },
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    const result = summarizeKnownContacts([c])
    expect(result).toEqual({
      status: 'has_presence',
      presences: [{ contactId: c.id, name: 'Marie Curie', role: 'DSI', since: '2019-03-01' }],
      mostRecentUpdateAt: '2026-05-01T00:00:00.000Z',
    })
  })

  it('le rôle retombe sur le titre CONNU du contact si l’entrée courante n’en porte pas', () => {
    const c = contact({
      title: 'Directeur Technique',
      apollo_enrichment: { employment_history: [{ organization_name: 'Ce Compte', current: true }] },
    })
    const result = summarizeKnownContacts([c])
    expect(result).toEqual({
      status: 'has_presence',
      presences: [{ contactId: c.id, name: c.full_name, role: 'Directeur Technique', since: null }],
      mostRecentUpdateAt: c.updated_at,
    })
  })

  it('« since » est NULL, jamais deviné, quand l’entrée courante n’a pas de date', () => {
    const c = contact({
      apollo_enrichment: { employment_history: [{ organization_name: 'Ce Compte', current: true }] },
    })
    const result = summarizeKnownContacts([c])
    expect(result.status).toBe('has_presence')
    if (result.status === 'has_presence') {
      expect(result.presences[0]?.since).toBeNull()
    }
  })

  it('mélange enrichi/non-enrichi : seuls les enrichis comptent pour le statut, tous pour le compte', () => {
    const enrichedWithPresence = contact({
      full_name: 'Avec Présence',
      apollo_enrichment: { employment_history: [{ organization_name: 'X', current: true, start_date: '2020-01-01' }] },
    })
    const enrichedNoPresence = contact({ apollo_enrichment: { employment_history: [] } })
    const notEnriched = contact({ apollo_enrichment: null })

    const result = summarizeKnownContacts([enrichedWithPresence, enrichedNoPresence, notEnriched])
    expect(result.status).toBe('has_presence')
    if (result.status === 'has_presence') {
      expect(result.presences).toHaveLength(1)
      expect(result.presences[0]?.name).toBe('Avec Présence')
    }
  })
})
