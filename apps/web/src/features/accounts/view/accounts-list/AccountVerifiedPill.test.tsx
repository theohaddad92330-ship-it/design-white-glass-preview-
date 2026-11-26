import type { AccountBillingProfile } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountVerifiedPill } from './AccountVerifiedPill'

// #3672 — audit « Vérifié par ÉLÉMENT » : la pastille ne couvre que l'identité légale du payeur,
// avec sa source et sa date ; sans preuve elle ne rend rien, et ne dit jamais « non vérifié ».
function profile(overrides: Partial<AccountBillingProfile>): AccountBillingProfile {
  return { identitySource: null, identityCheckedOn: null, ...overrides } as AccountBillingProfile
}

describe('AccountVerifiedPill', () => {
  it('nomme ce qu’elle vérifie (l’identité légale) et la date, pas « tout le dossier »', async () => {
    renderWithRouter(
      <AccountVerifiedPill profile={profile({ identitySource: 'public_registry', identityCheckedOn: '2026-09-02' })} />,
    )
    const pill = await screen.findByLabelText(/Identité légale confirmée le/)
    expect(pill).toBeInTheDocument()
    expect(pill.getAttribute('aria-label')).not.toMatch(/dossier/i)
  })

  it('sait dire NON : une source sans date ne rend aucune pastille', () => {
    const { container } = renderWithRouter(
      <AccountVerifiedPill profile={profile({ identitySource: 'public_registry', identityCheckedOn: null })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sait dire NON : sans profil, ni pastille ni « non vérifié »', () => {
    const { container } = renderWithRouter(<AccountVerifiedPill profile={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
