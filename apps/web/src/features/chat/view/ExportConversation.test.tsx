import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useDataExit, type DataExitGrant } from '@/lib/data-exit'
import { exportAgentChatThread } from '@/features/chat/api/agentChatApi'
import { ExportConversation } from './ExportConversation'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/chat/api/agentChatApi', () => ({
  exportAgentChatThread: vi.fn(() => Promise.resolve()),
}))

// #3979.1 — le bouton d'en-tête de /chat : Markdown et PDF du fil ouvert.
describe('ExportConversation — #3979.1 exporter le fil depuis l’en-tête', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
  })

  it('le bouton est nommé et propose Markdown puis PDF', async () => {
    render(<ExportConversation accountId="acc-1" conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    expect(screen.getByRole('button', { name: /fil complet — markdown/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fil complet — pdf/i })).toBeInTheDocument()
  })

  it('Markdown exporte CE fil, dans CE compte', async () => {
    render(<ExportConversation accountId="acc-1" conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /fil complet — markdown/i }))
    await waitFor(() =>
      expect(exportAgentChatThread).toHaveBeenCalledWith(
        { conversationId: 'conv-9', accountId: 'acc-1' },
        'md',
        'full',
      ),
    )
  })

  it('PDF exporte au format pdf', async () => {
    render(<ExportConversation accountId={null} conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /fil complet — pdf/i }))
    await waitFor(() =>
      expect(exportAgentChatThread).toHaveBeenCalledWith({ conversationId: 'conv-9', accountId: null }, 'pdf', 'full'),
    )
  })

  it('un échec se DIT', async () => {
    vi.mocked(exportAgentChatThread).mockRejectedValueOnce(new Error('boom'))
    render(<ExportConversation accountId={null} conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /fil complet — markdown/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('la règle d’espace « pas d’export » masque le bouton', () => {
    vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
    render(<ExportConversation accountId={null} conversationId="conv-9" />)
    expect(screen.queryByRole('button', { name: /exporter/i })).toBeNull()
  })

  it('un fil sans conversation (fil par défaut) reste exportable', async () => {
    render(<ExportConversation accountId={null} conversationId={null} />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /fil complet — markdown/i }))
    await waitFor(() =>
      expect(exportAgentChatThread).toHaveBeenCalledWith({ conversationId: null, accountId: null }, 'md', 'full'),
    )
  })

  // #3895.1 — le choix « Extrait » / « Fil complet », pour Markdown comme pour PDF.
  it('« Extrait » demande l’extrait, en Markdown comme en PDF', async () => {
    render(<ExportConversation accountId={null} conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /extrait — markdown/i }))
    await waitFor(() =>
      expect(exportAgentChatThread).toHaveBeenLastCalledWith(
        { conversationId: 'conv-9', accountId: null },
        'md',
        'extract',
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    await userEvent.click(screen.getByRole('button', { name: /extrait — pdf/i }))
    await waitFor(() =>
      expect(exportAgentChatThread).toHaveBeenLastCalledWith(
        { conversationId: 'conv-9', accountId: null },
        'pdf',
        'extract',
      ),
    )
  })

  it('NON : le menu ne propose que ces deux portées, jamais un export implicite', async () => {
    render(<ExportConversation accountId={null} conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^exporter$/i }))
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /—/ })).toHaveLength(4)
  })
})
