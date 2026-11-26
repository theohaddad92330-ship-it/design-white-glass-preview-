import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { DetectedNewEmployer } from './DetectedNewEmployer'

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
    ...overrides,
  } as Contact
}

afterEach(() => {
  cleanup()
})

// #2296.30/.33 (épopée #2964) — un contact `historique` dont Apollo connaît
// déjà l'employeur actuel : on le NOMME et on propose le lanceur de
// recherche pré-rempli, jamais une fusion/création automatique.
describe('DetectedNewEmployer', () => {
  it('#2296.30/.33 — employeur détecté nommé + action de recherche pré-remplie', async () => {
    renderWithRouter(
      <DetectedNewEmployer
        contact={contact({
          lifecycle_state: 'historique',
          apollo_enrichment: { employment_history: [{ organization_name: 'Capgemini', current: true }] },
        })}
      />,
    )
    // le contenu n'apparaît qu'une fois la route (TanStack Router, async) résolue.
    expect(await screen.findByText('Nouvel employeur détecté : Capgemini')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Chercher chez Capgemini' })
    expect(link).toHaveAttribute('href', expect.stringContaining('/search'))
    expect(link).toHaveAttribute('href', expect.stringContaining('Capgemini'))
  })

  it('contact non historique → rien ne se rend (jamais un panneau vide)', () => {
    renderWithRouter(
      <DetectedNewEmployer
        contact={contact({
          lifecycle_state: 'actionnable',
          apollo_enrichment: { employment_history: [{ organization_name: 'Capgemini', current: true }] },
        })}
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('historique sans employeur Apollo connu → rien ne se rend, aucun nom deviné', () => {
    renderWithRouter(
      <DetectedNewEmployer contact={contact({ lifecycle_state: 'historique', apollo_enrichment: null })} />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
