import { DEFAULT_MAX_RECRUITERS_SHOWN } from '@bellum/contracts'
import { WorkspaceReverseMarketSettingsService } from './workspace-reverse-market-settings.service'

/**
 * `#2035.10` — le marché inversé, réglable par espace.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
 * concurrentes. Ce service porte désormais les TROIS réglages du sujet, dont
 * `maxRecruitersShown`, qui vivait dans un second service
 * (`ReverseMarketSettingsService`, module `consultants/matching`) sur une
 * autre table. Un réglage vit à un seul endroit (GA-26).
 *
 * Ce que ce service garde : une ligne ABSENTE rend l'état « jamais réglé »
 * (`enabled: false`, `responseCapacityPerWeek: null`, le défaut de recruteurs
 * affichés), jamais une valeur devinée — et un patch partiel ne touche que ce
 * qu'il nomme.
 */
describe('WorkspaceReverseMarketSettingsService', () => {
  type Row = { enabled: boolean; response_capacity_per_week: number | null; max_recruiters_shown: number }

  function build(row: Row | null = null) {
    const findOne = jest.fn(async () => (row ? { workspace_id: 'w-1', ...row, updated_at: new Date() } : null))
    const query = jest.fn().mockResolvedValue([])
    const repo = { findOne, manager: { query } }
    return { service: new WorkspaceReverseMarketSettingsService(repo as never), findOne, query }
  }

  it('sans réglage, jamais activé et capacité NON RENSEIGNÉE — pas zéro', async () => {
    const { service } = build()
    const settings = await service.effectiveFor('w-1')
    expect(settings).toEqual({
      enabled: false,
      responseCapacityPerWeek: null,
      maxRecruitersShown: DEFAULT_MAX_RECRUITERS_SHOWN,
    })
  })

  it('rend les TROIS réglages posés par l’espace, fusionnés sur une seule table', async () => {
    const { service } = build({ enabled: true, response_capacity_per_week: 8, max_recruiters_shown: 25 })
    const settings = await service.effectiveFor('w-1')
    expect(settings).toEqual({ enabled: true, responseCapacityPerWeek: 8, maxRecruitersShown: 25 })
  })

  it('borne toute lecture à l’espace', async () => {
    const { service, findOne } = build()
    await service.effectiveFor('w-1')
    expect(findOne).toHaveBeenCalledWith({ where: { workspace_id: 'w-1' } })
  })

  it('`maxRecruitersShownFor` est le SEUL chemin de `ReverseMarketService` — défaut compris', async () => {
    const { service } = build()
    expect(await service.maxRecruitersShownFor('w-1')).toBe(DEFAULT_MAX_RECRUITERS_SHOWN)

    const { service: reglee } = build({ enabled: false, response_capacity_per_week: null, max_recruiters_shown: 3 })
    expect(await reglee.maxRecruitersShownFor('w-1')).toBe(3)
  })

  it('un patch partiel (seul `enabled`) ne touche ni la capacité ni le nombre de recruteurs', async () => {
    const { service, query } = build({ enabled: false, response_capacity_per_week: 8, max_recruiters_shown: 25 })
    await service.update('w-1', { enabled: true })

    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (workspace_id) DO UPDATE')
    // Les deux réglages déjà en base sont reconduits, jamais effacés par des
    // champs absents — c'est exactement ce que la coexistence de deux tables
    // rendait impossible à garantir.
    expect(params).toEqual(['w-1', true, 8, 25])
  })

  it('`responseCapacityPerWeek: null` explicite repasse à « non renseigné »', async () => {
    const { service, query } = build({ enabled: true, response_capacity_per_week: 8, max_recruiters_shown: 10 })
    await service.update('w-1', { responseCapacityPerWeek: null })

    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['w-1', true, null, 10])
  })

  it('un patch du seul réglage venu de la vague 2 laisse les deux autres en place', async () => {
    const { service, query } = build({ enabled: true, response_capacity_per_week: 8, max_recruiters_shown: 10 })
    await service.update('w-1', { maxRecruitersShown: 42 })

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('workspace_reverse_market_settings')
    expect(params).toEqual(['w-1', true, 8, 42])
  })
})
