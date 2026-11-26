import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactGuardrail } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useAccountEntities } from '@/features/adv/api'
import { ApiError } from '@/lib/api-error'
import { teamGuardrailsApi } from '../api'
import * as hooks from '../hooks'
import { AccountTeamCard } from './AccountTeamCard'
import { AssigneePicker } from './AssigneePicker'
import { AlreadyProposedNote } from './AlreadyProposedNote'
import { ColleagueActivityBanner } from './ColleagueActivityBanner'
import { useColleagueContactGuard } from './ColleagueContactDialog'
import { DoNotContactBadge } from './DoNotContactBadge'
import { ContactScopeNote } from './ContactScopeNote'
import { EntityCoverage } from './EntityCoverage'
import { DuplicateCandidatesCard } from './DuplicateCandidatesCard'

vi.mock('../api', () => ({ teamGuardrailsApi: { checkContacts: vi.fn() } }))
vi.mock('../hooks', () => ({
  useContactColleagueActivity: vi.fn(),
  useContactGuardrails: vi.fn(),
  useDoNotContactList: vi.fn(),
  useAlreadyProposed: vi.fn(),
  useDuplicateCandidates: vi.fn(),
  useProposeMerge: vi.fn(),
  useAccountTeam: vi.fn(),
  useAccountTeamMutations: vi.fn(),
  useAccountTeamScopeMutations: vi.fn(),
  useDistributePreview: vi.fn(),
  useDistributeApply: vi.fn(),
  useAssigneeCandidates: vi.fn(),
  useGroupEntityFiches: vi.fn(),
  useWorkspaceBusinessUnits: vi.fn(),
  useCreateBusinessUnit: vi.fn(),
}))
vi.mock('@/features/adv/api', () => ({ useAccountEntities: vi.fn() }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'u-bob', fullName: 'Bob Durand', email: 'bob@esn.fr', role: 'sales', isSelf: true },
      { userId: 'u-eve', fullName: 'Eve Martin', email: 'eve@esn.fr', role: 'sales', isSelf: false },
    ],
  }),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

/** Un résultat de requête réduit à `data` — typé par le hook que le test remplace. */
const q = <R,>(data: unknown): R => ({ data }) as unknown as R

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.clearAllMocks()
  // Par défaut : aucune zone, aucune fiche suivie, aucune entité (les carte d'avant #4996 n'en savent rien).
  vi.mocked(hooks.useGroupEntityFiches).mockReturnValue(q([]))
  vi.mocked(useAccountEntities).mockReturnValue(q({ items: [] }))
  // #4996.4 — par défaut, l'espace n'a aucune BU : la section s'affiche, vide, avec son geste « Ajouter la BU ».
  vi.mocked(hooks.useWorkspaceBusinessUnits).mockReturnValue([])
  vi.mocked(hooks.useCreateBusinessUnit).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useCreateBusinessUnit>)
  vi.mocked(hooks.useAccountTeamScopeMutations).mockReturnValue({
    add: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  } as unknown as ReturnType<typeof hooks.useAccountTeamScopeMutations>)
  vi.mocked(hooks.useDistributePreview).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useDistributePreview>)
  vi.mocked(hooks.useDistributeApply).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useDistributeApply>)
})

