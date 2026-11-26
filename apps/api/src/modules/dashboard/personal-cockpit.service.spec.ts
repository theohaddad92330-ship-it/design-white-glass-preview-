import type { CockpitPerspective, DashboardAccountInsight, PersonalRelance } from '@bellum/contracts'
import { PersonalCockpitService } from './personal-cockpit.service'
import type { AccountsService } from '../accounts/accounts.service'
import type { ActionsService } from '../actions/actions.service'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CockpitPerspectiveService } from './cockpit-perspective.service'

/** Build a valid `DashboardAccountInsight` (mirrors the accounts service mapper). */
function account(id: string, over: Partial<DashboardAccountInsight> = {}): DashboardAccountInsight {
  return {
    id,
    company_name: over.company_name ?? `Company ${id}`,
    sector: null,
    employees: null,
    priority_score: over.priority_score ?? null,
    priority_justification: over.priority_justification ?? null,
    status: over.status ?? 'completed',
    created_at: over.created_at ?? '2026-07-01T00:00:00.000Z',
    recent_signals_count: over.recent_signals_count ?? 0,
    primary_signal: over.primary_signal ?? null,
  }
}

function relance(over: Partial<PersonalRelance> & { id: string; account_id: string }): PersonalRelance {
  return {
    id: over.id,
    account_id: over.account_id,
    company_name: over.company_name ?? 'Company',
    label: over.label ?? 'Relance',
    due_date: over.due_date ?? '2026-07-10',
    overdue: over.overdue ?? false,
    cadence_step: over.cadence_step ?? null,
    contact_id: over.contact_id ?? null,
    assigned_to_me: over.assigned_to_me ?? true,
  }
}

/** Un recul minimal et VALIDE — les blocs ont chacun leur provenance. */
const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 30,
  population: 0,
  computed_at: '2026-09-04T09:00:00.000Z',
}
const PERSPECTIVE: CockpitPerspective = {
  trajectory: {
    pipeline: { amount_euros: null, open_count: 0, valued_count: 0 },
    missions_active: 0,
    invoiced_euros: null,
    collected_euros: null,
    finance_readable: false,
    provenance: PROVENANCE,
  },
  coverage: {
    followed: 3,
    without_next_action: 1,
    no_interaction_30d: 7,
    new_signals_7d: 0,
    never_worked: 0,
    anomalies: [],
    provenance: PROVENANCE,
  },
  relationship: {
    active_threads: 2,
    awaiting_reply: 1,
    replies_received: 0,
    accounts_without_interaction: 7,
    provenance: PROVENANCE,
  },
  dormant: [],
  series: { coverage: null, outreach: null, provenance: PROVENANCE },
}

