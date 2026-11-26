import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { HistoricalContactStillUseful } from './HistoricalContactStillUseful'

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
    ...overrides,
  } as Contact
}

afterEach(() => {
  cleanup()
})

// #2296.23/.25/.26 (LAU-FINAL-037) — un contact `historique` reste utile
// comme réseau dormant / historique du compte / source d'information, nommé
// à l'écran plutôt que silencieusement retiré du classement.
describe('HistoricalContactStillUseful', () => {
  it('#2296.23/.25/.26 — lifecycle_state historique → les trois usages nommés', () => {
    render(<HistoricalContactStillUseful contact={contact({ lifecycle_state: 'historique' })} />)
    expect(screen.getByText('Réseau dormant')).toBeInTheDocument()
    expect(screen.getByText('Historique du compte')).toBeInTheDocument()
    expect(screen.getByText("Source d'information potentielle")).toBeInTheDocument()
  })

  it('contact actif → rien ne se rend (jamais un panneau vide)', () => {
    const { container } = render(<HistoricalContactStillUseful contact={contact({ lifecycle_state: 'actionnable' })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
