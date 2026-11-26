import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { chooseOption } from '@/test/select'

const CONNECTED = vi.hoisted(() => [
  { provider: 'gmail', family: 'email', name: 'Gmail' },
  { provider: 'hubspot', family: 'crm', name: 'HubSpot' },
  { provider: 'google-calendar', family: 'calendar', name: 'Google Agenda', needsReconnect: true },
])
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const navigateMock = vi.hoisted(() => vi.fn())
import { Chat } from './Chat'

/**
 * #2450.1 / #2448.1 (reste, épopée #2882) — LE MODE DE RECHERCHE, DEPUIS
 * L'ÉCRAN `/chat` PLEIN ÉCRAN.
 *
 * La bulle (`LauraDock`, lot r7 du 26/09) était l'UNE des six surfaces
 * produit nommées par #2448.1 ; `Chat.tsx` (5/6 restantes) n'appelait jamais
 * `askLauraStreaming` avec un `mode` — le défaut que ce dépôt nomme « code
 * juste, jamais appelé », ici côté CONTRAT plutôt que côté service : le champ
 * `mode` existait déjà dans `LauraTurnRequest` (`laura-turn.ts`) sans qu'aucun
 * appelant de cet écran ne l'atteigne.
 *
 * Même échafaudage que `Chat.scope-object.test.tsx` / `Chat.context-persistence.test.tsx`.
 */
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: [] }),
  }
})
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({ CommandDrawerButton: () => null }))
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: ['email', 'crm'], tools: CONNECTED, isLoading: false }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: MotionMockProps) => {
            const Component = prop as ElementType
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ search: locationSearch.current }),
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [] }] }, isError: false, isLoading: false }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [] }, isLoading: false, isError: false }),
}))
vi.mock('./laura-home-suggestions', async importOriginal => {
  const actual = await importOriginal<typeof import('./laura-home-suggestions')>()
  return { ...actual, useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }) }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
}))
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useUpdateRagDocumentScope', () => ({
  useUpdateRagDocumentScope: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useRagDocumentContent', () => ({
  useRagDocumentContent: () => ({ data: undefined, isLoading: false, isError: false }),
}))
// #2876 (#2433.4) — même raison que `useRagDocumentContent` juste au-dessus :
// `AttachmentPreviewDialog` appelle ce hook inconditionnellement, qui exige un
// `QueryClientProvider` absent de ce harnais de test.
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))

const askLauraStreamingMock = vi.fn()
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: (...args: unknown[]) => askLauraStreamingMock(...args) }))

const listMessagesMock = vi.fn()
const createMessageMock = vi.fn()
const listHistoryMock = vi.fn()
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: (...args: unknown[]) => listMessagesMock(...args),
  createAgentChatMessage: (...args: unknown[]) => createMessageMock(...args),
  listAgentChatHistory: (...args: unknown[]) => listHistoryMock(...args),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  locationSearch.current = {}
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockImplementation(async (args: Record<string, unknown>) => ({ id: 'm-1', ...args }))
  askLauraStreamingMock.mockResolvedValue({ reply: 'Réponse de Laura' })
})

