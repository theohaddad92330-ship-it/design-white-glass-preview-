import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { ContactsEmptyState } from './ContactsEmptyState'

// #2297 — `EnrichConfirmDialog` lit `useIsDemo` (session) : espace réel par défaut.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: vi.fn(() => false) }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}))

// `AskLaura` vit sous le routeur et dépose sa question dans la bulle : ce qui
// compte ICI, c'est que l'état vide la PROPOSE, avec une question et le dossier.
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label, question, accountId }: { label: string; question: string; accountId?: string }) => (
    <a data-testid="ask-laura" data-question={question} data-account={accountId}>
      {label}
    </a>
  ),
}))

/**
 * #1130 — « aucun contact trouvé (j'ai rajouté en manuel) ».
 *
 * L'écran vide affirmait « Aucun contact suffisamment fiable n'a été identifié »
 * — un VERDICT, et un verdict que la réponse du serveur ne porte pas. Le
 * commercial ne peut pas distinguer trois situations qui se ressemblent :
 * personne n'a jamais cherché, la recherche a rendu zéro, la recherche a
 * échoué. La troisième est celle qui coûte : on renonce à un compte parce qu'un
 * timeout s'est présenté comme une absence.
 *
 * ⚠️ Ce que le serveur NE dit PAS reste non-dit : il ne renvoie ni périmètre
 * cherché, ni fournisseur interrogé, ni nombre de hits (`{count, identified,
 * organigramRebuild}` est tout ce que porte `POST /analysis/:id/enrich-contacts`).
 * Ces tests vérifient donc qu'on rapporte ce qui EXISTE, jamais qu'on comble.
 */

type EnrichMutation = ReturnType<typeof useEnrichContacts>

function mutation(partial: Partial<EnrichMutation>): EnrichMutation {
  return {
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    ...partial,
  } as unknown as EnrichMutation
}

const noop = () => {}

function renderEmptyState(
  enrichBatchMutation: EnrichMutation,
  handlers: { onChangeScope?: () => void; onContinueWithout?: () => void } = {},
  queryClient = new QueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ContactsEmptyState
        accountId="acc-1"
        enrichBatchMutation={enrichBatchMutation}
        onCreateContact={noop}
        onImportCsv={noop}
        onChangeScope={handlers.onChangeScope ?? noop}
        onContinueWithout={handlers.onContinueWithout ?? noop}
      />
    </QueryClientProvider>,
  )
}

