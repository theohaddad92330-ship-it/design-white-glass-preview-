import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatConversationDetailView } from '@/features/chat/api/agentChatApi'
import { ConversationMenu } from './ConversationMenu'
import { frozenVersionFrom } from './FrozenVersionBanner'
import { ShareConversation } from './ShareConversation'

/** #3775.1 — les trois anciens déclencheurs vivent désormais dans UN menu « Conversation » : on l'ouvre, puis l'onglet. */
async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
  await userEvent.click(await screen.findByRole('tab', { name }))
}

/**
 * #2430 — l'objet conversation À L'ÉCRAN : partage vivant / figé (#2430.4),
 * « Détails » (propriétaire #2430.12, branche #2430.2, conservation légale
 * #2430.10). Les appels réseau sont bouchés ; ce qui est prouvé, c'est ce que
 * l'écran envoie et ce qu'il affiche de la réponse.
 */
const api = vi.hoisted(() => ({
  snapshotChatConversation: vi.fn(),
  getChatConversation: vi.fn(),
  branchChatConversation: vi.fn(),
  setChatConversationOwner: vi.fn(),
  attachChatConversation: vi.fn(),
  setChatConversationLegalHold: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/chat/api/agentChatApi', () => api)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
// Le menu de `@bellum/ui` (Radix) ne s'ouvre pas sous jsdom : on le remplace par
// un équivalent qui garde SON contrat (`value`, `onChange`, `options`, `ariaLabel`).
vi.mock('@bellum/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@bellum/ui')>()),
  SelectField: (props: {
    value: string | undefined
    onChange: (next: string) => void
    options: readonly { value: string; label: string }[]
    ariaLabel?: string
  }) => (
    <select aria-label={props.ariaLabel} value={props.value} onChange={event => props.onChange(event.target.value)}>
      <option value="" />
      {props.options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'u-alice', email: 'alice@esn.fr', fullName: 'Alice Martin', role: 'owner', isSelf: true },
      { userId: 'u-bob', email: 'bob@esn.fr', fullName: 'Bob Durand', role: 'member', isSelf: false },
    ],
  }),
}))

function detail(overrides: Partial<ChatConversationDetailView> = {}): ChatConversationDetailView {
  return {
    conversationId: 'conv-9',
    ownerUserId: 'u-alice',
    ownerSource: 'opener',
    parentConversationId: null,
    branchedFromMessageId: null,
    attachedAccountId: null,
    legalHold: null,
    versions: [],
    canManage: false,
    ...overrides,
    // #2075.29/.30 — calculé APRÈS le spread : `overrides` est un `Partial<>`,
    // qui rend chaque propriété optionnelle (donc `| undefined` possible) même
    // pour un appel qui ne la fournit pas — jamais ce que rend le vrai serveur.
    auditSnapshot: overrides.auditSnapshot ?? null,
  }
}

function withQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('#2430.4 — partager une version FIGÉE : une borne, un lien numéroté', () => {
  it('fige puis copie le lien du MÊME fil, avec sa version', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.snapshotChatConversation.mockResolvedValue({ version: 3 })
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^partager dans l.espace$/i }))
    await userEvent.click(screen.getByRole('button', { name: /copier une version figée/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(api.snapshotChatConversation).toHaveBeenCalledWith('conv-9')
    const url = new URL(writeText.mock.calls[0]![0] as string)
    expect(url.searchParams.get('conversationId')).toBe('conv-9')
    expect(url.searchParams.get('version')).toBe('3')
  })

  it('NON — une version qui n’a pas pu être figée ne copie AUCUN lien', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.snapshotChatConversation.mockRejectedValue(new Error('500'))
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^partager dans l.espace$/i }))
    await userEvent.click(screen.getByRole('button', { name: /copier une version figée/i }))
    await waitFor(() => expect(api.snapshotChatConversation).toHaveBeenCalled())
    expect(writeText).not.toHaveBeenCalled()
  })

  it('le lien vivant reste sans version', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await userEvent.click(screen.getByRole('button', { name: /^partager dans l.espace$/i }))
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(new URL(writeText.mock.calls[0]![0] as string).searchParams.has('version')).toBe(false)
    expect(api.snapshotChatConversation).not.toHaveBeenCalled()
  })

  it('`?version=` n’est lu que comme un entier strictement positif', () => {
    expect(frozenVersionFrom('2')).toBe(2)
    for (const raw of [null, undefined, '', '0', 'abc', '1.5', '-1']) expect(frozenVersionFrom(raw)).toBeNull()
  })
})

