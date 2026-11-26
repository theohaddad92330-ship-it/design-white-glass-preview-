import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chat } from './Chat'

/**
 * #3050 (26/09/2026, iPhone prod) — SOUS 768 px, une fois le fil COMMENCÉ, la
 * ligne d'outils du composer (amorces, le catalogue, les connecteurs
 * branchés) se tait : le FIL redevient le contenu. Rien n'est supprimé —
 * tout reste accessible depuis le « + » (`ComposerToolsMenu`), voir
 * `Chat.tsx`. Bureau et fil VIERGE inchangés.
 *
 * #3772.1 — « Mon activité » (le mode de personnalisation) ne vit plus dans
 * cette ligne du tout : il a rejoint le panneau Contexte de l'en-tête
 * (`ScopeDialog`), ouvert à toutes les tailles depuis `ScopeButton` — voir
 * `Chat.scope-object.test.tsx`. Ce fichier ne porte donc plus d'assertion sur
 * son (ex-)bouton.
 *
 * Même harnais que `Composer.suggestions.test.tsx` (les mêmes hooks réseau y
 * sont doublés pour la même raison : `Chat` porte trop de `useQuery` pour
 * qu'un test de composer monte un `QueryClientProvider`).
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
vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: ({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) => (
    <>
      <button type="button" onClick={() => onOpenChange?.(true)}>
        Que puis-je demander ?
      </button>
      {open ? (
        <div role="dialog" aria-label="Catalogue des commandes">
          Fixture — catalogue
        </div>
      ) : null}
    </>
  ),
}))
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
const capabilities = vi.hoisted(() => ({ families: ['crm'] as string[] }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({
    families: capabilities.families,
    tools: [{ provider: 'hubspot', family: 'crm', name: 'HubSpot' }],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))

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
  useLocation: () => ({ search: {} }),
  useNavigate: () => vi.fn(),
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
  return {
    ...actual,
    useLauraHomeContext: () => ({ hasPortfolio: false, hasVivier: false, hasPartners: false }),
  }
})
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({ useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useIngestRagZip', () => ({
  useIngestRagZip: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
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
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const listMessagesMock = vi.fn()
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: (...args: unknown[]) => listMessagesMock(...args),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

/** Un fil DÉJÀ entamé : c'est le seul moment où la ligne compacte doit se taire sous 768 px. */
function renderEngagedThread() {
  listMessagesMock.mockResolvedValue([
    {
      id: 'm-1',
      account_id: null,
      conversation_id: 'general',
      role: 'user',
      content: 'Prépare-moi une session LinkedIn',
      created_at: '2026-09-26T10:00:00Z',
    },
    {
      id: 'm-2',
      account_id: null,
      conversation_id: 'general',
      role: 'assistant',
      content: 'Voici un premier jet.',
      created_at: '2026-09-26T10:00:05Z',
    },
  ])
  render(<Chat />)
  return screen.findByText('Prépare-moi une session LinkedIn')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * `CommandDrawerButton` reste MONTÉ même caché (son dialogue est piloté par
 * `commandsOpen`, que le menu « + » peut encore ouvrir) : Chat.tsx enveloppe
 * son propre déclencheur dans un `<div className="hidden">`, jamais un
 * démontage. jsdom n'exécute aucun CSS (`chat-mise-en-page.test.ts` le note
 * déjà) : `not.toBeInTheDocument()` ne prouverait donc RIEN ici — la classe
 * du parent immédiat est ce qui se lit.
 */
function commandsTriggerWrapperClassName(): string | undefined {
  return screen.getByRole('button', { name: 'Que puis-je demander ?' }).parentElement?.className
}

