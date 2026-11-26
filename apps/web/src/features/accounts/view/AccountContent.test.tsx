import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountContent } from './AccountContent'

// Le cache par balise n'est pas décoratif : sans lui, `motion.div` rend une
// closure NEUVE à chaque rendu, ce que React lit comme un changement de
// TYPE de composant — et démonte/remonte tout le sous-arbre au premier
// re-rendu venu après le montage (voir l'investigation CI du 30/08 dans
// `AccountContent.selection.test.tsx`, qui a trouvé ce défaut).
vi.mock('framer-motion', () => {
  const motionTags = new Map<string, any>()
  return {
    motion: new Proxy(
      {},
      {
        get: (_target: unknown, prop: string) => {
          if (typeof prop !== 'string') return undefined
          if (!motionTags.has(prop)) {
            const Component = prop
            motionTags.set(prop, ({ children, ...props }: any) => <Component {...props}>{children}</Component>)
          }
          return motionTags.get(prop)
        },
      },
    ),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useInView: () => true,
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  }
})

function renderAccounts(over: Partial<Parameters<typeof AccountContent>[0]> = {}) {
  const props = {
    accounts: [],
    counters: undefined,
    loading: false,
    failed: false,
    onRetry: () => {},
    viewMode: 'list' as const,
    onChangeViewMode: () => {},
    selectedIds: new Set<string>(),
    onSelectedIdsChange: () => {},
    compareOpen: false,
    onCompareOpenChange: () => {},
    query: '',
    onQueryChange: () => {},
    sortKey: 'date_desc' as const,
    onSortKeyChange: vi.fn(),
    activeTab: 'all',
    onTabChange: () => {},
    activeFilters: [],
    onFiltersChange: () => {},
    onClearFilters: vi.fn(),
    narrowing: { active: false, lifecycle: null } as ListNarrowing,
    ...over,
  }
  renderWithRouter(<AccountContent {...props} />)
  return props
}

/**
 * #4127 revient sur #4087.1 (bandeau compacté), délibérément — Louis 13/10 :
 * « supprime état du portefeuille et tout ce container, il ne sert à rien ».
 */
describe('AccountContent — #4127 plus de bandeau « État du portefeuille »', () => {
  it('aucune section « État du portefeuille », même avec des compteurs', () => {
    renderAccounts({ counters: { followed: 12, withoutNextAction: 3 } })
    expect(document.querySelector('[aria-label="État du portefeuille"]')).toBeNull()
    expect(screen.queryByText('État du portefeuille')).not.toBeInTheDocument()
    expect(screen.queryByText(/sans prochaine action/i)).not.toBeInTheDocument()
  })

  it('sous restriction, la sortie « Voir tout le portefeuille » survit hors du bandeau', async () => {
    renderAccounts({ narrowing: { active: true, lifecycle: 'opportunity' } })
    expect(await screen.findByRole('link', { name: /voir tout le portefeuille/i })).toBeInTheDocument()
  })

  it('sans restriction, aucune sortie', () => {
    renderAccounts()
    expect(screen.queryByRole('link', { name: /voir tout le portefeuille/i })).not.toBeInTheDocument()
  })
})

/**
 * DÉFAUT DE RECETTE — production, 30/08/2026.
 *
 * 24 comptes au portefeuille. L'encart du bas propose « Voir les opportunités
 * → », l'URL devient `/accounts?lifecycle=opportunity`, et l'écran répond
 * « Aucun compte analysé pour l'instant · Lance ta première analyse » — le
 * message du portefeuille INITIAL, et un geste qui coûte 8 crédits pour un
 * problème qui n'existe pas.
 *
 * Les deux états EXISTENT tous les deux dans ce fichier depuis #1134. C'est la
 * BASCULE entre eux qui était aveugle : `lifecycle` n'est ni une pastille de la
 * barre de filtres, ni un onglet, donc rien ne le comptait comme une
 * restriction.
 */
describe('AccountContent — un vide FILTRÉ n’est pas un portefeuille vide', () => {
  it('sous un rangement invisible, rend l’état « aucun résultat » et JAMAIS l’état initial', async () => {
    renderAccounts({ narrowing: { active: true, lifecycle: 'opportunity' } })

    expect(await screen.findByText('Aucun compte ne correspond aux filtres')).toBeInTheDocument()
    // Le message du portefeuille vide, et surtout son geste payant, n'ont rien
    // à faire devant quelqu'un qui a 24 comptes.
    expect(screen.queryByText("Aucun compte analysé pour l'instant")).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lancer ma première analyse/i })).not.toBeInTheDocument()
  })

  it('NOMME le rangement plutôt que d’écrire « les filtres » devant une barre vide', async () => {
    renderAccounts({ narrowing: { active: true, lifecycle: 'opportunity' } })

    expect(await screen.findByText(/aucun de ses comptes n’est rangé en « À potentiel »/)).toBeInTheDocument()
  })

  it('offre le geste qui en SORT — retirer le filtre, pas dépenser un crédit', async () => {
    const props = renderAccounts({ narrowing: { active: true, lifecycle: 'opportunity' } })

    await userEvent.click(await screen.findByRole('button', { name: /retirer ce filtre/i }))
    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('ne propose plus d’analyser un nom tapé sous un rangement — la société y est peut-être déjà', async () => {
    renderAccounts({ query: 'Doctolib', narrowing: { active: true, lifecycle: 'opportunity' } })

    expect(await screen.findByText('Aucun compte ne correspond aux filtres')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /analyser/i })).not.toBeInTheDocument()
  })

  it('sans aucune restriction, l’état INITIAL reste celui qu’on montre', async () => {
    renderAccounts({ narrowing: { active: false, lifecycle: null } })

    expect(await screen.findByText("Aucun compte analysé pour l'instant")).toBeInTheDocument()
    expect(screen.queryByText('Aucun compte ne correspond aux filtres')).not.toBeInTheDocument()
  })
})

