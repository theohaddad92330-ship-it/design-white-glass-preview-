import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountSimilarContainer } from './AccountSimilarContainer'

let suggestions: SimilarAccountSuggestion[] = []
let loading = false

vi.mock('@/features/accounts/hooks/useSimilarToAccount', () => ({
  useSimilarToAccount: () => ({ data: suggestions, isLoading: loading }),
  similarToAccountQueryKey: (accountId: string | undefined) => ['accounts', 'similar-to-account', accountId],
}))

const { setSimilarSuggestionDismissed, toastFn } = vi.hoisted(() => ({
  setSimilarSuggestionDismissed: vi.fn().mockResolvedValue({ dismissed: true }),
  toastFn: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { setSimilarSuggestionDismissed },
}))
vi.mock('sonner', () => ({ toast: toastFn }))

function suggestion(over: Partial<SimilarAccountSuggestion> = {}): SimilarAccountSuggestion {
  return {
    id: 's-1',
    company_name: 'KEOLIS',
    sector: 'Transport ferroviaire (NAF 49.10Z)',
    description: 'LYON · Transport ferroviaire',
    ...over,
  } as SimilarAccountSuggestion
}

beforeEach(() => {
  suggestions = []
  loading = false
})

/**
 * #2117.82 — RECETTE 23/09 : SUR MP GEMS (compte pauvre), le panneau latéral
 * mesurait 2x la hauteur du contenu principal (~1270px de vide) — cette
 * carte, entre autres, restait montée avec un titre et « Aucune entreprise
 * similaire trouvée pour ce secteur. » alors qu'elle ne dit RIEN. Doctrine
 * « on n'affiche pas ce qu'on n'a pas » : la carte ne se rend plus du tout
 * une fois la recherche terminée sans résultat — le chargement, lui, reste
 * visible (il dit qu'une recherche est en cours).
 */
describe('AccountSimilarContainer — présent-only, aucune carte vide (#2117.82)', () => {
  it('ne rend RIEN — pas de titre, pas de message d’absence — une fois la recherche vide', async () => {
    suggestions = []
    loading = false
    const { container } = renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    // `renderWithRouter` monte le routeur de façon ASYNCHRONE (TanStack
    // Router résout la correspondance de route via une promesse) : un
    // contrôle synchrone juste après `render` ne prouverait RIEN — le DOM
    // serait vide de toute façon, PAS ENCORE monté. `waitFor` force au
    // moins un nouveau tick avant de conclure ; la carte « reste visible
    // PENDANT la recherche » (test suivant) prouve que le même montage
    // affiche bien du contenu quand il y en a — l'absence ici est donc
    // celle du COMPOSANT, pas celle d'un rendu qui n'a pas eu lieu.
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Comptes du même secteur')).not.toBeInTheDocument()
    expect(screen.queryByText('Aucune entreprise similaire trouvée pour ce secteur.')).not.toBeInTheDocument()
  })

  it('reste visible PENDANT la recherche — ce n’est pas encore une absence connue', async () => {
    suggestions = []
    loading = true
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    expect(await screen.findByText('Comptes du même secteur')).toBeInTheDocument()
    expect(screen.getByText('Recherche par code NAF…')).toBeInTheDocument()
  })
})

/**
 * #1632.5 — L'AFFINITÉ TECHNOLOGIQUE SUR LE DOSSIER D'UN COMPTE.
 *
 * La carte jumelle de celle du portefeuille. Elle dit la même phrase — c'est le
 * MÊME composant qui la rend — mais elle se tait sur la provenance, que son
 * propre titre annonce déjà.
 */
/**
 * #2127.26 / .27 / .29 — CE QUE LA SUGGESTION PARTAGE AVEC LE COMPTE OUVERT.
 *
 * Le secteur est dans le titre. Ce qui manquait : la zone, la taille, le recours
 * à des externes OBSERVÉ des deux côtés — et seulement quand le serveur l'a
 * vérifié. Rien de vérifié → rien d'écrit, jamais une différence affirmée.
 */
describe('AccountSimilarContainer — les critères partagés avec le compte ouvert (#2127.26/.27/.29/.30)', () => {
  it('écrit les critères partagés, dans l’ordre du contrat', async () => {
    suggestions = [suggestion({ reference_shared: ['geo', 'size', 'external_use', 'role_family'] })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)
    expect(
      await screen.findByText(
        'En commun : même zone · effectif comparable · recours à des externes observé des deux côtés · métiers recrutés en commun',
      ),
    ).toBeInTheDocument()
  })

  it('#2127.30 — cite les familles de rôles recrutées en commun quand c’est le SEUL critère vérifié', async () => {
    suggestions = [suggestion({ reference_shared: ['role_family'] })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)
    expect(await screen.findByText('En commun : métiers recrutés en commun')).toBeInTheDocument()
  })

  it('n’écrit rien quand rien n’est partagé ou quand l’API est antérieure au champ', async () => {
    suggestions = [suggestion({ reference_shared: [] }), suggestion({ id: 's-2', company_name: 'TRANSDEV' })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)
    await screen.findByText('TRANSDEV')
    expect(screen.queryByText(/En commun/)).not.toBeInTheDocument()
  })
})