describe('ContactsEmptyState — dire ce qu’on sait, mener au geste qui marche', () => {
  /**
   * Le geste que Louis a fini par trouver tout seul, en haut à droite de
   * l'onglet, à 900 px de la phrase qui le lui conseillait. Une réponse juste
   * sans chemin DEPUIS l'endroit où la question se pose.
   */
  it('offre la saisie manuelle et l’import là où la question se pose', () => {
    renderEmptyState(mutation({}))
    expect(screen.getByRole('button', { name: 'Ajouter un contact' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechercher des contacts' })).toBeInTheDocument()
  })

  /**
   * Aucune recherche n'a eu lieu dans cette session : l'écran ne conclut rien.
   * « Un verdict ne se conclut pas d'un silence. »
   */
  it('ne conclut rien tant qu’aucune recherche n’a rendu de réponse', () => {
    renderEmptyState(mutation({}))
    expect(screen.getByText('Aucun contact dans ce dossier.')).toBeInTheDocument()
    expect(screen.queryByText(/dernière recherche/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Aucune donnée trouvée')).not.toBeInTheDocument()
    expect(screen.queryByText('Source indisponible')).not.toBeInTheDocument()
  })

  /**
   * #2126.4 / #2126.13 — la recherche a répondu, et elle n'a rien trouvé :
   * l'état porte un NOM (« Aucune donnée trouvée ») et une phrase qui dit ce
   * qui a été vérifié, pas un titre générique qui ressemble au dossier neuf.
   */
  it('nomme l’état « Aucune donnée trouvée » quand la recherche a rendu zéro', () => {
    renderEmptyState(mutation({ isSuccess: true, data: { count: 0 } }))
    expect(screen.getByText('Aucune donnée trouvée')).toBeInTheDocument()
    expect(screen.getByText('Je n’ai trouvé aucun contact vérifiable dans ce périmètre.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun contact dans ce dossier.')).not.toBeInTheDocument()
  })

  /**
   * `identified` = ce que la recherche a trouvé, `count` = ce qui est ENTRÉ au
   * dossier (api.ts:69). Les deux chiffres viennent du serveur ; l'écart n'est
   * pas interprété, il est dit.
   */
  it('distingue « trouvé » de « entré au dossier » quand le serveur donne les deux', () => {
    renderEmptyState(mutation({ isSuccess: true, data: { count: 0, identified: 3 } }))
    expect(screen.getByText('3 contacts trouvés, aucun n’est entré au dossier.')).toBeInTheDocument()
  })

  /**
   * LA distinction qui compte : « cassé » et « non mesurable » se ressemblent.
   * #2126.8 / #2126.14 — une panne s'appelle « Source indisponible », et la
   * phrase dit que le résultat est INCOMPLET : jamais « aucun contact ».
   */
  it('n’appelle jamais un échec de recherche une absence de contact', () => {
    renderEmptyState(mutation({ isError: true, error: new Error('boom') }))
    expect(screen.getByText('Source indisponible')).toBeInTheDocument()
    expect(
      screen.getByText('Je n’ai pas pu interroger la source Contacts. Ce résultat est incomplet.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Aucune donnée trouvée')).not.toBeInTheDocument()
    expect(screen.queryByText(/aucun contact vérifiable/)).not.toBeInTheDocument()
  })

  /**
   * #2126.12 — aucun des états nommés ne rend un « 0 » : un dossier vide n'est
   * pas « 0 contact », et une panne encore moins.
   */
  it.each([
    ['jamais cherché', mutation({})],
    ['zéro trouvé', mutation({ isSuccess: true, data: { count: 0 } })],
    ['zéro trouvé, identified à 0', mutation({ isSuccess: true, data: { count: 0, identified: 0 } })],
    ['source en panne', mutation({ isError: true, error: new Error('boom') })],
  ])('n’affiche jamais un zéro nu — %s', (_label, state) => {
    const { container } = renderEmptyState(state)
    expect(container.textContent ?? '').not.toMatch(/(^|\D)0(\D|$)/)
  })

  /**
   * #2126.18 / .22 / .23 / .24 — un état vide sans sortie est une impasse. Les
   * quatre gestes de sortie sont là, et aucun ne dépense : « Actualiser » RELIT
   * le dossier (la recherche payante reste derrière sa confirmation).
   */
  it('propose les gestes de sortie : actualiser, changer de périmètre, Laura, continuer sans', async () => {
    const onChangeScope = vi.fn()
    const onContinueWithout = vi.fn()
    const mutate = vi.fn()
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    renderEmptyState(
      mutation({ mutate, isSuccess: true, data: { count: 0 } }),
      { onChangeScope, onContinueWithout },
      queryClient,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'acc-1'] })
    expect(mutate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Changer de périmètre' }))
    expect(onChangeScope).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Continuer sans cette donnée' }))
    expect(onContinueWithout).toHaveBeenCalledTimes(1)

    const laura = screen.getByTestId('ask-laura')
    expect(laura).toHaveTextContent('Demander à Laura')
    expect(laura).toHaveAttribute('data-account', 'acc-1')
    expect(laura.getAttribute('data-question')).toMatch(/contact/)
  })

  /**
   * #2120.52-57 — cette recherche est gratuite (Phase 2, aucun crédit débité)
   * mais tournait jusqu'à une minute sur un simple clic, sans jamais le dire.
   * Le clic arme désormais la confirmation partagée ; `mutate` n'est appelé
   * qu'après le clic de confirmation, et le dialogue dit explicitement que
   * c'est gratuit plutôt que d'annoncer un coût inventé.
   */
  it('annonce la recherche avant de la lancer, sans jamais afficher de coût inventé', async () => {
    const mutate = vi.fn()
    renderEmptyState(mutation({ mutate }))

    await userEvent.click(screen.getByRole('button', { name: 'Rechercher des contacts' }))
    expect(mutate).not.toHaveBeenCalled()

    expect(await screen.findByText('Lancer une recherche de contacts ?')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)

    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
