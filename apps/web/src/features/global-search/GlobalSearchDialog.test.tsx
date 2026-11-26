import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import fr from '@/i18n/locales/fr/globalSearch.json'
import { GlobalSearchDialog } from './GlobalSearchDialog'
import { useGlobalSearchStore } from './globalSearchStore'

const EMPTY_PAGE = { data: [], pagination: { currentPage: 1, size: 5, hasNext: false, total: 0 } }

const listAccounts = vi.fn()
const listContacts = vi.fn()
const listNeeds = vi.fn()

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return { ...actual, accountsApi: { ...actual.accountsApi, list: (...args: unknown[]) => listAccounts(...args) } }
})

vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/contacts/api')>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, listPage: (...args: unknown[]) => listContacts(...args) },
  }
})

vi.mock('@/features/projects/open-needs/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/projects/open-needs/api')>(
    '@/features/projects/open-needs/api',
  )
  return { ...actual, openNeedsApi: { ...actual.openNeedsApi, list: (...args: unknown[]) => listNeeds(...args) } }
})

const searchConsultants = vi.fn()
const EMPTY_TALENT_PAGE = { items: [], total: 0, page: 1, limit: 5 }

vi.mock('@/features/consultants/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/consultants/api')>('@/features/consultants/api')
  return {
    ...actual,
    consultantsApi: { ...actual.consultantsApi, search: (...args: unknown[]) => searchConsultants(...args) },
  }
})

const listMissions = vi.fn()
const EMPTY_MISSION_PAGE = { missions: [], canReadFinance: false }

vi.mock('@/features/missions/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/missions/api')>('@/features/missions/api')
  return { ...actual, missionsApi: { ...actual.missionsApi, list: (...args: unknown[]) => listMissions(...args) } }
})

const mineActions = vi.fn()

vi.mock('@/features/actions/planItems.api', async () => {
  const actual = await vi.importActual<typeof import('@/features/actions/planItems.api')>(
    '@/features/actions/planItems.api',
  )
  return { ...actual, planItemsApi: { ...actual.planItemsApi, mine: (...args: unknown[]) => mineActions(...args) } }
})

/**
 * #3015 — `renderWithRouter` monte une session SANS utilisateur : `useTeam`
 * (`enabled: !!user`) n'y résout JAMAIS de rôle réel, donc aucun test de ce
 * fichier n'avait jamais exercé le chemin où `team.workspace.role` porte une
 * VRAIE valeur venue du serveur — exactement le chemin qui plantait en
 * recette (`hasPermission` sur un rôle que ce build ne connaît plus). Mocké
 * ici plutôt que de changer `renderWithRouter` (partagé par d'autres suites,
 * dont la garde « pas de rôle → pas de page réservée » juste en dessous
 * dépend du repli `member`).
 */
const useTeamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeamMock() }))

afterEach(() => {
  // `useTeamMock` en PREMIER : `close()` et `resetTestQueryClient()` juste en
  // dessous programment un ré-rendu React ASYNCHRONE (le composant reste
  // monté entre deux tests). Réinitialiser le mock à SA valeur vide avant ce
  // ré-rendu ferait planter la modale entre deux tests — le repli
  // `mockReturnValue` du prochain `beforeEach` suffit, un `mockReset()` ici
  // n'ajoute rien qu'un risque de course.
  listAccounts.mockReset()
  listContacts.mockReset()
  listNeeds.mockReset()
  searchConsultants.mockReset()
  listMissions.mockReset()
  mineActions.mockReset()
  useGlobalSearchStore.getState().close()
  resetTestQueryClient()
})

beforeEach(() => {
  // Non mockés explicitement, les groupes restent VIDES par défaut : un test
  // qui n'exerce qu'une seule entité n'a pas à mocker les six autres.
  listAccounts.mockResolvedValue(EMPTY_PAGE)
  listContacts.mockResolvedValue(EMPTY_PAGE)
  listNeeds.mockResolvedValue(EMPTY_PAGE)
  searchConsultants.mockResolvedValue(EMPTY_TALENT_PAGE)
  listMissions.mockResolvedValue(EMPTY_MISSION_PAGE)
  mineActions.mockResolvedValue([])
  // Le repli par défaut : aucune équipe résolue, comme `renderWithRouter`
  // (session sans utilisateur) le produisait déjà avant ce mock.
  useTeamMock.mockReturnValue({ team: undefined, isLoading: false, isError: false })
})