describe('#4158.20 — ColleagueActivityBanner', () => {
  it('ne rend RIEN quand personne n’a travaillé la fiche', () => {
    vi.mocked(hooks.useContactColleagueActivity).mockReturnValue(q({ items: [] }))
    const { container } = render(<ColleagueActivityBanner contactId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme en clair qui, quoi et quand — en lecture seule', () => {
    vi.mocked(hooks.useContactColleagueActivity).mockReturnValue(
      q({
        items: [
          {
            user_id: 'u-bob',
            name: 'Bob Durand',
            is_responsible: false,
            last_action: 'message_sent',
            last_action_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          },
        ],
      }),
    )
    render(<ColleagueActivityBanner contactId="c1" />)
    expect(screen.getByText(/Bob Durand a travaillé cette fiche : message envoyé/)).toBeInTheDocument()
    expect(screen.getByText(/rien n’est bloqué/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('un responsable sans activité datée ne reçoit ni action ni date inventées', () => {
    vi.mocked(hooks.useContactColleagueActivity).mockReturnValue(
      q({
        items: [
          { user_id: 'u-bob', name: 'Bob Durand', is_responsible: true, last_action: null, last_action_at: null },
        ],
      }),
    )
    render(<ColleagueActivityBanner contactId="c1" />)
    expect(screen.getByText('Bob Durand est responsable de cette fiche.')).toBeInTheDocument()
  })
})

describe('#4158.22 — DoNotContactBadge', () => {
  it('affiche le badge avec le motif pour un contact listé, rien sinon', () => {
    vi.mocked(hooks.useContactGuardrails).mockReturnValue(
      q({ items: [{ contact_id: 'c1', contacted: null, do_not_contact: { reason: 'Litige', kind: 'contact' } }] }),
    )
    const { rerender } = render(<DoNotContactBadge contactId="c1" />)
    expect(screen.getByText('Ne pas contacter')).toHaveAttribute('title', expect.stringContaining('Litige'))
    vi.mocked(hooks.useContactGuardrails).mockReturnValue(q({ items: [] }))
    rerender(<DoNotContactBadge contactId="c1" />)
    expect(screen.queryByText('Ne pas contacter')).toBeNull()
  })
})

describe('#4158.21/.22 — useColleagueContactGuard', () => {
  const finding = (over: Partial<ContactGuardrail> = {}): ContactGuardrail => ({
    contact_id: 'c1',
    do_not_contact: null,
    contacted: { contact_id: 'c1', by_user_id: 'u-bob', by_name: 'Bob Durand', at: '', days_ago: 4, proof: 'verified' },
    ...over,
  })

  it('exécute DIRECTEMENT quand l’espace ne sait rien (aucune boîte de dialogue)', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({ items: [] })
    const { result } = renderHook(() => useColleagueContactGuard('c1'))
    const action = vi.fn()
    act(() => result.current.run(action))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(result.current.dialog).toBeNull()
  })

  it('sans contact visé : exécute sans rien lire', () => {
    const { result } = renderHook(() => useColleagueContactGuard(null))
    const action = vi.fn()
    act(() => result.current.run(action))
    expect(action).toHaveBeenCalledTimes(1)
    expect(teamGuardrailsApi.checkContacts).not.toHaveBeenCalled()
  })

  it('si la lecture ÉCHOUE, le travail n’est pas bloqué', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockRejectedValue(new Error('réseau'))
    const { result } = renderHook(() => useColleagueContactGuard('c1'))
    const action = vi.fn()
    act(() => result.current.run(action))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })

  it('avertit « contacté par Bob il y a 4 jours » et n’exécute QU’APRÈS confirmation', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({ items: [finding()] })
    const action = vi.fn()
    function Harness() {
      const guard = useColleagueContactGuard('c1')
      return (
        <>
          <button onClick={() => guard.run(action)}>go</button>
          {guard.dialog}
        </>
      )
    }
    render(<Harness />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByText('go'))
    expect(
      await screen.findByText(/Bob Durand a contacté ce contact il y a 4 jours \(envoi vérifié\)/),
    ).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Continuer quand même' }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('Annuler n’exécute rien ; un envoi DÉCLARÉ se nomme déclaré ; la liste d’exclusion passe en premier', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({
      items: [
        finding({
          contacted: {
            contact_id: 'c1',
            by_user_id: 'u-bob',
            by_name: 'Bob Durand',
            at: '',
            days_ago: 1,
            proof: 'declared',
          },
          do_not_contact: {
            id: 'd1',
            kind: 'contact',
            contact_id: 'c1',
            contact_name: 'Jean',
            domain: null,
            reason: 'Client en litige',
            added_by: 'u-eve',
            added_by_name: 'Eve Martin',
            created_at: '',
          },
        }),
      ],
    })
    const action = vi.fn()
    function Harness() {
      const guard = useColleagueContactGuard('c1')
      return (
        <>
          <button onClick={() => guard.run(action)}>go</button>
          {guard.dialog}
        </>
      )
    }
    render(<Harness />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByText('go'))
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent(
      'liste « ne pas contacter » de l’espace : Client en litige (ajouté par Eve Martin)',
    )
    expect(items[1]).toHaveTextContent('dit avoir contacté ce contact il y a 1 jour (déclaré, non vérifié)')
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Annuler' }))
    expect(action).not.toHaveBeenCalled()
  })
})

