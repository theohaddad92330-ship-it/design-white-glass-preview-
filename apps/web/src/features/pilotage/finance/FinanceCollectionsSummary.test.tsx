import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { FinanceCollectionsSummary } from './FinanceCollectionsSummary'

/**
 * #2744.2 — /pilotage/finance : la carte « En attente » était ÉCRASÉE
 * (85 × 100 px, texte en lettre-à-lettre) alors qu'une seule carte sur cinq
 * était touchée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÉCANISME (même famille que GA-373, #2652)
 * ─────────────────────────────────────────────────────────────────────────
 * Cette grille (`lg:grid-cols-5`) posait son compte de colonnes sur un
 * palier de FENÊTRE, alors qu'elle vit DANS `FinanceScreen.tsx`, qui divise
 * déjà la page sur ce même signal (`md:grid-cols-2`, la carte partage la
 * moitié de la fenêtre avec un autre bloc). À `lg` (fenêtre large), la
 * grille croit disposer de toute la largeur et force 5 colonnes égales dans
 * un conteneur qui n'en fait que la moitié — chaque carte hérite d'environ
 * 85 px, et un montant qui n'y tient pas se met en lettre-à-lettre (85 × 100).
 * `grid-cols-[repeat(auto-fit,minmax(<min>,1fr))]` mesure la largeur RÉELLE
 * du conteneur reçu, quel que soit ce qui l'entoure, comme `SectorPicker.tsx`
 * / `FilterRail.tsx` l'ont déjà fait pour #2652.
 */
function bucket(overrides: Partial<{ count: number; amountCents: number | null; withoutAmount: number }> = {}) {
  return { count: 0, amountCents: 0, withoutAmount: 0, ...overrides }
}

const summary = {
  paid: bucket({ count: 2, amountCents: 500_000 }),
  pending: bucket({ count: 1, amountCents: 1_234_500 }),
  overdue: bucket(),
  disputed: bucket(),
  invoiced: { ...bucket({ count: 3, amountCents: 1_734_500 }), declared: 3 },
  withoutDueDate: 0,
}

async function renderSummary() {
  const result = renderWithRouter(
    <FinanceCollectionsSummary
      summary={summary}
      canReadFinance
      loading={false}
      failed={false}
      unmatched={bucket()}
      unmatchedLoading={false}
      unmatchedFailed={false}
    />,
  )
  // Le rendu passe par TanStack Router (`renderWithRouter`) : la route
  // interne se résout de façon asynchrone, même en mémoire. Attendre le
  // libellé du premier seau est ce qui garantit que le DOM interrogé
  // ensuite est bien celui du composant, pas la coquille vide du routeur.
  await screen.findByText('En attente')
  return result
}

describe('r3a (recette prod 07/10) — « Encaissé » nomme sa période et sa source sous le chiffre', () => {
  it('une seule légende, sous le seau payé', async () => {
    await renderSummary()
    expect(screen.getAllByText('sur 12 mois · suivi de facturation')).toHaveLength(1)
  })
})

describe('#2744.2 — la grille des 5 cartes se mesure à son conteneur, pas à la fenêtre', () => {
  it('ne pose plus son compte de colonnes sur un palier de FENÊTRE (`lg:grid-cols-5`)', async () => {
    const { container } = await renderSummary()
    const grid = container.querySelector('.grid')
    expect(grid).not.toBeNull()
    expect(grid?.className ?? '').not.toMatch(/\blg:grid-cols-5\b/)
  })

  it('dimensionne ses colonnes par le CONTENU (`auto-fit`/`minmax`), comme SectorPicker/FilterRail (#2652)', async () => {
    const { container } = await renderSummary()
    const grid = container.querySelector('.grid')
    expect(grid?.className ?? '').toMatch(/grid-cols-\[repeat\(auto-fit,\s*minmax\(\d+px,\s*1fr\)\)\]/)
  })

  it('les 5 cartes (4 seaux + « non rapproché ») restent dans la MÊME grille', async () => {
    const { container } = await renderSummary()
    const grid = container.querySelector('.grid')
    expect(grid?.children).toHaveLength(5)
  })
})