describe('#2207.67 — GlobalSearchDialog, le mécanisme', () => {
  it('ne rend rien tant que le store est fermé', () => {
    renderWithRouter(<GlobalSearchDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("s'ouvre quand le store passe à `isOpen: true`, et porte le champ de recherche", async () => {
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: fr.inputLabel })).toBeTruthy()
  })

  it('met le focus dans le champ à l’ouverture', async () => {
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('oublie la saisie à la fermeture — rouvrir ne retrouve pas l’ancienne requête', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Renault')
    expect(input).toHaveValue('Renault')

    act(() => useGlobalSearchStore.getState().close())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    act(() => useGlobalSearchStore.getState().open())
    const reopened = await screen.findByRole('textbox', { name: fr.inputLabel })
    expect(reopened).toHaveValue('')
  })

  it("n'affirme aucune absence — aucun texte « 0 résultat » n'est écrit dans le composant", () => {
    // Doctrine : « on n'affiche pas ce qu'on n'a pas ». Tant qu'aucun groupe ne
    // trouve rien, la seule aide visible est l'indice statique, qui ne varie
    // pas avec la présence ou l'absence de résultats.
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    expect(screen.queryByText(/0 résultat|aucun résultat/i)).toBeNull()
  })
})

describe('#2207.68 — recherche : compte', () => {
  it('ne lance aucune requête sous deux caractères', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'R')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(listAccounts).not.toHaveBeenCalled()
  })

  it('affiche le groupe « Comptes » avec les résultats de `accountsApi.list({ q })`', async () => {
    listAccounts.mockResolvedValue({
      data: [{ id: 'acc-1', company_name: 'Groupe TF1' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'TF1')

    expect(await screen.findByRole('option', { name: /Groupe TF1/ })).toBeTruthy()
    expect(screen.getByText(fr.groups.accounts)).toBeTruthy()
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ q: 'TF1' }))
  })

  it('ne rend aucun groupe « Comptes » quand la recherche ne trouve rien', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(listAccounts).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.accounts)).toBeNull()
  })

  // #4621.2 — la liste /accounts écarte archivés et coquilles d'échec ; la recherche globale héritait de ce
  // silence (« 5 contacts Engie, aucun compte »). Même lecture que l'écran des comptes : `limit: 1`, `archived`
  // puis `error|canceled`, seulement quand AUCUN compte actif ne correspond.
  it('#4621.2 — aucun compte actif mais des archivés : la recherche le DIT, avec le geste', async () => {
    listAccounts.mockImplementation(async (params: { status?: unknown }) =>
      params.status === 'archived'
        ? { data: [], pagination: { currentPage: 1, size: 1, hasNext: false, totalItems: 2 } }
        : EMPTY_PAGE,
    )
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await user.type(await screen.findByRole('textbox', { name: fr.inputLabel }), 'ENGIE')

    expect(await screen.findByRole('option', { name: /2 comptes archivés/ })).toBeTruthy()
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ q: 'ENGIE', status: 'archived', limit: 1 }))
  })

  it('#4621.2 — sinon des échecs : la recherche dit que l’analyse a échoué', async () => {
    listAccounts.mockImplementation(async (params: { status?: unknown }) =>
      Array.isArray(params.status)
        ? { data: [], pagination: { currentPage: 1, size: 1, hasNext: false, totalItems: 1 } }
        : EMPTY_PAGE,
    )
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await user.type(await screen.findByRole('textbox', { name: fr.inputLabel }), 'ENGIE')

    expect(await screen.findByRole('option', { name: /analyse a échoué/ })).toBeTruthy()
    expect(listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'ENGIE', status: ['error', 'canceled'], limit: 1 }),
    )
  })

  it('#4621.2 — un compte actif trouvé : aucune lecture des archivés, aucune ligne en plus', async () => {
    listAccounts.mockResolvedValue({
      data: [{ id: 'acc-1', company_name: 'Groupe TF1' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await user.type(await screen.findByRole('textbox', { name: fr.inputLabel }), 'TF1')

    await screen.findByRole('option', { name: /Groupe TF1/ })
    expect(listAccounts).not.toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
    expect(screen.queryByRole('option', { name: /archivé|échoué/ })).toBeNull()
  })

  it('sélectionner un compte ferme la modale', async () => {
    listAccounts.mockResolvedValue({
      data: [{ id: 'acc-1', company_name: 'Groupe TF1' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'TF1')
    const row = await screen.findByRole('option', { name: /Groupe TF1/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.69 — recherche : contact', () => {
  it('affiche le groupe « Contacts » avec les résultats de `contactsApi.listPage({ q })`, entreprise en sous-titre', async () => {
    listContacts.mockResolvedValue({
      data: [{ id: 'c1', full_name: 'Jean Dupont', entity: 'Groupe TF1' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Dupont')

    expect(await screen.findByRole('option', { name: /Jean Dupont/ })).toBeTruthy()
    expect(screen.getByText(fr.groups.contacts)).toBeTruthy()
    expect(screen.getByText('Groupe TF1')).toBeTruthy()
    expect(listContacts).toHaveBeenCalledWith(expect.objectContaining({ q: 'Dupont' }))
  })

  it('ne rend aucun groupe « Contacts » quand la recherche ne trouve rien', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(listContacts).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.contacts)).toBeNull()
  })

  it('sélectionner un contact ferme la modale', async () => {
    listContacts.mockResolvedValue({
      data: [{ id: 'c1', full_name: 'Jean Dupont', entity: null }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Dupont')
    const row = await screen.findByRole('option', { name: /Jean Dupont/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.70 — recherche : besoin', () => {
  it('affiche le groupe « Besoins » avec les résultats de `openNeedsApi.list`, compte en sous-titre', async () => {
    listNeeds.mockResolvedValue({
      data: [{ id: 'n1', title: 'Devops confirmé', account_name: 'Groupe TF1' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
      counters: {},
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Devops')

    expect(await screen.findByRole('option', { name: /Devops confirmé/ })).toBeTruthy()
    expect(screen.getByText(fr.groups.needs)).toBeTruthy()
    expect(listNeeds).toHaveBeenCalledWith(expect.objectContaining({ q: 'Devops' }))
  })

  it('ne rend aucun groupe « Besoins » quand la recherche ne trouve rien', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(listNeeds).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.needs)).toBeNull()
  })

  it('sélectionner un besoin ferme la modale', async () => {
    listNeeds.mockResolvedValue({
      data: [{ id: 'n1', title: 'Devops confirmé', account_name: null }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
      counters: {},
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Devops')
    const row = await screen.findByRole('option', { name: /Devops confirmé/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.71 — recherche : consultant', () => {
  it('affiche le groupe « Consultants » avec les résultats de `consultantsApi.search({ q })`, la mission en sous-titre', async () => {
    searchConsultants.mockResolvedValue({
      items: [{ id: 't1', fullName: 'Yanis Berthier', title: 'Lead Data' }],
      total: 1,
      page: 1,
      limit: 5,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Yanis')

    expect(await screen.findByRole('option', { name: /Yanis Berthier/ })).toBeTruthy()
    expect(screen.getByText(fr.groups.consultants)).toBeTruthy()
    expect(searchConsultants).toHaveBeenCalledWith(expect.objectContaining({ q: 'Yanis' }))
  })

  it("dit « Nom non renseigné » plutôt que le nom d'un fichier déposé", async () => {
    // D366 — une fiche née d'un CV sans identité relue ne montre jamais son
    // nom de fichier comme si c'était un nom de personne.
    searchConsultants.mockResolvedValue({
      items: [{ id: 't1', fullName: 'cv_anonyme_louis_ai-engineer-node_gw', title: null }],
      total: 1,
      page: 1,
      limit: 5,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'gw')

    expect(await screen.findByRole('option', { name: /Nom non renseigné/ })).toBeTruthy()
  })

  it('ne rend aucun groupe « Consultants » quand la recherche ne trouve rien', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(searchConsultants).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.consultants)).toBeNull()
  })

  it('sélectionner un consultant ferme la modale', async () => {
    searchConsultants.mockResolvedValue({
      items: [{ id: 't1', fullName: 'Yanis Berthier', title: null }],
      total: 1,
      page: 1,
      limit: 5,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Yanis')
    const row = await screen.findByRole('option', { name: /Yanis Berthier/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.72 — recherche : mission', () => {
  it('affiche le groupe « Missions », filtré CÔTÉ CLIENT sur le libellé ou le compte', async () => {
    listMissions.mockResolvedValue({
      missions: [
        { id: 'm1', label: 'Mission Renault Devops', accountName: 'Renault' },
        { id: 'm2', label: 'Mission SNCF Data', accountName: 'SNCF' },
      ],
      canReadFinance: false,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Renault')

    expect(await screen.findByRole('option', { name: /Mission Renault Devops/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Mission SNCF Data/ })).toBeNull()
    expect(screen.getByText(fr.groups.missions)).toBeTruthy()
  })

  it('ne rend aucun groupe « Missions » quand rien ne correspond', async () => {
    listMissions.mockResolvedValue({
      missions: [{ id: 'm1', label: 'Mission Renault Devops', accountName: 'Renault' }],
      canReadFinance: false,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(listMissions).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.missions)).toBeNull()
  })

  it('sélectionner une mission ferme la modale', async () => {
    listMissions.mockResolvedValue({
      missions: [{ id: 'm1', label: 'Mission Renault Devops', accountName: 'Renault' }],
      canReadFinance: false,
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Renault')
    const row = await screen.findByRole('option', { name: /Mission Renault Devops/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.73 — recherche : action', () => {
  it('affiche le groupe « Actions », filtré CÔTÉ CLIENT sur le libellé ou le compte', async () => {
    mineActions.mockResolvedValue([
      { id: 'a1', label: 'Relancer le DSI', company_name: 'Renault', account_id: 'acc-renault' },
      { id: 'a2', label: 'Préparer la soutenance', company_name: 'SNCF', account_id: 'acc-sncf' },
    ])
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'DSI')

    expect(await screen.findByRole('option', { name: /Relancer le DSI/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Préparer la soutenance/ })).toBeNull()
    expect(screen.getByText(fr.groups.actions)).toBeTruthy()
  })

  it('ne rend aucun groupe « Actions » quand rien ne correspond', async () => {
    mineActions.mockResolvedValue([
      { id: 'a1', label: 'Relancer le DSI', company_name: 'Renault', account_id: 'acc-1' },
    ])
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await waitFor(() => expect(mineActions).toHaveBeenCalled())
    expect(screen.queryByText(fr.groups.actions)).toBeNull()
  })

  it("sélectionner une action ferme la modale et ouvre le COMPTE qu'elle fait avancer — une action n'a pas de fiche à elle", async () => {
    mineActions.mockResolvedValue([
      { id: 'a1', label: 'Relancer le DSI', company_name: 'Renault', account_id: 'acc-renault' },
    ])
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'DSI')
    const row = await screen.findByRole('option', { name: /Relancer le DSI/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#2207.74 — recherche : paramètre', () => {
  it('affiche le groupe « Paramètres » — aucun appel réseau, filtré sur le libellé TRADUIT de SETTINGS_SECTIONS', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Notif')

    expect(await screen.findByRole('option', { name: /Notifications/ })).toBeTruthy()
    expect(screen.getByText(fr.groups.settings)).toBeTruthy()
  })

  it("ne montre PAS une page réservée aux gestionnaires à un membre — « on n'affiche pas ce qu'on n'a pas »", async () => {
    // `renderWithRouter` monte une session SANS utilisateur : `useTeam` ne
    // résout aucun rôle, et le repli `'member'` n'a pas `team:manage`.
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Journal')

    await new Promise(resolve => setTimeout(resolve, 300))
    expect(screen.queryByRole('option', { name: /Journal d'activité/ })).toBeNull()
  })

  it('ne rend aucun groupe « Paramètres » quand rien ne correspond', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Zzz')

    await new Promise(resolve => setTimeout(resolve, 300))
    expect(screen.queryByText(fr.groups.settings)).toBeNull()
  })

  it('sélectionner un paramètre ferme la modale', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Notif')
    const row = await screen.findByRole('option', { name: /Notifications/ })
    await user.click(row)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('#3015 — navigation clavier : ↑/↓ traverse les groupes, Entrée navigue', () => {
  /**
   * Le clic marchait déjà ; ↑/↓ ne déplaçait AUCUN surlignage et Entrée ne
   * naviguait nulle part — aucun état ni aucune ligne d'aide clavier
   * n'existait. Deux GROUPES DIFFÉRENTS (comptes, contacts) prouvent que la
   * flèche traverse la frontière entre deux groupes plutôt que de rester
   * coincée dans le premier — c'était la moitié manquante d'une navigation
   * qui raisonnerait groupe par groupe au lieu de la liste entière.
   */
  it('↑/↓ avance/recule dans la liste APLATIE des groupes, Entrée navigue vers la ligne active', async () => {
    listAccounts.mockResolvedValue({
      data: [
        { id: 'acc-1', company_name: 'Groupe TF1' },
        { id: 'acc-2', company_name: 'Renault' },
      ],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 2 },
    })
    listContacts.mockResolvedValue({
      data: [{ id: 'c1', full_name: 'Jean Dupont', entity: 'Autre Entreprise' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Groupe')

    const tf1 = await screen.findByRole('option', { name: 'Groupe TF1' })
    const renault = await screen.findByRole('option', { name: /Renault/ })
    const dupont = await screen.findByRole('option', { name: /Jean Dupont/ })

    // Ordre stable sous le pointeur : « Analyser » et « Demander à Laura » (affichées dès la frappe) restent EN HAUT,
    // les entités arrivées ensuite s'insèrent dessous. Le premier de la liste aplatie est actif par défaut.
    const analyze = screen.getByRole('option', { name: /Analyser « Groupe »/ })
    const laura = screen.getByRole('option', { name: /Demander à Laura/ })
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', analyze.id))
    expect(analyze).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', laura.id)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', tf1.id)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', renault.id)
    expect(renault).toHaveAttribute('aria-selected', 'true')
    expect(tf1).toHaveAttribute('aria-selected', 'false')

    // La flèche TRAVERSE la frontière entre « Comptes » et « Contacts » — une seule liste, puis s'arrête au bout.
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', dupont.id)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', dupont.id)

    await user.keyboard('{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', renault.id)

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('MAQ-SHELL-E8 — « Analyser » et « Demander à Laura » ne paraissent qu’à partir de deux caractères', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'T')
    expect(screen.queryByRole('option', { name: /Analyser/ })).toBeNull()
    await user.type(input, 'ha')
    expect(await screen.findByRole('option', { name: 'Analyser « Tha » — choisir l’entreprise exacte' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Demander à Laura : « Que sais-tu de Tha ? »' })).toBeTruthy()
    expect(screen.getByRole('group', { name: fr.analyze.group })).toBeTruthy()
  })

  it('MAQ-SHELL-E8 — choisir « Analyser » ferme la recherche (vers l’écran d’analyse)', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    const input = await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.type(input, 'Thales')
    await user.click(await screen.findByRole('option', { name: /Analyser « Thales »/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Entrée sur une liste vide ne fait rien — aucune ligne active à atteindre', async () => {
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await screen.findByRole('textbox', { name: fr.inputLabel })
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('#3015 — recette du 25/09/2026 : premier ⌘⇧K après chargement', () => {
  /**
   * Cause racine reproduite ici : `GlobalSearchDialog` calcule
   * `canManageWorkspace` avec `hasPermission(team?.workspace.role ??
   * 'member', 'team:manage')` sur le rôle RENVOYÉ PAR LE SERVEUR — jamais
   * garanti connu de `ROLE_PERMISSIONS` à l'exécution (cache
   * `PersistQueryClientProvider` persisté depuis avant un renommage de rôle,
   * skew web/API). `hasPermission` levait alors sur un rôle inconnu — et
   * plantait TOUT l'écran, pas seulement la modale, puisque
   * `ShortcutsProvider`/`GlobalSearchDialog` vivent au même niveau que le
   * contenu de la route (`__root.tsx`, sibling de `<Outlet/>`). Corrigé à la
   * source (`hasPermission`, `packages/contracts`) ; ce test garde l'appelant
   * qui l'a révélé — aucun autre test de ce fichier ne résolvait jamais
   * `useTeam` avec un rôle réel (`renderWithRouter` monte une session sans
   * utilisateur).
   */
  it("un rôle que ce build ne reconnaît plus n'empêche pas la modale de s'ouvrir", async () => {
    useTeamMock.mockReturnValue({
      team: { workspace: { role: 'legacy_role_removed_since', memberCount: 1 }, members: [], invitations: [] },
      isLoading: false,
      isError: false,
    })

    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('palette globale — ordre stable sous le pointeur', () => {
  const options = () => screen.getAllByRole('option').map(option => option.textContent ?? '')

  it('un groupe arrivé EN RETARD s’insère SOUS les lignes déjà affichées', async () => {
    let resolveAccounts: (page: unknown) => void = () => undefined
    listAccounts.mockReturnValue(new Promise(resolve => (resolveAccounts = resolve)))
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await user.type(await screen.findByRole('textbox', { name: fr.inputLabel }), 'Zorbix')

    // Temps 1 : seules « Analyser » et « Demander à » sont là.
    expect(await screen.findByRole('option', { name: /Analyser/ })).toBeTruthy()
    const before = options()
    expect(before).toHaveLength(2)

    // Temps 2 : « Comptes » arrive — SOUS les deux lignes, qui ne bougent pas.
    await act(async () => {
      resolveAccounts({
        data: [{ id: 'acc-9', company_name: 'Zorbix Group' }],
        pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
      })
    })
    const account = await screen.findByRole('option', { name: /Zorbix Group/ })
    const all = screen.getAllByRole('option')
    expect(all.slice(0, 2).map(o => o.textContent)).toEqual(before)
    expect(all.indexOf(account)).toBe(2)
  })

  it('recette prod 03/11 : un groupe de DONNÉES arrivé après un autre s’insère sous lui, jamais au-dessus', async () => {
    let resolveAccounts: (page: unknown) => void = () => undefined
    let resolveContacts: (page: unknown) => void = () => undefined
    listAccounts.mockReturnValue(new Promise(resolve => (resolveAccounts = resolve)))
    listContacts.mockReturnValue(new Promise(resolve => (resolveContacts = resolve)))
    listNeeds.mockResolvedValue({
      data: [{ id: 'n1', title: 'Socle data Zorbix', account_name: 'Zorbix Group' }],
      pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
    })
    const user = userEvent.setup()
    renderWithRouter(<GlobalSearchDialog />)
    act(() => useGlobalSearchStore.getState().open())
    await user.type(await screen.findByRole('textbox', { name: fr.inputLabel }), 'Zorbix')

    // Temps 1 : « Besoins » arrive en premier.
    await screen.findByRole('option', { name: /Socle data Zorbix/ })
    const t1 = options()

    // Temps 2 : « Contacts » arrive — SOUS ce qui est déjà affiché.
    await act(async () => {
      resolveContacts({
        data: [{ id: 'c9', full_name: 'Jean Zorbix', entity: null }],
        pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
      })
    })
    await screen.findByRole('option', { name: /Jean Zorbix/ })
    const t2 = options()
    expect(t2.slice(0, t1.length)).toEqual(t1)

    // Temps 3 : « Comptes » arrive en dernier — toujours SOUS, alors que son rang canonique est le premier.
    await act(async () => {
      resolveAccounts({
        data: [{ id: 'acc-9', company_name: 'Zorbix Group SA' }],
        pagination: { currentPage: 1, size: 5, hasNext: false, total: 1 },
      })
    })
    await screen.findByRole('option', { name: /Zorbix Group SA/ })
    const t3 = options()
    expect(t3.slice(0, t2.length)).toEqual(t2)
  })
})
