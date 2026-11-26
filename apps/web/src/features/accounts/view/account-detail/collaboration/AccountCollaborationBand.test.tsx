import type { Account } from '@bellum/contracts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { timeline, bridge, members, assignMutate, requestValidationMutate, team, permissions, buList, buAssign } =
  vi.hoisted(() => ({
    permissions: vi.fn(),
    buList: vi.fn(),
    buAssign: vi.fn(),
    timeline: vi.fn(),
    bridge: vi.fn(),
    members: vi.fn(),
    assignMutate: vi.fn(),
    requestValidationMutate: vi.fn(),
    team: vi.fn(),
  }))

vi.mock('@/features/activities/hooks/useTimeline', () => ({ useTimeline: () => timeline() }))
vi.mock('@/features/memoire-collective/hooks/useMemoryBridge', () => ({ useMemoryBridge: () => bridge() }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => members() }))
vi.mock('@/features/manager/hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useRequestManagerValidation', () => ({
  useRequestManagerValidation: () => ({ mutate: requestValidationMutate, isPending: false }),
}))
vi.mock('@/features/team-guardrails/hooks', () => ({ useAccountTeam: () => team() }))
vi.mock('@/lib/permissions', () => ({ useUserPermissions: () => permissions() }))
vi.mock('@/features/business-units/api', () => ({ businessUnitsApi: { list: () => buList() } }))
vi.mock('@/features/accounts/hooks/useAssignAccountBusinessUnit', () => ({
  useAssignAccountBusinessUnit: () => ({ mutate: buAssign, isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))

const { AccountCollaborationAlerts, AccountCollaborationMenuItems, AccountTeamFacts } =
  await import('./AccountCollaborationBand')
const { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } = await import('@bellum/ui')

// Les menus Radix ont besoin de ces API de pointeur, que jsdom n'implémente pas.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function compte(over: Partial<Account> = {}): Account {
  return { id: ACCOUNT_ID, company_name: 'THALES', status: 'completed', ...over } as Account
}

function trace(over: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'email',
    source: 'manual',
    direction: 'outbound',
    subject: null,
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    durationSeconds: null,
    accountId: ACCOUNT_ID,
    contactId: null,
    projectId: null,
    linkReason: null,
    userId: 'u-sarah',
    authorName: 'Sarah Martin',
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: new Date().toISOString(),
    ...over,
  }
}

function collision() {
  return {
    kind: 'prospectionCollision',
    circle: 'c1',
    subject: { kind: 'account', id: ACCOUNT_ID, label: 'THALES' },
    colleague: { kind: 'member', userId: 'u-sarah', displayName: 'Sarah Martin', role: 'sales' },
    action: 'coordinateOrArbitrate',
    observedAt: '2026-09-12T08:00:00.000Z',
    expiresAt: null,
    provenance: 'accountActivity',
    detail: { kind: 'prospectionCollision', lastTouchOn: '2026-09-12', withinDays: 7 },
  }
}

beforeEach(() => {
  permissions.mockReturnValue({ status: 'known', permissions: [] })
  timeline.mockReset().mockReturnValue({ data: { items: [] } })
  bridge.mockReset().mockReturnValue({ bridge: { data: undefined } })
  members.mockReset().mockReturnValue({ data: [] })
  assignMutate.mockReset()
  requestValidationMutate.mockReset()
  team.mockReset().mockReturnValue({ data: { responsible: null, members: [], can_edit: true } })
})
afterEach(cleanup)

/**
 * #2128 → #4507 (refonte V22, décision Louis 24/10/2026) — la collaboration n'est plus un BANDEAU sous
 * l'identité : chaque morceau a changé d'endroit, aucun n'est perdu. Cette suite garde, dans l'ordre :
 *  1. les COLLISIONS se montrent sous l'identité, seulement quand il y en a, et nomment leur raison ;
 *  2. les FAITS d'équipe (BU, dernière activité, contributeurs) ne comptent personne et omettent l'absence ;
 *  3. les GESTES du menu « … » demandent au serveur, avec les mêmes portes qu'avant.
 */
describe('AccountCollaborationAlerts — les collisions, sous l’identité', () => {
  it('NOMME la raison de la collision et propose une action — jamais un blocage muet', () => {
    bridge.mockReturnValue({ bridge: { data: { crossings: [collision()] } } })
    render(<AccountCollaborationAlerts account={compte()} onOpenHistory={() => {}} />)
    expect(screen.getByText('Collision de prospection')).toBeTruthy()
    expect(screen.getByText(/Se coordonner, ou demander un arbitrage/)).toBeTruthy()
  })

  it('ouvre l’activité du collègue NOMMÉ, sur ce dossier', () => {
    bridge.mockReturnValue({ bridge: { data: { crossings: [collision()] } } })
    const onOpenHistory = vi.fn()
    render(<AccountCollaborationAlerts account={compte()} onOpenHistory={onOpenHistory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voir l’activité de Sarah Martin' }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('« Continuer malgré tout » replie l’annonce et ne bloque rien', () => {
    bridge.mockReturnValue({ bridge: { data: { crossings: [collision()] } } })
    render(<AccountCollaborationAlerts account={compte()} onOpenHistory={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuer malgré tout' }))
    expect(screen.queryByText('Collision de prospection')).toBeNull()
  })

  it('nomme le collègue dont l’analyse tourne déjà sur ce compte (#2128.19)', () => {
    render(
      <AccountCollaborationAlerts
        account={compte({
          active_analysis_by_colleague: {
            colleague: { user_id: 'u-sarah', name: 'Sarah Martin' },
            started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          },
        })}
        onOpenHistory={() => {}}
      />,
    )
    expect(screen.getByText(/Sarah Martin a lancé une analyse/)).toBeTruthy()
  })

  it('NON : sans collision ni analyse concurrente, rien du tout (ni région, ni « propriétaire »)', () => {
    const { container } = render(
      <AccountCollaborationAlerts
        account={compte({ owner: null, active_analysis_by_colleague: null })}
        onOpenHistory={() => {}}
      />,
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('AccountTeamFacts — ce que l’équipe a fait du compte (Périmètre & données)', () => {
  it('nomme la BU du compte et la dernière activité d’un collègue, avec sa date', () => {
    timeline.mockReturnValue({ data: { items: [trace()] } })
    render(
      <AccountTeamFacts
        account={compte({ business_unit: { id: 'bu-1', name: 'Banque & assurance' } } as Partial<Account>)}
      />,
    )
    expect(screen.getByText(/Banque & assurance/)).toBeTruthy()
    expect(screen.getByText(/Dernière activité de l’équipe : Sarah Martin/)).toBeTruthy()
  })

  it('n’affiche AUCUN compteur par personne', () => {
    timeline.mockReturnValue({
      data: {
        items: [
          trace({ occurredAt: '2026-09-10T08:00:00.000Z' }),
          trace({ occurredAt: '2026-09-11T08:00:00.000Z' }),
          trace({ occurredAt: '2026-09-12T08:00:00.000Z' }),
          trace({ userId: 'u-marc', authorName: 'Marc Dupont', occurredAt: '2026-09-13T08:00:00.000Z' }),
        ],
      },
    })
    const { container } = render(<AccountTeamFacts account={compte()} />)
    expect(container.textContent).toContain('Marc Dupont')
    expect(container.textContent).toContain('Sarah Martin')
    expect(container.textContent).not.toMatch(/Sarah Martin\s*\(?\s*3/)
    expect(container.textContent).not.toMatch(/3 (touches|activités)/)
  })

  // #2128 — le sélecteur de BU : même droit que l'API (`records:write`).
  describe('sélecteur de BU (#2128)', () => {
    const withClient = (node: React.ReactNode) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {node}
      </QueryClientProvider>
    )
    beforeEach(() => {
      buList.mockResolvedValue({
        businessUnits: [
          { id: 'bu-1', name: 'Banque & assurance' },
          { id: 'bu-2', name: 'Industrie' },
        ],
        viewerAccess: 'workspace',
      })
      buAssign.mockReset()
      buList.mockClear()
    })

    it('qui peut modifier le compte choisit la BU — même sans BU posée', async () => {
      permissions.mockReturnValue({ status: 'known', permissions: ['records:write'] })
      render(withClient(<AccountTeamFacts account={compte()} />))
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(await screen.findByRole('combobox'))
      await user.click(await screen.findByRole('option', { name: 'Industrie' }))
      expect(buAssign).toHaveBeenCalledWith('bu-2')
    })

    it('« Aucune BU » détache le compte', async () => {
      permissions.mockReturnValue({ status: 'known', permissions: ['records:write'] })
      render(
        withClient(
          <AccountTeamFacts
            account={compte({ business_unit: { id: 'bu-1', name: 'Banque & assurance' } } as Partial<Account>)}
          />,
        ),
      )
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      await user.click(await screen.findByRole('combobox'))
      await user.click(await screen.findByRole('option', { name: 'Aucune BU' }))
      expect(buAssign).toHaveBeenCalledWith(null)
    })

    it('NON : qui ne peut que lire ne voit AUCUN sélecteur (la BU posée se lit seulement)', async () => {
      permissions.mockReturnValue({ status: 'known', permissions: ['accounts:read'] })
      render(
        withClient(
          <AccountTeamFacts
            account={compte({ business_unit: { id: 'bu-1', name: 'Banque & assurance' } } as Partial<Account>)}
          />,
        ),
      )
      expect(screen.getByText(/Banque & assurance/)).toBeTruthy()
      expect(screen.queryByRole('combobox')).toBeNull()
      expect(buList).not.toHaveBeenCalled()
    })

    it('NON : droit inconnu → fail-closed, aucun sélecteur', () => {
      permissions.mockReturnValue({ status: 'unknown' })
      const { container } = render(withClient(<AccountTeamFacts account={compte()} />))
      expect(container.querySelector('[data-testid="account-business-unit-picker"]')).toBeNull()
    })
  })

  it('NON : ni BU ni activité d’un collègue → aucun élément (jamais « BU : » orphelin)', () => {
    const { container } = render(<AccountTeamFacts account={compte({ business_unit: null } as Partial<Account>)} />)
    expect(container.innerHTML).toBe('')
  })
})

function MenuHarness({ onOpenTeam = () => {} }: { onOpenTeam?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>…</DropdownMenuTrigger>
      <DropdownMenuContent>
        <AccountCollaborationMenuItems account={compte({ owner: null })} onOpenTeam={onOpenTeam} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function openHarness(onOpenTeam?: () => void) {
  const u = userEvent.setup({ pointerEventsCheck: 0 })
  render(<MenuHarness onOpenTeam={onOpenTeam} />)
  await u.click(screen.getByRole('button', { name: '…' }))
  await screen.findByRole('menu')
  return u
}

describe('AccountCollaborationMenuItems — les gestes d’équipe, dans « … »', () => {
  it('« Attribuer » demande l’attribution au SERVEUR, qui tient les droits', async () => {
    members.mockReturnValue({
      data: [{ userId: 'u-marc', email: 'marc@esn.fr', fullName: 'Marc Dupont', role: 'sales', isSelf: false }],
    })
    const u = await openHarness()
    screen.getByRole('menuitem', { name: 'Attribuer ce compte à un membre de l’équipe' }).focus()
    await u.keyboard('{ArrowRight}')
    fireEvent.click(await screen.findByRole('menuitem', { name: /Marc Dupont/ }))
    expect(assignMutate).toHaveBeenCalledWith({ accountId: ACCOUNT_ID, assignedTo: 'u-marc' })
  })

  it('propose de LIBÉRER le compte — un geste distinct, refusé par le serveur s’il le faut', async () => {
    const u = await openHarness()
    screen.getByRole('menuitem', { name: 'Attribuer ce compte à un membre de l’équipe' }).focus()
    await u.keyboard('{ArrowRight}')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Libérer le compte' }))
    expect(assignMutate).toHaveBeenCalledWith({ accountId: ACCOUNT_ID, assignedTo: null })
  })

  it('« Demander une validation » : le serveur pose la tâche sur les membres habilités', async () => {
    await openHarness()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Demander une validation' }))
    expect(requestValidationMutate).toHaveBeenCalledWith(undefined)
  })

  it('« Ajouter un co-équipier » ouvre la carte d’équipe quand l’API dit `can_edit`', async () => {
    const onOpenTeam = vi.fn()
    await openHarness(onOpenTeam)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajouter un co-équipier' }))
    expect(onOpenTeam).toHaveBeenCalledTimes(1)
  })

  // #4507 (régression corrigée) — la LISTE des co-équipiers se lit par tout membre ; seuls l'ajout et le
  // retrait restent réservés à `can_edit`.
  it('DROITS — sans `can_edit`, « Ajouter » n’existe pas mais « Voir l’équipe du compte » ouvre la même fenêtre', async () => {
    team.mockReturnValue({ data: { responsible: null, members: [], can_edit: false } })
    const onOpenTeam = vi.fn()
    await openHarness(onOpenTeam)
    expect(screen.queryByRole('menuitem', { name: 'Ajouter un co-équipier' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Attribuer ce compte à un membre de l’équipe' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Demander une validation' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Voir l’équipe du compte' }))
    expect(onOpenTeam).toHaveBeenCalledTimes(1)
  })

  it('avec `can_edit`, l’entrée garde son nom d’action (« Ajouter ») et « Voir » n’est pas doublée', async () => {
    await openHarness()
    expect(screen.getByRole('menuitem', { name: 'Ajouter un co-équipier' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Voir l’équipe du compte' })).toBeNull()
  })

  it('l’équipe se lit aussi pendant le chargement des droits : l’entrée « Voir » est offerte, jamais retirée', async () => {
    team.mockReturnValue({ data: undefined })
    await openHarness()
    expect(screen.getByRole('menuitem', { name: 'Voir l’équipe du compte' })).toBeTruthy()
  })
})
