import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { vi } from 'vitest'
import { clearAllChatDrafts, readChatDraft, writeChatDraft } from '../lib/composer-draft'

/**
 * (hérité du harnais de Chat.draft.test.tsx) #1953.15 / #1953.16 / #1953.17 / #1953.18 — LE BROUILLON SURVIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT CES QUATRE POINTS SE LISENT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre partagent la MÊME cause (`input` en `useState` seul, constat du
 * registre) et donc le MÊME correctif : une copie débouncée dans
 * `localStorage`, relue au montage. « Survit à un rafraîchissement » et
 * « survit à une navigation accidentelle » se prouvent tous deux en DÉMONTANT
 * puis en REMONTANT `<Chat />` — c'est exactement ce que fait un F5 ou un
 * retour arrière du navigateur pour ce composant. « Survit à une perte de
 * réseau » est couvert au même titre (perdre le réseau ne vide pas un
 * `useState`, mais forcer un rechargement pour la retrouver le ferait sans ce
 * correctif) et par `Chat.send-failure.test.tsx`, qui couvre le cas où le
 * réseau tombe PENDANT l'envoi. « Fermeture du drawer » n'a pas d'équivalent
 * sur `/chat` (pas de tiroir autour de sa saisie) ; voir le rapport de
 * livraison pour ce que ce point vise réellement (la bulle de Laura) et
 * pourquoi elle n'obtient PAS cette même persistance.
 */

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

const stableNavigate = vi.hoisted(() => () => Promise.resolve())
const locationSearch = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

// #1960.13 — l'incident DÉCLARÉ se lit dans les bannières de l'opérateur, donc
// par `useQuery` ; ce test rend `Chat` sans `QueryClientProvider`. La lecture
// est VIDE : aucun drapeau posé, donc aucun refus décoré — le cas normal, et
// le comportement byte-identique à celui d'avant le point.
vi.mock('@/features/banners/useBanners', () => ({ useActiveBanners: () => ({ data: [] }) }))

// #1918.2 / #1918.5 — les portées proposables se lisent par `useQuery`
// (`GET /business-units`), or ces tests rendent `Chat` sans
// `QueryClientProvider`. La lecture est rendue VIDE, et la RÈGLE reste celle du
// contrat : `offerableMemoryScopes` est appelé pour de vrai. C'est exactement
// l'état « je n'ai pas pu lire les périmètres » — il n'ouvre jamais une portée,
// il la retire, et « cette conversation » reste offerte dans un fil.
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: [] }),
  }
})

vi.mock('@/features/chat-commands/view/CommandDrawerButton', () => ({
  CommandDrawerButton: () => null,
}))
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
// #1940.4 — l'auteur des bulles lit le profil (react-query) : même double que le prénom.
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
  useLocation: () => ({ search: locationSearch.current }),
  useNavigate: () => stableNavigate,
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
// V13.3 — un objet MUTABLE (même patron que `locationSearch` plus haut) : la
// session arrive de façon ASYNCHRONE en production (après le premier rendu),
// et le scénario de course a besoin de rejouer ce même décalage ICI.
const sessionUser = vi.hoisted(() => ({ current: { id: 'u1' } as { id: string } | null }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: sessionUser.current }) }))
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
// #1954.20 — « retirer » une pièce jointe la supprime : `Chat` monte ce hook
// react-query, que cette suite (sans QueryClientProvider) doit doubler.
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

import { Chat } from './Chat'

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  locationSearch.current = {}
  sessionUser.current = { id: 'u1' }
  listMessagesMock.mockResolvedValue([])
  listHistoryMock.mockResolvedValue([])
  createMessageMock.mockResolvedValue({})
})

describe('#3469 / #3482.2 — le composer a le focus dès le montage', () => {
  it('`/chat` nu : document.activeElement est le champ, la frappe y atterrit', async () => {
    render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(document.activeElement).toBe(textarea))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('`/chat?new=1` : dès que le choix de portée est refermé (ou absent), le champ reprend le focus', async () => {
    locationSearch.current = { new: '1' }
    render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    const dialog = screen.queryByRole('dialog')
    if (dialog) {
      fireEvent.click(
        within(dialog)
          .getAllByRole('button')
          .find(b => /annuler|fermer/i.test(b.textContent ?? ''))!,
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    await waitFor(() => expect(document.activeElement).toBe(textarea))
  })

  it('un fil existant (`?conversationId=`) a aussi le focus au montage', async () => {
    locationSearch.current = { conversationId: 'c-focus' }
    render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    await waitFor(() => expect(document.activeElement).toBe(textarea))
  })

  /**
   * Vu en passant (lot V10, 08/10, recette prod Q #3899) — exactement le
   * symptôme de #3469 réapparu : le correctif différait le focus d'un tour
   * (`setTimeout(…, 0)`) MÊME sans aucune modale à attendre, rouvrant une
   * fenêtre où une frappe immédiate après navigation partait dans le vide.
   * Sans modale (le cas courant), rien ne justifie d'attendre un tour : le
   * focus se pose SYNCHRONEMENT au montage, prouvé ici SANS `waitFor` ni
   * `await` entre le rendu et la lecture du focus.
   */
  it('sait dire NON : sans modale de portée, le focus est posé SYNCHRONEMENT au montage — aucune fenêtre où une frappe se perd', () => {
    render(<Chat />)
    const textarea = screen.getByPlaceholderText('Écris ton message...')
    expect(document.activeElement).toBe(textarea)
  })
})

// V13.3 (recette prod 08/10) — « après navigation vers /chat, la frappe
// immédiate est polluée (« ééä » envoyé) ou perdue » : la session (`userId`)
// arrive de façon ASYNCHRONE après le premier rendu, et c'est CETTE fenêtre
// que le champ doit fermer à la frappe — désactivé jusqu'à ce qu'elle se
// résolve, puis repris par le focus automatique ci-dessus.
// #3769 (lot RAA 10/10) — RENVERSÉ : un champ désactivé JETTE la frappe. Le champ reste
// actif ; la frappe gagne, et la restauration du brouillon ne vaut que sur un champ vide.
describe('V13.3 / #3769 — le composeur n’est plus désactivé tant que la session n’est pas résolue', () => {
  it('actif et conserve la frappe tant que `useSession` n’a pas rendu d’utilisateur', async () => {
    sessionUser.current = null
    render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    expect(textarea).not.toBeDisabled()
  })

  it('prend le focus dès que la session se résout', async () => {
    sessionUser.current = null
    const { rerender } = render(<Chat />)
    const textarea = await screen.findByPlaceholderText('Écris ton message...')
    expect(textarea).not.toBeDisabled()

    sessionUser.current = { id: 'u1' }
    rerender(<Chat />)

    await waitFor(() => expect(textarea).not.toBeDisabled())
    await waitFor(() => expect(document.activeElement).toBe(textarea))
  })
})
