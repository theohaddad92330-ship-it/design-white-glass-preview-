/**
 * #2120.49 — « AJOUTER CE QUE JE SAIS » OUVRE LA NOTE TERRAIN, PAS L'HISTORIQUE.
 *
 * Le geste était câblé (#2128.58) vers `onOpenInDossier('history')` : ce que
 * je sais se consignait dans le journal du compte. QCM Louis, 15/09/2026 :
 * « Ajouter ce que je sais » = NOTE TERRAIN sur la personne, le MÊME geste
 * que la carte d'influence (#2121.43 — datée, gagne sur l'analyse, jamais
 * écrasée), qui vit dans l'onglet Organigramme (`FocalOrgView` →
 * `OrgCorrectionDrawer`). Le correctif règle le GESTE (la destination),
 * jamais le mécanisme lui-même : on réutilise ce qui existe déjà, on ne
 * recode rien.
 *
 * ⚠️ `DossierSearchField.test.tsx` couvre déjà tout le comportement visuel
 * du champ (focus, raccourcis d'action). Ce test-ci vérifie une seule
 * chose : où `AccountDossierSearch` (le CONTAINER, l'appelant) branche le
 * geste — donc son enfant lourd est un jeton, comme dans
 * `AccountDetail.collaboration.test.tsx` pour la même raison (les hooks
 * réseau de l'index de recherche n'ont rien à voir avec cette question).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Contact } from '@bellum/contracts'

// Le champ ne se focus JAMAIS dans ce test : `active` (l'état qui monte
// `DossierSearchIndex`, l'enfant lourd aux hooks réseau) reste `false` du
// début à la fin. Le jeton ci-dessous n'a besoin d'aucun de ces hooks pour
// exposer le seul geste qu'on vérifie.
vi.mock('./DossierSearchField', () => ({
  DossierSearch: ({ onAddWhatIKnow }: { onAddWhatIKnow: () => void }) => (
    <button type="button" onClick={onAddWhatIKnow}>
      jeton-ajouter-ce-que-je-sais
    </button>
  ),
}))

const { AccountDossierSearch } = await import('./AccountDossierSearch')

const ACCOUNT = { id: 'acc-1', company_name: 'ACME' } as Account
const CONTACTS: Contact[] = []

function renderSearch(onOpenInDossier: (tab: string, item?: string) => void) {
  const rootRoute = createRootRoute()
  const accountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$id',
    validateSearch: (search: Record<string, unknown>) => ({ find: search.find as string | undefined }),
    component: () => <AccountDossierSearch account={ACCOUNT} contacts={CONTACTS} onOpenInDossier={onOpenInDossier} />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([accountRoute]),
    history: createMemoryHistory({ initialEntries: ['/accounts/acc-1'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('AccountDossierSearch — « Ajouter ce que je sais » (#2120.49)', () => {
  it('ouvre l’organigramme (la note terrain, #2121.43), jamais l’historique', async () => {
    const onOpenInDossier = vi.fn()
    renderSearch(onOpenInDossier)

    // `fireEvent.click`, PAS `userEvent.click` : ce dernier simule le focus
    // implicite du clic sur un bouton, qui remonte par `onFocusCapture`
    // jusqu'au conteneur — il monterait alors le VRAI `DossierSearchIndex`
    // (ses hooks réseau, hors sujet ici) avant même que le clic n'arrive.
    // Même piège que `CommercialStatusSubmenu.reason.test.tsx`.
    fireEvent.click(await screen.findByText('jeton-ajouter-ce-que-je-sais'))

    expect(onOpenInDossier).toHaveBeenCalledWith('organigramme')
    expect(onOpenInDossier).not.toHaveBeenCalledWith('history')
  })
})