describe('#3050 — sous 768 px, un fil COMMENCÉ tait la ligne d’outils du composer', () => {
  it('amorces et connecteurs quittent le DOM ; le catalogue se cache par classe', async () => {
    stubMatchMedia(true)
    await renderEngagedThread()

    expect(screen.queryByRole('button', { name: 'Où investir mon temps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /outils et sources/i })).not.toBeInTheDocument()
    expect(commandsTriggerWrapperClassName()).toBe('hidden')
    // Le « + » reste, lui, toujours affiché : c'est par lui que tout reste atteignable.
    expect(screen.getByRole('button', { name: 'Ajouter à ce message' })).toBeInTheDocument()
  })

  it('rien n’est supprimé : le catalogue rejoint le menu « + »', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderEngagedThread()

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    expect(await screen.findByRole('menuitem', { name: 'Que puis-je demander ?' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Signaler un problème/ })).toBeInTheDocument()
  })

  it('un fil VIERGE garde la ligne d’outils intacte — seul un fil commencé la tait', async () => {
    stubMatchMedia(true)
    listMessagesMock.mockResolvedValue([])
    render(<Chat />)
    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled())

    // L'accueil (fil vide) porte déjà les amorces au centre — la ligne d'outils,
    // elle, garde son catalogue : rien de plus à taire ici, aucune duplication
    // à créer.
    expect(commandsTriggerWrapperClassName()).not.toBe('hidden')
  })

  it('bureau (≥ 768 px) inchangé : la ligne d’outils reste en place sur un fil commencé', async () => {
    stubMatchMedia(false)
    await renderEngagedThread()

    expect(commandsTriggerWrapperClassName()).not.toBe('hidden')
    expect(screen.getByRole('button', { name: /outils et sources/i })).toBeInTheDocument()
  })
})

/**
 * #3775.5b — le bouton flottant de signalement se tait désormais sur /chat à
 * TOUTES les largeurs (plus seulement sous 768 px, voir `FeedbackWidget.tsx`
 * et `FeedbackWidget.test.tsx`) : la condition `isMobile` qui réservait
 * « Signaler un problème » au menu « + » mobile seul n'a donc plus lieu
 * d'être — le geste doit rester atteignable en BUREAU aussi.
 */
describe('#3775.5b — « Signaler un problème » rejoint le « + », à toutes les largeurs', () => {
  it('bureau (≥ 768 px) : l’entrée est dans le menu « + », pas seulement en mobile', async () => {
    stubMatchMedia(false)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderEngagedThread()

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    expect(await screen.findByRole('menuitem', { name: /Signaler un problème/ })).toBeInTheDocument()
  })

  it('mobile (< 768 px) : non-régression — l’entrée reste présente', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderEngagedThread()

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    expect(await screen.findByRole('menuitem', { name: /Signaler un problème/ })).toBeInTheDocument()
  })
})

/**
 * #3050 (27/09/2026) — LE COMPOSEUR RESTE COLLÉ EN BAS, JUSTE AU-DESSUS DE LA
 * NAVIGATION : RIEN NE S'EMPILE PLUS SOUS LUI.
 *
 * Recette du 27/09 (fenêtre 500px, espace réel) : le fil n'occupait que 38% de
 * la hauteur utile, le composeur finissait à 375px sur 701, et 325px de barre
 * mémoire (« Laura garde en tête ») + navigation basse s'empilaient dessous.
 * `MemoryBar` (la barre) ne se monte donc plus DU TOUT sous 768px — ce test
 * échoue si elle revient, sous quelque forme que ce soit, entre le composeur
 * et la fin du DOM du fil. Le geste qu'elle portait rejoint le « + » du
 * composeur (`ComposerToolsMenu` → `MemoryDialog`), qui ne rend rien fermé.
 */
describe('#3050 — sous 768 px, rien ne s’empile plus entre le composeur et la navigation', () => {
  it('« Mémoire » n’apparaît PAS avant d’ouvrir le « + » — aucune barre montée', async () => {
    stubMatchMedia(true)
    await renderEngagedThread()

    expect(screen.queryByText(/Mémoire · /)).not.toBeInTheDocument()
  })

  it('#5042 — plus d’entrée « Mémoire » dans le « + » mobile ; la mention d’erreur reste, une fois', async () => {
    stubMatchMedia(true)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderEngagedThread()

    await user.click(screen.getByRole('button', { name: 'Ajouter à ce message' }))
    await screen.findByRole('menuitem', { name: /signaler/i })
    expect(screen.queryByRole('menuitem', { name: /^mémoire$/i })).not.toBeInTheDocument()
  })

  it('#5042 — bureau et mobile : aucune barre « Mémoire », la mention d’erreur sous le composeur, UNE fois', async () => {
    for (const mobile of [false, true]) {
      cleanup()
      stubMatchMedia(mobile)
      await renderEngagedThread()

      expect(screen.queryByText(/Mémoire · /)).not.toBeInTheDocument()
      expect(
        screen.getAllByText('Les réponses peuvent contenir des erreurs. Vérifie les informations critiques.'),
      ).toHaveLength(1)
    }
  })
})
