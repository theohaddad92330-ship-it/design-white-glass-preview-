import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route as PilotageIndexRoute } from '@/routes/pilotage/index'
import { PilotagePendingSkeleton } from './PilotagePendingSkeleton'

/**
 * `CustomerPage` porte la vraie coque applicative (barre latérale, session,
 * thème…) — la monter pour de vrai ici demanderait de doubler la douzaine de
 * hooks métier qu'elle entraîne (même motif que
 * `chaque-route-de-premier-niveau-survit-au-chargement-direct.test.tsx`,
 * qui le fait déjà pour la coquille `SettingsPage`, à un tout autre budget).
 * Ce test-ci ne mesure pas la coquille elle-même — déjà sous test ailleurs —
 * mais QUE `PilotagePendingSkeleton` la demande, avec le bon réglage
 * (`titleInScreen`, même contrat que `PilotagePage`).
 */
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, titleInScreen }: { children: React.ReactNode; titleInScreen?: boolean }) => (
    <div data-testid="customer-page-shell" data-title-in-screen={titleInScreen ? 'true' : 'false'}>
      {children}
    </div>
  ),
}))

/**
 * #3475 — /pilotage restait ~2,5 s presque noir (spinner générique du
 * routeur sur fond sombre) avant d'afficher quoi que ce soit, le temps que le
 * chunk de l'écran (une douzaine de panneaux) charge. `PilotagePendingSkeleton`
 * doit apparaître IMMÉDIATEMENT à la place : la vraie coque (barre latérale),
 * puis des emplacements de carte — jamais une page blanche/noire.
 */
describe('PilotagePendingSkeleton (#3475)', () => {
  it('est bien le pendingComponent câblé sur la route /pilotage — sinon il ne se joue jamais', () => {
    // La preuve que ce composant est APPELÉ, pas seulement écrit : sans ce
    // test, rien ne garantit que la route cite encore ce fichier après un
    // refactor.
    expect(PilotageIndexRoute.options.pendingComponent).toBe(PilotagePendingSkeleton)
  })

  it('se montre SANS délai : pendingMs à 0, sinon le routeur attend 1 s avant de le rendre (écran noir)', () => {
    // Cause réelle de la recette du 01/10 (« écran noir, sans coque ni
    // squelette ») : le pendingComponent était câblé mais TanStack Router ne
    // l'affiche qu'après `pendingMs` (1000 ms par défaut) — une seconde de
    // fond sombre nu. Une valeur absente ou > 0 doit faire échouer ce test.
    expect(PilotageIndexRoute.options.pendingMs).toBe(0)
  })

  it('demande la vraie coque, réglée comme PilotagePage (titre dans l’écran, pas l’en-tête)', () => {
    render(<PilotagePendingSkeleton />)
    const shell = screen.getByTestId('customer-page-shell')
    // Sans ce réglage, l'en-tête afficherait un titre pendant le squelette
    // puis le ferait disparaître à l'arrivée de la vraie page (#3475 :
    // « un écran moche revient partiel »).
    expect(shell.dataset['titleInScreen']).toBe('true')
  })

  it('affiche des emplacements de carte à la place du contenu, pas une page vide', () => {
    render(<PilotagePendingSkeleton />)
    const skeleton = screen.getByTestId('pilotage-pending-skeleton')
    // Un bloc-silhouette par section de la vraie page (titre, bande de
    // décision, carte du maillon faible, chaîne).
    expect(skeleton.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(4)
  })
})
