import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ConversationMenu } from './ConversationMenu'

const useWorkspaceMembersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => useWorkspaceMembersMock(),
}))
vi.mock('@/features/memory/hooks/useConversationSummary', () => ({
  useConversationSummary: () => ({ isLoading: false, isError: false, data: null }),
  useCorrectConversationSummary: () => ({ mutate: vi.fn(), isPending: false }),
}))

/**
 * #3775.1 / #3775.2 / #3775.3 — l'en-tête de /chat ne pose plus quatre
 * boutons équivalents : UN accès « Conversation » regroupe Résumé, Accès et
 * Détails (le partage reste direct, nommé par sa portée). Et l'onglet d'accès
 * dit la règle réellement appliquée (le fil est lié à l'espace), jamais un
 * cadenas « Privé » ni « Vous seul » déduit d'un auteur unique.
 */
describe('ConversationMenu', () => {
  beforeEach(() => {
    useWorkspaceMembersMock.mockReset()
    useWorkspaceMembersMock.mockReturnValue({ data: [], isLoading: false, isError: false })
  })

  it('expose un seul déclencheur au lieu de Résumé / Participants / Détails', async () => {
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} />)
    expect(await screen.findByRole('button', { name: 'Conversation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Résumé' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Participants' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Détails' })).not.toBeInTheDocument()
    // Rien n'est lu avant l'ouverture.
    expect(useWorkspaceMembersMock).not.toHaveBeenCalled()
  })

  it("ne propose pas de Résumé avant le premier échange, et ouvre sur l'accès", async () => {
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange={false} sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    expect(await screen.findByRole('tab', { name: 'Accès' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Détails' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Résumé' })).not.toBeInTheDocument()
  })

  it('propose le Résumé dès qu’il y a eu un échange, sans le rendre obligatoire', async () => {
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    const summary = await screen.findByRole('tab', { name: 'Résumé' })
    // L'accès reste l'onglet d'ouverture : consulter ne déclenche rien.
    expect(screen.getByRole('tab', { name: 'Accès', selected: true })).toBeInTheDocument()
    await userEvent.click(summary)
    expect(await screen.findByText('Aucun résumé pour ce fil pour l’instant.')).toBeInTheDocument()
  })

  // #5032.9 — le panneau latéral dit que Laura a lu le fil de la messagerie ; sans lecture, aucune ligne.
  it('#5032.9 — l’onglet Résumé dit que Laura a lu un fil de la messagerie, et seulement quand c’est le cas', async () => {
    const withRead = renderWithRouter(
      <ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} mailboxRead />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    await userEvent.click(await screen.findByRole('tab', { name: 'Résumé' }))
    expect(await screen.findByText(/Laura a lu un fil de ta messagerie/)).toBeInTheDocument()
    withRead.unmount()

    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    await userEvent.click(await screen.findByRole('tab', { name: 'Résumé' }))
    expect(await screen.findByText('Aucun résumé pour ce fil pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByText(/a lu un fil de ta messagerie/)).not.toBeInTheDocument()
  })

  it("dit l'accès lié à l'espace, même avec un seul membre — jamais « Privé » ni « Vous seul »", async () => {
    useWorkspaceMembersMock.mockReturnValue({
      data: [{ userId: 'u-1', email: 'a@ex.com', fullName: 'Alice Martin', role: 'owner', isSelf: true }],
      isLoading: false,
      isError: false,
    })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    expect(await screen.findByText(/Lié à ton espace/)).toBeInTheDocument()
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.queryByText(/Privé/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Vous seul|Toi seul/)).not.toBeInTheDocument()
  })

  it('garde la règle et nomme la limite quand la liste des membres est indisponible', async () => {
    useWorkspaceMembersMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderWithRouter(<ConversationMenu accountId={null} conversationId="c-1" hasExchange sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    expect(await screen.findByText(/Lié à ton espace/)).toBeInTheDocument()
    expect(screen.getByText(/La liste des membres n’a pas pu être lue/)).toBeInTheDocument()
    expect(screen.queryByText(/Privé|Vous seul|Toi seul/)).not.toBeInTheDocument()
  })

  it('sans fil enregistré, ne propose que l’accès (aucun détail à lire)', async () => {
    renderWithRouter(<ConversationMenu accountId={null} conversationId={null} hasExchange={false} sources={[]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
    expect(await screen.findByRole('tab', { name: 'Accès' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Détails' })).not.toBeInTheDocument()
  })
})