describe('AccountContent — l’état vide filtré offre son geste', () => {
  /**
   * MANQUE C DU 30/08 — généralisé à TOUS les filtres, pas seulement
   * `lifecycle`. Un SEUL filtre à facettes actif est désormais NOMMÉ, comme
   * l'était déjà le rangement du cycle commercial : jamais le message
   * générique du portefeuille filtré pour un cas qu'on peut désigner.
   */
  it('NOMME un filtre à facettes ISOLÉ, plutôt que le message générique', async () => {
    renderAccounts({
      narrowing: { active: true, lifecycle: null },
      activeFilters: [{ id: 'status', value: 'completed' }],
    })

    expect(await screen.findByText('Aucun compte ne correspond aux filtres')).toBeInTheDocument()
    expect(await screen.findByText(/Statut de l’analyse : Terminé/)).toBeInTheDocument()
    // « Retirer ce filtre », au SINGULIER — comme pour le rangement isolé.
    expect(await screen.findByRole('button', { name: /retirer ce filtre/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /réinitialiser les filtres/i })).not.toBeInTheDocument()
  })

  it('relâche réellement le filtre isolé au clic', async () => {
    const props = renderAccounts({
      narrowing: { active: true, lifecycle: null },
      activeFilters: [{ id: 'status', value: 'completed' }],
    })

    await userEvent.click(await screen.findByRole('button', { name: /retirer ce filtre/i }))

    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
  })

  // Plusieurs filtres à la fois : on ne sait plus dire LEQUEL retirer isolément
  // — le geste générique (pluriel) reste le bon.
  it('propose « Réinitialiser les filtres » — au pluriel — quand PLUSIEURS filtres à facettes ne rendent rien', async () => {
    renderAccounts({
      narrowing: { active: true, lifecycle: null },
      activeFilters: [
        { id: 'status', value: 'completed' },
        { id: 'sector', value: 'Banque & Assurance' },
      ],
    })

    expect(await screen.findByText('Aucun compte ne correspond aux filtres')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /réinitialiser les filtres/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer ce filtre/i })).not.toBeInTheDocument()
  })

  it('relâche réellement les filtres au clic — cas générique (plusieurs filtres)', async () => {
    const props = renderAccounts({
      narrowing: { active: true, lifecycle: null },
      activeFilters: [
        { id: 'status', value: 'completed' },
        { id: 'sector', value: 'Banque & Assurance' },
      ],
    })

    await userEvent.click(await screen.findByRole('button', { name: /réinitialiser les filtres/i }))

    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
  })

  // Un bouton qui ne fait rien est pire qu'un texte nu : sans filtre à relâcher
  // (une recherche blanche, par exemple), il n'y a pas de geste à offrir.
  it('n’offre aucun bouton quand il n’y a rien à relâcher', async () => {
    renderAccounts({ narrowing: { active: true, lifecycle: null }, query: '   ', activeFilters: [] })

    expect(await screen.findByText('Aucun compte ne correspond aux filtres')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /réinitialiser les filtres/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer ce filtre/i })).not.toBeInTheDocument()
  })

  // La branche sœur (une société tapée qui n'est pas au portefeuille) garde SON
  // geste : lancer l'analyse. Le bouton de filtres n'a rien à y faire.
  it('laisse à la branche « analyser » son propre geste', async () => {
    renderAccounts({ narrowing: { active: true, lifecycle: null }, query: 'Doctolib' })

    expect(await screen.findByRole('link', { name: /analyser/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /réinitialiser les filtres/i })).not.toBeInTheDocument()
  })

  // …et le geste « analyser » disparaît dès qu'UN SEUL autre axe est posé à
  // côté du nom tapé : la société est peut-être déjà là, hors du rayon que cet
  // axe pose (même raison que sous `lifecycle`, généralisée).
  it('un filtre à facettes ISOLÉ retire aussi le geste « analyser », même avec un nom tapé', async () => {
    renderAccounts({
      narrowing: { active: true, lifecycle: null },
      query: 'Doctolib',
      activeFilters: [{ id: 'status', value: 'completed' }],
    })

    expect(await screen.findByText(/Statut de l’analyse : Terminé/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /analyser/i })).not.toBeInTheDocument()
  })
})
