import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * « Laura garde en tête » — la barre tient sur UNE ligne, le détail est dans
 * une modale.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La barre rendait UNE pastille par fait épinglé, et la ligne se repliait :
 * six faits = six lignes, soit un tiers de la hauteur de l'écran mangé sous le
 * fil, en permanence, pour une information de contexte. Ce n'est pas une
 * question de goût — la barre est FIXE sous la saisie, donc chaque ligne
 * qu'elle prend est une ligne de conversation en moins, et ça ne se rattrape
 * pas en faisant défiler.
 *
 * ⚠️ La première correction plafonnait l'aperçu à deux pastilles. MESURÉ EN
 * PROD, ça ne tenait toujours pas : la barre fait 966 px avec le rail des
 * conversations ouvert, l'avertissement en prend 435, le titre 222 — il reste
 * 245 px pour deux pastilles, un compteur et le bouton d'épinglage. Les
 * pastilles ne rétrécissaient pas (`min-width: auto`, le premier responsable
 * des débordements de ce dépôt) : elles se PEIGNAIENT par-dessus
 * l'avertissement, et « Épingler un fait » finissait 5 px hors de la barre.
 *
 * D'où la règle que ces tests tiennent : **la barre ne rend AUCUN texte de
 * fait**. Elle dit combien Laura garde en tête, et le détail s'ouvre. Un
 * aperçu qui ne tient pas n'est pas un aperçu, c'est un chevauchement — et
 * aucune largeur de pastille ne se devine sans mesurer, ce qu'un test ne sait
 * pas faire.
 */

const memory = vi.hoisted(() => ({ facts: vi.fn(), pin: vi.fn(), unpin: vi.fn() }))

// #1946.11 — le traceur produit, doublé pour OBSERVER. La vraie implémentation
// est inerte tant que `VITE_PRODUCT_TRACKER_ENABLED` n'est pas posée : la
// laisser réelle rendrait le test vert sans rien mesurer.
const tracker = vi.hoisted(() => ({ memoryAdded: vi.fn() }))
// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@/lib/product-tracker', () => ({ trackMemoryAdded: tracker.memoryAdded }))

vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({ usePinnedFacts: memory.facts }))
vi.mock('@/features/memory/hooks/usePinFact', () => ({ usePinFact: () => ({ mutate: memory.pin, isPending: false }) }))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({
  useUnpinFact: () => ({ mutate: memory.unpin, isPending: false }),
}))
vi.mock('@bellum/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@bellum/ui')
  return {
    ...actual,
    // La modale est CONTRÔLÉE dans le test : fermée, son contenu n'existe pas.
    // C'est exactement ce qu'on veut prouver — les faits au-delà de l'aperçu
    // ne sont pas juste masqués, ils ne pèsent pas sur la barre.
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  }
})

const { MemoryBar } = await import('./MemoryBar')

const facts = [
  'Ils refusent les CV anonymisés',
  'Le référencement passe par la centrale d’achat',
  'Le DSI ne prend aucun rendez-vous avant 9 h 30',
  'Budget arbitré en septembre',
  'Ne pas passer par les achats',
  'Le décideur est Renaud D.',
].map((fact, index) => ({
  id: `f${index + 1}`,
  fact,
  accountId: null,
  kind: 'fact' as const,
  origin: 'manual' as const,
  scope: 'workspace' as const,
  ownedByMe: true,
  expiresAt: null,
  createdAt: '2026-09-01T08:00:00.000Z',
}))

function renderBar(data = facts) {
  memory.facts.mockReturnValue({ data, isLoading: false, isError: false })
  render(<MemoryBar accountId={null} />)
}

beforeEach(() => {
  // `mockImplementation` posée par un test survivrait au suivant : ici, faire
  // réussir l'épinglage une fois rendrait « un épinglage qui n'aboutit pas »
  // impossible à écrire.
  memory.pin.mockReset()
  tracker.memoryAdded.mockClear()
})