describe('#4158.23 — AlreadyProposedNote', () => {
  it('rien quand personne ne l’a proposé', () => {
    vi.mocked(hooks.useAlreadyProposed).mockReturnValue(q({ items: [] }))
    const { container } = render(<AlreadyProposedNote projectId="p1" consultantIds={['k1']} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit qui, quel client, quelle date — et que c’est une information', () => {
    vi.mocked(hooks.useAlreadyProposed).mockReturnValue(
      q({
        items: [
          {
            consultant_id: 'k1',
            by_user_id: 'u-bob',
            by_name: 'Bob Durand',
            account_name: 'THALES',
            need_role: 'Architecte',
            at: '2026-10-01T10:00:00.000Z',
            relation: 'client',
          },
        ],
      }),
    )
    render(<AlreadyProposedNote projectId="p1" consultantIds={['k1']} />)
    expect(screen.getByText(/Déjà proposé par Bob Durand chez THALES le/)).toBeInTheDocument()
    expect(screen.getByText(/Information seulement/)).toBeInTheDocument()
  })
})

describe('#4158.24 — DuplicateCandidatesCard', () => {
  it('propose la fusion, ne fusionne pas ; rien sans candidat', async () => {
    const mutate = vi.fn()
    vi.mocked(hooks.useProposeMerge).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
      typeof hooks.useProposeMerge
    >)
    vi.mocked(hooks.useDuplicateCandidates).mockReturnValue(q({ items: [] }))
    const { container, rerender } = render(<DuplicateCandidatesCard kind="contact" id="c1" />)
    expect(container).toBeEmptyDOMElement()
    vi.mocked(hooks.useDuplicateCandidates).mockReturnValue(
      q({ items: [{ kind: 'contact', id: 'c2', label: 'Jean Martin', reason: 'email', owner_name: 'Bob Durand' }] }),
    )
    rerender(<DuplicateCandidatesCard kind="contact" id="c1" />)
    expect(screen.getByText('même adresse e-mail · Responsable : Bob Durand')).toBeInTheDocument()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Proposer la fusion' }))
    expect(mutate).toHaveBeenCalledWith('c2')
    expect(screen.getByText(/Rien n’est fusionné seul/)).toBeInTheDocument()
  })
})