async function send(text: string) {
  await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
  const textarea = screen.getByPlaceholderText('Écris ton message...')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('#3708 — « Outils et sources » remplace les bulles et l’exclusion part avec le tour', () => {
  it('une seule entrée compacte « Outils et sources », et les puces « Tes outils avec Laura » au-dessus de la saisie', async () => {
    render(<Chat />)
    expect(await screen.findByRole('button', { name: /outils et sources/i })).toBeInTheDocument()
    const chips = await screen.findByRole('group', { name: 'Tes outils avec Laura' })
    expect(within(chips).getByRole('button', { name: /Gmail/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chips).getByRole('button', { name: /HubSpot/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('le menu dit les outils branchés (lecture seule), « autorisation expirée », et mène à /integrations', async () => {
    render(<Chat />)
    fireEvent.click(await screen.findByRole('button', { name: /outils et sources/i }))
    expect(await screen.findByText('Outils de cette conversation')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(/autorisation expirée/i)).toBeInTheDocument()
    expect(screen.getByText(/ne déconnecte aucun compte/)).toBeInTheDocument()
    expect(screen.getByText(/jamais à envoyer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /gérer les connexions/i })).toHaveAttribute('href', '/integrations')
  })

  it('REJEU : écarter le CRM par sa puce → la demande part avec excludedToolFamilies=[crm], sans rien déconnecter', async () => {
    render(<Chat />)
    const chips = await screen.findByRole('group', { name: 'Tes outils avec Laura' })
    fireEvent.click(within(chips).getByRole('button', { name: /HubSpot/ }))
    expect(within(chips).getByRole('button', { name: /HubSpot/ })).toHaveAttribute('aria-pressed', 'false')
    // le résumé dit le nombre sélectionné
    expect(screen.getByRole('button', { name: /outils et sources · 2\/3/i })).toBeInTheDocument()
    await send('Prépare une relance')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: 'Prépare une relance',
          excludedToolFamilies: ['crm'],
          excludedToolProviders: ['hubspot'],
        }),
        expect.anything(),
        expect.anything(),
      ),
    )
    // la sélection ne déclenche aucune action externe : un seul tour, celui de l'envoi
    expect(askLauraStreamingMock).toHaveBeenCalledTimes(1)
  })

  it('sans exclusion, aucune famille n’est transmise', async () => {
    render(<Chat />)
    await send('Bonjour')
    await waitFor(() => expect(askLauraStreamingMock).toHaveBeenCalled())
    expect(askLauraStreamingMock.mock.calls[0]![0].excludedToolFamilies ?? []).toEqual([])
    expect(askLauraStreamingMock.mock.calls[0]![0].excludedToolProviders ?? []).toEqual([])
  })
})

describe('#3709 — changer de réglage ne déplace pas la saisie et ne perd pas le brouillon', () => {
  it('la rangée des trois réglages ne passe jamais à la ligne', async () => {
    render(<Chat />)
    const row = await screen.findByTestId('chat-composer-settings-row')
    expect(row.className).toContain('flex-nowrap')
    expect(row.className).not.toContain('flex-wrap')
  })

  it('#3709 — la profondeur par défaut se lit « Standard » (vocabulaire du produit), sa valeur transmise reste `auto`', async () => {
    render(<Chat />)
    const select = await screen.findByRole('combobox', { name: /mode de recherche/i })
    expect(select).toHaveTextContent('Standard')
    expect(select).not.toHaveTextContent(/^Auto$/)
  })

  it('#3709 — à 360 px, rien ne peut descendre ni masquer Envoyer : rangée sans retour, textes longs masqués, Envoyer hors de la rangée', async () => {
    const previous = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    try {
      render(<Chat />)
      const row = await screen.findByTestId('chat-composer-settings-row')
      expect(row.className).toContain('flex-nowrap')
      expect(row.className).toContain('min-w-0')
      // #3774.2.2 (J31) : la phrase de politique du mode n'existe plus dans la barre — rien de long ne peut empiler la rangée.
      expect(screen.queryByTestId('chat-research-mode-policy')).not.toBeInTheDocument()
      // Le résumé « Outils et sources » ne garde que l'icône sous `sm` (le nom accessible reste porté par aria-label).
      const tools = screen.getByRole('button', { name: /outils et sources/i })
      expect(tools.querySelector('span.hidden.sm\\:inline')).not.toBeNull()
      // « Envoyer » vit hors de la rangée des réglages : aucun réglage ne peut le pousser hors de l'écran.
      const send = screen.getByRole('button', { name: /^envoyer$/i })
      expect(row.contains(send)).toBe(false)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previous })
    }
  })

  it('brouillon, point d’insertion et nœud de saisie survivent à un changement de profondeur', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    const textarea = screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Brouillon en cours' } })
    textarea.setSelectionRange(5, 5)

    await chooseOption(screen.getByRole('combobox', { name: /mode de recherche/i }), 'approfondi')

    const after = screen.getByPlaceholderText('Écris ton message...') as HTMLTextAreaElement
    expect(after).toBe(textarea)
    expect(after.value).toBe('Brouillon en cours')
    expect(after.selectionStart).toBe(5)
  })

  it('changer de profondeur ou d’outils ne lance aucun travail (aucun tour, aucune estimation payante)', async () => {
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())
    await chooseOption(screen.getByRole('combobox', { name: /mode de recherche/i }), 'approfondi')
    fireEvent.click(await screen.findByRole('button', { name: /Gmail/, pressed: true }))
    expect(askLauraStreamingMock).not.toHaveBeenCalled()
    expect(createMessageMock).not.toHaveBeenCalled()
  })

  it('le réglage visible est le réglage transmis ; le changement vaut pour la demande SUIVANTE', async () => {
    render(<Chat />)
    await send('Premier tour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Premier tour', mode: 'auto' }),
        expect.anything(),
        expect.anything(),
      ),
    )
    await chooseOption(screen.getByRole('combobox', { name: /mode de recherche/i }), 'approfondi')
    expect(askLauraStreamingMock.mock.calls[0]![0].mode).toBe('auto')
    await send('Second tour')
    await waitFor(() =>
      expect(askLauraStreamingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Second tour', mode: 'approfondi' }),
        expect.anything(),
        expect.anything(),
      ),
    )
  })
})