describe('MemoryBar — une ligne, le détail dans une modale', () => {
  it('ne rend AUCUN texte de fait dans la barre — c’est ce qui la garde sur une ligne', () => {
    renderBar()
    for (const fact of facts) expect(screen.queryByText(fact.fact)).not.toBeInTheDocument()
  })

  it('#3775.4 — un seul accès compact : « Mémoire · 6 éléments enregistrés »', () => {
    renderBar()
    expect(screen.getByText('Mémoire · 6 éléments enregistrés')).toBeInTheDocument()
    // Plus de « Voir » ni d'« Épingler un fait » : le panneau porte ces gestes.
    expect(screen.queryByRole('button', { name: 'Voir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Épingler un fait' })).not.toBeInTheDocument()
    // Et jamais « utilisés » : rien ne trace un usage effectif dans une réponse.
    expect(screen.queryByText(/utilisés?/i)).not.toBeInTheDocument()
  })

  it('#3775.4 — le compteur est celui du panneau : il lit le même fil, expirés écartés', () => {
    memory.facts.mockReturnValue({
      data: [...facts, { ...facts[0], id: 'old', expiresAt: '2020-01-01T00:00:00.000Z' }],
      isLoading: false,
      isError: false,
    })
    render(<MemoryBar accountId="acc-1" conversationId="conv-1" />)
    expect(memory.facts).toHaveBeenCalledWith('acc-1', 'conv-1')
    expect(screen.getByText('Mémoire · 6 éléments enregistrés')).toBeInTheDocument()
  })

  // #3775 — DERNIER CRITÈRE (tronqué à « Le compteur » dans l'issue, reconstruit
  // au lot P04 09/10) : le compteur correspond EXACTEMENT au panneau qu'il ouvre.
  it('#3775 compteur — le panneau ouvert liste autant d’éléments que le compteur annonce', () => {
    const expired = { ...facts[0], id: 'old', fact: 'Un fait échu', expiresAt: '2020-01-01T00:00:00.000Z' }
    memory.facts.mockReturnValue({ data: [...facts, expired], isLoading: false, isError: false })
    render(<MemoryBar accountId="acc-1" conversationId="conv-1" />)
    expect(screen.getByText('Mémoire · 6 éléments enregistrés')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la mémoire complète' }))
    const listed = facts.filter(fact => screen.queryByText(fact.fact) !== null)
    expect(listed).toHaveLength(6)
    expect(screen.queryByText('Un fait échu')).not.toBeInTheDocument()
  })

  it('un seul élément se dit au singulier', () => {
    renderBar(facts.slice(0, 1))
    expect(screen.getByText('Mémoire · 1 élément enregistré')).toBeInTheDocument()
  })

  it('sans aucun élément, pas de compteur — « 0 élément » n’apprend rien', () => {
    renderBar([])
    expect(screen.queryByText(/élément/)).not.toBeInTheDocument()
    expect(screen.getByText('Mémoire · rien d’enregistré pour l’instant')).toBeInTheDocument()
  })

  it('le titre ouvre la mémoire complète — tous les éléments, pas un aperçu', () => {
    renderBar()
    expect(screen.queryByText(facts[5].fact)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la mémoire complète' }))
    for (const fact of facts) expect(screen.getByText(fact.fact)).toBeInTheDocument()
  })

  it('rien dans la barre ne peut déborder : l’accès mémoire est shrink-0', () => {
    // Le débordement mesuré en prod venait d'un enfant qui ne rétrécit pas
    // DANS un conteneur trop étroit. Plus aucun enfant ne porte de texte de
    // longueur inconnue — c'est ce qui rend le débordement impossible, et non
    // une borne de largeur qu'il faudrait deviner.
    renderBar()
    expect(screen.getByRole('button', { name: 'Ouvrir la mémoire complète' }).className).toContain('shrink-0')
  })
})
