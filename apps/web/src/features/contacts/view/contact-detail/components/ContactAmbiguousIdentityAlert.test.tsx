import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactAmbiguousIdentityAlert } from './ContactAmbiguousIdentityAlert'

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c-1',
    account_id: 'a-1',
    full_name: 'Sandrine Martin',
    title: 'DSI',
    entity: 'BPCE',
    decision_role: 'technical',
    priority: 1,
    email: 'sandrine@bpce.com',
    email_verified: false,
    phone: null,
    linkedin_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'contacted',
    source: null,
    lifecycle_state: null,
    apollo_enrichment: null,
    last_enrichment_result: null,
    ...overrides,
  } as Contact
}

afterEach(() => {
  cleanup()
})

// #3687.13 — l'identité de la personne (pas seulement son rôle) est incertaine
// quand Apollo a dû choisir entre plusieurs profils possibles : à nommer au
// même endroit que les autres alertes de la zone de travail, pas enfoui dans
// un résumé d'enrichissement en masse.
describe('ContactAmbiguousIdentityAlert', () => {
  it('#3687.13 — last_enrichment_result ambiguous → alerte visible', async () => {
    renderWithRouter(<ContactAmbiguousIdentityAlert contact={contact({ last_enrichment_result: 'ambiguous' })} />)
    expect(await screen.findByText(/identité incertaine/i)).toBeInTheDocument()
  })

  it('résultat non ambigu → rien ne se rend', () => {
    renderWithRouter(<ContactAmbiguousIdentityAlert contact={contact({ last_enrichment_result: 'matched' })} />)
    expect(screen.queryByText(/identité.*incertaine|ambigu/i)).not.toBeInTheDocument()
  })

  it('sans résultat (jamais enrichi) → rien ne se rend', () => {
    renderWithRouter(<ContactAmbiguousIdentityAlert contact={contact({ last_enrichment_result: null })} />)
    expect(screen.queryByText(/identité.*incertaine|ambigu/i)).not.toBeInTheDocument()
  })
})
