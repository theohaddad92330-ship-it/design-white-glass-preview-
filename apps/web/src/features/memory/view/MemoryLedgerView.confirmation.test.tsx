import type React from 'react'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryItem, MemoryLedger, MemoryLedgerEntry } from '@bellum/contracts'

let ledger: MemoryLedger | null = { entries: [], unreadableLayers: [] }
let pinned: MemoryItem[] = []

// #1928.9 — les réglages de réponse ouvrent la section « Préférences
// personnelles » et portent leur propre réseau (`useReplyPreferences` → React
// Query → session). Ils ont leur suite (`ReplyPreferencesSettings.test.tsx`) ;
// ici un témoin nul, pour que CE fichier garde ce qu'il vise.
// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
// #4060 — l'approche des messages porte son propre réseau (session) : témoin nul, comme ReplyPreferencesSettings.
vi.mock('@/features/memory/view/MessageApproachSettings', () => ({ MessageApproachSettings: () => null }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@/features/memory/view/ReplyPreferencesSettings', () => ({ ReplyPreferencesSettings: () => null }))
// #2867 (LOT c10 clôture 26/09) — le temps protégé porte, lui aussi, son propre réseau (`useProtectedTime` → session) : même témoin nul, pour la même raison que `ReplyPreferencesSettings` juste au-dessus.
vi.mock('@/features/memory/view/ProtectedTimeSettings', () => ({ ProtectedTimeSettings: () => null }))
vi.mock('@/features/memory/view/AgendaPreferencesSettings', () => ({ AgendaPreferencesSettings: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useMemoryLedger: () => ({ data: ledger, isLoading: false, isError: false }),
  useForgetMemoryEntry: () => ({ mutate: vi.fn(), isPending: false }),
  useForgetAllMemory: () => ({ mutate: vi.fn(), isPending: false }),
  useSetFactScope: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFact: () => ({ mutate: vi.fn(), isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: pinned, isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({
  useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { MemoryLedgerView } = await import('./MemoryLedgerView')
const { MemoireCard } = await import('./MemoireCard')

function note(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'n-1',
    layer: 'facts',
    text: 'ALTEN n’est plus sur le compte',
    recordedAt: '2026-09-01T09:00:00.000Z',
    accountId: null,
    detail: 'copilotNote',
    expiresAt: null,
    kind: 'fact',
    origin: 'copilot',
    scope: 'workspace',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: { firstName: 'Alice', avatarUrl: null },
    surfaces: ['chat', 'externalAssistant'],
    ...over,
  }
}

function rowOf(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement
  if (!element) throw new Error(`aucune ligne pour « ${text} »`)
  return element
}

/**
 * Q1 (décision de Louis du 13/09) — une note de Laura dont une personne a
 * réécrit le texte n'est plus « à vérifier » : elle est « confirmée par
 * <prénom> ». Son origine reste dite (« retenu d'une réponse de Laura »).
 */
describe('Réglages › Mémoire — une note de Laura confirmée', () => {
  beforeEach(() => {
    ledger = { entries: [], unreadableLayers: [] }
  })

  it('dit « confirmée par Julie » à la place de « à vérifier », et pourquoi elle pèse désormais', () => {
    ledger = {
      entries: [note({ detail: 'confirmedNote', confirmedBy: { firstName: 'Julie', avatarUrl: null } })],
      unreadableLayers: [],
    }
    render(<MemoryLedgerView />)
    const row = within(rowOf('ALTEN n’est plus sur le compte'))
    expect(row.getByText('Note de Laura — confirmée par Julie')).toBeInTheDocument()
    expect(row.queryByText(/à vérifier/)).toBeNull()
    // L'origine est conservée…
    expect(row.getByText(/Retenu d'une réponse de Laura/)).toBeInTheDocument()
    // …et la raison dit le nouveau rang.
    expect(row.getByText(/la traite comme un fait déclaré/)).toBeInTheDocument()
  })

  it('un confirmateur dont le compte est effacé n’est pas nommé : « confirmée », sans prénom deviné', () => {
    ledger = { entries: [note({ detail: 'confirmedNote', confirmedBy: null })], unreadableLayers: [] }
    render(<MemoryLedgerView />)
    expect(within(rowOf('ALTEN n’est plus sur le compte')).getByText('Note de Laura — confirmée')).toBeInTheDocument()
  })

  it('le témoin : une note jamais relue reste « à vérifier »', () => {
    ledger = { entries: [note({})], unreadableLayers: [] }
    render(<MemoryLedgerView />)
    const row = within(rowOf('ALTEN n’est plus sur le compte'))
    expect(row.getByText('Note de Laura — à vérifier')).toBeInTheDocument()
    expect(row.getByText(/jamais confirmée/)).toBeInTheDocument()
  })
})

describe('Carte Mémoire du chat — une note de Laura confirmée', () => {
  const base: MemoryItem = {
    id: 'n-1',
    fact: 'ALTEN n’est plus sur le compte',
    accountId: null,
    kind: 'fact',
    origin: 'copilot',
    scope: 'workspace',
    ownedByMe: true,
    canForget: true,
    expiresAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
  }

  it('dit « confirmée » quand une personne l’a confirmée', () => {
    pinned = [{ ...base, confirmedAt: '2026-09-13T08:00:00.000Z' }]
    render(<MemoireCard accountId={null} />)
    expect(screen.getByText('Note de Laura — confirmée')).toBeInTheDocument()
    // Le libellé EXACT, pas une expression : depuis #1962 le sélecteur de nature
    // de la carte propose « Hypothèse à vérifier », qu'une garde sur /à vérifier/
    // attraperait sans le viser.
    expect(screen.queryByText('Note de Laura — à vérifier')).toBeNull()
  })

  it('le témoin : sans confirmation, elle reste « à vérifier »', () => {
    pinned = [{ ...base, confirmedAt: null }]
    render(<MemoireCard accountId={null} />)
    expect(screen.getByText('Note de Laura — à vérifier')).toBeInTheDocument()
  })
})
