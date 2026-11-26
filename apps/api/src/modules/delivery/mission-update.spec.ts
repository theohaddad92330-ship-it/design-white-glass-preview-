import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import type { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DeliveryService } from './delivery.service'

/**
 * RÉPARER UNE FICHE DE MISSION — le chemin d'écriture qui manquait.
 *
 * `BLOCKER_ACTIONS` promet un geste par bloqueur de facturation. Trois d'entre
 * eux — `missing_billing_contact`, `missing_rate`, `missing_start_date` —
 * désignaient des colonnes que SEULE la création savait écrire : une mission
 * créée sans elles restait bloquée pour toujours, et l'écran ADV annonçait
 * pourtant qu'elles « se réparent sur la fiche de mission ».
 *
 * Mesuré le 01/09/2026 sur un espace réel : `missing_billing_contact` sur
 * 11 missions sur 11.
 */
const USER = 'user-1'
const WORKSPACE = 'ws-1'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const MISSION = '44444444-4444-4444-8444-444444444444'
const CONTACT = '55555555-5555-4555-8555-555555555555'

function build() {
  const missions = createMockRepository<MissionEntity>()
  const timesheets = createMockRepository<MissionTimesheetEntity>()
  const accounts = createMockRepository<AccountEntity>()
  const terms = createMockRepository<MissionCommercialTermsEntity>()
  const projects = createMockRepository<ProjectEntity>()
  terms.find.mockResolvedValue([])
  timesheets.find.mockResolvedValue([])
  missions.save.mockImplementation(async (entity: Partial<MissionEntity>) => entity as MissionEntity)
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' }),
  } as unknown as WorkspaceContextService
  const service = new DeliveryService(
    missions as never,
    timesheets as never,
    accounts as never,
    projects as never,
    // #2191.17 / #2191.18 — le besoin, non lu par les gestes de réparation
    // (pas de création).
    { findOne: jest.fn() } as never,
    terms as never,
    // #2562 — le cache des deals CRM, non lu par les gestes de réparation.
    { findOne: jest.fn() } as never,
    // #2560.6 — le vivier, non lu par les gestes de réparation (pas de création).
    { findOne: jest.fn() } as never,
    // #2339.7 — le vivier des positionnements, non lu par les gestes de
    // réparation (pas de création).
    { findOne: jest.fn() } as never,
    { assign: jest.fn() } as never,
    workspaceContext,
    { record: jest.fn() } as never,
    // #2411.11 — les résolutions de risque, non lues par les gestes de réparation.
    { find: jest.fn().mockResolvedValue([]), upsert: jest.fn() } as never,
    // #2411.6 — l'état de facturation, non lu par les gestes de réparation.
    { list: jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-01', canReadFinance: true }) } as never,
  )
  return { service, missions, accounts }
}

function mission(over: Partial<MissionEntity> = {}): MissionEntity {
  return {
    id: MISSION,
    workspace_id: WORKSPACE,
    user_id: USER,
    account_id: ACCOUNT,
    opportunity_id: null,
    label: 'TMA socle data',
    status: 'active',
    started_on: '2026-01-01',
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    billing_contact_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  } as MissionEntity
}

