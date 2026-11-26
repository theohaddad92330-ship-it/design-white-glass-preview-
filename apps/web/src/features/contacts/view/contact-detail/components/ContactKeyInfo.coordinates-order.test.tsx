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

// #4404.2 — recette 21/10 M : e-mail, téléphone, puis LinkedIn SOUS les deux, en clair.
const contact = {
  id: 'c1',
  account_id: 'a1',
  full_name: 'Amina Benali',
  email: 'amina@exemple.fr',
  phone: '+33612345678',
  linkedin_url: 'https://www.linkedin.com/in/amina-benali',
  raw_data: {},
} as unknown as Contact

describe('ContactKeyInfo — #4404.2 ordre des coordonnées', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('affiche e-mail, téléphone puis LinkedIn, dans cet ordre', () => {
    render(<ContactKeyInfo contact={contact} />)
    const email = screen.getByText('amina@exemple.fr')
    const phone = screen.getByText(/\+33 6 12 34 56 78/)
    const linkedin = screen.getByRole('link', { name: /linkedin\.com\/in\/amina-benali/ })
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(email, phone)).toBe(true)
    expect(before(phone, linkedin)).toBe(true)
    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/amina-benali')
    expect(linkedin).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('sans URL LinkedIn : aucune ligne (jamais un lien mort)', () => {
    render(<ContactKeyInfo contact={{ ...contact, linkedin_url: null } as unknown as Contact} />)
    expect(screen.queryByRole('link', { name: /linkedin/i })).not.toBeInTheDocument()
  })
})