describe('#4158.25 — AccountTeamCard', () => {
  const mutations = { add: { mutate: vi.fn(), isPending: false }, remove: { mutate: vi.fn(), isPending: false } }
  const team = (canEdit: boolean) =>
    q<ReturnType<typeof hooks.useAccountTeam>>({
      responsible: { user_id: 'u-bob', name: 'Bob Durand' },
      members: [{ user_id: 'u-eve', name: 'Eve Martin', added_by_name: 'Bob Durand', created_at: '' }],
      can_edit: canEdit,
    })

  it('lecture seule : nomme le responsable et les co-équipiers, aucun contrôle d’édition', () => {
    vi.mocked(hooks.useAccountTeam).mockReturnValue(team(false))
    vi.mocked(hooks.useAccountTeamMutations).mockReturnValue(
      mutations as unknown as ReturnType<typeof hooks.useAccountTeamMutations>,
    )
    render(<AccountTeamCard accountId="a1" />)
    expect(screen.getByText('Responsable : Bob Durand')).toBeInTheDocument()
    expect(screen.getByText('Eve Martin')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('éditable : retire un co-équipier, n’offre que les membres pas déjà dans l’équipe', async () => {
    vi.mocked(hooks.useAccountTeam).mockReturnValue(team(true))
    vi.mocked(hooks.useAccountTeamMutations).mockReturnValue(
      mutations as unknown as ReturnType<typeof hooks.useAccountTeamMutations>,
    )
    render(<AccountTeamCard accountId="a1" />)
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByRole('button', { name: 'Retirer Eve Martin de l’équipe du compte' }))
    expect(mutations.remove.mutate).toHaveBeenCalledWith('u-eve')
    // Bob (responsable) et Eve (déjà co-équipière) ne sont plus proposés : plus rien à ajouter.
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('#4158.52 — badge « Ne pas contacter » dans les listes', () => {
  const entry = (over: Record<string, unknown>) => ({
    id: 'e1',
    kind: 'contact' as const,
    contact_id: null,
    contact_name: null,
    domain: null,
    reason: 'Litige',
    added_by: 'u-bob',
    added_by_name: 'Bob Durand',
    created_at: '',
    ...over,
  })

  it('reconnaît le contact lui-même, puis le domaine de son adresse, sinon rien', async () => {
    const { listedDoNotContact } = await vi.importActual<typeof import('./DoNotContactBadge')>('./DoNotContactBadge')
    const entries = [entry({ contact_id: 'c1' }), entry({ id: 'e2', kind: 'domain', domain: 'acme.fr' })]
    expect(listedDoNotContact(entries, 'c1', null)?.id).toBe('e1')
    expect(listedDoNotContact(entries, 'c2', 'Jean@ACME.fr')?.id).toBe('e2')
    expect(listedDoNotContact(entries, 'c2', 'jean@autre.fr')).toBeNull()
    expect(listedDoNotContact(entries, 'c2', null)).toBeNull()
    expect(listedDoNotContact(undefined, 'c1', null)).toBeNull()
  })

  it('affiche le MÊME badge que la fiche pour un contact listé, rien sinon', async () => {
    const { DoNotContactListBadge } = await vi.importActual<typeof import('./DoNotContactBadge')>('./DoNotContactBadge')
    vi.mocked(hooks.useDoNotContactList).mockReturnValue(q({ items: [entry({ contact_id: 'c1' })] }))
    const { rerender } = render(<DoNotContactListBadge contactId="c1" />)
    expect(screen.getByText('Ne pas contacter')).toHaveAttribute('title', expect.stringContaining('Litige'))
    rerender(<DoNotContactListBadge contactId="c9" />)
    expect(screen.queryByText('Ne pas contacter')).toBeNull()
  })
})

/* ------------------- #4996 L6 — équipe de compte groupe : zones, répartition ------------------- */

describe('#4996 L6 — AccountTeamCard : le périmètre de chacun', () => {
  const addScope = { mutateAsync: vi.fn(), isPending: false }
  const removeScope = { mutate: vi.fn(), isPending: false }
  const scopeMutations = { add: addScope, remove: removeScope }
  const entities = [
    { id: 'en-cib', name: 'BNP Paribas CIB', kind: 'subsidiary', is_default: false },
    { id: 'en-def', name: 'Périmètre non déterminé', kind: 'division', is_default: true },
  ]
  const team = (over: Record<string, unknown> = {}) =>
    q<ReturnType<typeof hooks.useAccountTeam>>({
      responsible: { user_id: 'u-bob', name: 'Bob Durand', scopes: [] },
      members: [
        {
          user_id: 'u-eve',
          name: 'Eve Martin',
          added_by_name: null,
          created_at: '',
          scopes: [
            { id: 's1', entity_id: 'en-cib', label: 'BNP Paribas CIB' },
            { id: 's2', entity_id: null, label: 'IT Groupe' },
          ],
        },
      ],
      can_edit: true,
      can_edit_own_scope: true,
      ...over,
    })
  const arrange = (teamResult = team()) => {
    vi.mocked(hooks.useAccountTeam).mockReturnValue(teamResult)
    vi.mocked(hooks.useAccountTeamMutations).mockReturnValue(
      mutations as unknown as ReturnType<typeof hooks.useAccountTeamMutations>,
    )
    vi.mocked(hooks.useAccountTeamScopeMutations).mockReturnValue(
      scopeMutations as unknown as ReturnType<typeof hooks.useAccountTeamScopeMutations>,
    )
    vi.mocked(hooks.useGroupEntityFiches).mockReturnValue(q([]))
    vi.mocked(useAccountEntities).mockReturnValue(q({ items: entities }))
  }
  const mutations = { add: { mutate: vi.fn(), isPending: false }, remove: { mutate: vi.fn(), isPending: false } }
  const user = () => userEvent.setup({ pointerEventsCheck: 0 })

  it('un membre sans zone n’a AUCUNE ligne « Périmètre » ; un membre à zones les nomme', () => {
    arrange()
    render(<AccountTeamCard accountId="a1" />)
    // Eve a deux zones : une ligne. Bob (responsable) n’en a aucune : pas de « Périmètre » pour lui.
    expect(screen.getAllByText(/Périmètre :/)).toHaveLength(1)
    expect(screen.getByText(/Périmètre : BNP Paribas CIB · IT Groupe/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun périmètre/)).toBeNull()
  })

  it('sans droit lu du contrat : pas de bouton « modifier » (rien n’est recalculé côté web)', () => {
    arrange(team({ can_edit: false, can_edit_own_scope: false }))
    render(<AccountTeamCard accountId="a1" />)
    expect(screen.queryByRole('button', { name: /Modifier le périmètre/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Répartir selon les périmètres/ })).toBeNull()
  })

  it('droit sur SOI seulement : « modifier » n’est offert que sur sa propre ligne', () => {
    arrange(
      team({
        can_edit: false,
        responsible: { user_id: 'u-eve', name: 'Eve Martin', scopes: [] },
        members: [{ user_id: 'u-bob', name: 'Bob Durand', added_by_name: null, created_at: '', scopes: [] }],
      }),
    )
    render(<AccountTeamCard accountId="a1" />)
    expect(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier le périmètre de Eve Martin' })).toBeNull()
  })

  it('pose une zone d’entité : seul `entity_id` part, le libellé est recopié par le serveur', async () => {
    arrange()
    addScope.mutateAsync.mockResolvedValue({})
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' }))
    expect(screen.getByText('Filiale')).toBeInTheDocument()
    await u.click(screen.getByRole('checkbox', { name: /BNP Paribas CIB/ }))
    expect(addScope.mutateAsync).toHaveBeenCalledWith({ user_id: 'u-bob', entity_id: 'en-cib' })
  })

  it('retire une zone posée', async () => {
    arrange()
    render(<AccountTeamCard accountId="a1" />)
    await user().click(screen.getByRole('button', { name: 'Modifier le périmètre de Eve Martin' }))
    await user().click(screen.getByRole('checkbox', { name: /BNP Paribas CIB/ }))
    expect(removeScope.mutate).toHaveBeenCalledWith({ userId: 'u-eve', scopeId: 's1' })
  })

  it('l’erreur de l’API s’affiche SOUS le champ du libellé libre', async () => {
    arrange()
    addScope.mutateAsync.mockRejectedValue(new ApiError('Le libellé est trop court.', 400))
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' }))
    await u.type(screen.getByLabelText('Libellé libre'), 'IT')
    await u.click(screen.getByRole('button', { name: 'Ajouter le libellé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le libellé est trop court.')
  })

  it('#4996.4 — aucune BU dans l’espace : la section reste là, dit « Aucune BU », et « Ajouter la BU » crée par nom', async () => {
    arrange()
    const create = vi.fn().mockResolvedValue({ id: 'bu-new', name: 'Agence Nantes' })
    vi.mocked(hooks.useCreateBusinessUnit).mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useCreateBusinessUnit>)
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' }))
    expect(screen.getByText('Entités du compte')).toBeInTheDocument()
    expect(screen.getByText('Business units')).toBeInTheDocument()
    expect(screen.getByText('Aucune BU dans l’espace.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ajouter la BU' }))
    await u.type(screen.getByLabelText('Nom de la BU'), 'Agence Nantes')
    await u.click(screen.getByRole('button', { name: 'Valider' }))
    expect(create).toHaveBeenCalledWith({ name: 'Agence Nantes', kind: 'business_unit', specialties: [] })
  })

  it('#4996.4 — « Ajouter la BU » : l’erreur de l’API se lit, rien n’est inventé', async () => {
    arrange()
    const create = vi.fn().mockRejectedValue(new Error('Droit insuffisant.'))
    vi.mocked(hooks.useCreateBusinessUnit).mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useCreateBusinessUnit>)
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' }))
    await u.click(screen.getByRole('button', { name: 'Ajouter la BU' }))
    await u.type(screen.getByLabelText('Nom de la BU'), 'Agence Nantes')
    await u.click(screen.getByRole('button', { name: 'Valider' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Droit insuffisant.')
  })

  it('#4996.4 — pose une zone de BU : seul `business_unit_id` part ; une BU posée se décoche', async () => {
    arrange(
      team({
        members: [
          {
            user_id: 'u-eve',
            name: 'Eve Martin',
            added_by_name: null,
            created_at: '',
            scopes: [{ id: 's9', entity_id: null, business_unit_id: 'bu-lyon', label: 'Agence Lyon' }],
          },
        ],
      }),
    )
    vi.mocked(hooks.useWorkspaceBusinessUnits).mockReturnValue([
      { id: 'bu-lyon', name: 'Agence Lyon' },
      { id: 'bu-paris', name: 'Agence Paris' },
    ])
    addScope.mutateAsync.mockResolvedValue({})
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Bob Durand' }))
    expect(screen.getByText('Business units')).toBeInTheDocument()
    await u.click(screen.getByRole('checkbox', { name: 'Agence Paris' }))
    expect(addScope.mutateAsync).toHaveBeenCalledWith({ user_id: 'u-bob', business_unit_id: 'bu-paris' })
    await u.click(screen.getByRole('button', { name: 'Terminé' }))
    await u.click(screen.getByRole('button', { name: 'Modifier le périmètre de Eve Martin' }))
    expect(screen.getByRole('checkbox', { name: 'Agence Lyon' })).toBeChecked()
    // Une zone de BU n'est pas un libellé libre : elle ne s'affiche pas deux fois.
    expect(screen.getAllByText('Agence Lyon')).toHaveLength(1)
    await u.click(screen.getByRole('checkbox', { name: 'Agence Lyon' }))
    expect(removeScope.mutate).toHaveBeenCalledWith({ userId: 'u-eve', scopeId: 's9' })
  })

  it('« Fiches d’entité déjà suivies » : une ligne par fiche portée, aucune sinon', () => {
    arrange()
    vi.mocked(hooks.useGroupEntityFiches).mockReturnValue(
      q([
        { id: 'g1', companyName: 'Arval', ownerUserId: 'u-eve' },
        { id: 'g2', companyName: 'Libre', ownerUserId: null },
      ]),
    )
    const { unmount } = render(<AccountTeamCard accountId="a1" />)
    expect(screen.getByText('Arval — porté par Eve Martin')).toBeInTheDocument()
    expect(screen.queryByText(/Libre —/)).toBeNull()
    unmount()
    vi.mocked(hooks.useGroupEntityFiches).mockReturnValue(q([]))
    render(<AccountTeamCard accountId="a1" />)
    expect(screen.queryByText(/Fiches d’entité déjà suivies/)).toBeNull()
  })
})

describe('#4996 L6 — « Répartir selon les périmètres » : aperçu figé puis application', () => {
  const preview = { mutateAsync: vi.fn(), isPending: false }
  const apply = { mutateAsync: vi.fn(), isPending: false }
  const arrange = () => {
    vi.mocked(hooks.useAccountTeam).mockReturnValue(
      q({ responsible: { user_id: 'u-bob', name: 'Bob Durand' }, members: [], can_edit: true }),
    )
    vi.mocked(hooks.useAccountTeamMutations).mockReturnValue({
      add: { mutate: vi.fn(), isPending: false },
      remove: { mutate: vi.fn(), isPending: false },
    } as unknown as ReturnType<typeof hooks.useAccountTeamMutations>)
    vi.mocked(hooks.useAccountTeamScopeMutations).mockReturnValue({
      add: { mutateAsync: vi.fn(), isPending: false },
      remove: { mutate: vi.fn(), isPending: false },
    } as unknown as ReturnType<typeof hooks.useAccountTeamScopeMutations>)
    vi.mocked(hooks.useGroupEntityFiches).mockReturnValue(q([]))
    vi.mocked(useAccountEntities).mockReturnValue(q({ items: [] }))
    vi.mocked(hooks.useDistributePreview).mockReturnValue(
      preview as unknown as ReturnType<typeof hooks.useDistributePreview>,
    )
    vi.mocked(hooks.useDistributeApply).mockReturnValue(apply as unknown as ReturnType<typeof hooks.useDistributeApply>)
    preview.mutateAsync.mockResolvedValue({
      fingerprint: 'abcdef123456',
      groups: [{ user_id: 'u-eve', name: 'Eve Martin', labels: ['Personal Finance'], count: 23 }],
      unchanged_count: 9,
    })
  }
  const user = () => userEvent.setup({ pointerEventsCheck: 0 })

  it('l’aperçu nomme chaque groupe et ce qui reste inchangé ; il n’écrit rien', async () => {
    arrange()
    render(<AccountTeamCard accountId="a1" />)
    await user().click(screen.getByRole('button', { name: 'Répartir selon les périmètres' }))
    expect(await screen.findByText(/23 contacts → Eve Martin \(Personal Finance\)/)).toBeInTheDocument()
    expect(screen.getByText(/9 sans zone ou avec deux candidats, inchangés/)).toBeInTheDocument()
    expect(apply.mutateAsync).not.toHaveBeenCalled()
  })

  it('« Appliquer » renvoie l’empreinte de l’aperçu', async () => {
    arrange()
    apply.mutateAsync.mockResolvedValue({ applied: 23 })
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Répartir selon les périmètres' }))
    await u.click(await screen.findByRole('button', { name: 'Appliquer la répartition' }))
    expect(apply.mutateAsync).toHaveBeenCalledWith('abcdef123456')
    expect(await screen.findByText('23 contacts répartis.')).toBeInTheDocument()
  })

  it('409 = aperçu périmé : on le dit et on redemande l’aperçu, sans rien appliquer de plus', async () => {
    arrange()
    apply.mutateAsync.mockRejectedValue(new ApiError('périmé', 409))
    render(<AccountTeamCard accountId="a1" />)
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Répartir selon les périmètres' }))
    await u.click(await screen.findByRole('button', { name: 'Appliquer la répartition' }))
    expect(await screen.findByText(/L’aperçu n’est plus à jour/)).toBeInTheDocument()
    await waitFor(() => expect(preview.mutateAsync).toHaveBeenCalledTimes(2))
  })
})

describe('#4996 L6 — sélecteur de porteur ordonné', () => {
  it('liste ceux qui couvrent l’entité d’abord, avec « couvre … », sans rien présélectionner', async () => {
    vi.mocked(hooks.useAssigneeCandidates).mockReturnValue(
      q({
        items: [
          { user_id: 'u-eve', name: 'Eve Martin', covers: ['BNP Paribas CIB'] },
          { user_id: 'u-bob', name: 'Bob Durand', covers: [] },
        ],
      }),
    )
    const onPick = vi.fn()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>ouvrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <AssigneePicker contactId="c1" currentOwnerId={null} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('Eve Martin')
    expect(items[0]).toHaveTextContent('couvre BNP Paribas CIB')
    expect(items[1]).not.toHaveTextContent('couvre')
    expect(onPick).not.toHaveBeenCalled()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(items[0])
    expect(onPick).toHaveBeenCalledWith('u-eve')
  })
})

describe('#4996 L6 — « dans la zone de X » sur un contact', () => {
  const arrange = (scopes: { id: string; entity_id: string | null; label: string }[]) =>
    vi.mocked(hooks.useAccountTeam).mockReturnValue(
      q({
        responsible: { user_id: 'u-bob', name: 'Bob Durand', scopes: [] },
        members: [{ user_id: 'u-eve', name: 'Eve Martin', added_by_name: null, created_at: '', scopes }],
        can_edit: false,
      }),
    )

  it('nomme le collègue dont la zone couvre l’entité du contact — information, jamais un refus', () => {
    arrange([{ id: 's1', entity_id: 'en-cib', label: 'BNP Paribas CIB' }])
    render(<ContactScopeNote accountId="a1" entityId="en-cib" />)
    expect(screen.getByText('Dans la zone de Eve Martin.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ne dit rien de soi-même, d’un contact sans entité ni d’une zone en texte libre', () => {
    arrange([{ id: 's2', entity_id: null, label: 'IT Groupe' }])
    const { container, rerender } = render(<ContactScopeNote accountId="a1" entityId="en-cib" />)
    expect(container).toBeEmptyDOMElement()
    arrange([{ id: 's1', entity_id: 'en-cib', label: 'X' }])
    rerender(<ContactScopeNote accountId="a1" entityId={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#4996 L6 — « couvert par X » sur les entités du compte', () => {
  const arrange = (scopes: { id: string; entity_id: string | null; label: string }[]) => {
    vi.mocked(hooks.useAccountTeam).mockReturnValue(
      q({
        responsible: { user_id: 'u-bob', name: 'Bob Durand', scopes: [] },
        members: [{ user_id: 'u-eve', name: 'Eve Martin', added_by_name: null, created_at: '', scopes }],
        can_edit: false,
      }),
    )
    vi.mocked(useAccountEntities).mockReturnValue(
      q({
        items: [
          { id: 'en-cib', name: 'BNP Paribas CIB', kind: 'subsidiary', is_default: false },
          { id: 'en-pf', name: 'BNP Paribas Personal Finance', kind: 'subsidiary', is_default: false },
        ],
      }),
    )
  }

  it('nomme qui couvre une entité ; une entité que personne ne couvre n’a ni pastille ni « non couverte »', () => {
    arrange([{ id: 's1', entity_id: 'en-cib', label: 'BNP Paribas CIB' }])
    render(<EntityCoverage accountId="a1" />)
    expect(screen.getByText('BNP Paribas CIB')).toBeInTheDocument()
    expect(screen.getByText('couvert par Eve Martin')).toBeInTheDocument()
    expect(screen.queryByText('BNP Paribas Personal Finance')).toBeNull()
    expect(screen.queryByText(/non couvert|%/)).toBeNull()
  })

  it('aucune zone d’entité (texte libre seulement) : rien du tout', () => {
    arrange([{ id: 's2', entity_id: null, label: 'IT Groupe' }])
    const { container } = render(<EntityCoverage accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