describe('DeliveryService.updateMission', () => {
  it('pose le contact de facturation quand il appartient au compte de la mission', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    missions.manager.query.mockResolvedValue([{ id: CONTACT }])

    const view = await service.updateMission(USER, MISSION, { billingContactId: CONTACT })

    expect(view.billing_contact_id).toBe(CONTACT)
    expect(missions.save).toHaveBeenCalledWith(expect.objectContaining({ billing_contact_id: CONTACT }))
  })

  it('refuse un contact qui n’appartient pas au compte de la mission', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    // Aucun contact rendu = le contact n'est pas sur ce compte.
    missions.manager.query.mockResolvedValue([])

    await expect(service.updateMission(USER, MISSION, { billingContactId: CONTACT })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('`null` EFFACE le contact — le bloqueur revient, et c’est un geste légitime', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ billing_contact_id: CONTACT }))

    const view = await service.updateMission(USER, MISSION, { billingContactId: null })

    expect(view.billing_contact_id).toBeNull()
    // Aucune vérification d'appartenance sur un effacement : il n'y a rien à vérifier.
    expect(missions.manager.query).not.toHaveBeenCalled()
  })

  it('ne touche QUE les champs envoyés — un corps partiel n’efface rien', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ daily_rate: 600, ends_on: '2026-12-31' }))

    await service.updateMission(USER, MISSION, { startedOn: '2026-02-01' })

    expect(missions.save).toHaveBeenCalledWith(
      expect.objectContaining({ started_on: '2026-02-01', daily_rate: 600, ends_on: '2026-12-31' }),
    )
  })

  // #2953 (#2193.17/.18) — l'objectif et le périmètre, saisis sur la fiche.
  it('pose l’objectif ET le périmètre, sans se toucher entre eux', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())

    const view = await service.updateMission(USER, MISSION, {
      objective: 'Reprendre le run applicatif',
      perimeter: 'TMA du portail transporteurs',
    })

    expect(view.objective).toBe('Reprendre le run applicatif')
    expect(view.perimeter).toBe('TMA du portail transporteurs')
  })

  it('`null` efface l’objectif — « non renseigné », jamais une chaîne vide', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ objective: 'Ancien objectif' }))

    const view = await service.updateMission(USER, MISSION, { objective: null })

    expect(view.objective).toBeNull()
  })

  it('`undefined` (champ absent du corps) laisse le périmètre intact', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ perimeter: 'Intact' }))

    const view = await service.updateMission(USER, MISSION, { objective: 'Nouveau' })

    expect(view.perimeter).toBe('Intact')
  })

  it('refuse une fin antérieure au début sur la ligne FUSIONNÉE — un corps partiel ne dit rien de l’autre borne', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ started_on: '2026-06-01' }))

    await expect(service.updateMission(USER, MISSION, { endsOn: '2026-03-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('ne trouve pas une mission d’un autre espace', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(null)

    await expect(service.updateMission(USER, MISSION, { dailyRate: 700 })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('pose le TJM vendu — le bloqueur `missing_rate` se lève', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())

    const view = await service.updateMission(USER, MISSION, { dailyRate: 720 })

    expect(view.daily_rate).toBe(720)
  })

  it("un TJM qui n'existait pas encore (`null`) ne ferme aucune fenêtre — rien n'a été produit avec un tarif qui n'existait pas", async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ daily_rate: null }))

    await service.updateMission(USER, MISSION, { dailyRate: 720 })

    expect(missions.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('mission_rate_history'),
      expect.anything(),
    )
  })

  it('un `PUT` qui renvoie le MÊME TJM ne ferme aucune fenêtre — rien à écraser', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ daily_rate: 650 }))

    await service.updateMission(USER, MISSION, { dailyRate: 650 })

    expect(missions.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('mission_rate_history'),
      expect.anything(),
    )
  })

  /**
   * #2407.10 / #2417.7 — LE CLIQUET : un changement de TJM ferme la fenêtre de
   * l'ANCIEN tarif dans `mission_rate_history` AVANT de l'écraser sur la ligne
   * mission. Casser ce comportement (supprimer l'INSERT, ou l'écrire APRÈS
   * `mission.daily_rate = input.dailyRate`) romprait cette assertion en
   * nommant `mission_rate_history` absent des appels — le coupable exact.
   */
  it('un TJM qui CHANGE ferme la fenêtre de l’ancien tarif dans `mission_rate_history` avant de l’écraser', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ daily_rate: 650, started_on: '2026-01-01' }))
    missions.manager.query.mockResolvedValue([])

    const view = await service.updateMission(USER, MISSION, { dailyRate: 720 })

    expect(missions.manager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mission_rate_history'), [
      MISSION,
      WORKSPACE,
      650,
      '2026-01-01',
      expect.any(String),
    ])
    expect(view.daily_rate).toBe(720)
  })

  // #2407.3 — reco appliquée (decisions §1) : la PROVENANCE des seuls champs
  // disputés (dates, TJM) se trace à chaque changement, source nommée.
  it('trace la provenance d’un champ disputé qui CHANGE (TJM, dates), jamais d’un champ inchangé', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ daily_rate: 650, started_on: '2026-01-01', ends_on: null }))
    missions.manager.query.mockResolvedValue([])

    await service.updateMission(USER, MISSION, { dailyRate: 720, startedOn: '2026-01-01' })

    const audits = missions.manager.query.mock.calls.filter(([sql]: [string]) =>
      sql.includes('INSERT INTO record_field_audit'),
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]?.[1]).toEqual([WORKSPACE, MISSION, 'daily_rate', '650', '720', USER])
  })
})

/**
 * X66 / #3547 — CHANGER LE MODE (forfait encadré) D'UNE MISSION DÉJÀ CRÉÉE.
 * Même cohérence qu'à la création (`deliveryModeProblems`) : le mode encadré
 * n'existe qu'au forfait, le rôle et l'équipe n'existent qu'avec lui.
 */
describe('DeliveryService.updateMission — le mode de réalisation (#3547)', () => {
  it('passe un forfait staffé en forfait encadré : mode, rôle tenu et équipe client écrits', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ contract_kind: 'forfait', delivery_mode: 'staffed' }))

    const view = await service.updateMission(USER, MISSION, {
      deliveryMode: 'supervised',
      supervisionRole: 'both',
      clientTeamSize: 8,
      clientTeamNames: ['Marie Dupont'],
    })

    expect(view.delivery_mode).toBe('supervised')
    expect(missions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_mode: 'supervised',
        supervision_role: 'both',
        client_team_size: 8,
        client_team_names: ['Marie Dupont'],
      }),
    )
  })

  it('REFUSE le mode encadré sur une régie, avant toute écriture', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ contract_kind: 'regie', delivery_mode: 'staffed' }))

    await expect(service.updateMission(USER, MISSION, { deliveryMode: 'supervised' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('repasser en staffé EFFACE le rôle et l’équipe : jamais un champ orphelin', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(
      mission({
        contract_kind: 'forfait',
        delivery_mode: 'supervised',
        supervision_role: 'framing',
        client_team_size: 4,
        client_team_names: ['Paul Martin'],
      }),
    )

    await service.updateMission(USER, MISSION, { deliveryMode: 'staffed' })

    expect(missions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_mode: 'staffed',
        supervision_role: null,
        client_team_size: null,
        client_team_names: [],
      }),
    )
  })

  it('règle le rôle d’une mission DÉJÀ encadrée sans toucher à son équipe', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(
      mission({
        contract_kind: 'forfait',
        delivery_mode: 'supervised',
        supervision_role: 'framing',
        client_team_size: 4,
        client_team_names: [],
      }),
    )

    await service.updateMission(USER, MISSION, { supervisionRole: 'supervision' })

    expect(missions.save).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_mode: 'supervised', supervision_role: 'supervision', client_team_size: 4 }),
    )
  })

  it('REFUSE un rôle ou une équipe sur une mission staffée', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ contract_kind: 'forfait', delivery_mode: 'staffed' }))

    await expect(service.updateMission(USER, MISSION, { clientTeamSize: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(missions.save).not.toHaveBeenCalled()
  })
})
