import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactKeyInfo } from './ContactKeyInfo'

// #4504.3 — la carte porte « Responsable du contact » (session) : mêmes doublures que ContactKeyInfo.test.tsx.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))

/**
 * #4016.L13 — « fait confirmé jusqu'à preuve contraire » : la valeur confirmée à la main reste
 * affichée ; ce qu'une source a dit contre elle se NOMME à côté, daté — jamais à sa place.
 */
function person(contradictions?: Contact['field_contradictions']): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Gilles Denoyel',
    email: 'g.denoyel@edf.fr',
    title: 'DSI',
    ...(contradictions ? { field_contradictions: contradictions } : {}),
  } as unknown as Contact
}

const EMAIL_CONTRADICTION = {
  field: 'email',
  value: 'gilles.denoyel@edf.fr',
  source: 'pipeline' as const,
  observedAt: '2026-10-10T10:00:00.000Z',
}

describe('ContactKeyInfo — contradiction d’un fait confirmé (#4016.L13)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('garde le fait confirmé et nomme la contradiction à côté, avec sa date', () => {
    render(<ContactKeyInfo contact={person([EMAIL_CONTRADICTION])} />)
    expect(screen.getByText('g.denoyel@edf.fr')).toBeInTheDocument()
    expect(screen.getByText(/Une source indique « gilles\.denoyel@edf\.fr » le .*2026/)).toBeInTheDocument()
    expect(screen.getByText(/ta valeur confirmée est gardée/)).toBeInTheDocument()
  })

  it('dit la même chose en anglais', async () => {
    await i18n.changeLanguage('en')
    render(<ContactKeyInfo contact={person([EMAIL_CONTRADICTION])} />)
    expect(screen.getByText(/A source says “gilles\.denoyel@edf\.fr” on .*2026/)).toBeInTheDocument()
  })

  it('sait dire NON : sans contradiction, ou sur un champ non affiché, aucune ligne', () => {
    for (const contact of [person(), person([]), person([{ ...EMAIL_CONTRADICTION, field: 'decisionRole' }])]) {
      const { unmount } = render(<ContactKeyInfo contact={contact} />)
      expect(screen.queryByText(/Une source indique/)).not.toBeInTheDocument()
      unmount()
    }
  })
})
