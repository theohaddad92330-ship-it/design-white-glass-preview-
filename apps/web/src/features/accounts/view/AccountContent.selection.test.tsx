import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountContent } from './AccountContent'
import type { AccountRow } from './accounts-list/types'

/**
 * LA PREUVE QUE LA BARRE DE SÉLECTION EST ATTEIGNABLE.
 *
 * `SelectionBar` ne se monte qu'à partir de DEUX comptes retenus, et
 * `CompareDialog` de même. Tant qu'aucun geste de l'écran ne pouvait faire
 * grossir `selectedIds`, ces deux composants étaient du code mort : leurs
 * propres tests passaient au vert, et personne ne les voyait jamais.
 *
 * Ce fichier part du HAUT — l'état vit chez l'appelant, comme dans
 * `AccountsPage` — et va jusqu'à la barre. Il tombe si quelqu'un débranche la
 * sélection quelque part entre `AccountContent` et la case de la ligne.
 */

vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))

/**
 * CAUSE RÉELLE trouvée en CI (30/08) : `motion.div` est réévalué à CHAQUE
 * rendu — c'est un accès de propriété sur ce Proxy — et SANS CACHE il
 * rendait une closure NEUVE à chaque accès. React compare le TYPE d'un
 * élément par RÉFÉRENCE ; une closure neuve à chaque rendu se lit donc comme
 * un composant DIFFÉRENT, et React démonte puis remonte tout le sous-arbre
 * `motion.div` — tableau compris — au premier re-rendu survenant après le
 * montage initial.
 *
 * Tant qu'AUCUNE requête ne réglait après le montage dans ce test (le seul
 * hook qui en posait une, `useAccountSectors`, est gardé par
 * `enabled: !!user`, et `renderWithRouter` monte avec `user: null`), ce
 * défaut restait invisible : le composant ne se re-rendait jamais entre le
 * montage et la fin des clics. `AccountContent` a gagné une requête qui,
 * elle, n'est pas gardée sur l'utilisateur (`useAccessSummary`, manque B du
 * 30/08 — même choix que `TabAccess.tsx` pour `/accounts/:id/access`) : elle
 * se règle après un tick, provoque le PREMIER re-rendu que ce test ait
 * jamais vu survenir en cours de clic, et révèle le défaut latent du mock —
 * la case cochée au milieu du geste se retrouvait démontée avant que le
 * clic n'atteigne son gestionnaire.
 *
 * La vraie bibliothèque exporte des composants STABLES (`motion.div` est la
 * MÊME référence à chaque rendu) ; ce mock s'aligne donc dessus avec un
 * cache par balise, plutôt que de se reposer sur l'absence accidentelle de
 * second rendu. Correction faite ICI et pas dans le composant : aucun
 * utilisateur réel ne perd un clic à cause de ce mock — la vraie librairie
 * ne recrée jamais `motion.div`, vérifié en la démontant du mock (voir la
 * note d'investigation dans le commit).
 */
vi.mock('framer-motion', () => {
  const motionTags = new Map<string, React.ElementType>()
  return {
    motion: new Proxy(
      {},
      {
        get: (_target: unknown, prop: string) => {
          if (typeof prop !== 'string') return undefined
          if (!motionTags.has(prop)) {
            const Tag = prop as unknown as React.ElementType
            motionTags.set(
              prop,
              function MotionMock({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
                return <Tag {...props}>{children}</Tag>
              },
            )
          }
          return motionTags.get(prop)
        },
      },
    ),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useInView: () => true,
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  }
})

function makeRow(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...over,
  }
}

const ROWS: AccountRow[] = [
  makeRow({ id: 'a', company_name: 'edf' }),
  makeRow({ id: 'b', company_name: 'lcl' }),
  makeRow({ id: 'c', company_name: 'sncf' }),
]

/** L'état de sélection vit chez l'APPELANT, exactement comme dans `AccountsPage`. */
function Harness() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  return (
    <AccountContent
      accounts={ROWS}
      counters={undefined}
      loading={false}
      failed={false}
      onRetry={() => {}}
      viewMode="list"
      onChangeViewMode={() => {}}
      selectedIds={selectedIds}
      onSelectedIdsChange={setSelectedIds}
      compareOpen={compareOpen}
      onCompareOpenChange={setCompareOpen}
      query=""
      onQueryChange={() => {}}
      sortKey="date_desc"
      onSortKeyChange={() => {}}
      activeTab="all"
      onTabChange={() => {}}
      activeFilters={[]}
      onFiltersChange={() => {}}
      onClearFilters={() => {}}
      narrowing={{ active: false, lifecycle: null }}
    />
  )
}

describe('AccountContent — la sélection a enfin un PRODUCTEUR', () => {
  it('fait apparaître la barre de sélection à partir de deux comptes cochés', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<Harness />)

    expect(screen.queryByRole('button', { name: 'Comparer' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' }))
    // Un seul compte ne se compare à rien : la barre reste muette.
    expect(screen.queryByRole('button', { name: 'Comparer' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Lcl' }))

    expect(await screen.findByRole('button', { name: 'Comparer' })).toBeInTheDocument()
    // Le compte est mis en avant dans un `<span>` imbriqué (`Trans`), donc le
    // nœud porteur n'a que « comptes sélectionnés » en texte DIRECT : c'est son
    // `textContent` complet qu'il faut lire.
    expect((await screen.findByText(/comptes sélectionnés/)).textContent).toMatch(/2\s*comptes sélectionnés/)
  })

  it('« Effacer la sélection » relâche vraiment les cases', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<Harness />)

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Lcl' }))
    await user.click(await screen.findByRole('button', { name: 'Effacer la sélection' }))

    expect(screen.queryByRole('button', { name: 'Comparer' })).not.toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' })).not.toBeChecked()
  })

  it('« Tout sélectionner » retient les trois lignes chargées, puis les relâche', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<Harness />)

    const all = await screen.findByRole('checkbox', { name: 'Tout sélectionner' })
    await user.click(all)

    expect((await screen.findByText(/comptes sélectionnés/)).textContent).toMatch(/3\s*comptes sélectionnés/)
    expect(await screen.findByRole('checkbox', { name: 'Sélectionner Sncf' })).toBeChecked()

    await user.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))

    expect(screen.queryByRole('button', { name: 'Comparer' })).not.toBeInTheDocument()
  })

  /**
   * #2157.4/.8 — MÊME défaut que celui documenté au-dessus, pour « Créer une
   * cible » : le geste existait déjà dans le dossier compte
   * (`useCreateTargetFromAccount.ts`), mais aucune SÉLECTION de plusieurs
   * lignes ne pouvait le déclencher — la « recette » 2156.72 le nommait.
   */
  it('« Créer une cible » ouvre la preview sur les DEUX comptes sélectionnés', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<Harness />)

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Lcl' }))

    await user.click(await screen.findByRole('button', { name: 'Créer une cible' }))

    expect(await screen.findByRole('heading', { name: 'Créer une cible' })).toBeInTheDocument()
    expect(screen.getByText('2 fiches sélectionnées')).toBeInTheDocument()
  })
})
