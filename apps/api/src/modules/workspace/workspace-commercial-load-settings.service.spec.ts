import { DEFAULT_MAX_OPEN_NEEDS } from '@bellum/contracts'
import { WorkspaceCommercialLoadSettingsService } from './workspace-commercial-load-settings.service'

/**
 * `#2035.11` — la charge commerciale et la priorisation des besoins.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
 * concurrentes. `maxOpenNeeds` était écrit par CE service ET par
 * `CommercialLoadSettingsService` (module `projects`), sur deux tables
 * différentes. Il n'a qu'un seul endroit désormais : la table de production,
 * où il n'a jamais bougé (GA-26).
 *
 * Les deux plafonds s'appuient sur des colonnes réelles
 * (`accounts.assigned_to`, `project_needs.status`) — ce service ne fait que
 * les lire/écrire, il ne calcule aucune charge.
 */
describe('WorkspaceCommercialLoadSettingsService', () => {
  function build(
    row: {
      max_tracked_accounts: number | null
      max_open_needs: number
      weekly_available_hours?: number | null
      cadence_weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | null
    } | null = null,
  ) {
    const findOne = jest.fn(async () =>
      row
        ? { workspace_id: 'w-1', weekly_available_hours: null, cadence_weekday: null, ...row, updated_at: new Date() }
        : null,
    )
    const query = jest.fn().mockResolvedValue([])
    const repo = { findOne, manager: { query } }
    return { service: new WorkspaceCommercialLoadSettingsService(repo as never), findOne, query }
  }

  it('sans réglage, le plafond de dossiers est NON RENSEIGNÉ — pas zéro dossier', async () => {
    const { service } = build()
    const settings = await service.effectiveFor('w-1')
    // `maxOpenNeeds` est NOT NULL en base et a toujours une valeur — celle du
    // code tant que l'espace n'a rien réglé. `maxTrackedAccounts`, lui, n'est
    // PAS zéro : il n'est pas renseigné (GA-18/GA-19).
    expect(settings).toEqual({
      maxTrackedAccounts: null,
      maxOpenNeeds: DEFAULT_MAX_OPEN_NEEDS,
      weeklyAvailableHours: null,
      cadenceWeekday: null,
    })
  })

  // #3289.29 — le jour imposé à la cadence : NULL = non renseigné, patch partiel sans effacer le reste.
  it('#3289.29 — pose le jour imposé sans toucher aux plafonds, et NULL le repasse à « non renseigné »', async () => {
    const { service, query } = build({ max_tracked_accounts: 40, max_open_needs: 15, weekly_available_hours: 32 })
    const posed = await service.update('w-1', { cadenceWeekday: 'tuesday' })
    expect(posed).toEqual({
      maxTrackedAccounts: 40,
      maxOpenNeeds: 15,
      weeklyAvailableHours: 32,
      cadenceWeekday: 'tuesday',
    })
    expect(query.mock.calls[0]?.[1]).toEqual(['w-1', 40, 15, 32, 'tuesday'])
    const cleared = await service.update('w-1', { cadenceWeekday: null })
    expect(cleared.cadenceWeekday).toBeNull()
  })

  it('#3289.29 — lit le jour imposé de la ligne', async () => {
    const { service } = build({ max_tracked_accounts: null, max_open_needs: 15, cadence_weekday: 'thursday' })
    expect((await service.effectiveFor('w-1')).cadenceWeekday).toBe('thursday')
  })

  // #3245 (reste de #3209.3) — heures commerciales disponibles : même
  // convention que `maxTrackedAccounts`, NULL = non renseigné, jamais 0 heure.
  it('rend les heures commerciales disponibles quand l’espace les a réglées', async () => {
    const { service } = build({ max_tracked_accounts: null, max_open_needs: 15, weekly_available_hours: 32 })
    const settings = await service.effectiveFor('w-1')
    expect(settings.weeklyAvailableHours).toBe(32)
  })

  it('un patch qui ne touche que les heures disponibles ne modifie pas les deux autres plafonds', async () => {
    const { service, query } = build({ max_tracked_accounts: 40, max_open_needs: 15, weekly_available_hours: null })
    await service.update('w-1', { weeklyAvailableHours: 35 })

    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['w-1', 40, 15, 35, null])
  })

  it('`maxOpenNeedsFor` est le SEUL chemin d’`OpenNeedsService` — défaut compris', async () => {
    const { service } = build()
    expect(await service.maxOpenNeedsFor('w-1')).toBe(DEFAULT_MAX_OPEN_NEEDS)

    const { service: reglee } = build({ max_tracked_accounts: null, max_open_needs: 40 })
    expect(await reglee.maxOpenNeedsFor('w-1')).toBe(40)
  })

  it('rend les plafonds posés par l’espace', async () => {
    const { service } = build({ max_tracked_accounts: 40, max_open_needs: 15 })
    const settings = await service.effectiveFor('w-1')
    expect(settings).toEqual({
      maxTrackedAccounts: 40,
      maxOpenNeeds: 15,
      weeklyAvailableHours: null,
      cadenceWeekday: null,
    })
  })

  it('borne toute lecture à l’espace', async () => {
    const { service, findOne } = build()
    await service.effectiveFor('w-1')
    expect(findOne).toHaveBeenCalledWith({ where: { workspace_id: 'w-1' } })
  })

  it('un patch partiel ne touche pas l’autre plafond', async () => {
    const { service, query } = build({ max_tracked_accounts: 40, max_open_needs: 15 })
    await service.update('w-1', { maxOpenNeeds: 20 })

    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (workspace_id) DO UPDATE')
    expect(params).toEqual(['w-1', 40, 20, null, null])
  })

  it('`null` explicite repasse un plafond à « non renseigné »', async () => {
    const { service, query } = build({ max_tracked_accounts: 40, max_open_needs: 15 })
    await service.update('w-1', { maxTrackedAccounts: null })

    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['w-1', null, 15, null, null])
  })

  it('écrit dans la table de PRODUCTION, jamais dans celle de la vague 3', async () => {
    const { service, query } = build({ max_tracked_accounts: 40, max_open_needs: 15 })
    await service.update('w-1', { maxTrackedAccounts: 12 })

    const [sql] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('workspace_commercial_load_settings')
    expect(sql).not.toContain('capacity_settings')
  })
})