describe('#2430 — « Détails » de la conversation', () => {
  it('#2430.12 — dit le propriétaire et d’où il vient, et transfère à un membre choisi', async () => {
    api.getChatConversation.mockResolvedValue(detail())
    api.setChatConversationOwner.mockResolvedValue({})
    render(withQuery(<ConversationMenu accountId="acc-1" conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    expect(await screen.findByText('Propriétaire : Alice Martin (a ouvert la conversation)')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Transférer à…'), 'u-bob')
    await userEvent.click(screen.getByRole('button', { name: /^transférer$/i }))
    await waitFor(() => expect(api.setChatConversationOwner).toHaveBeenCalledWith('conv-9', 'u-bob'))
  })

  it('#2430.2 — « Explorer une autre hypothèse » ouvre la branche, même portée', async () => {
    api.getChatConversation.mockResolvedValue(detail())
    api.branchChatConversation.mockResolvedValue({ conversationId: 'conv-branche' })
    render(withQuery(<ConversationMenu accountId="acc-1" conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    await userEvent.click(await screen.findByRole('button', { name: /explorer une autre hypothèse/i }))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/chat',
        search: { conversationId: 'conv-branche', accountId: 'acc-1' },
      }),
    )
    expect(api.branchChatConversation).toHaveBeenCalledWith('conv-9')
  })

  it('#2430.10 / #2439.13 — la conservation légale se lit par tous, dit sa raison, ne se pose que par un gérant', async () => {
    api.getChatConversation.mockResolvedValue(
      detail({ legalHold: { since: '2026-09-22T19:00:00Z', by: 'u-bob', reason: 'Litige en cours', reviewBy: null } }),
    )
    const { unmount } = render(
      withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />),
    )
    await openTab('Détails')
    expect(await screen.findByText(/Conservation légale depuis le/)).toBeInTheDocument()
    expect(screen.getByText(/Raison : Litige en cours/)).toBeInTheDocument()
    // #2439.13 — aucune date de revue posée : aucune ligne « à revoir » (on
    // n'affiche pas ce qu'on n'a pas).
    expect(screen.queryByText(/à revoir/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /lever la conservation légale/i })).toBeNull()
    unmount()

    api.getChatConversation.mockResolvedValue(detail({ canManage: true }))
    api.setChatConversationLegalHold.mockResolvedValue({})
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    // #2439.13 — le geste reste désactivé tant qu'aucune raison n'est écrite.
    const place = await screen.findByRole('button', { name: /poser une conservation légale/i })
    expect(place).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/raison de la conservation légale/i), 'Litige en cours')
    expect(place).toBeEnabled()
    await userEvent.click(place)
    // Date de revue laissée vide : aucun délai n'est inventé.
    await waitFor(() =>
      expect(api.setChatConversationLegalHold).toHaveBeenCalledWith('conv-9', true, 'Litige en cours', undefined),
    )
  })

  it('#2075.29/.30 — un fil ouvert depuis l’audit affiche CE QUE L’AUDIT DISAIT alors', async () => {
    api.getChatConversation.mockResolvedValue(
      detail({
        auditSnapshot: {
          auditVersion: 4,
          strategy: 'topDown',
          firstActions: ['Relancer les comptes tièdes'],
          unknowns: ['Aucune source ne renseigne encore le budget de fronts'],
          takenAt: '2026-09-26T10:00:00Z',
        },
      }),
    )
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    expect(await screen.findByText('Ouverte depuis l’audit commercial')).toBeInTheDocument()
    expect(screen.getByText('Version de l’audit au moment de l’ouverture : 4')).toBeInTheDocument()
    expect(screen.getByText(/entrée par le haut/)).toBeInTheDocument()
    expect(screen.getByText('Relancer les comptes tièdes')).toBeInTheDocument()
    expect(screen.getByText('Aucune source ne renseigne encore le budget de fronts')).toBeInTheDocument()
  })

  it('NON — un fil qui ne vient pas de l’audit n’affiche AUCUNE ligne « ouverte depuis l’audit »', async () => {
    api.getChatConversation.mockResolvedValue(detail())
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    await screen.findByText(/Propriétaire/)
    expect(screen.queryByText('Ouverte depuis l’audit commercial')).toBeNull()
  })

  it('#2439.13 — une date de revue posée voyage avec la pose, et se lit ensuite (en retard ou non)', async () => {
    api.getChatConversation.mockResolvedValue(detail({ canManage: true }))
    api.setChatConversationLegalHold.mockResolvedValue({})
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    await userEvent.type(screen.getByLabelText(/raison de la conservation légale/i), 'Litige en cours')
    await userEvent.type(screen.getByLabelText(/date de revue/i), '2027-01-01')
    await userEvent.click(await screen.findByRole('button', { name: /poser une conservation légale/i }))
    await waitFor(() =>
      expect(api.setChatConversationLegalHold).toHaveBeenCalledWith(
        'conv-9',
        true,
        'Litige en cours',
        '2027-01-01T00:00:00.000Z',
      ),
    )
  })

  it('#2439.13 — une date de revue dépassée s’affiche comme en retard, pas comme un simple rappel', async () => {
    api.getChatConversation.mockResolvedValue(
      detail({
        legalHold: {
          since: '2026-09-22T19:00:00Z',
          by: 'u-bob',
          reason: 'Litige en cours',
          reviewBy: '2020-01-01T00:00:00.000Z',
        },
      }),
    )
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    expect(await screen.findByText(/revue en retard/i)).toBeInTheDocument()
    expect(screen.queryByText(/^à revoir/i)).toBeNull()
  })

  it('NON — une lecture ratée se DIT, sans propriétaire deviné', async () => {
    api.getChatConversation.mockRejectedValue(new Error('404'))
    render(withQuery(<ConversationMenu accountId={null} conversationId="conv-9" hasExchange={false} sources={[]} />))
    await openTab('Détails')
    expect(await screen.findByText(/Aucun détail pour l’instant/)).toBeInTheDocument()
    expect(screen.queryByText(/Propriétaire/)).toBeNull()
  })
})
