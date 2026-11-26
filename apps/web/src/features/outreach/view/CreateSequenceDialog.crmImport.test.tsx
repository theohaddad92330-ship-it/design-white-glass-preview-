import { render, screen } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #2202.14 — « IMPORTER DEPUIS MON CRM » N'APPARAÎT QUE SI UN CONNECTEUR EST
 * RÉELLEMENT BRANCHÉ.
 *
 * La porte était DÉCRITE (commentaire de tête du fichier, `audience.
 * importFromCrm`/`crmHint` déjà au catalogue i18n) sans jamais être rendue :
 * seul le texte d'avertissement « aucun CRM connecté » apparaissait, sans
 * qu'aucun état connecté ne la fasse basculer. Le statut se lit sur la MÊME
 * porte que la file de validation CRM (`useCrmWriteRequests`, `status`) —
 * jamais un second appel qui pourrait diverger.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const crmStatus = vi.hoisted(() => ({ value: 'not_connected' as 'ready' | 'not_connected' | 'not_configured' }))
vi.mock('@/features/crm/api', () => ({
  useCrmWriteRequests: () => ({ data: { status: crmStatus.value, requests: [] } }),
}))
// #2202.23 — sans rapport avec ce lot : liste vide, aucun avertissement porteur.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

describe('CreateSequenceDialog — porte CRM conditionnée à un connecteur réel (#2202.14)', () => {
  it('sans connecteur : le texte prévient, aucun lien « Importer depuis mon CRM »', () => {
    crmStatus.value = 'not_connected'
    render(<CreateSequenceDialog open onOpenChange={() => {}} />)
    expect(screen.getByText(/Aucun CRM compatible n’est connecté/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Importer depuis mon CRM/ })).not.toBeInTheDocument()
  })

  it('connecteur branché : le lien apparaît, le texte d’avertissement disparaît', () => {
    crmStatus.value = 'ready'
    render(<CreateSequenceDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('link', { name: /Importer depuis mon CRM/ })).toHaveAttribute(
      'href',
      '/settings/mes-donnees',
    )
    expect(screen.queryByText(/Aucun CRM compatible n’est connecté/)).not.toBeInTheDocument()
  })
})
