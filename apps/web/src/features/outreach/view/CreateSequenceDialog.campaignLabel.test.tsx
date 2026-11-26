import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * #2203.32 → .38 / #2153.29 — LES SÉQUENCES D'UN MÊME GESTE PARTAGENT UNE
 * ÉTIQUETTE (arbitrage de Louis, 16/09/2026).
 *
 * « J'ai lancé une campagne sur 12 contacts » n'avait aucune surface : douze
 * séquences qui ne se savaient pas parentes. C'est un ÉTIQUETAGE — aucun objet
 * « campagne », aucune table : une séquence reste mono-contact, et c'est ce
 * qui lui permet de s'arrêter quand CETTE personne répond.
 *
 * Ce que cette suite tient : l'étiquette est LA MÊME pour tous les contacts du
 * geste (une par tour de boucle en ferait douze campagnes d'une personne), et
 * un lancement solitaire n'en porte AUCUNE.
 */
const mutateAsync = vi.fn()

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
// #2202.14 — porte CRM sans rapport avec ce lot : pas de connecteur (comportement d'avant).
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
// #2202.23 — sans rapport avec ce lot : liste vide, aucun avertissement porteur.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

import { CreateSequenceDialog } from './CreateSequenceDialog'

const contact = (id: string, name: string) => ({
  id,
  full_name: name,
  title: 'DSI',
  email: `${id}@example.com`,
  email_message: null,
})

const DEUX = [
  contact('11111111-1111-4111-8111-111111111111', 'Claire Dubois'),
  contact('22222222-2222-4222-8222-222222222222', 'Marc Petit'),
]

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({ id: 'seq' })
})

const submit = async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  await user.click(screen.getByRole('button', { name: /Créer/ }))
}

describe('CreateSequenceDialog — l’étiquette de campagne (#2203.32 → .38)', () => {
  it('envoie LA MÊME étiquette pour tous les contacts du geste', async () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={DEUX}
        campaignContext={{ objective: 'Relancer les DSI industrie', persona: 'DSI', relation: 'cold', tone: 'direct' }}
      />,
    )
    await submit()

    expect(mutateAsync).toHaveBeenCalledTimes(2)
    const labels = mutateAsync.mock.calls.map(call => (call[0] as { campaign_label?: string }).campaign_label)
    expect(labels).toEqual(['Relancer les DSI industrie', 'Relancer les DSI industrie'])
  })

  it('n’en envoie AUCUNE pour un seul contact — une séquence seule n’est pas une campagne', async () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[DEUX[0]!]} />)
    await submit()

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync.mock.calls[0]?.[0]).not.toHaveProperty('campaign_label')
  })
})
