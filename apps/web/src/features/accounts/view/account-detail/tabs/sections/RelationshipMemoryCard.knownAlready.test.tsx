import type { Contact, RelationshipMemory } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { RelationshipMemoryCard } from './RelationshipMemoryCard'

let contacts: Contact[] = []

vi.mock('@/features/contacts/api', () => ({
  contactKeys: { byAccount: (accountId: string) => ['contacts', 'account', accountId] as const },
  contactsApi: { listByAccount: () => Promise.resolve(contacts) },
}))

vi.mock('@/features/accounts/api', () => ({
  accountsApi: { setRelationshipMemory: vi.fn().mockResolvedValue({}) },
}))

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

beforeEach(() => {
  cleanup()
  contacts = []
})

/**
 * #1607.5 — LE BLOC « CE QUE BELLUM SAIT DÉJÀ ».
 *
 * ⚠️ Ce que ces tests tiennent, verbatim depuis le lot :
 *  1. Le bloc NOMME ce qu'il ne sait pas, et n'écrit JAMAIS « 0 » pour une
 *     valeur absente.
 *  2. Une correction humaine (le formulaire) n'est JAMAIS écrasée par ce que
 *     le bloc affiche, quelle que soit sa date.
 */
describe('RelationshipMemoryCard — « Ce que Bellum sait déjà » (#1607.5)', () => {
  it('nomme l’absence de contact — jamais un « 0 »', async () => {
    contacts = []
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={null} />)

    expect(await screen.findByText("Aucun contact connu sur ce compte pour l'instant.")).toBeInTheDocument()
    // Aucun « 0 » brut n'apparaît nulle part dans le bloc.
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('nomme l’absence d’enrichissement — NON MESURÉ, pas zéro', async () => {
    contacts = [contact({ apollo_enrichment: null }), contact({ apollo_enrichment: null })]
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={null} />)

    expect(await screen.findByText(/jamais enrichis/)).toBeInTheDocument()
    expect(screen.getByText(/2 contacts connus/)).toBeInTheDocument()
  })

  it('affiche le rôle et la date de présence connue, avec sa provenance', async () => {
    contacts = [
      contact({
        full_name: 'Marie Curie',
        apollo_enrichment: {
          employment_history: [
            { organization_name: 'Ce Compte', title: 'DSI', start_date: '2019-03-01', current: true },
          ],
        },
      }),
    ]
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={null} />)

    expect(await screen.findByText('Marie Curie')).toBeInTheDocument()
    expect(screen.getByText('DSI')).toBeInTheDocument()
    expect(screen.getByText(/connu depuis/)).toBeInTheDocument()
    // Provenance : la source ET la date (Primitive `Provenance`).
    expect(screen.getByText(/calculé par|pipeline/i)).toBeInTheDocument()
  })

  it('nomme un rôle ou une date manquants — jamais devinés, jamais « 0 »', async () => {
    contacts = [
      contact({
        full_name: 'Sans Date',
        apollo_enrichment: { employment_history: [{ organization_name: 'Ce Compte', current: true }] },
      }),
    ]
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={null} />)

    expect(await screen.findByText('Sans Date')).toBeInTheDocument()
    expect(screen.getByText('rôle non identifié')).toBeInTheDocument()
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  it('une CORRECTION HUMAINE dans le formulaire n’est JAMAIS écrasée par ce que le bloc affiche', async () => {
    const user = userEvent.setup()
    contacts = [
      contact({
        full_name: 'Marie Curie',
        apollo_enrichment: {
          employment_history: [
            { organization_name: 'Ce Compte', title: 'DSI', start_date: '2019-03-01', current: true },
          ],
        },
      }),
    ]
    const memory: RelationshipMemory = { relation: 'Client historique depuis 2018' }
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={memory} />)

    // Le champ « Relation » (saisie humaine) garde sa valeur, quoi que le
    // bloc « déjà su » affiche à côté.
    const champRelation = (await screen.findByDisplayValue('Client historique depuis 2018')) as HTMLInputElement
    expect(champRelation.value).toBe('Client historique depuis 2018')

    // L'utilisateur tape par-dessus : c'est SA saisie qui doit rester,
    // jamais retapée par le bloc de lecture.
    await user.clear(champRelation)
    await user.type(champRelation, 'Nouvelle note du commercial')
    expect(champRelation.value).toBe('Nouvelle note du commercial')
    // Le bloc de lecture reste lui-même inchangé, à côté.
    expect(screen.getByText('Marie Curie')).toBeInTheDocument()
  })
})
