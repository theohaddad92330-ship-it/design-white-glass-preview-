import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * Les contacts du CRM, et la réponse d'API que l'écran jetait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT — LE MÊME QUE `/pilotage`, UN ÉCRAN PLUS LOIN
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /crm/contacts` échoue par `crmReadFailure()`
 * (`apps/api/src/modules/crm/crm.service.ts`), qui rend un corps de connecteur
 * complet : `code: "scope_missing"`, la capacité, les trois portées de LECTURE
 * nommées, et une phrase déjà écrite avec le geste à faire.
 *
 * Le panneau, lui, déstructurait `isError` SANS `error` — il ne pouvait donc
 * rien lire de tout cela — et rendait une phrase unique : « Impossible de
 * charger les contacts CRM. Réessaie dans un instant. » Sur une portée
 * manquante, « réessaie dans un instant » est un mensonge : un jeton OAuth ne
 * gagne pas une portée toute seule, et l'attente peut durer une journée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. les TROIS états se distinguent : pas connecté · connecté sans le droit de
 *     lire · panne réelle ;
 *  2. la phrase du serveur est AFFICHÉE, pas réécrite (elle nomme les portées) ;
 *  3. il y a un chemin — et une PANNE n'en a pas, parce qu'Intégrations ne la
 *     répare pas ;
 *  4. le nom de l'ÉDITEUR n'atteint jamais le JSX.
 */

/** Le corps que `crmReadFailure()` rend sur une portée manquante. */
const SERVER_BODY = {
  code: 'scope_missing',
  provider: 'hubspot',
  capability: 'crm',
  scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read'],
  message:
    "Je n'ai pas le droit de regarder ton CRM. Reconnecte cet outil : un accès déjà donné ne s'élargit pas tout seul.",
}

const contacts = vi.fn()
const addToPortfolioMutate = vi.fn()
vi.mock('@/features/crm/hooks/useCrmContacts', () => ({ useCrmContacts: () => contacts() }))
vi.mock('@/features/crm/hooks/useLogCrmActivity', () => ({
  useLogCrmActivity: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/features/crm/hooks/useAddCrmCompanyToPortfolio', () => ({
  useAddCrmCompanyToPortfolio: () => ({ mutate: addToPortfolioMutate, isPending: false, variables: undefined }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { CrmDataPanel } = await import('./CrmDataPanel')

const failing = (error: unknown) => ({
  data: undefined,
  isLoading: false,
  isError: true,
  error,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  isRefetching: false,
})

beforeEach(() => {
  contacts.mockReset()
  addToPortfolioMutate.mockReset()
})

const withOneCompanyContact = () =>
  contacts.mockReturnValue({
    data: {
      pages: [
        {
          contacts: [
            {
              id: 'c1',
              email: 'jean@qonto.com',
              firstName: 'Jean',
              lastName: 'Dupont',
              company: 'Qonto',
              jobTitle: 'CTO',
              phone: null,
            },
          ],
          nextAfter: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    isRefetching: false,
  })

describe('CrmDataPanel — trois états, jamais un « ou »', () => {
  it('portée manquante : AFFICHE la phrase du serveur, et ouvre un chemin', () => {
    contacts.mockReturnValue(failing(new ApiError(SERVER_BODY.message, 503, 'scope_missing')))
    const { container } = render(<CrmDataPanel />)

    // La phrase du serveur, telle quelle : la réécrire perdrait le geste.
    expect(container.textContent).toContain("Je n'ai pas le droit de regarder ton CRM")
    // La phrase fourre-tout d'avant a disparu de ce cas-là.
    expect(container.textContent).not.toContain('Réessaie dans un instant')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('aucun CRM connecté : un AUTRE message, et le même chemin', () => {
    contacts.mockReturnValue(failing(new ApiError('Aucun CRM connecté à cet espace.', 412)))
    const { container } = render(<CrmDataPanel />)

    expect(container.textContent).toContain('Aucun CRM n’est connecté')
    expect(container.textContent).not.toContain("Je n'ai pas le droit")
    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('vraie panne : distincte des deux autres, et SANS chemin', () => {
    // « Cassé » et « pas le droit » ne se ressemblent pas — et Intégrations ne
    // répare pas une panne : un bouton qui ne répare rien est pire qu'un
    // message nu.
    contacts.mockReturnValue(failing(new ApiError('boom', 500)))
    const { container } = render(<CrmDataPanel />)

    expect(container.textContent).toContain('c’est la lecture qui a échoué')
    expect(container.textContent).not.toContain('Aucun CRM n’est connecté')
    expect(container.textContent).not.toContain("Je n'ai pas le droit")
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('un corps sans `message` ne laisse pas l’écran muet', () => {
    contacts.mockReturnValue(failing(new ApiError('', 503, 'scope_missing')))
    const { container } = render(<CrmDataPanel />)
    expect(container.textContent).toContain('Reconnecte-le')
  })

  it('un échec qui n’est PAS une `ApiError` reste lisible', () => {
    contacts.mockReturnValue(failing(new Error('network')))
    const { container } = render(<CrmDataPanel />)
    expect(container.textContent).toContain('c’est la lecture qui a échoué')
  })

  it('une liste VIDE ne se confond pas avec un échec', () => {
    // « Une erreur se remarque, une liste vide se croit » : les deux gardent
    // des phrases distinctes.
    contacts.mockReturnValue({
      data: { pages: [{ contacts: [], nextAfter: null }] },
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
      isRefetching: false,
    })
    const { container } = render(<CrmDataPanel />)
    expect(container.textContent).toContain('Aucun contact dans ton CRM')
    expect(container.textContent).not.toContain('la lecture qui a échoué')
  })
})

describe('doctrine — le nom de l’éditeur n’atteint pas cet écran', () => {
  it('le corps 503 porte « hubspot », le DOM ne le porte jamais', () => {
    contacts.mockReturnValue(failing(new ApiError(SERVER_BODY.message, 503, 'scope_missing')))
    const { container } = render(<CrmDataPanel />)
    expect(container.textContent ?? '').not.toMatch(/hubspot/i)
    expect(container.textContent).toMatch(/ton CRM/i)
  })

  it('l’entête nomme la CAPACITÉ, pas l’éditeur', () => {
    // L'entête disait « Importer depuis HubSpot » : ce panneau vit dans
    // Connaissances › Données CRM, pas dans Réglages › Intégrations, donc
    // l'exception de doctrine ne s'y applique pas.
    contacts.mockReturnValue(failing(new ApiError('boom', 500)))
    const { container } = render(<CrmDataPanel />)
    expect(container.textContent ?? '').not.toMatch(/hubspot/i)
  })
})

// #2150.32 (épopée #2781) — « Ajouter au portefeuille » depuis le CRM. Un
// contact CRM connaît déjà l'entreprise (`company`) : le bouton rejoue la même
// porte que Découvrir (`accountsApi.addToPortfolio`), jamais une résolution
// distincte.
describe('CrmDataPanel — ajouter au portefeuille (#2150.32)', () => {
  it('une ligne avec société connue porte un bouton « Ajouter au portefeuille »', () => {
    withOneCompanyContact()
    render(<CrmDataPanel />)
    expect(screen.getByRole('button', { name: 'Ajouter Qonto au portefeuille' })).toBeInTheDocument()
  })

  it('cliquer le bouton appelle la même résolution que Découvrir, avec le nom de société de la ligne', () => {
    withOneCompanyContact()
    render(<CrmDataPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Qonto au portefeuille' }))
    expect(addToPortfolioMutate).toHaveBeenCalledTimes(1)
    expect(addToPortfolioMutate).toHaveBeenCalledWith({ company_name: 'Qonto' })
  })

  it('un contact sans société connue ne porte AUCUN bouton — rien à résoudre', () => {
    contacts.mockReturnValue({
      data: {
        pages: [
          {
            contacts: [
              { id: 'c2', email: 'a@b.com', firstName: 'A', lastName: 'B', company: null, jobTitle: null, phone: null },
            ],
            nextAfter: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
      isRefetching: false,
    })
    render(<CrmDataPanel />)
    expect(screen.queryByRole('button', { name: /portefeuille/i })).not.toBeInTheDocument()
  })
})