/**
 * #2127.37 — CTA « MASQUER CETTE SUGGESTION », PERSISTANT ET PAR PERSONNE.
 *
 * Le clic n'est pas nichée dans le bouton de navigation (deux CTA sur une
 * suggestion, jamais un bouton dans un bouton) : cible ≥ 44 px, nommée, et
 * démasquable — la doctrine « on archive, on ne supprime pas ».
 */
describe('AccountSimilarContainer — masquer cette suggestion (#2127.37)', () => {
  beforeEach(() => {
    setSimilarSuggestionDismissed.mockClear()
    toastFn.mockClear()
  })

  it('propose un CTA « Masquer cette suggestion », nommé et distinct du CTA de navigation', async () => {
    suggestions = [suggestion({ id: '552049447' })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    const dismissButton = await screen.findByRole('button', { name: 'Masquer cette suggestion' })
    const navButton = screen.getByRole('button', { name: /KEOLIS/ })
    expect(dismissButton).not.toBe(navButton)
    // Deux boutons frères, jamais l'un dans l'autre.
    expect(dismissButton.closest('button')).toBe(dismissButton)
  })

  it('masquer appelle l’API PERSISTANTE avec le SIREN de la suggestion et le compte ouvert', async () => {
    const user = userEvent.setup()
    suggestions = [suggestion({ id: '552049447' })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    await user.click(await screen.findByRole('button', { name: 'Masquer cette suggestion' }))

    await waitFor(() => {
      expect(setSimilarSuggestionDismissed).toHaveBeenCalledWith('acc-1', '552049447', true)
    })
  })

  it('masquer confirme par un message ET propose Annuler — se démasque, ne supprime rien', async () => {
    const user = userEvent.setup()
    suggestions = [suggestion({ id: '552049447' })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    await user.click(await screen.findByRole('button', { name: 'Masquer cette suggestion' }))

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalledWith(
        'Suggestion masquée',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Annuler' }) }),
      )
    })

    // Annuler DÉMASQUE — même appel, `on: false` — jamais une suppression.
    const [, options] = toastFn.mock.calls[0]!
    options.action.onClick()
    expect(setSimilarSuggestionDismissed).toHaveBeenCalledWith('acc-1', '552049447', false)
  })
})

describe('AccountSimilarContainer — la raison technologique (#1632)', () => {
  it('NOMME le compte de référence et LISTE les technologies communes', async () => {
    suggestions = [
      suggestion({
        similarity_headline: { kind: 'tech', referenceAccount: 'SNCF', technologies: ['java', 'c++', 'python'] },
      }),
    ]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    expect(await screen.findByText(/Environnement technologique proche de/)).toHaveTextContent(
      'Environnement technologique proche de SNCF : java, c++, python',
    )
  })

  it('n’écrit JAMAIS « stack proche » ni un score nu — les deux interdits du retour', async () => {
    suggestions = [
      suggestion({
        similarity_headline: { kind: 'tech', referenceAccount: 'SNCF', technologies: ['java', 'c++', 'python'] },
      }),
    ]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)
    await screen.findByText(/Environnement technologique proche de/)

    expect(screen.queryByText(/stack proche/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/similarité\s*0/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0[.,]\d\d/)).not.toBeInTheDocument()
  })

  it('se TAIT sur la provenance — le titre de la carte la dit déjà (loi 4)', async () => {
    suggestions = [suggestion({ similarity_headline: { kind: 'sector', referenceAccount: 'SNCF' } })]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)
    await screen.findByText('KEOLIS')

    expect(screen.queryByText(/Même secteur que/)).not.toBeInTheDocument()
    expect(screen.getByText('Comptes du même secteur')).toBeInTheDocument()
  })

  it('n’écrit rien de plus pour une réponse d’API antérieure au champ', async () => {
    suggestions = [suggestion()]
    renderWithRouter(<AccountSimilarContainer accountId="acc-1" />)

    expect(await screen.findByText('KEOLIS')).toBeInTheDocument()
    expect(screen.queryByText(/Environnement technologique/)).not.toBeInTheDocument()
  })
})
