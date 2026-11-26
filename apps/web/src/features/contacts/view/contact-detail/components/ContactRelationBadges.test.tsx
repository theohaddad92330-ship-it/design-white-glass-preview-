import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactRelationBadges } from './ContactRelationBadges'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/features/contacts/hooks/useUpdateContactStatus', () => ({
  useUpdateContactStatus: () => ({ mutate, isPending: false }),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const base = { id: 'c-1', account_id: 'acc-1', full_name: 'Paul Ferrer', decision_role: 'user' } as unknown as Contact
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

// Théo B c5-fiche-contact.R2 / N3 / N4 / A3 — badge dérivé + clic pour déclarer ; la déclaration humaine gagne.
describe('ContactRelationBadges', () => {
  beforeEach(async () => {
    mutate.mockClear()
    await i18n.changeLanguage('fr')
  })

  it('montre « Échange engagé » quand l’historique le dérive', async () => {
    const contact = {
      ...base,
      relation_badge: { derived: 'engaged', declared: null, shown: { source: 'derived', relation: 'engaged' } },
    } as Contact
    renderWithRouter(<ContactRelationBadges contact={contact} />)
    expect(await screen.findByRole('button', { name: /Échange engagé/ })).toBeInTheDocument()
  })

  it('la déclaration humaine gagne sur le dérivé', async () => {
    const contact = {
      ...base,
      relation_badge: {
        derived: 'engaged',
        declared: 'refused',
        shown: { source: 'declared', status: 'refused' },
      },
    } as Contact
    renderWithRouter(<ContactRelationBadges contact={contact} />)
    expect(await screen.findByRole('button', { name: /A décliné/ })).toBeInTheDocument()
    expect(screen.queryByText('Échange engagé')).toBeNull()
  })

  it('un clic ouvre les issues et déclarer enregistre le statut', async () => {
    const contact = {
      ...base,
      relation_badge: { derived: 'to_contact', declared: null, shown: { source: 'derived', relation: 'to_contact' } },
    } as Contact
    renderWithRouter(<ContactRelationBadges contact={contact} />)
    await user().click(await screen.findByRole('button', { name: /À contacter/ }))
    await user().click(await screen.findByRole('menuitem', { name: 'Rendez-vous décroché' }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-1', account_id: 'acc-1', full_name: 'Paul Ferrer', status: 'meeting' }),
    )
  })

  it('affiche le type d’interlocuteur déduit du rôle, et rien sans rôle connu', async () => {
    const { unmount } = renderWithRouter(<ContactRelationBadges contact={base} />)
    expect(await screen.findByText('Interlocuteur métier')).toBeInTheDocument()
    unmount()
    renderWithRouter(<ContactRelationBadges contact={{ ...base, decision_role: 'procurement' } as Contact} />)
    expect(await screen.findByText('Appui / accès')).toBeInTheDocument()
    expect(screen.queryByText('Interlocuteur métier')).toBeNull()
  })

  it('sans badge servi ni rôle connu : rien (jamais un état deviné)', () => {
    const { container } = renderWithRouter(
      <ContactRelationBadges contact={{ ...base, decision_role: 'unknown' } as Contact} />,
    )
    expect(container.querySelector('button')).toBeNull()
    expect(screen.queryByText(/Interlocuteur|Appui/)).toBeNull()
  })
})