describe('PersonalCockpitService', () => {
  function build() {
    const accountsService = {
      listPersonalAccounts: jest.fn().mockResolvedValue([]),
      countPersonalAccounts: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Pick<AccountsService, 'listPersonalAccounts' | 'countPersonalAccounts'>>
    const actionsService = {
      listPersonalMessages: jest.fn().mockResolvedValue([]),
      countMessagesSince: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Pick<ActionsService, 'listPersonalMessages' | 'countMessagesSince'>>
    const planItemsService = {
      listPersonalRelances: jest.fn().mockResolvedValue([]),
      // `null` = comptage impossible → le service retombe sur la liste affichée.
      // Les tests qui vérifient les tuiles le renseignent explicitement.
      countPersonalRelances: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Pick<ActionPlanItemsService, 'listPersonalRelances' | 'countPersonalRelances'>>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace' | 'extraPermissionsOf'>>
    const perspective = {
      getPerspective: jest.fn().mockResolvedValue(PERSPECTIVE),
    } as unknown as jest.Mocked<Pick<CockpitPerspectiveService, 'getPerspective'>>

    const service = new PersonalCockpitService(
      accountsService as unknown as AccountsService,
      actionsService as unknown as ActionsService,
      planItemsService as unknown as ActionPlanItemsService,
      workspaceContext as unknown as WorkspaceContextService,
      perspective as unknown as CockpitPerspectiveService,
    )
    return { service, accountsService, actionsService, planItemsService, workspaceContext, perspective }
  }

  // Perf 29/09/2026 (`GET /dashboard/me` 4-5 s) : le recul était lu APRÈS les six
  // lectures de la page, donc leurs durées s'ADDITIONNAIENT. Il part maintenant
  // avec elles — la réponse dure le plus lent des deux, pas leur somme.
  it('starts the perspective read WITHOUT waiting for the page reads', async () => {
    const { service, accountsService, perspective } = build()
    let releaseAccounts: (rows: DashboardAccountInsight[]) => void = () => undefined
    accountsService.listPersonalAccounts.mockReturnValue(
      new Promise<DashboardAccountInsight[]>(resolve => {
        releaseAccounts = resolve
      }),
    )
    const pending = service.getPersonalCockpit('user-1')
    await new Promise(resolve => setImmediate(resolve))
    expect(perspective.getPerspective).toHaveBeenCalledTimes(1)
    releaseAccounts([])
    await pending
  })

  it('scopes every read to the current user inside their active workspace', async () => {
    const { service, accountsService, actionsService, planItemsService, workspaceContext } = build()
    await service.getPersonalCockpit('user-1')
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    // My data, in my workspace — the strict personal scope.
    expect(accountsService.listPersonalAccounts).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(planItemsService.listPersonalRelances).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(actionsService.listPersonalMessages).toHaveBeenCalledWith('user-1', expect.any(Number))
    expect(actionsService.countMessagesSince).toHaveBeenCalledWith('user-1', expect.any(Date))
  })

  it('computes KPIs from my own accounts, relances and messages', async () => {
    const { service, accountsService, actionsService, planItemsService } = build()
    accountsService.listPersonalAccounts.mockResolvedValue([account('a1'), account('a2')])
    accountsService.countPersonalAccounts.mockResolvedValue(2)
    planItemsService.listPersonalRelances.mockResolvedValue([
      relance({ id: 'r1', account_id: 'a1', overdue: true }),
      relance({ id: 'r2', account_id: 'a2', overdue: false }),
    ])
    actionsService.countMessagesSince.mockResolvedValue(4)

    const res = await service.getPersonalCockpit('user-1')
    expect(res.kpis).toEqual({ my_accounts: 2, relances_open: 2, relances_overdue: 1, messages_this_week: 4 })
  })

  it('builds priorities relance-first, only on MY accounts, deduped by account', async () => {
    const { service, accountsService, planItemsService } = build()
    accountsService.listPersonalAccounts.mockResolvedValue([
      account('a1', { priority_score: 9, primary_signal: 'Levée de fonds' }),
      account('a2', { priority_score: 5, primary_signal: 'Recrutement' }),
    ])
    planItemsService.listPersonalRelances.mockResolvedValue([
      relance({ id: 'r1', account_id: 'a1', label: 'Rappeler la DSI', overdue: true }),
      // Second relance on the same account must NOT create a duplicate priority.
      relance({ id: 'r2', account_id: 'a1', label: 'Envoyer proposition' }),
      // A relance delegated to me on an account I do NOT own: stays a relance,
      // but never becomes one of "my account" priorities.
      relance({ id: 'r3', account_id: 'ghost', label: 'Compte collègue' }),
    ])

    const res = await service.getPersonalCockpit('user-1')
    expect(res.priorities.map(p => p.account_id)).toEqual(['a1', 'a2'])
    expect(res.priorities[0]).toMatchObject({
      account_id: 'a1',
      overdue: true,
      reason: 'Relance en retard : Rappeler la DSI',
    })
    // a2 has no relance → filled from the hottest-account pass, reason = its signal.
    expect(res.priorities[1]).toMatchObject({ account_id: 'a2', overdue: false, reason: 'Recrutement' })
    expect(res.priorities.some(p => p.account_id === 'ghost')).toBe(false)
  })

  it('caps the display lists but keeps KPI counts on the full sets', async () => {
    const { service, accountsService, actionsService, planItemsService } = build()
    accountsService.listPersonalAccounts.mockResolvedValue(Array.from({ length: 12 }, (_, i) => account(`a${i}`)))
    accountsService.countPersonalAccounts.mockResolvedValue(12)
    planItemsService.listPersonalRelances.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => relance({ id: `r${i}`, account_id: `a${i}` })),
    )
    actionsService.listPersonalMessages.mockResolvedValue([{ id: 'm1' }] as never)

    const res = await service.getPersonalCockpit('user-1')
    expect(res.relances).toHaveLength(8)
    expect(res.accounts).toHaveLength(8)
    expect(res.messages).toHaveLength(1)
    expect(res.kpis.my_accounts).toBe(12)
    expect(res.kpis.relances_open).toBe(12)
  })

  it('compte les comptes par une REQUÊTE, pas par la longueur d’une liste bornée', async () => {
    // Recette live du 29/08/2026 : « 27 Comptes suivis » sur `/dashboard`
    // contre « 23 suivis » sur `/accounts`. La différence de POPULATION est
    // réelle (voir le libellé, corrigé) — mais le chiffre avait en plus un
    // plafond silencieux : `listPersonalAccounts` est bornée à 200 lignes, et
    // le KPI valait son `.length`. Au 201e compte, le cockpit aurait annoncé
    // « 200 » pour toujours, sans que rien ne le signale.
    const { service, accountsService } = build()
    accountsService.listPersonalAccounts.mockResolvedValue(Array.from({ length: 200 }, (_, i) => account(`a${i}`)))
    accountsService.countPersonalAccounts.mockResolvedValue(412)

    const res = await service.getPersonalCockpit('user-1')
    expect(accountsService.countPersonalAccounts).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(res.kpis.my_accounts).toBe(412)
  })

  it('compte les relances par une REQUÊTE, pas par la longueur de la liste bornée (#1285)', async () => {
    // Recette live du 31/08/2026 : « 100 Relances à faire » sur `/dashboard`.
    // Ce n'était pas un nombre, c'était le `limit` de `listPersonalRelances` —
    // le même plafond silencieux que celui des comptes, deux tuiles plus loin.
    const { service, planItemsService } = build()
    planItemsService.listPersonalRelances.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => relance({ id: `r${i}`, account_id: `a${i}`, overdue: true })),
    )
    planItemsService.countPersonalRelances.mockResolvedValue({ open: 137, overdue: 73 })

    const res = await service.getPersonalCockpit('user-1')

    expect(planItemsService.countPersonalRelances).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(res.kpis.relances_open).toBe(137)
    expect(res.kpis.relances_overdue).toBe(73)
  })

  it('un comptage impossible retombe sur ce qui est AFFICHÉ, jamais sur zéro (#1285)', async () => {
    const { service, planItemsService } = build()
    planItemsService.listPersonalRelances.mockResolvedValue([
      relance({ id: 'r1', account_id: 'a1', overdue: true }),
      relance({ id: 'r2', account_id: 'a2', overdue: false }),
    ])
    planItemsService.countPersonalRelances.mockResolvedValue(null)

    const res = await service.getPersonalCockpit('user-1')

    // Sous-estimé (la liste est bornée), jamais inventé — et surtout pas « 0 »,
    // qui dirait « tu n'as rien à faire » à quelqu'un qui a du retard.
    expect(res.kpis.relances_open).toBe(2)
    expect(res.kpis.relances_overdue).toBe(1)
  })

  // #1408 suite — un cockpit qui ne peut RIEN calculer ne rend plus « 0 partout ».
  // « 0 relance en retard » est un ZÉRO QUI MENT : il dit « rien à faire » à un
  // commercial dont on n'a simplement pas pu lire le portefeuille. L'échec doit
  // se DIRE (propager), pas se déguiser en journée calme — même règle que
  // `UnknownValue`/GA-18/GA-19 appliquée à l'ensemble de la réponse plutôt qu'à
  // un seul champ.
  it('propage l’échec plutôt que de rendre un cockpit à zéro qui dirait « rien à faire »', async () => {
    const { service, workspaceContext, accountsService } = build()
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('no workspace'))

    await expect(service.getPersonalCockpit('user-1')).rejects.toThrow('no workspace')
    expect(accountsService.listPersonalAccounts).not.toHaveBeenCalled()
  })

  it('sert le recul, scopé au même utilisateur et au même espace (#1404 → #1411)', async () => {
    const { service, perspective } = build()
    const res = await service.getPersonalCockpit('user-1')
    // ⚠️ Le troisième argument est le DROIT FINANCIER de l'appelant, et il n'est
    // pas décoratif : sans lui, cette route — qui ne porte que `JwtGuard` —
    // rendrait le facturé de MES missions à un rôle que `/delivery` masque.
    // `owner` sans permission supplémentaire porte `finance:read`.
    expect(perspective.getPerspective).toHaveBeenCalledWith('user-1', 'ws-1', true)
    expect(res.perspective?.coverage.no_interaction_30d).toBe(7)
  })

  it('un recul illisible rend `undefined`, JAMAIS des blocs à zéro', async () => {
    const { service, perspective } = build()
    perspective.getPerspective.mockRejectedValue(new Error('pg down'))
    const res = await service.getPersonalCockpit('user-1')
    // `undefined` ⇒ l'écran MASQUE la perspective. Un objet rempli de zéros
    // aurait annoncé « zéro compte silencieux », c'est-à-dire une bonne
    // nouvelle qu'aucune mesure ne justifie.
    expect(res.perspective).toBeUndefined()
    // ...et le reste du cockpit tient debout : un bloc qui tombe n'en éteint pas cinq.
    expect(res.kpis).toBeDefined()
    expect(res.relances).toEqual([])
  })

  it('passe le droit financier de l’APPELANT, jamais un `true` de confort', async () => {
    const { service, workspaceContext, perspective } = build()
    // Un `sales` sans permission supplémentaire ne porte pas `finance:read`.
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' } as never)
    await service.getPersonalCockpit('user-1')
    expect(perspective.getPerspective).toHaveBeenCalledWith('user-1', 'ws-1', false)
  })
})
