import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceTeam } from '@bellum/contracts'

/**
 * Ce fichier garde UNE chose, et c'est le défaut n°1 du dépôt : un calcul juste
 * que personne n'appelle. L'endpoint `PATCH /workspaces/portfolio-visibility` et
 * `portfolioScopeFor` existaient et étaient testés ; aucun écran ne les
 * atteignait. Un test de la carte SEULE aurait été vert dans ce monde-là.
 */

const useTeamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({
  TEAM_KEY: ['workspace-team'] as const,
  useTeam: () => useTeamMock(),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' }, loading: false }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children?: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))
// Le sélecteur de marché tire son propre appel réseau — hors sujet ici, et son
// comportement est couvert ailleurs.
vi.mock('@/features/team/view/MarketSelector', () => ({ MarketSelector: () => null }))
vi.mock('@/features/team/view/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))
// #4158.57 — le rapatriement d'espace tire ses propres appels ; couvert par `WorkspaceMerge.test.tsx`.
vi.mock('@/features/team/view/WorkspaceMerge', () => ({
  PersonalSpaceMergeCard: () => null,
  WorkspaceMergeRequestsSection: () => null,
}))
// #2770.37 — la politique d'équipe tire son propre appel réseau ; son comportement
// est couvert par `TeamPolicyCard.test.tsx`.
vi.mock('@/features/team/view/TeamPolicyCard', () => ({ TeamPolicyCard: () => null }))
// La boîte de départ tire son propre appel réseau (le portefeuille du membre) ;
// son contenu est couvert par `MemberOffboardingDialog.test.tsx`. Ce qu'on garde
// ICI, c'est le CÂBLAGE : la corbeille ouvre la boîte et ne retire plus rien au
// premier clic.
const memberPortfolioMock = vi.fn()
vi.mock('@/features/team/hooks/useMemberPortfolio', () => ({
  MEMBER_PORTFOLIO_KEY: (userId: string) => ['member-portfolio', userId],
  useMemberPortfolio: (...args: unknown[]) => memberPortfolioMock(...args),
}))

const { TeamView } = await import('./TeamView')

/** La charge utile de `GET /workspaces/me`, plus le champ que le serveur ne
 *  renvoie pas encore — passé en `extra` pour dire lequel des deux mondes on
 *  simule sans mentir sur le type du contrat. */
function team(extra: Record<string, unknown> = {}): WorkspaceTeam {
  return {
    workspace: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'ESN Test',
      role: 'owner',
      memberCount: 1,
      communityDataSharing: false,
      ...extra,
    },
    members: [{ userId: 'me', email: 'moi@esn.fr', fullName: 'Moi', role: 'owner', joinedAt: null }],
    invitations: [],
    seats: { used: 1, total: 5 },
  } as unknown as WorkspaceTeam
}

const removeMemberMutate = vi.fn()
const crossTeamSupportMutate = vi.fn()
const resendMutate = vi.fn()
let resendData: unknown

beforeEach(() => {
  useTeamMock.mockReset()
  removeMemberMutate.mockReset()
  crossTeamSupportMutate.mockReset()
  resendMutate.mockReset()
  resendData = undefined
  memberPortfolioMock.mockReturnValue({
    portfolio: { data: undefined, isLoading: true, isError: false },
    handOver: { mutate: vi.fn(), isPending: false },
  })
})

function renderTeam(data: WorkspaceTeam) {
  useTeamMock.mockReturnValue({
    team: data,
    isLoading: false,
    isError: false,
    invite: { mutate: vi.fn(), isPending: false },
    revokeInvitation: { mutate: vi.fn(), isPending: false, variables: undefined },
    resendInvitation: { mutate: resendMutate, isPending: false, variables: undefined, data: resendData },
    removeMember: { mutate: removeMemberMutate, isPending: false, variables: undefined },
    updateMemberRole: { mutate: vi.fn(), isPending: false, variables: undefined },
    setCrossTeamSupport: { mutate: crossTeamSupportMutate, isPending: false, variables: undefined },
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamView />
    </QueryClientProvider>,
  )
}

/** « Droits & visibilité » est un vrai sous-onglet : il n'affiche que son contenu. */
const openRightsTab = () => userEvent.click(screen.getByRole('button', { name: 'Droits & visibilité' }))

describe('les trois sous-onglets de l’administration', () => {
  it('« Membres & invitations » s’ouvre d’abord, et ne montre pas les droits ni les règles', () => {
    renderTeam(team())
    expect(screen.getByRole('button', { name: 'Membres & invitations' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Les personnes de l’espace' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /Qui voit quels comptes/ })).toBeNull()
  })

  it('« Droits & visibilité » montre le cloisonnement et le partage — et plus la liste des membres', async () => {
    renderTeam(team())
    await openRightsTab()
    expect(screen.getByRole('heading', { name: 'Le rôle ne remplace pas le consentement.' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /Qui voit quels comptes/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Les personnes de l’espace' })).toBeNull()
  })

  it('« Règles d’équipe » montre le cadre, et lui seul', async () => {
    renderTeam(team())
    await userEvent.click(screen.getByRole('button', { name: 'Règles d’équipe' }))
    expect(screen.getByRole('heading', { name: 'Les règles donnent le cadre.' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /Qui voit quels comptes/ })).toBeNull()
  })

  it('« Inviter un membre » ouvre la fenêtre d’invitation', async () => {
    renderTeam(team())
    await userEvent.click(screen.getByRole('button', { name: 'Inviter un membre' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('collaborateur@ton-esn.fr')).toBeInTheDocument()
  })
})

describe('l’écran Équipe branche le cloisonnement de portefeuille', () => {
  it('affiche le réglage, et lui passe la valeur LUE sur la réponse du serveur', async () => {
    renderTeam(team({ portfolioVisibility: 'restricted' }))
    await openRightsTab()
    expect(screen.getByRole('radiogroup', { name: /Qui voit quels comptes/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Cloisonné par commercial/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('n’affiche aucune option comme active tant que le serveur ne renvoie pas le champ', async () => {
    // L'état d'AUJOURD'HUI : `getTeam` compose son objet `workspace` à la main
    // et n'y met pas `portfolioVisibility`.
    renderTeam(team())
    await openRightsTab()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false')
    }
  })
})

/**
 * LE DÉFAUT N°1 DU DÉPÔT, DANS SA VERSION LA PLUS COÛTEUSE : un chemin livré
 * que le CLIC ne traverse pas.
 *
 * La prévisualisation d'un départ et le transfert de portefeuille peuvent
 * exister, être justes et testés — s'ils ne sont pas au bout de la corbeille de
 * la ligne d'un membre, ils n'existent pas. C'est cela qu'on garde ici.
 */
describe('les trois onglets de l’écran Équipe n’affichent que leur contenu', () => {
  it('Membres & invitations d’abord ; Règles d’équipe ne montre ni les membres ni le cloisonnement', async () => {
    renderTeam(team({ portfolioVisibility: 'restricted' }))
    // Les sous-onglets sont des pastilles (GA-127) : `aria-pressed`, pas `role="tab"`.
    expect(screen.getByRole('button', { name: 'Membres & invitations' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('radiogroup', { name: /Qui voit quels comptes/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Règles d’équipe' }))
    expect(screen.queryByRole('radiogroup', { name: /Qui voit quels comptes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument()
  })
})

describe('la corbeille d’un membre ouvre le départ, elle ne retire plus au premier clic', () => {
  const teamWithTwo = () =>
    ({
      workspace: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'ESN Test',
        role: 'owner',
        memberCount: 2,
        communityDataSharing: false,
      },
      members: [
        { userId: 'me', email: 'moi@esn.fr', fullName: 'Moi', role: 'owner', joinedAt: null },
        {
          userId: '22222222-2222-4222-8222-222222222222',
          email: 'partant@esn.fr',
          fullName: 'Camille Partant',
          role: 'sales',
          joinedAt: null,
        },
      ],
      invitations: [],
      seats: { used: 2, total: 5 },
    }) as unknown as WorkspaceTeam

  it('un clic sur la corbeille n’appelle AUCUN retrait', async () => {
    renderTeam(teamWithTwo())

    await userEvent.click(screen.getByRole('button', { name: /Retirer partant@esn.fr/ }))

    expect(removeMemberMutate).not.toHaveBeenCalled()
  })

  it('… il ouvre la prévisualisation du départ', async () => {
    renderTeam(teamWithTwo())

    await userEvent.click(screen.getByRole('button', { name: /Retirer partant@esn.fr/ }))

    expect(screen.getByRole('dialog', { name: /Le départ de Camille Partant/ })).toBeInTheDocument()
    // …et le portefeuille du membre est bien DEMANDÉ, pour ce membre-là.
    expect(memberPortfolioMock).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', true)
  })
})

describe('#3387.10 — « renfort transversal » sur la ligne du membre', () => {
  const MARIE = { userId: 'marie', email: 'marie@esn.fr', fullName: 'Marie', role: 'sales', joinedAt: null }

  function withMarie(crossTeamSupport: boolean) {
    const base = team()
    return { ...base, members: [...base.members, { ...MARIE, crossTeamSupport }] } as WorkspaceTeam
  }

  it('le geste désigne le membre — et appelle la mutation avec la valeur inverse', async () => {
    renderTeam(withMarie(false))
    // Théo D team-admin — le geste vit dans la fenêtre « Rôle » de la ligne.
    await userEvent.click(screen.getByRole('button', { name: 'Rôle de Marie' }))
    await userEvent.click(screen.getByRole('button', { name: /Désigner Marie en renfort transversal/ }))
    expect(crossTeamSupportMutate).toHaveBeenCalledWith({ userId: 'marie', enabled: true })
  })

  it('un membre déjà désigné le DIT sur sa ligne, et le même geste le retire', async () => {
    renderTeam(withMarie(true))
    expect(screen.getByText('Renfort transversal')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rôle de Marie' }))
    await userEvent.click(screen.getByRole('button', { name: /Retirer Marie du renfort transversal/ }))
    expect(crossTeamSupportMutate).toHaveBeenCalledWith({ userId: 'marie', enabled: false })
  })

  it('le propriétaire pilote : aucun geste de renfort sur sa propre ligne', () => {
    renderTeam(team())
    expect(screen.queryByRole('button', { name: /renfort transversal/ })).toBeNull()
  })
})

describe('#3386 — le rôle et la taille de l’ESN ne se règlent pas ici, et l’écran le dit', () => {
  it('renvoie vers Profil › Identité, où le rôle se règle (un réglage, un endroit — GA-26)', () => {
    renderTeam(team())
    const link = screen.getByRole('link', { name: /profil/i })
    expect(link).toHaveAttribute('href', '/settings/profile')
  })
})

describe('#4158.1 / #4158.2 — droits d’admin et renvoi d’invitation', () => {
  const withRole = (role: string, invitations: unknown[] = [], members: unknown[] = []) =>
    ({
      ...team({ role }),
      members: [{ userId: 'me', email: 'moi@esn.fr', fullName: 'Moi', role, joinedAt: null }, ...members],
      invitations,
    }) as unknown as WorkspaceTeam
  const invitation = (id: string, email: string, role: string) => ({
    id,
    email,
    role,
    status: 'pending',
    expiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: '2029-01-01T00:00:00.000Z',
  })
  const adminMember = { userId: 'adm', email: 'adm@esn.fr', fullName: 'Adèle Admin', role: 'admin', joinedAt: null }

  it('sales_ops : « Admin » n’est pas proposé à l’invitation', async () => {
    renderTeam(withRole('sales_ops'))
    await userEvent.click(screen.getByRole('button', { name: 'Inviter un membre' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('combobox'))
    expect(screen.queryByRole('option', { name: /^Admin/ })).toBeNull()
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('owner : « Admin » est proposé', async () => {
    renderTeam(withRole('owner'))
    await userEvent.click(screen.getByRole('button', { name: 'Inviter un membre' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('combobox'))
    expect(screen.getByRole('option', { name: /^Admin/ })).toBeInTheDocument()
  })

  it('sales_ops : aucune corbeille ni sélecteur de rôle sur la ligne d’un admin', () => {
    renderTeam(withRole('sales_ops', [], [adminMember]))
    expect(screen.queryByRole('button', { name: /Retirer adm@esn.fr/ })).toBeNull()
  })

  it('témoin : le propriétaire, lui, a la corbeille sur la ligne d’un admin', () => {
    renderTeam(withRole('owner', [], [adminMember]))
    expect(screen.getByRole('button', { name: /Retirer adm@esn.fr/ })).toBeInTheDocument()
  })

  it('« Renvoyer » appelle le renvoi de CETTE invitation', async () => {
    renderTeam(withRole('sales_ops', [invitation('inv-1', 'colle@esn.fr', 'sales')]))
    await userEvent.click(screen.getByRole('button', { name: /Renvoyer l'invitation à colle@esn.fr/ }))
    expect(resendMutate).toHaveBeenCalledWith('inv-1')
  })

  it('sales_ops : pas de « Renvoyer » sur une invitation admin ; owner si', () => {
    renderTeam(withRole('sales_ops', [invitation('inv-2', 'adm2@esn.fr', 'admin')]))
    expect(screen.queryByRole('button', { name: /Renvoyer l'invitation à adm2@esn.fr/ })).toBeNull()
  })

  it('l’issue du dernier renvoi est dite : parti / non parti', () => {
    resendData = {
      invitation: invitation('inv-1', 'colle@esn.fr', 'sales'),
      emailSent: false,
      emailError: 'smtp',
    }
    renderTeam(withRole('owner', [invitation('inv-1', 'colle@esn.fr', 'sales')]))
    expect(screen.getByRole('status')).toHaveTextContent(/E-mail non parti/)
  })

  it('refonte Théo — le bloc Membres porte les places et « Inviter » ; l’invitation s’ouvre en modale', async () => {
    renderTeam(withRole('owner'))
    const block = screen.getByRole('region', { name: 'Les personnes de l’espace' })
    expect(within(block).getByRole('heading', { level: 2 })).toHaveTextContent(/personnes/)
    expect(within(block).getByText(/places dans ton offre/)).toBeInTheDocument()
    // Les places vivent dans le bloc, plus dans l'en-tête (une donnée, un endroit).
    expect(screen.getAllByText(/places dans ton offre/)).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(within(block).getByRole('button', { name: 'Inviter un membre' }))
    const dialog = screen.getByRole('dialog', { name: 'Inviter un collaborateur' })
    expect(within(dialog).getByRole('textbox', { name: 'collaborateur@ton-esn.fr' })).toBeInTheDocument()
  })
})

describe('Théo D team-admin — la structure de la maquette', () => {
  it('« Les personnes de l’espace » porte l’invitation dans son en-tête, puis « Invitations en attente » et son état vide nommé', () => {
    renderTeam(team())
    const people = screen.getByRole('region', { name: 'Les personnes de l’espace' })
    expect(within(people).getByRole('button', { name: 'Inviter un membre' })).toBeInTheDocument()
    expect(within(people).getByText('Accès actif')).toBeInTheDocument()
    const pending = screen.getByRole('region', { name: 'Invitations en attente' })
    expect(within(pending).getByText('Personne n’attend d’invitation.')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings.indexOf('Les personnes de l’espace')).toBeLessThan(headings.indexOf('Invitations en attente'))
  })

  it('le titre est celui de la maquette, à point d’accent', () => {
    renderTeam(team())
    expect(screen.getByRole('heading', { level: 1, name: /^Un espace bien administré/ })).toBeInTheDocument()
  })

  it('« Règles d’équipe » renvoie au moteur d’action unique (les automatisations)', async () => {
    renderTeam(team())
    await userEvent.click(screen.getByRole('button', { name: 'Règles d’équipe' }))
    expect(screen.getByRole('link', { name: 'Voir les automatisations' })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
  })
})

// #4669.1 — jumeau de /billing : jamais « 2 / 1 sièges », l'écart se nomme.
describe('le badge des sièges', () => {
  it('le rapport tombe juste : « 1 / 5 sièges »', () => {
    renderTeam(team())
    expect(screen.getByText('1 / 5 sièges')).toBeInTheDocument()
  })

  it('NON : plus d’occupés que de payés — « 1 siège de plus que l’abonnement », aucune fraction impossible', () => {
    renderTeam({ ...team(), seats: { used: 2, total: 1 } } as WorkspaceTeam)
    expect(screen.getByText('1 siège de plus que l’abonnement')).toBeInTheDocument()
    expect(screen.queryByText(/2 \/ 1/)).toBeNull()
  })
})
