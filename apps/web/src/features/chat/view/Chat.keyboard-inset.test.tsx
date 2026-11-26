import { act, render } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2435.5 — LE COMPOSER SE POUSSE AU-DESSUS DU CLAVIER OUVERT.
 *
 * Preuve que `useVisualViewportInset` (testé seul dans
 * `apps/web/src/features/mobile/useVisualViewportInset.test.ts`) est bien
 * BRANCHÉ sur l'écran réel : `<Chat />` monté, le viewport visuel rétréci
 * simulé (comme un clavier qui s'ouvre), et la marge basse du formulaire de
 * saisie mesurée. Même gabarit de mocks que `Chat.attach-formats.test.tsx`.
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
// #2451.9 — le composeur lit le mode par défaut de l'espace par `useQuery`
// (`GET /workspaces/laura-mode`), or ce fichier rend `Chat` sans
// `QueryClientProvider` (même raison que useMemoryScopeOptions/useDeleteRagDocument,
// #1918.5/#1982). `undefined` = comportement byte-identique à avant #2451.9.
vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))
vi.mock('@/features/chat/hooks/useChatPresence', () => ({ useChatPresence: () => [] }))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: [], isLoading: false }),
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
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-id') }),
}))
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
vi.mock('../api/laura-turn', () => ({ askLauraStreaming: vi.fn() }))
vi.mock('../api/agentChatApi', () => ({
  listAgentChatMessages: vi.fn().mockResolvedValue([]),
  createAgentChatMessage: vi.fn().mockResolvedValue({}),
  listAgentChatHistory: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/chat/hooks/useChatModeEstimate', () => ({
  useChatModeEstimate: () => ({ data: undefined }),
}))

import { Chat } from './Chat'

class FakeVisualViewport extends EventTarget {
  height: number
  offsetTop = 0
  constructor(height: number) {
    super()
    this.height = height
  }
}

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

let originalVisualViewport: VisualViewport | null
let originalInnerHeight: number

beforeEach(() => {
  localStorage.clear()
  originalVisualViewport = window.visualViewport
  originalInnerHeight = window.innerHeight
})

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: originalVisualViewport, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
})

function composerForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form')
  if (!(form instanceof HTMLFormElement)) throw new Error('formulaire du composer absent du rendu')
  return form
}

/**
 * #2112 — RECETTE IPHONE DU 25/09 : LA SAISIE PREND TOUT L'ÉCRAN ET POUSSE
 * LE BOUTON « + » (JOINDRE / PRISE DE PHOTO) HORS DU CADRE.
 *
 * La saisie grandit avec le texte tapé jusqu'à `COMPOSER_MAX_HEIGHT_PX`
 * (220px, la même valeur pour tout le monde) — sur un clavier mobile ouvert,
 * la hauteur VISIBLE tombe souvent sous 300px (mesuré `Chat.keyboard-inset.test.tsx`
 * juste au-dessus : 500px de viewport visuel MOINS l'en-tête, la bande de
 * mémoire et le padding ajouté par le clavier). Une saisie qui peut à elle
 * seule atteindre 220px y prend l'essentiel de l'espace restant, et pousse la
 * rangée d'outils — le bouton « + » qui ouvre joindre un fichier / prise de
 * photo (#2435.9) — sous le pli. Sous 768px seulement (`useIsMobile`), le
 * plafond redescend à 120px ; desktop garde 220px, inchangé.
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
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

function composerTextarea(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector('textarea')
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('champ de saisie absent du rendu')
  return textarea
}

describe('#2112 — sous 768px, la saisie plafonne plus bas pour laisser le bouton « + » dans le cadre', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plafonne à 120px sur mobile, jamais 220px', () => {
    stubMatchMedia(true)
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    Object.defineProperty(window, 'visualViewport', { value: new FakeVisualViewport(800), configurable: true })

    const { container } = render(<Chat />)

    expect(composerTextarea(container).className).toContain('max-h-[120px]')
    expect(composerTextarea(container).className).not.toContain('max-h-[220px]')
  })

  it('garde 220px sur le bureau — non-régression', () => {
    stubMatchMedia(false)
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    Object.defineProperty(window, 'visualViewport', { value: new FakeVisualViewport(800), configurable: true })

    const { container } = render(<Chat />)

    expect(composerTextarea(container).className).toContain('max-h-[220px]')
    expect(composerTextarea(container).className).not.toContain('max-h-[120px]')
  })
})

describe('#2435.5 — le composer se pousse au-dessus du clavier ouvert', () => {
  it('sans clavier, le composer ne porte aucune marge basse ajoutée', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    Object.defineProperty(window, 'visualViewport', { value: new FakeVisualViewport(800), configurable: true })

    const { container } = render(<Chat />)
    expect(composerForm(container).style.paddingBottom).toBe('')
  })

  it('clavier ouvert (viewport visuel rétréci de 300px) → le composer gagne 300px de marge basse', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const fake = new FakeVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })

    const { container } = render(<Chat />)

    act(() => {
      fake.height = 500
      fake.dispatchEvent(new Event('resize'))
    })

    expect(composerForm(container).style.paddingBottom).toBe('300px')
  })
})
