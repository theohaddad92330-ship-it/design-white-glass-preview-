import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionsToolbar } from './MissionsToolbar'

/*
 * #1812 (09/09/2026) — « Demander à {{copilot}} » ne prend plus de place sur la
 * page : sur un poste de bureau, c'est la BULLE qui porte la question, et
 * `AskLaura` ne rend alors rien du tout.
 *
 * Ce test-ci ne mesure pas la bulle — il mesure que CET écran propose bien le
 * geste, avec le bon libellé et le bon contexte. On double donc le dépôt pour
 * dire « une autre instance porte la bulle », cas où `AskLaura` rend son lien
 * exactement comme avant. Le nouveau chemin a ses propres tests :
 * `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`, `LauraDock.intro.test.tsx`
 * et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

// `AskLaura` rend un `<Link>` — un vrai routeur n'a rien à faire dans un test
// de disposition, le même esprit que `MissionsPage.test.tsx`.
// ⚠️ `href` est OBLIGATOIRE : un `<a>` sans `href` n'a AUCUN rôle ARIA
// implicite, et `getByRole('link', …)` ne le trouverait jamais.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

function renderToolbar(trailing?: React.ReactNode, canReadFinance?: boolean) {
  render(
    <MissionsToolbar
      query=""
      onQueryChange={vi.fn()}
      facets={[]}
      onToggleFacet={vi.fn()}
      counts={{ toRenew: 0, noEndDate: 0, withRisk: 0, marginAtRisk: 0, consultantsSoonAvailable: 0 }}
      canReadFinance={canReadFinance}
      trailing={trailing}
    />,
  )
}

/**
 * #1825 — « mettre colonne justifié à droite, sur la même ligne que rechercher
 * une mission pour gagner de l'espace sur la page ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PEUT PROUVER, ET CE QU'IL NE PEUT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne met rien en page : il ne peut pas mesurer que deux éléments sont
 * visuellement sur la même LIGNE. Il peut en revanche vérifier la STRUCTURE
 * DOM qui produit ce résultat — `trailing` rendu comme un ENFANT DIRECT du
 * MÊME conteneur `flex` que la recherche, pas dans un second `<Box>` empilé
 * en dessous (l'ancien défaut : deux `Box` block-level l'un sous l'autre sont
 * deux rangées, quoi qu'on mette dedans).
 */
describe('MissionsToolbar — #1825, un contenu additionnel rejoint la même rangée', () => {
  beforeEach(cleanup)

  it('rend `trailing` comme un ENFANT DIRECT du même conteneur flex que la recherche', () => {
    renderToolbar(<button type="button">Colonnes</button>)
    const search = screen.getByPlaceholderText('Rechercher une mission, un compte…')
    const trailingButton = screen.getByRole('button', { name: 'Colonnes' })
    // `SearchInput` enveloppe son `<input>` dans son propre `<div>` (l'icône),
    // et l'`<input>` porte LUI-MÊME la classe `flex` (mise en page de son
    // contenu, sans rapport avec la rangée) — `closest` matcherait l'élément
    // de DÉPART s'il correspond déjà, d'où le départ au PARENT. Il remonte
    // ensuite jusqu'à la rangée : le plus proche ancêtre `.flex` réel.
    const row = search.parentElement?.closest('.flex')
    expect(row).not.toBeNull()
    expect(trailingButton.parentElement).toBe(row)
  })

  it('#X31 — le champ de recherche est assez large pour son placeholder (recette Y11 : « Rechercher une mission, un c »)', () => {
    renderToolbar(undefined)
    const search = screen.getByPlaceholderText('Rechercher une mission, un compte…')
    // 34 caractères à 14 px tiennent dans 24 rem ; le champ prend toute la largeur de son conteneur.
    expect((search.getAttribute('placeholder') ?? '').length).toBeLessThanOrEqual(40)
    expect(search).toHaveClass('w-full')
  })

  it('sans `trailing`, rien ne change — l’autre appelant (PlanningPage) garde son rendu', () => {
    renderToolbar(undefined)
    expect(screen.getByPlaceholderText('Rechercher une mission, un compte…')).toBeInTheDocument()
    // #3655.1 — « supprimer » : la barre ne porte plus de lien Laura.
    expect(screen.queryByRole('link', { name: /Laura/i })).toBeNull()
  })
})

/**
 * #2408.49 — LA PASTILLE « Marge à risque », SEULEMENT avec `finance:read`.
 *
 * ⚠️ Le serveur retire déjà `margin_at_risk` du tableau sans le droit
 * (`MARGIN_RISKS`, `delivery.service.ts`) : sans cette porte côté écran, la
 * pastille resterait visible mais bloquée à zéro pour tout le monde d'autre
 * — une population qui ne peut jamais se remplir se lit comme une panne.
 */
describe('MissionsToolbar — #2408.49, la pastille « Marge » suit `finance:read`', () => {
  beforeEach(cleanup)

  it('n’affiche PAS la pastille sans le droit financier', () => {
    renderToolbar(undefined, false)
    expect(screen.queryByRole('button', { name: /Marge à risque/ })).not.toBeInTheDocument()
  })

  it('n’affiche pas la pastille non plus quand le droit n’est pas encore connu', () => {
    renderToolbar(undefined, undefined)
    expect(screen.queryByRole('button', { name: /Marge à risque/ })).not.toBeInTheDocument()
  })

  it('affiche la pastille AVEC le droit financier', () => {
    renderToolbar(undefined, true)
    expect(screen.getByRole('button', { name: /Marge à risque/ })).toBeInTheDocument()
  })
})
