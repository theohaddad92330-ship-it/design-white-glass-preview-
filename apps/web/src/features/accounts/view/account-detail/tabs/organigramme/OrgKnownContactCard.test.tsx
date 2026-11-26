import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrgKnownContactCard } from './OrgKnownContactCard'
import type { KnownOrgContact } from './knownOrgContacts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const card = (over: Partial<KnownOrgContact> = {}): KnownOrgContact => ({
  id: 'c1',
  fullName: 'Didier Montandon',
  title: 'CISO',
  level: 'L1',
  probableDuplicate: null,
  ...over,
})

// #4679 — pastille « Connu », doublon probable PROPOSÉ vers la file de fusion existante, jamais fusionné.
describe('OrgKnownContactCard', () => {
  it('porte la pastille « Connu », le nom et le titre', () => {
    render(<OrgKnownContactCard contact={card()} />)
    expect(screen.getByText('Connu')).toBeInTheDocument()
    expect(screen.getByText('Didier Montandon')).toBeInTheDocument()
    expect(screen.getByText('CISO')).toBeInTheDocument()
  })

  it('un doublon probable est NOMMÉ et mène à la proposition de fusion existante', () => {
    render(
      <OrgKnownContactCard contact={card({ probableDuplicate: { personId: 'p', fullName: 'Référent technique' } })} />,
    )
    expect(screen.getByText('doublon probable : Référent technique')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les propositions de fusion' })).toHaveAttribute(
      'href',
      '/contacts/imports',
    )
    expect(screen.queryByRole('button', { name: /fusionner/i })).toBeNull()
  })

  it('SAIT DIRE NON — sans doublon, aucune mention de doublon', () => {
    render(<OrgKnownContactCard contact={card()} />)
    expect(screen.queryByTestId('org-known-duplicate')).toBeNull()
  })

  it('cliquable (cible ≥ 44 px, au clavier) quand une fiche existe', () => {
    const onOpen = vi.fn()
    render(<OrgKnownContactCard contact={card()} onOpen={onOpen} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('min-h-11')
    button.click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
