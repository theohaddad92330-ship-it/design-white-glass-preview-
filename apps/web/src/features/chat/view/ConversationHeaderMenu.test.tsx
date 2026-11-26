import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useDataExit, type DataExitGrant } from '@/lib/data-exit'
import { ConversationHeaderMenu } from './ConversationHeaderMenu'

const presenceMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => presenceMock() }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/useConversationSummary', () => ({
  useConversationSummary: () => ({ isLoading: false, isError: false, data: null }),
  useCorrectConversationSummary: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * #5047 — l'en-tête de /chat prend la forme de la maquette V8 : UN menu ⋯ qui range
 * Conversation, Partager, la présence et Exporter. Forme de la maquette, fonction gardée.
 */
function renderMenu() {
  return renderWithRouter(
    <ConversationHeaderMenu
      accountId="acc-1"
      conversationId="conv-1"
      hasExchange
      sources={[]}
      hasRestrictedSource={false}
    />,
  )
}

describe('ConversationHeaderMenu — #5047', () => {
  beforeEach(() => {
    presenceMock.mockReset()
    presenceMock.mockReturnValue([])
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
  })

  it('l’en-tête n’expose qu’un déclencheur nommé, aucune des quatre actions avant ouverture', async () => {
    renderMenu()
    expect(await screen.findByRole('button', { name: 'Plus d’actions sur la conversation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Conversation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /partager/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^exporter$/i })).not.toBeInTheDocument()
  })

  it('le ⋯ ouvre Conversation (trois onglets), Partager et Exporter', async () => {
    renderMenu()
    await userEvent.click(await screen.findByRole('button', { name: 'Plus d’actions sur la conversation' }))
    const menu = await screen.findByRole('dialog')
    expect(within(menu).getByRole('button', { name: 'Conversation' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: /^partager dans l.espace$/i })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: /^exporter$/i })).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('button', { name: 'Conversation' }))
    expect(await screen.findByRole('tab', { name: 'Résumé' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Accès' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Détails' })).toBeInTheDocument()
  })

  it('la présence reste perceptible : le ⋯ le dit, et le menu nomme le collègue', async () => {
    presenceMock.mockReturnValue([{ firstName: 'Bedros', avatarUrl: null }])
    renderMenu()
    const trigger = await screen.findByRole('button', {
      name: /plus d’actions sur la conversation.*bedros est aussi ici/i,
    })
    await userEvent.click(trigger)
    expect(within(await screen.findByRole('dialog')).getByText('Bedros est aussi ici')).toBeInTheDocument()
  })

  it('personne d’autre mesuré : ni pastille ni ligne de présence', async () => {
    renderMenu()
    const trigger = await screen.findByRole('button', { name: 'Plus d’actions sur la conversation' })
    await userEvent.click(trigger)
    expect(screen.queryByText(/est aussi ici|sont aussi ici/)).not.toBeInTheDocument()
  })

  it('cible tactile ≥ 44 px', async () => {
    renderMenu()
    const trigger = await screen.findByRole('button', { name: 'Plus d’actions sur la conversation' })
    expect(trigger.className).toContain('pointer-coarse:min-h-11')
    expect(trigger.className).toContain('pointer-coarse:min-w-11')
  })
})
