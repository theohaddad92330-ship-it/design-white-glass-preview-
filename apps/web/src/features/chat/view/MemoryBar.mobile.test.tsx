import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * « Laura garde en tête » sur téléphone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #3050 (27/09/2026) — LA BARRE NE SE MONTE PLUS SOUS 768px
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette du 27/09 (fenêtre 500px) : le composeur finissait à 375px sur 701,
 * et 325px de barre + navigation basse s'empilaient dessous — le fil visé est
 * 100dvh moins l'en-tête, le composeur et la navigation, jamais une ligne de
 * plus. Même réduite à un seul bouton compact, cette ligne restait UNE ligne
 * de plus entre le composeur et la navigation — ce que la recette refuse
 * explicitement (« le composeur est collé en bas juste au-dessus de la
 * navigation »).
 *
 * Sous 768px, `MemoryBar` ne rend donc RIEN (`null`) : le geste rejoint le
 * « + » du composeur (`Chat.tsx`, `ComposerToolsMenu` → `onOpenMemory`), qui
 * ouvre `MemoryDialog` — le même contenu, monté par `Composer` avec son PROPRE
 * état, testé plus bas dans ce fichier.
 */

const memory = vi.hoisted(() => ({ facts: vi.fn(), pin: vi.fn(), unpin: vi.fn() }))

vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({ usePinnedFacts: memory.facts }))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: memory.pin, isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({
  useUnpinFact: () => ({ mutate: memory.unpin, isPending: false }),
}))
vi.mock('@/features/memory/view/MemoireCard', () => ({ MemoireCard: () => <div>panneau mémoire</div> }))
vi.mock('@bellum/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@bellum/ui')
  return {
    ...actual,
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  }
})

const { MemoryBar, MemoryDialog } = await import('./MemoryBar')

const facts = [
  { id: 'f1', fact: 'Le décideur est Renaud D.', expiresAt: null, kind: 'fact', origin: 'manual' },
  { id: 'f2', fact: 'Budget arbitré en septembre', expiresAt: null, kind: 'fact', origin: 'manual' },
  { id: 'f3', fact: 'Ne pas passer par les achats', expiresAt: null, kind: 'fact', origin: 'manual' },
]

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

describe('MemoryBar — sous 768px, elle ne rend RIEN (#3050)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ne rend aucun élément — ni bouton, ni barre, ni avertissement en permanence', () => {
    stubMatchMedia(true)
    memory.facts.mockReturnValue({ data: facts, isLoading: false, isError: false })
    const { container } = render(<MemoryBar accountId={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('garde la barre COMPLÈTE sur le bureau — non-régression', () => {
    stubMatchMedia(false)
    memory.facts.mockReturnValue({ data: facts, isLoading: false, isError: false })
    render(<MemoryBar accountId={null} />)
    expect(screen.getByText('Mémoire · 3 éléments enregistrés')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir la mémoire complète' })).toBeInTheDocument()
    expect(
      screen.getByText('Les réponses peuvent contenir des erreurs. Vérifie les informations critiques.'),
    ).toBeInTheDocument()
  })
})

/**
 * #3050 — LE TIROIR MOBILE : `MemoryDialog`, ouvert depuis le « + » du
 * composeur (`ComposerToolsMenu` → `onOpenMemory`, `Chat.tsx`), avec son
 * PROPRE état (`Composer`, `memoryOpen`/`setMemoryOpen`) — jamais celui de
 * `MemoryBar`, qui ne se monte plus sous 768px.
 */
describe('MemoryDialog — le contenu que le « + » ouvre sous 768px', () => {
  it('fermée, elle ne rend rien', () => {
    const { container } = render(<MemoryDialog accountId={null} open={false} onOpenChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ouverte, elle porte l’avertissement — plus aucune barre ne le fait sous 768px', () => {
    render(<MemoryDialog accountId={null} open onOpenChange={() => {}} />)
    expect(
      screen.getByText('Les réponses peuvent contenir des erreurs. Vérifie les informations critiques.'),
    ).toBeInTheDocument()
    expect(screen.getByText('panneau mémoire')).toBeInTheDocument()
  })

  it('`showDisclaimer={false}` (le cas `MemoryBar` desktop) ne le dit pas une seconde fois', () => {
    render(<MemoryDialog accountId={null} open onOpenChange={() => {}} showDisclaimer={false} />)
    expect(
      screen.queryByText('Les réponses peuvent contenir des erreurs. Vérifie les informations critiques.'),
    ).not.toBeInTheDocument()
  })
})

describe('MemoryBar — le repli mobile', () => {
  it('rend le compte « Mémoire · N éléments enregistrés » à TOUTES les largeurs — c’est lui qui dit ce que la modale contient', () => {
    memory.facts.mockReturnValue({ data: facts, isLoading: false, isError: false })
    render(<MemoryBar accountId={null} />)
    const summary = screen.getByText('Mémoire · 3 éléments enregistrés').closest('button')
    expect(summary).not.toBeNull()
    expect(summary?.className).not.toContain('md:hidden')
  })

  it('aucun texte de fait dans la barre, à aucune largeur', () => {
    memory.facts.mockReturnValue({ data: facts, isLoading: false, isError: false })
    render(<MemoryBar accountId={null} />)
    for (const fact of facts) expect(screen.queryByText(fact.fact)).not.toBeInTheDocument()
  })

  it('sans aucun fait, PAS de compte — « 0 élément » n’apprend rien', () => {
    memory.facts.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MemoryBar accountId={null} />)
    expect(screen.queryByText(/élément/)).not.toBeInTheDocument()
    expect(screen.getByText('Mémoire · rien d’enregistré pour l’instant')).toBeInTheDocument()
  })

  it('une mémoire illisible le DIT — elle ne se rend pas vide', () => {
    memory.facts.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MemoryBar accountId={null} />)
    expect(screen.getByText('Mémoire indisponible')).toBeInTheDocument()
  })
})
