import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #2202.1 / #2202.2 / #2202.3 / #2202.4 / #2202.6 / #2202.8 — CINQ SITUATIONS
 * SANS GABARIT, ABSENTES DES SIX PREMIERS CHOIX.
 *
 * Le retour pointait un cas précis, répété : « ne pas forcer 4 étapes sur 12
 * jours ». Les six gabarits existants portaient chacun une situation
 * commerciale réelle, mais aucun ne couvrait le message unique (une question,
 * une réponse, pas de suivi), la session d'appels, une cadence délibérément
 * légère, l'entretien d'une relation sur la durée (nurturing), ni la relance
 * qui suit un rendez-vous.
 *
 * Le sélecteur de gabarit (`CreateSequenceDialog.tsx:512`) est piloté par
 * `outreachTemplateKeySchema.options` : ces tests verrouillent que les cinq
 * nouvelles entrées du contrat (`outreach-sequence.ts`) apparaissent bien
 * comme des choix cliquables, pas seulement au contrat.
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #2202.14 — porte CRM sans rapport avec ce lot : pas de connecteur (comportement d'avant).
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
// #2202.23 — sans rapport avec ce lot : liste vide, aucun avertissement porteur.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

const CONTACT = {
  id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Alex Martin',
  title: 'CTO',
  email: 'alex@example.com',
}

function renderDialog() {
  return render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT]} />)
}

describe('CreateSequenceDialog — cinq gabarits neufs (#2202.1/.2/.3/.4/.6/.8)', () => {
  it('propose « Message unique », « Session d’appels », « Séquence légère », « Nurturing » et « Relance après rendez-vous »', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /Message unique/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Session d’appels/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Séquence légère/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nurturing/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Relance après rendez-vous/ })).toBeInTheDocument()
  })

  it('#2202.1 — « Message unique » ne force ni 4 étapes ni 12 jours : une seule touche, à J0', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Message unique/ }))
    const card = screen.getByRole('button', { name: /Message unique/ })
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 touche · 0 jour · E-mail')).toBeInTheDocument()
  })
})
