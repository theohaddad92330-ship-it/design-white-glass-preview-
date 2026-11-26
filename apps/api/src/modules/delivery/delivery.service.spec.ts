import { BadRequestException, NotFoundException } from '@nestjs/common'
import { In, IsNull } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { MissionRiskResolutionEntity } from '../../database/entities/mission-risk-resolution.entity'
import type { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import type { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { SubmissionEntity } from '../../database/entities/submission.entity'
import { createMockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CommercialTransitionsService } from '../commercial-transitions/commercial-transitions.service'
import type { StaffingService } from './staffing.service'
import type { InvoiceReadinessService } from './invoice-readiness.service'
import { DeliveryService } from './delivery.service'
// #2414.48 — même liste de stades « présenté » que `DeliveryService`, pour que le test pin la vraie valeur.
import { PRESENTED_SUBMISSION_STAGES } from '../proposals/presented-submission-stages'

/**
 * Delivery OS (addendum final p71-72).
 *
 * Ce que le module apporte : les signaux de fin de mission arrivent AVANT la fin,
 * et ils arrivent au commercial. Un renouvellement se prépare à J-60 ; découvert
 * à J-3, il se négocie en position de faiblesse quand il ne se perd pas.
 *
 * Trois refus s'y testent aussi, et ils comptent autant : ne rien stocker de ce
 * qui se calcule, ne pas laisser passer une date de fin antérieure au début, et
 * ne pas réécrire un relevé déjà validé.
 */

const USER = 'user-1'
const WORKSPACE = 'ws-1'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

function build() {
  const missions = createMockRepository<MissionEntity>()
  const timesheets = createMockRepository<MissionTimesheetEntity>()
  const accounts = createMockRepository<AccountEntity>()
  // Les conditions commerciales — la SOURCE du coût chargé depuis D43. Vide par
  // défaut : une mission dont personne n'a saisi les conditions n'a pas de marge.
  const terms = createMockRepository<MissionCommercialTermsEntity>()
  terms.find.mockResolvedValue([])
  missions.save.mockImplementation(async (entity: Partial<MissionEntity>) => ({ id: 'm1', ...entity }))
  timesheets.save.mockImplementation(async (entity: Partial<MissionTimesheetEntity>) => ({ id: 't1', ...entity }))
  timesheets.find.mockResolvedValue([])
  timesheets.findOne.mockResolvedValue(null)
  accounts.findOne.mockResolvedValue({ id: ACCOUNT })
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: 'owner' }),
    // #2414.34/.40 — `marketDemandByConsultant` lit le même aiguillage démo
    // que `ReverseMarketService.forTalent()` ; `false` par défaut, comme un
    // espace de production réel.
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  } as unknown as WorkspaceContextService
  const projects = createMockRepository<ProjectEntity>()
  // Aucun projet par défaut : une mission créée à la main n'hérite de rien.
  projects.findOne.mockResolvedValue(null)
  // #4559 — l'affaire désignée à la création appartient à l'espace par défaut ;
  // les tests de REFUS posent `count` à 0.
  projects.count.mockResolvedValue(1)
  // #2191.17 / #2191.18 — le besoin, pour le télétravail et le lieu repris au
  // handoff. Aucun besoin par défaut, même raison que `projects` au-dessus.
  const needs = createMockRepository<ProjectNeedEntity>()
  needs.findOne.mockResolvedValue(null)
  needs.count.mockResolvedValue(1)
  // #2562 — le cache des deals CRM, pour le lien `crm_deal_id` à la création.
  // Non appelé par défaut : la plupart des tests ne désignent aucun deal.
  const crmDealFacts = createMockRepository<CrmDealFactEntity>()
  // #2560.6 — le vivier, pour vérifier qu'un `consultantId` désigné à la
  // création appartient à CET espace. Non appelé par défaut : la plupart des
  // tests ne désignent aucun consultant.
  const consultants = createMockRepository<ConsultantEntity>()
  // #2339.7 — le vivier des positionnements, pour vérifier qu'un
  // `submissionId` désigné à la création appartient à CET espace. Non appelé
  // par défaut : la plupart des tests ne désignent aucun positionnement.
  const submissions = createMockRepository<SubmissionEntity>()
  const commercialTransitions = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as CommercialTransitionsService
  const staffing = { assign: jest.fn() } as unknown as StaffingService
  // #2411.11 — les résolutions de risque. Vide par défaut : aucun risque n'est
  // marqué « traité » tant qu'un test ne le pose pas lui-même.
  const riskResolutions = createMockRepository<MissionRiskResolutionEntity>()
  riskResolutions.find.mockResolvedValue([])
  // #2411.6 — l'état de facturation, VIDE par défaut : aucune mission n'est
  // « facturation bloquée » tant qu'un test ne le pose pas lui-même.
  const invoiceReadiness = {
    list: jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-01', canReadFinance: true }),
  } as unknown as InvoiceReadinessService
  const service = new DeliveryService(
    missions as never,
    timesheets as never,
    accounts as never,
    projects as never,
    needs as never,
    terms as never,
    crmDealFacts as never,
    consultants as never,
    submissions as never,
    staffing,
    workspaceContext,
    commercialTransitions,
    riskResolutions as never,
    invoiceReadiness,
  )
  return {
    service,
    missions,
    timesheets,
    accounts,
    projects,
    needs,
    terms,
    crmDealFacts,
    consultants,
    submissions,
    staffing,
    commercialTransitions,
    riskResolutions,
    invoiceReadiness,
  }
}

function mission(over: Partial<MissionEntity> = {}): MissionEntity {
  return {
    id: 'm1',
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
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  } as MissionEntity
}

describe('création de mission', () => {
  // #4559 — le REFUS : un identifiant d'un autre espace ne se stocke pas.
  it('refuse une affaire (opportunityId) d’un autre espace, sans rien écrire', async () => {
    const { service, projects, missions } = build()
    projects.count.mockImplementation(async (opts: { where: { workspace_id: string } }) =>
      opts.where.workspace_id === WORKSPACE ? 0 : 1,
    )
    await expect(
      service.create(USER, { accountId: ACCOUNT, opportunityId: '44444444-4444-4444-8444-444444444444', label: 'M' }),
    ).rejects.toThrow(NotFoundException)
    expect(projects.count).toHaveBeenCalledWith({
      where: { id: '44444444-4444-4444-8444-444444444444', workspace_id: WORKSPACE },
    })
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('refuse un besoin (needId) d’un autre espace, sans rien écrire', async () => {
    const { service, needs, missions } = build()
    needs.count.mockImplementation(async (opts: { where: { workspace_id: string } }) =>
      opts.where.workspace_id === WORKSPACE ? 0 : 1,
    )
    await expect(
      service.create(USER, { accountId: ACCOUNT, needId: '55555555-5555-4555-8555-555555555555', label: 'M' }),
    ).rejects.toThrow(NotFoundException)
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('refuse un compte hors du périmètre de l’appelant', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValueOnce(null)
    await expect(service.create(USER, { accountId: ACCOUNT, label: 'Mission' })).rejects.toThrow(NotFoundException)
  })

  it('refuse une fin antérieure au début', async () => {
    // Ce n'est pas une saisie « à corriger plus tard » : elle produirait une
    // fenêtre « en retard » dès la création, donc une alerte permanente et fausse.
    const { service } = build()
    await expect(
      service.create(USER, { accountId: ACCOUNT, label: 'Mission', startedOn: '2026-06-01', endsOn: '2026-05-01' }),
    ).rejects.toThrow(BadRequestException)
  })

  // #2320.21 (épopée #2967) — « Retenu → Mission nécessite accord client ET
  // accord consultant ». Deux rails déclarés séparément, même garde que
  // `consultantAgreement` des positionnements (#2320.18).
  it('pose l’accord CLIENT et l’accord CONSULTANT séparément — deux rails, pas un', async () => {
    const { service } = build()
    const view = await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Mission',
      clientAgreement: true,
      clientAgreementDate: '2026-09-25',
      consultantAgreement: false,
      consultantAgreementDate: '2026-09-24',
    })
    expect(view.client_agreement).toBe(true)
    expect(view.client_agreement_date).toBe('2026-09-25')
    expect(view.consultant_agreement).toBe(false)
    expect(view.consultant_agreement_date).toBe('2026-09-24')
  })

  describe('#3547 — le forfait encadré, sans consultants', () => {
    it('crée une mission encadrée SANS consultant : mode, rôle tenu et équipe côté client écrits, jamais un consultant inventé', async () => {
      const { service, staffing, missions } = build()
      const view = await service.create(USER, {
        accountId: ACCOUNT,
        label: 'Cadrage du forfait paiement',
        contractKind: 'forfait',
        deliveryMode: 'supervised',
        supervisionRole: 'both',
        clientTeamSize: 8,
        clientTeamNames: ['Marie Dupont'],
      })
      expect(view.delivery_mode).toBe('supervised')
      expect(view.supervision_role).toBe('both')
      expect(view.client_team_size).toBe(8)
      expect(view.client_team_names).toEqual(['Marie Dupont'])
      expect(staffing.assign).not.toHaveBeenCalled()
      expect(missions.save).toHaveBeenCalledTimes(1)
    })

    it('sans le mode, la mission reste staffed — comportement historique, rien d’inventé', async () => {
      const { service } = build()
      const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission' })
      expect(view.delivery_mode).toBe('staffed')
      expect(view.supervision_role).toBeNull()
      expect(view.client_team_size).toBeNull()
      expect(view.client_team_names).toEqual([])
    })

    it('REFUSE le mode encadré hors forfait avant toute écriture', async () => {
      const { service, missions } = build()
      await expect(
        service.create(USER, { accountId: ACCOUNT, label: 'x', contractKind: 'regie', deliveryMode: 'supervised' }),
      ).rejects.toThrow(BadRequestException)
      expect(missions.save).not.toHaveBeenCalled()
    })

    it('REPREND le mode du besoin quand le rôle d’origine est certain — un forfait encadré le reste à la signature', async () => {
      const { service, needs } = build()
      needs.findOne.mockResolvedValue({
        id: 'n-1',
        workspace_id: WORKSPACE,
        remote: null,
        location: null,
        contract_kind: 'forfait',
        delivery_mode: 'supervised',
        supervision_role: 'framing',
        client_team_size: null,
        client_team_names: ['Paul Martin'],
      } as never)
      const view = await service.create(USER, {
        accountId: ACCOUNT,
        label: 'Mission née du besoin',
        needId: 'n-1',
        contractKind: 'forfait',
      })
      expect(view.delivery_mode).toBe('supervised')
      expect(view.supervision_role).toBe('framing')
      expect(view.client_team_names).toEqual(['Paul Martin'])
    })
  })

  it('laisse les deux accords à `null` — jamais devinés — quand rien n’est déclaré', async () => {
    const { service } = build()
    const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission' })
    expect(view.client_agreement).toBeNull()
    expect(view.consultant_agreement).toBeNull()
  })

  it('démarre en onboarding quand la mission n’a pas commencé', async () => {
    // L'onboarding est l'état où le travail (contrats, accès, matériel) a lieu :
    // le confondre avec « active » ferait perdre la seule fenêtre utile pour le
    // suivre.
    const { service } = build()
    const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission', startedOn: inDays(30) })
    expect(view.status).toBe('onboarding')
  })

  /**
   * Le contexte hérité du projet (addendum Stelya §9.1).
   *
   * La règle était écrite dans le docblock de `mission.entity.ts` — « le
   * contexte HÉRITÉ du projet à la conversion » — et implémentée nulle part :
   * les trois colonnes sont restées vides depuis leur migration.
   */
  it('hérite du secteur et du domaine du projet à la conversion', async () => {
    const { service, projects } = build()
    projects.findOne.mockResolvedValueOnce({
      id: 'p-1',
      workspace_id: WORKSPACE,
      application_sector_codes: ['automotive'],
      primary_domain_code: 'industrial_engineering',
    })
    const view = await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-1', label: 'Mission' })
    expect(view.application_sector_codes).toEqual(['automotive'])
    expect(view.primary_domain_code).toBe('industrial_engineering')
    expect(view.inherited_from_project_at).toBeInstanceOf(Date)
  })

  it('n’hérite de RIEN sans projet — le secteur du compte n’est pas celui de la demande', async () => {
    const { service, projects } = build()
    const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission créée à la main' })
    expect(projects.findOne).not.toHaveBeenCalled()
    expect(view.inherited_from_project_at).toBeUndefined()
  })

  /**
   * #2407.3 — RÉFUTÉ en prod le 23/09 : `GET …/field-sources` ne rendait que
   * dates + TJM, `null` partout, parce que RIEN n'écrivait la provenance du
   * CLIENT ni de l'INTITULÉ — les deux ne se posent qu'ici, à la création
   * (aucune route de mise à jour ne les touche ensuite). Un correctif de
   * LECTURE est inerte si personne n'écrit : c'est l'ÉCRIVAIN qui manquait.
   */
  it('trace la provenance du CLIENT et de l’INTITULÉ à la création, source « human »', async () => {
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission tracée' })
    const inserts = (missions.manager.query.mock.calls as [string, unknown[]][]).filter(([sql]) =>
      sql.includes('INSERT INTO record_field_audit'),
    )
    const accountInsert = inserts.find(([, params]) => params[2] === 'account_id')
    const labelInsert = inserts.find(([, params]) => params[2] === 'label')
    expect(accountInsert?.[1]).toEqual([WORKSPACE, 'm1', 'account_id', null, ACCOUNT, USER])
    expect(labelInsert?.[1]).toEqual([WORKSPACE, 'm1', 'label', null, 'Mission tracée', USER])
  })

  it('n’estampille pas une copie VIDE — « le projet n’avait rien » ≠ « on n’a pas su lire »', async () => {
    const { service, projects } = build()
    projects.findOne.mockResolvedValueOnce({
      id: 'p-2',
      workspace_id: WORKSPACE,
      application_sector_codes: [],
      primary_domain_code: null,
    })
    const view = await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-2', label: 'Mission' })
    expect(view.inherited_from_project_at).toBeUndefined()
  })

  it('n’hérite pas d’un projet d’un AUTRE espace, même si son identifiant est deviné', async () => {
    const { service, projects } = build()
    projects.findOne.mockResolvedValueOnce({
      id: 'p-3',
      workspace_id: 'w-etranger',
      application_sector_codes: ['aerospace'],
      primary_domain_code: null,
    })
    const view = await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-3', label: 'Mission' })
    expect(view.application_sector_codes).toBeUndefined()
    expect(view.inherited_from_project_at).toBeUndefined()
  })

  it('une lecture de projet en échec ne fait PAS tomber la création', async () => {
    // Une mission qui ne part pas coûte plus cher qu'une mission sans secteur,
    // qui reste saisissable ensuite.
    const { service, projects } = build()
    projects.findOne.mockRejectedValueOnce(new Error('pg down'))
    const view = await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-4', label: 'Mission' })
    expect(view.label).toBe('Mission')
    expect(view.inherited_from_project_at).toBeUndefined()
  })

  it('démarre active quand la date de début est passée', async () => {
    const { service } = build()
    const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission', startedOn: inDays(-10) })
    expect(view.status).toBe('active')
  })

  it('garde le lien vers le besoin — c’est ce qui referme la boucle du produit', async () => {
    const { service } = build()
    const view = await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Mission',
      opportunityId: '44444444-4444-4444-8444-444444444444',
    })
    expect(view.opportunity_id).toBe('44444444-4444-4444-8444-444444444444')
  })

  /**
   * LE RÔLE D'ORIGINE (`missions.need_id`, migration `1791001000001`,
   * arbitrage du 31/08/2026).
   *
   * `opportunity_id` désigne l'AFFAIRE, et une affaire porte souvent plusieurs
   * rôles : sans cette colonne, « combien de missions sont nées de ce besoin »
   * n'avait aucune réponse, et le bandeau Staffing d'une fiche besoin écrivait
   * « non mesuré » pour toujours.
   */
  it('écrit le rôle d’origine quand l’appelant le désigne', async () => {
    const { service, missions } = build()
    await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Mission',
      needId: '55555555-5555-4555-8555-555555555555',
    })
    expect(missions.create).toHaveBeenCalledWith(
      expect.objectContaining({ need_id: '55555555-5555-4555-8555-555555555555' }),
    )
  })

  /**
   * #2191.17 / #2191.18 — LE TÉLÉTRAVAIL ET LE LIEU, REPRIS DU BESOIN
   * (`project_needs.remote` / `.location`) à la MÊME condition que le rôle
   * d'origine juste au-dessus : `needId` désigné, dans l'espace de l'appelant.
   */
  it('reprend le télétravail et le lieu du besoin, quand le rôle d’origine est désigné', async () => {
    const { service, missions, needs } = build()
    needs.findOne.mockResolvedValueOnce({
      id: '55555555-5555-4555-8555-555555555555',
      workspace_id: WORKSPACE,
      remote: 'hybride',
      location: 'Paris',
    })
    await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Mission',
      needId: '55555555-5555-4555-8555-555555555555',
    })
    expect(needs.findOne).toHaveBeenCalledWith({
      where: { id: '55555555-5555-4555-8555-555555555555' },
      select: [
        'id',
        'workspace_id',
        'remote',
        'location',
        // #3547 — le forfait encadré voyage du besoin à la mission.
        'delivery_mode',
        'supervision_role',
        'client_team_size',
        'client_team_names',
      ],
    })
    expect(missions.create).toHaveBeenCalledWith(
      expect.objectContaining({ remote_preference: 'hybride', location: 'Paris' }),
    )
  })

  it('n’invente ni télétravail ni lieu — `null`, sans besoin désigné', async () => {
    const { service, missions, needs } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(needs.findOne).not.toHaveBeenCalled()
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ remote_preference: null, location: null }))
  })

  it('n’apporte pas le contexte d’un besoin d’un AUTRE espace, même deviné', async () => {
    const { service, missions, needs } = build()
    needs.findOne.mockResolvedValueOnce({
      id: 'need-etranger',
      workspace_id: 'ws-concurrent',
      remote: 'full_remote',
      location: 'Lyon',
    })
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission', needId: 'need-etranger' })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ remote_preference: null, location: null }))
  })

  /**
   * #2191.31 — DÉDOUBLONNAGE : une mission existante sur le MÊME besoin, le
   * MÊME consultant, une PÉRIODE qui chevauche.
   */
  describe('dédoublonnage — même besoin, consultant, période (#2191.31)', () => {
    const NEED = '55555555-5555-4555-8555-555555555555'
    const CONSULTANT = '66666666-6666-4666-8666-666666666666'

    it('rend la mission EXISTANTE plutôt que d’en créer une seconde', async () => {
      const { service, missions, consultants } = build()
      consultants.findOne.mockResolvedValueOnce({ id: CONSULTANT, full_name: 'Jade Aouad', photo_url: null })
      missions.manager.query.mockResolvedValueOnce([{ id: 'm-existante' }])
      missions.findOne.mockResolvedValueOnce(mission({ id: 'm-existante' }))

      const view = await service.create(USER, {
        accountId: ACCOUNT,
        label: 'Mission en double',
        needId: NEED,
        consultantId: CONSULTANT,
      })

      expect(missions.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('mission_assignments'),
        expect.arrayContaining([WORKSPACE, NEED, CONSULTANT]),
      )
      expect(view.id).toBe('m-existante')
      expect(missions.create).not.toHaveBeenCalled()
    })

    it('ne dédoublonne PAS un besoin seul — deux consultants distincts sont deux missions (headcount > 1)', async () => {
      const { service, missions } = build()
      await service.create(USER, { accountId: ACCOUNT, label: 'Mission', needId: NEED })
      expect(missions.manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('mission_assignments'),
        expect.anything(),
      )
      expect(missions.create).toHaveBeenCalled()
    })

    it('crée normalement — aucun doublon trouvé', async () => {
      const { service, missions, consultants } = build()
      consultants.findOne.mockResolvedValueOnce({ id: CONSULTANT, full_name: 'Jade Aouad', photo_url: null })
      await service.create(USER, {
        accountId: ACCOUNT,
        label: 'Mission neuve',
        needId: NEED,
        consultantId: CONSULTANT,
      })
      expect(missions.create).toHaveBeenCalled()
    })
  })

  /**
   * #2562 — LE LIEN VERS LE DEAL CRM (`missions.crm_deal_id`, migration
   * `1795660000000`), écrit au même geste de création QUE la reprise
   * propose : une mission née d'un deal PORTE ce deal dès sa naissance.
   *
   * ⚠️ Vérifié dans l'ESPACE de l'appelant, comme le compte juste au-dessus :
   * un identifiant deviné d'un AUTRE espace ne doit jamais rattacher une
   * mission au cache CRM d'un concurrent.
   */
  it('rattache le deal CRM à la création, quand l’appelant le désigne', async () => {
    const { service, missions, crmDealFacts } = build()
    crmDealFacts.findOne.mockResolvedValueOnce({ id: 'd-1', workspace_id: WORKSPACE })
    await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Renouvellement Q4',
      crmDealId: 'd-1',
    })
    expect(crmDealFacts.findOne).toHaveBeenCalledWith({ where: { id: 'd-1', workspace_id: WORKSPACE } })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ crm_deal_id: 'd-1' }))
  })

  it('écrit `null` — jamais deviné — sans deal désigné', async () => {
    const { service, missions, crmDealFacts } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(crmDealFacts.findOne).not.toHaveBeenCalled()
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ crm_deal_id: null }))
  })

  // #2561/#2562 — la reprise d'une VENTE Odoo : origine INTERNE (jamais dans le
  // corps HTTP de `POST missions`), idempotente.
  it('pose `odoo_sale_order_id` quand la mission naît d’une vente Odoo', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValueOnce(null)
    await service.create(USER, { accountId: ACCOUNT, label: 'Data (S00042)' }, { odooSaleOrderId: 42 })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ odoo_sale_order_id: 42 }))
  })

  it('rend la mission EXISTANTE au second passage sur la même vente — aucun doublon', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValueOnce({ id: 'm-deja', workspace_id: WORKSPACE, odoo_sale_order_id: 42 })
    await service
      .create(USER, { accountId: ACCOUNT, label: 'Data (S00042)' }, { odooSaleOrderId: 42 })
      .catch(() => null)
    expect(missions.findOne).toHaveBeenCalledWith({ where: { workspace_id: WORKSPACE, odoo_sale_order_id: 42 } })
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('écrit `null` sans origine Odoo', async () => {
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ odoo_sale_order_id: null }))
  })

  it('refuse un `crmDealId` introuvable dans l’espace — jamais un rattachement au cache d’un AUTRE espace', async () => {
    const { service, crmDealFacts } = build()
    crmDealFacts.findOne.mockResolvedValueOnce(null)
    await expect(
      service.create(USER, { accountId: ACCOUNT, label: 'Mission', crmDealId: 'd-etranger' }),
    ).rejects.toThrow(NotFoundException)
  })

  /**
   * #2339.7 (épopée #2795) — LE POSITIONNEMENT dont cette mission est la
   * CONVERSION (`missions.submission_id`, migration `1796321999852`). Même
   * garde que le deal CRM juste au-dessus : vérifié dans L'ESPACE de
   * l'appelant, jamais un rattachement deviné au positionnement d'un
   * concurrent.
   */
  it('rattache le positionnement retenu à la création, quand l’appelant le désigne', async () => {
    const { service, missions, submissions } = build()
    submissions.findOne.mockResolvedValueOnce({ id: 's-1', workspace_id: WORKSPACE })
    await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Conversion du positionnement',
      submissionId: 's-1',
    })
    expect(submissions.findOne).toHaveBeenCalledWith({
      where: { id: 's-1', workspace_id: WORKSPACE },
      // #4191 G4 : le positionnement porte aussi le coût journalier reporté sur la mission.
      select: ['id', 'consultant_id', 'daily_cost_cents'],
    })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ submission_id: 's-1' }))
  })

  it('écrit `null` — jamais deviné — sans positionnement désigné', async () => {
    const { service, missions, submissions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(submissions.findOne).not.toHaveBeenCalled()
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ submission_id: null }))
  })

  it('refuse un `submissionId` introuvable dans l’espace — jamais un rattachement au positionnement d’un AUTRE espace', async () => {
    const { service, submissions } = build()
    submissions.findOne.mockResolvedValueOnce(null)
    await expect(
      service.create(USER, { accountId: ACCOUNT, label: 'Mission', submissionId: 's-etranger' }),
    ).rejects.toThrow(NotFoundException)
  })

  /**
   * #2320.1/#2339.7 (épopées #2967/#2795) — la mission entre dans le journal
   * APPEND-ONLY de la chaîne commerciale (`commercial_transitions`), au même
   * titre que le besoin (`ProjectPipelineService.changeNeedStatus`). `proof`
   * nomme le positionnement retenu quand il est connu — c'est la PREUVE que
   * ce point du chantier nommait absente.
   */
  it('écrit la mission au journal de la chaîne commerciale, avec la preuve du positionnement', async () => {
    const { service, commercialTransitions, submissions } = build()
    submissions.findOne.mockResolvedValueOnce({ id: 's-1', workspace_id: WORKSPACE })
    const view = await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Conversion du positionnement',
      submissionId: 's-1',
    })
    expect(commercialTransitions.record).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      subjectType: 'mission',
      subjectId: view.id,
      fromState: null,
      toState: view.status,
      actorId: USER,
      proof: 'submission:s-1',
    })
  })

  it('journalise la mission sans preuve — jamais devinée — sans positionnement désigné', async () => {
    const { service, commercialTransitions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ proof: null }))
  })

  /**
   * #2560.6 — DÉCISION LOUIS 18/09/2026 : le client citait « le consultant »
   * dans son retour, mais le critère de recette de #2560 ne portait que sur
   * compte/rôle/dates/TJM/jours — l'affectation restait hors de ce que la
   * création d'une mission pouvait écrire, alors que l'objet existe déjà
   * (`MissionAssignment`, `staffing.service.ts`). `records:write` reste le
   * SEUL droit gardien : aucune route neuve, aucun droit élargi — la création
   * délègue l'écriture de l'affectation à `StaffingService.assign`, qui reste
   * l'unique écrivain de `mission_assignments`.
   */
  it('affecte le consultant désigné à la création, et le rend dans la fiche', async () => {
    const { service, missions, consultants, staffing } = build()
    consultants.findOne.mockResolvedValueOnce({
      id: 'c-1',
      workspace_id: WORKSPACE,
      full_name: 'Awa Diop',
      photo_url: null,
    })
    // #2407.3 — `create` écrit désormais aussi la provenance (client,
    // intitulé) via `manager.query` AVANT cette lecture : un mock filtré par
    // le texte de la requête reste juste quel que soit l'ordre des appels,
    // là où un `mockResolvedValueOnce` supposait que celui-ci soit le PREMIER.
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('mission_assignments')) {
        return [{ mission_id: 'm1', consultant_id: 'c-1', full_name: 'Awa Diop', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    const view = await service.create(USER, {
      accountId: ACCOUNT,
      label: 'Mission avec consultant',
      startedOn: '2026-06-01',
      consultantId: 'c-1',
    })
    expect(consultants.findOne).toHaveBeenCalledWith({
      where: { id: 'c-1', workspace_id: WORKSPACE },
      select: ['id', 'full_name', 'photo_url'],
    })
    expect(staffing.assign).toHaveBeenCalledWith(USER, 'm1', {
      consultantId: 'c-1',
      loadPercent: 100,
      startsOn: '2026-06-01',
      endsOn: null,
    })
    expect(view.assignees).toEqual([{ id: 'c-1', fullName: 'Awa Diop', photoUrl: null, loadPercent: 100 }])
  })

  it('n’affecte ni ne consulte personne sans consultant désigné — le cas ordinaire, inchangé', async () => {
    const { service, consultants, staffing } = build()
    const view = await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(consultants.findOne).not.toHaveBeenCalled()
    expect(staffing.assign).not.toHaveBeenCalled()
    // Comportement PRÉ-EXISTANT, inchangé par ce lot : `assignees` reste
    // `null` par défaut à la création (voir `MissionView.assignees`) — ce
    // point ne touche que le CAS où un consultant est désigné.
    expect(view.assignees).toBeNull()
  })

  it('refuse un consultantId qui n’appartient pas à l’espace — AVANT d’écrire la mission (GA-11/GA-12)', async () => {
    const { service, missions, consultants, staffing } = build()
    consultants.findOne.mockResolvedValueOnce(null)
    await expect(
      service.create(USER, { accountId: ACCOUNT, label: 'Mission', consultantId: 'c-etranger' }),
    ).rejects.toThrow(BadRequestException)
    expect(missions.save).not.toHaveBeenCalled()
    expect(staffing.assign).not.toHaveBeenCalled()
  })

  it('écrit `null` — jamais un rôle deviné — quand personne ne l’a désigné', async () => {
    // `null` veut dire « rôle d'origine inconnu », pas « aucun rôle » : c'est
    // cette différence que la fiche du besoin rend, et un repli l'effacerait.
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(missions.create).toHaveBeenCalledWith(expect.objectContaining({ need_id: null }))
  })

  /**
   * L'idempotence de la conversion projet → mission (BEL-FIX-001, dossier du 26/08).
   *
   * Le chemin est devenu VIVANT en août : `create_mission` est le seul effet de
   * déplacement exécuté par le serveur, et il est PRÉ-COCHÉ à l'arrivée sur
   * `won`. Tant qu'il était mort, l'absence de contrainte d'unicité entre un
   * projet et sa mission était théorique. Elle ne l'est plus.
   *
   * Et le garde-fou existant ne couvre pas le cas : `warnsAboutMission` ne vaut
   * `true` qu'en SORTIE de `won` (`stage-move.ts`). Un `perdu → gagné`, un
   * `négociation → gagné` après un aller-retour, ou simplement deux clics,
   * repassent par le même chemin avec la case cochée — et créent une seconde
   * mission. Une mission ne se supprime pas : le doublon serait définitif, avec
   * son relevé, sa facturation et sa marge en double.
   */
  it('ne crée pas une SECONDE mission sur le même projet — elle rend la première', async () => {
    const { service, missions } = build()
    const existing = mission({ id: 'deja-la', opportunity_id: 'p-9', label: 'Mission déjà créée' })
    missions.findOne.mockResolvedValue(existing)

    const view = await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-9', label: 'Deuxième clic' })

    expect(view.id).toBe('deja-la')
    // Le libellé rendu est celui de la mission EXISTANTE : on ne réécrit pas
    // une mission vivante avec ce que le second appel croyait créer.
    expect(view.label).toBe('Mission déjà créée')
    expect(missions.save).not.toHaveBeenCalled()
  })

  it('cherche le doublon dans SON espace, et sur le projet demandé', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(null)

    await service.create(USER, { accountId: ACCOUNT, opportunityId: 'p-10', label: 'Mission' })

    // Sans le `workspace_id`, un identifiant de projet deviné rendrait la
    // mission d'un autre espace — et le second appel se croirait idempotent.
    expect(missions.findOne).toHaveBeenCalledWith({
      where: { workspace_id: WORKSPACE, opportunity_id: 'p-10', submission_id: IsNull() },
    })
  })

  it('ne cherche AUCUN doublon quand la mission ne vient pas d’un projet', async () => {
    // Deux missions créées à la main sur le même compte sont légitimes — c'est
    // le cas ordinaire d'une ESN qui place deux consultants. L'unicité porte sur
    // le PROJET, jamais sur le compte.
    const { service, missions } = build()
    await service.create(USER, { accountId: ACCOUNT, label: 'Mission à la main' })
    expect(missions.findOne).not.toHaveBeenCalled()
    expect(missions.save).toHaveBeenCalled()
  })
})

describe('lecture des missions', () => {
  it('calcule fenêtre, marge et risques — rien n’est stocké', async () => {
    // Une fenêtre « J-30 » écrite en base serait fausse le lendemain, et un
    // risque figé survivrait à sa résolution.
    const { service, missions, terms } = build()
    missions.find.mockResolvedValue([mission({ ends_on: inDays(20), daily_rate: 600 })])
    terms.find.mockResolvedValue([{ mission_id: 'm1', loaded_daily_cost_cents: '42000' }])
    const { missions: views } = await service.list(USER, { canReadFinance: true })
    expect(views[0].renewal).toBe('j30')
    expect(views[0].marginPercent).toBe(30)
    expect(views[0].risks).toContain('renewal_not_started')
  })

  it('ne montre pas de marge quand le coût manque', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600 })])
    const { missions: views } = await service.list(USER, { canReadFinance: true })
    expect(views[0].marginPercent).toBeNull()
    expect(views[0].risks).toContain('margin_unknown')
  })

  /**
   * #2408.8 — l'échéance TRÈS proche (ou dépassée) porte désormais SON PROPRE
   * badge, en plus de « renouvellement non engagé » : les deux répondent à des
   * questions différentes.
   */
  it('signale une échéance imminente EN PLUS du renouvellement non engagé', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ ends_on: inDays(3) })])
    const { missions: views } = await service.list(USER, { canReadFinance: true })
    expect(views[0].risks).toContain('ending_soon')
    expect(views[0].risks).toContain('renewal_not_started')
  })

  /**
   * #2408.18 — un bon de commande exigé (`mission_commercial_terms.
   * requires_po`) et jamais renseigné (`po_number` vide) remonte désormais
   * comme un risque de la table `/missions`, avant qu'une facture ne coince.
   */
  describe('le bon de commande exigé et absent remonte comme un risque', () => {
    it('signale `missing_po` quand un PO est exigé et absent', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', requires_po: true, po_number: null }])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].risks).toContain('missing_po')
    })

    it('se tait quand le PO exigé est renseigné', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', requires_po: true, po_number: 'PO-042' }])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].risks).not.toContain('missing_po')
    })

    it('n’affirme jamais `missing_po` sans `finance:read` — silence, pas un badge inventé', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', requires_po: true, po_number: null }])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].risks).not.toContain('missing_po')
      expect(terms.find).not.toHaveBeenCalled()
    })
  })

  /**
   * #2411.6 (reste, épopée #2881) — le mois COURANT de facturation `blocked`
   * (MÊME calcul que l'onglet Facturation, `InvoiceReadinessService.list`)
   * remonte désormais comme un risque de la table `/missions`, au même titre
   * que `missing_po` juste au-dessus.
   */
  describe('la facturation bloquée le mois courant remonte comme un risque', () => {
    it('signale `invoice_blocked` quand l’onglet Facturation rend cette mission bloquée', async () => {
      const { service, missions, invoiceReadiness } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      ;(invoiceReadiness.list as jest.Mock).mockResolvedValue({
        items: [{ missionId: 'm1', state: 'blocked' }],
        summary: {},
        month: '2026-01',
        canReadFinance: true,
      })
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].risks).toContain('invoice_blocked')
    })

    it('se tait quand aucune mission n’est bloquée', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].risks).not.toContain('invoice_blocked')
    })

    it('n’affirme jamais `invoice_blocked` sans `finance:read` — silence, pas un badge inventé', async () => {
      const { service, missions, invoiceReadiness } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      ;(invoiceReadiness.list as jest.Mock).mockResolvedValue({
        items: [{ missionId: 'm1', state: 'blocked' }],
        summary: {},
        month: '2026-01',
        canReadFinance: true,
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].risks).not.toContain('invoice_blocked')
      expect(invoiceReadiness.list).not.toHaveBeenCalled()
    })
  })

  /**
   * #2408.16 / #2408.33 / #2408.40 — les exceptions L15 remontent par
   * `GET /delivery/missions` : la satisfaction déclarée (champ ET risque), la
   * société juridique résolue en nom. Un silence (rien de déclaré) se lit
   * « non mesuré », jamais un niveau.
   */
  describe('les exceptions L15 remontent dans la liste', () => {
    it('porte la satisfaction déclarée et allume `low_satisfaction`', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), legal_entity_id: 'le-1' })])
      ;(missions.manager.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('FROM mission_feedback'))
          return [
            { mission_id: 'm1', rail: 'client', level: 'low', private: false, created_at: '2026-10-20T09:00:00Z' },
          ]
        if (sql.includes('FROM legal_entities')) return [{ id: 'le-1', name: 'Bellum Conseil SAS' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].satisfaction).toEqual({ client: 'low', consultant: null })
      expect(views[0].risks).toContain('low_satisfaction')
      expect(views[0].legalEntityName).toBe('Bellum Conseil SAS')
    })

    it('rien de déclaré : « non mesuré » sur les deux rails, aucune exception', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].satisfaction).toEqual({ client: null, consultant: null })
      expect(views[0].risks).not.toContain('low_satisfaction')
      expect(views[0].risks).not.toContain('relationship_threatened')
    })
  })

  /**
   * #2408.52, #2408.62 — le CANAL de staffing (`mission_commercial_terms.
   * channel`) remonte sur `/missions`, même table et même porte que le PO
   * juste au-dessus : sans lui, ni le filtre « partenaire » ni la vue
   * enregistrée « Partenaires/rang 2 » ne peuvent se poser une question sur
   * un canal qu'elles n'ont jamais reçu.
   */
  describe('le canal de staffing remonte sur /missions (#2408.52, #2408.62)', () => {
    it('remonte `channel` avec `finance:read`', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', channel: 'partner' }])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].channel).toBe('partner')
    })

    it('reste absent sans `finance:read` — jamais un canal deviné', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', channel: 'partner' }])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].channel).toBeUndefined()
      expect(terms.find).not.toHaveBeenCalled()
    })

    it('reste absent quand aucune ligne de conditions commerciales n’existe — jamais "unknown" deviné', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].channel).toBeUndefined()
    })
  })

  /**
   * #2408.53 — LA DEVISE (`mission_commercial_terms.currency`) remonte sur
   * /missions, même table et même porte que le canal juste au-dessus : sans
   * elle, le filtre « Devise » ne peut se poser aucune question sur une
   * valeur qu'il n'a jamais reçue. Contrairement au canal, `currency` peut
   * être `null` MÊME quand la ligne existe (non renseignée, colonne
   * nullable) : `undefined` (pas de droit, ou pas de ligne du tout) et
   * `null` (ligne lue, devise non renseignée) ne sont donc pas confondus.
   */
  describe('la devise remonte sur /missions (#2408.53)', () => {
    it('remonte `currency` avec `finance:read`', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', currency: 'CHF' }])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].currency).toBe('CHF')
    })

    it('reste absent sans `finance:read` — jamais une devise devinée', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', currency: 'CHF' }])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].currency).toBeUndefined()
      expect(terms.find).not.toHaveBeenCalled()
    })

    it('reste absent quand aucune ligne de conditions commerciales n’existe', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].currency).toBeUndefined()
    })

    it('reste `null` (pas devinée) quand la ligne existe mais la devise n’est pas renseignée', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200) })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', currency: null }])
      const { missions: views } = await service.list(USER, { canReadFinance: true })
      expect(views[0].currency).toBeNull()
    })
  })

  // #2195.13 — la colonne « Owner » était refusée faute de résolution GROUPÉE :
  // `staffing.service.ts` savait déjà résoudre un `owner_id` unique
  // (une mission à la fois), mais la liste en demande une version par LOT, sur
  // le modèle d'`accountsOf` — une requête, pas N.
  describe('le porteur (owner_id) se résout en une seule requête groupée', () => {
    it('rend le nom du porteur, prénom + nom', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ owner_id: 'owner-1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('profiles')) {
          return [{ user_id: 'owner-1', first_name: 'Camille', last_name: 'Perrin', email: 'camille@bellum.ai' }]
        }
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].ownerName).toBe('Camille Perrin')
    })

    it('retombe sur l’email quand le nom manque, jamais une chaîne vide', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ owner_id: 'owner-1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('profiles'))
          return [{ user_id: 'owner-1', first_name: null, last_name: null, email: 'a@b.io' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].ownerName).toBe('a@b.io')
    })

    it('rend `null` — jamais un UUID — quand personne ne porte la mission ou que la fiche est illisible', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ owner_id: null })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].ownerName).toBeNull()
    })

    it('une lecture en échec rend `null`, jamais une exception qui casserait toute la liste', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ owner_id: 'owner-1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('profiles')) throw new Error('relation "profiles" indisponible')
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].ownerName).toBeNull()
    })
  })

  // #2411.11 (reste, épopée #2881) — « Marquer comme traité » / « Ré-ouvrir »
  // un risque déjà CALCULÉ, PERSISTÉ tant que la mission n'a pas bougé depuis.
  describe('setMissionRiskResolution — résoudre/ré-ouvrir un risque (#2411.11)', () => {
    it('refuse un risque inconnu — jamais un pipe de route qui dupliquerait le contrat', async () => {
      const { service } = build()
      await expect(service.setMissionRiskResolution(USER, 'm1', 'not_a_real_risk', { resolved: true })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('refuse une mission hors de l’espace de travail de l’appelant', async () => {
      const { service, missions } = build()
      missions.findOne.mockResolvedValue(null)
      await expect(service.setMissionRiskResolution(USER, 'm1', 'missing_owner', { resolved: true })).rejects.toThrow(
        NotFoundException,
      )
    })

    it('écrit `resolved_at`/`resolved_by` sur `resolved: true`, l’instantané de `updated_at` avec', async () => {
      const now = new Date('2026-09-26T10:00:00Z')
      const missionUpdatedAt = new Date('2026-09-20T00:00:00Z')
      const { service, missions, riskResolutions } = build()
      missions.findOne.mockResolvedValue(mission({ id: 'm1', updated_at: missionUpdatedAt }))
      await service.setMissionRiskResolution(USER, 'm1', 'missing_owner', { resolved: true }, now)
      expect(riskResolutions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE,
          mission_id: 'm1',
          risk: 'missing_owner',
          resolved_at: now,
          resolved_by: USER,
          mission_updated_at_snapshot: missionUpdatedAt,
        }),
        ['mission_id', 'risk'],
      )
    })

    it('ré-ouvre en remettant `resolved_at`/`resolved_by` à `null` sur `resolved: false`', async () => {
      const { service, missions, riskResolutions } = build()
      missions.findOne.mockResolvedValue(mission({ id: 'm1' }))
      await service.setMissionRiskResolution(USER, 'm1', 'missing_owner', { resolved: false })
      expect(riskResolutions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ resolved_at: null, resolved_by: null }),
        ['mission_id', 'risk'],
      )
    })
  })

  describe('la lecture des missions filtre les risques déjà résolus (#2411.11)', () => {
    it('n’affiche plus un risque marqué « traité », tant que la mission n’a pas bougé depuis', async () => {
      const updatedAt = new Date('2026-09-20T00:00:00Z')
      const { service, missions, riskResolutions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', owner_id: null, updated_at: updatedAt })])
      riskResolutions.find.mockResolvedValue([
        {
          mission_id: 'm1',
          risk: 'missing_owner',
          resolved_at: new Date('2026-09-21T00:00:00Z'),
          mission_updated_at_snapshot: updatedAt,
        },
      ])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].risks).not.toContain('missing_owner')
    })

    it('un CHANGEMENT MATÉRIEL (la mission a bougé depuis le geste) referme la fenêtre — le risque redevient visible', async () => {
      const snapshotAt = new Date('2026-09-20T00:00:00Z')
      const touchedSince = new Date('2026-09-22T00:00:00Z')
      const { service, missions, riskResolutions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', owner_id: null, updated_at: touchedSince })])
      riskResolutions.find.mockResolvedValue([
        {
          mission_id: 'm1',
          risk: 'missing_owner',
          resolved_at: new Date('2026-09-21T00:00:00Z'),
          mission_updated_at_snapshot: snapshotAt,
        },
      ])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].risks).toContain('missing_owner')
    })

    it('une résolution RÉ-OUVERTE (`resolved_at: null`) ne masque plus rien', async () => {
      const { service, missions, riskResolutions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', owner_id: null })])
      // #2411.11 — l'index partiel de la migration exclut déjà ces lignes en
      // base ; le mock reproduit ce même filtre pour ne pas fausser le test.
      riskResolutions.find.mockResolvedValue([])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].risks).toContain('missing_owner')
    })
  })

  // #2195.12 — la colonne « Manager » du tableau des missions n'avait AUCUNE
  // résolution : `ConsultantsService.managerNamesOf` sait déjà nommer le
  // manager d'UN consultant (sa fiche), mais la liste des missions demande une
  // résolution à trois sauts par LOT — mission → mission_assignments →
  // consultants.manager_id → consultants.full_name — sur le modèle
  // d'`ownersOf` juste au-dessus.
  describe('le manager (des consultants affectés) se résout en une seule requête groupée', () => {
    it('rend le nom du manager quand une seule personne est affectée', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('manager_name')) return [{ mission_id: 'm1', manager_name: 'Paul Martin' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].managerName).toBe('Paul Martin')
    })

    it('joint les managers DISTINCTS quand plusieurs consultants affectés en ont un différent', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('manager_name'))
          return [
            { mission_id: 'm1', manager_name: 'Paul Martin' },
            { mission_id: 'm1', manager_name: 'Awa Diallo' },
          ]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].managerName).toBe('Awa Diallo, Paul Martin')
    })

    it('rend `null` — jamais deviné — quand aucun consultant affecté n’a de manager', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1' })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].managerName).toBeNull()
    })

    it('une lecture en échec rend `null`, jamais une exception qui casserait toute la liste', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('manager_name')) throw new Error('relation "consultants" indisponible')
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].managerName).toBeNull()
    })
  })

  // #2953 (#2193.6) — le HERO du dossier d'une mission (`MissionDossierPage.tsx`)
  // veut le manager client, et `GET /delivery/missions?id=…` — la lecture que le
  // dossier utilise — ne le rendait pas : la colonne, l'écran d'affectation et le
  // résumé du compte existaient déjà (#2836), seule la fiche d'UNE mission ne le
  // lisait pas encore.
  describe('le manager client (client_manager_contact_id) se résout en une seule requête groupée', () => {
    it('rend le nom du manager client désigné', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT, client_manager_contact_id: 'c1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contacts')) return [{ id: 'c1', account_id: ACCOUNT, full_name: 'Nadia Kessler' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].clientManagerName).toBe('Nadia Kessler')
    })

    // #2193.59 — l'ID voyage AVEC le nom : sans lui, aucun lien vers la fiche
    // du contact (`/contacts/$id`) n'est possible côté écran.
    it('rend aussi l’id du contact — #2193.59, pour un lien vers sa fiche', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT, client_manager_contact_id: 'c1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contacts')) return [{ id: 'c1', account_id: ACCOUNT, full_name: 'Nadia Kessler' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].clientManagerContactId).toBe('c1')
    })

    it('rend `null` — jamais un UUID — quand aucun manager client n’est désigné', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', client_manager_contact_id: null })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].clientManagerName).toBeNull()
      expect(views[0].clientManagerContactId).toBeNull()
    })

    it('rend `null` quand le contact désigné appartient à un AUTRE compte que la mission', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT, client_manager_contact_id: 'c1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contacts'))
          return [{ id: 'c1', account_id: 'un-autre-compte', full_name: 'Nadia Kessler' }]
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].clientManagerName).toBeNull()
      // #2193.59 — jamais un id sans le nom qui le confirme : le garde-fou de
      // compte protège le lien tout autant que le nom.
      expect(views[0].clientManagerContactId).toBeNull()
    })

    it('une lecture en échec rend `null`, jamais une exception qui casserait toute la liste', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1', client_manager_contact_id: 'c1' })])
      missions.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contacts')) throw new Error('relation "contacts" indisponible')
        return []
      })
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].clientManagerName).toBeNull()
      expect(views[0].clientManagerContactId).toBeNull()
    })
  })

  // #2930 (points couverts #2191.38) — le lien opportunité/positionnement
  // (`opportunity_id`) sortait en UUID nu et était refusé à l'écran
  // (`MissionDetailTabs.tsx`) faute de résolution GROUPÉE — même patron
  // qu'`ownersOf`/`managersOf` juste au-dessus, sur `opportunities.label`.
  describe('le besoin d’origine (opportunity_id) se résout en une seule requête groupée', () => {
    it('rend le libellé du besoin', async () => {
      const { service, missions, projects } = build()
      missions.find.mockResolvedValue([mission({ opportunity_id: 'op-1' })])
      projects.find.mockResolvedValue([{ id: 'op-1', label: 'Refonte du SI paiement' }])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].opportunityLabel).toBe('Refonte du SI paiement')
    })

    it('rend `null` — jamais un UUID — quand aucun besoin n’est lié', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ opportunity_id: null })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].opportunityLabel).toBeNull()
    })

    it('rend `null` quand le besoin lié est introuvable', async () => {
      const { service, missions, projects } = build()
      missions.find.mockResolvedValue([mission({ opportunity_id: 'op-1' })])
      projects.find.mockResolvedValue([])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].opportunityLabel).toBeNull()
    })

    it('une lecture en échec rend `null`, jamais une exception qui casserait toute la liste', async () => {
      const { service, missions, projects } = build()
      missions.find.mockResolvedValue([mission({ opportunity_id: 'op-1' })])
      projects.find.mockRejectedValue(new Error('relation "opportunities" indisponible'))
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].opportunityLabel).toBeNull()
    })
  })

  // #2953 (#2193.48) — même défaut qu'`opportunity_id` ci-dessus, sur le
  // POSITIONNEMENT d'origine (`submission_id`) cette fois : sortait en UUID
  // nu, aucune page ne pouvait l'ouvrir (route absente, épopée #2973/#2953).
  describe('le positionnement d’origine (submission_id) se résout en une seule requête groupée', () => {
    it('rend "consultant → besoin" quand les deux se résolvent', async () => {
      const { service, missions, submissions, consultants, projects } = build()
      missions.find.mockResolvedValue([mission({ submission_id: 'sub-1' })])
      submissions.find.mockResolvedValue([{ id: 'sub-1', consultant_id: 'c-1', project_id: 'op-1' }])
      consultants.find.mockResolvedValue([{ id: 'c-1', full_name: 'Awa Diop' }])
      projects.find.mockResolvedValue([{ id: 'op-1', label: 'Refonte du SI paiement' }])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].submissionLabel).toBe('Awa Diop → Refonte du SI paiement')
    })

    it('rend `null` — jamais un UUID — quand aucun positionnement n’est lié', async () => {
      const { service, missions } = build()
      missions.find.mockResolvedValue([mission({ submission_id: null })])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].submissionLabel).toBeNull()
    })

    it('rend `null` quand le positionnement lié est introuvable', async () => {
      const { service, missions, submissions } = build()
      missions.find.mockResolvedValue([mission({ submission_id: 'sub-1' })])
      submissions.find.mockResolvedValue([])
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].submissionLabel).toBeNull()
    })

    it('une lecture en échec rend `null`, jamais une exception qui casserait toute la liste', async () => {
      const { service, missions, submissions } = build()
      missions.find.mockResolvedValue([mission({ submission_id: 'sub-1' })])
      submissions.find.mockRejectedValue(new Error('relation "submissions" indisponible'))
      const { missions: views } = await service.list(USER, { canReadFinance: false })
      expect(views[0].submissionLabel).toBeNull()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * D43 (28/08/2026) — les TERMES COMMERCIAUX font foi pour le coût
   * ─────────────────────────────────────────────────────────────────────────
   * `missions.daily_cost` n'est écrite par AUCUN écran, aucun semis et aucun
   * appelant interne. Tant que la liste la lisait, elle disait « coût chargé
   * non renseigné » sur des missions dont la FICHE affichait une marge — deux
   * écrans en contradiction sur la même mission.
   *
   * Ces trois tests sont ceux qui empêchent la colonne morte de revenir : ils
   * la posent à une valeur qui SE VERRAIT si elle était encore lue.
   */
  describe('la marge lit les conditions commerciales, jamais missions.daily_cost', () => {
    it('lit le coût CHARGÉ des conditions, même quand la colonne morte dit autre chose', async () => {
      const { service, missions, terms } = build()
      // La colonne morte donnerait 30 %. Les conditions disent 20 %.
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600, daily_cost: 420 })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', loaded_daily_cost_cents: '48000' }])

      const { missions: views } = await service.list(USER, { canReadFinance: true })

      expect(views[0].marginPercent).toBe(20)
    })

    it('ne ressuscite PAS la colonne morte quand aucune condition n’est saisie', async () => {
      // Le cas de toute la base : `daily_cost` renseignée par un appel d'API
      // brut, aucune ligne de conditions. « Non mesurée » est la vérité.
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600, daily_cost: 420 })])
      terms.find.mockResolvedValue([])

      const { missions: views } = await service.list(USER, { canReadFinance: true })

      expect(views[0].marginPercent).toBeNull()
      expect(views[0].risks).toContain('margin_unknown')
    })

    it('rend le MÊME nombre que la fiche — à la décimale près', async () => {
      // La fiche affiche `missionMargin(...).percent`. Deux écrans qui
      // arrondissent chacun de leur côté disent « 32 % » et « 31,8 % » de la
      // même mission, et plus personne ne croit ni l'un ni l'autre.
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600 })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', loaded_daily_cost_cents: '40900' }])

      const { missions: views } = await service.list(USER, { canReadFinance: true })

      expect(views[0].marginPercent).toBe(31.8)
    })

    it('un coût illisible vaut « on ne sait pas », jamais zéro', async () => {
      // `bigint` revient en CHAÎNE depuis pg. Une chaîne vide passée à
      // `Number()` vaut 0 — soit « 100 % de marge », le genre de chiffre qu'on
      // croit une fois avant de ne plus jamais croire l'écran.
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600 })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', loaded_daily_cost_cents: '' }])

      const { missions: views } = await service.list(USER, { canReadFinance: true })

      expect(views[0].marginPercent).toBeNull()
    })

    it('une lecture de conditions en échec ne dit pas « marge nulle » — ni ne fait tomber la liste', async () => {
      // « Cassé » et « non mesurable » se ressemblent : le repli honnête est
      // `null`, jamais 0, et surtout jamais une liste qui ne s'affiche pas.
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600, daily_cost: 420 })])
      terms.find.mockRejectedValue(new Error('pg down'))

      const { missions: views } = await service.list(USER, { canReadFinance: true })

      expect(views).toHaveLength(1)
      expect(views[0].marginPercent).toBeNull()
    })

    it('n’expose toujours AUCUNE marge sans finance:read — présente, `null`, jamais un zéro', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ ends_on: inDays(200), daily_rate: 600 })])
      terms.find.mockResolvedValue([{ mission_id: 'm1', loaded_daily_cost_cents: '48000' }])

      const { missions: views } = await service.list(USER, { canReadFinance: false })

      // D45 · 26/08 : le champ n'est plus RETIRÉ, il est mis à `null` — présent
      // et vide. Ce que ce test garde est inchangé : la marge ne sort pas, et
      // surtout elle ne sort pas à zéro, qui se lirait comme une marge nulle.
      expect(views[0]).toHaveProperty('marginPercent')
      expect(views[0]?.marginPercent).toBeNull()
      expect(views[0]?.marginPercent).not.toBe(0)
    })

    it('ne lit les conditions QUE des missions affichées — une requête, pas N', async () => {
      const { service, missions, terms } = build()
      missions.find.mockResolvedValue([mission({ id: 'm1' }), mission({ id: 'm2' })])

      await service.list(USER, { canReadFinance: true })

      expect(terms.find).toHaveBeenCalledTimes(1)
      expect(terms.find).toHaveBeenCalledWith({
        where: { mission_id: In(['m1', 'm2']) },
        select: [
          'mission_id',
          'loaded_daily_cost_cents',
          'requires_po',
          'po_number',
          'notice_days',
          'channel',
          'currency',
        ],
      })
    })
  })

  it('remonte les missions SANS date de fin dans ce qui demande une action', async () => {
    // Elles ne seraient jamais relancées à temps : c'est exactement le trou que
    // le module comble.
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ ends_on: null }), mission({ id: 'm2', ends_on: inDays(300) })])
    const { missions: views } = await service.renewalsToAct(USER)
    expect(views).toHaveLength(1)
    expect(views[0].renewal).toBe('unknown')
  })

  /**
   * #2195.50 — DÉCISION LOUIS 20/09/2026 : LA FENÊTRE « AU-DELÀ DE 60 JOURS ».
   *
   * ⚠️ Le défaut reste `false` pour les DEUX autres appelants de cette méthode
   * (le pont copilote, l'ADV) : une mission à 300 jours ne demande AUCUNE action
   * maintenant, et l'inclure là-bas ferait annoncer une urgence qui n'existe
   * pas. Le test juste au-dessus le prouve déjà en creux — il reste vert
   * SANS ce lot. Seul `GET /delivery/renewals` (l'écran) passe `true` : c'est
   * lui qui doit désormais SERVIR les échéances lointaines, pour que l'ordre
   * « Sans date de fin AVANT les lointaines » ait un objet à ordonner.
   */
  it('#2195.50 — `includeFar` ouvre la fenêtre lointaine, et SEULEMENT sur demande', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ ends_on: null }), mission({ id: 'm2', ends_on: inDays(300) })])

    const withoutFar = await service.renewalsToAct(USER)
    expect(withoutFar.missions).toHaveLength(1)
    expect(withoutFar.missions[0]?.renewal).toBe('unknown')

    const withFar = await service.renewalsToAct(USER, undefined, undefined, false, true)
    expect(withFar.missions).toHaveLength(2)
    expect(withFar.missions.map(view => view.renewal).sort()).toEqual(['far', 'unknown'])
  })
})

describe('carte d’expansion', () => {
  it('classe en tête les comptes où une mission se termine bientôt', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([
      mission({ id: 'm1', account_id: 'acc-calme', ends_on: inDays(300) }),
      mission({ id: 'm2', account_id: 'acc-chaud', ends_on: inDays(20) }),
    ])
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].accountId).toBe('acc-chaud')
    expect(signals[0].endingSoon).toBe(1)
  })

  it('explique toujours POURQUOI maintenant', async () => {
    // Un score sans phrase n'a jamais fait décrocher un téléphone.
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission()])
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].reason.length).toBeGreaterThan(20)
  })

  /**
   * ⚠️ LE DÉFAUT QUI RENDAIT CETTE ROUTE INAFFICHABLE.
   *
   * `expertsOnSite` valait `accountMissions.length` — le MÊME nombre que
   * `activeMissions`, sans aucune jointure derrière. Les afficher côte à côte
   * montrait deux fois le même chiffre sous deux noms, ce qui est pire que de
   * ne rien montrer : c'est la raison écrite noir sur blanc dans
   * `AccountsBillingCounters.tsx` pour laquelle deux des quatre compteurs du
   * portefeuille n'existent pas.
   *
   * Un consultant sur DEUX missions du même compte est UN expert sur place.
   */
  it('compte les experts d’après les affectations, pas d’après les missions', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([
      mission({ id: 'm1', account_id: 'acc-1' }),
      mission({ id: 'm2', account_id: 'acc-1' }),
    ])
    missions.manager.query.mockResolvedValue([{ account_id: 'acc-1', experts: '1' }])
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].activeMissions).toBe(2)
    expect(signals[0].expertsOnSite).toBe(1)
  })

  it('ne promet pas un expert en poste quand aucune affectation n’est enregistrée', async () => {
    // La phrase de repli AFFIRMAIT « un expert sur place voit ce qu'aucune
    // recherche web ne verra ». Sur un compte sans affectation, elle promet un
    // interlocuteur terrain que personne ne pourra appeler.
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: 'acc-1' })])
    // `manager.query` rend `[]` par défaut : aucune affectation en cours.
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].expertsOnSite).toBe(0)
    expect(signals[0].reason).not.toContain('expert')
    expect(signals[0].reason.length).toBeGreaterThan(20)
  })

  it('nomme les experts en poste dans la phrase quand il y en a', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: 'acc-1', ends_on: inDays(300) })])
    missions.manager.query.mockResolvedValue([{ account_id: 'acc-1', experts: '3' }])
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].reason).toContain('3')
  })

  /**
   * Une table illisible doit faire échouer la LECTURE, jamais rendre « 0 ».
   *
   * Même parti pris que `PropagationService` : « cassé » et « non mesurable »
   * se ressemblent trop pour qu'on les confonde. `expertsOnSite` EST la réponse
   * de cette route — pas une décoration comme les noms d'affectés de la liste,
   * qui eux tolèrent `null`.
   */
  it('laisse remonter une lecture d’affectations en échec plutôt que de compter zéro', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: 'acc-1' })])
    missions.manager.query.mockRejectedValue(new Error('relation "mission_assignments" does not exist'))
    await expect(service.expansionMap(USER)).rejects.toThrow()
  })

  it('interroge la fenêtre d’affectation COUVRANTE, jamais la table entière', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ account_id: 'acc-1' })])
    await service.expansionMap(USER)
    const call = (missions.manager.query.mock.calls as [string, unknown[]][]).find(([sql]) =>
      sql.includes('mission_assignments'),
    )
    expect(call).toBeDefined()
    const sql = String(call?.[0])
    // Sans fenêtre, une affectation terminée l'an dernier compterait encore
    // quelqu'un sur place. `ends_on IS NULL` = occupé sans fin connue.
    expect(sql).toContain('ma.starts_on <= CURRENT_DATE')
    expect(sql).toContain('ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE')
    expect(call?.[1]).toEqual(['ws-1', ['active', 'onboarding']])
  })

  it('rend 0 pour un compte dont AUCUNE mission n’a d’affectation enregistrée', async () => {
    // C'est ce que la table SAIT. Ce zéro-là n'est pas affichable tel quel, et
    // c'est l'écran qui le refuse — voir `staffingHeadline`, qui lui donne sa
    // population.
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ account_id: 'acc-vide' })])
    const { signals } = await service.expansionMap(USER)
    expect(signals[0].expertsOnSite).toBe(0)
  })
})

describe('bandeau du portefeuille — staffingHeadline', () => {
  it('rend les trois chiffres, dont celui qui dit si le second est lisible', async () => {
    const { service, missions } = build()
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('active_missions')) {
        return [{ active_missions: '9', consultants: '6', unstaffed: '2' }]
      }
      return []
    })
    const headline = await service.staffingHeadline(USER)
    expect(headline).toEqual({ activeMissions: 9, consultantsOnMission: 6, missionsWithoutAssignment: 2 })
  })

  it('#3547 — « sans affectation » ne compte pas un forfait encadré : son absence n’est pas un oubli', async () => {
    const { service, missions } = build()
    await service.staffingHeadline(USER)
    const sql = String((missions.manager.query.mock.calls as [string][])[0]?.[0] ?? '')
    // La mission encadrée reste ACTIVE (elle compte dans le premier chiffre) ;
    // seule la population « sans affectation » l'écarte.
    expect(sql).toContain("a.delivery_mode <> 'supervised'")
  })

  it('compte les personnes en DISTINCT d’espace — quelqu’un chez deux clients est UNE personne', async () => {
    const { service, missions } = build()
    await service.staffingHeadline(USER)
    const sql = String((missions.manager.query.mock.calls as [string][])[0]?.[0] ?? '')
    // Sommer les comptages PAR COMPTE aurait compté deux fois un consultant
    // partagé, et le total aurait dépassé l'effectif.
    expect(sql).toContain('COUNT(DISTINCT consultant_id)')
  })

  it('ne rend jamais NaN sur une base muette', async () => {
    const { service, missions } = build()
    missions.manager.query.mockResolvedValue([])
    const headline = await service.staffingHeadline(USER)
    expect(headline).toEqual({ activeMissions: 0, consultantsOnMission: 0, missionsWithoutAssignment: 0 })
  })
})

describe('relevés d’activité', () => {
  it('refuse une mission hors périmètre', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(null)
    await expect(service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 20 })).rejects.toThrow(
      NotFoundException,
    )
  })

  it('refuse de réécrire un relevé déjà validé', async () => {
    // Il a servi de base à une facturation côté comptabilité : le modifier sans
    // trace créerait un écart que personne ne saurait expliquer.
    const { service, missions, timesheets } = build()
    missions.findOne.mockResolvedValue(mission())
    timesheets.findOne.mockResolvedValue({ id: 't1', status: 'validated' })
    await expect(service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 20 })).rejects.toThrow(
      /validé/i,
    )
  })

  // #2415.5 — QUI a réellement cliqué, distinct de `consultantId` (DE QUI
  // c'est le mois) : un ops peut déclarer un mois pour un autre consultant.
  it('#2415.5 — trace QUI a déclaré, distinct du consultant dont c’est le mois', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    const { timesheet } = await service.submitTimesheet(USER, 'm1', {
      periodMonth: '2026-08-01',
      days: 20,
      consultantId: 'consultant-9',
    })
    expect(timesheet.submitted_by).toBe(USER)
    expect(timesheet.consultant_id).toBe('consultant-9')
  })

  it('#2415.5 — un REDÉPÔT met à jour la trace — elle décrit ce dépôt-ci, pas le premier', async () => {
    const { service, missions, timesheets } = build()
    missions.findOne.mockResolvedValue(mission())
    timesheets.findOne.mockResolvedValue({ id: 't1', status: 'submitted', submitted_by: 'user-old' })
    const { timesheet } = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 20 })
    expect(timesheet.submitted_by).toBe(USER)
  })

  it('détecte un nombre de jours inhabituel sans le refuser', async () => {
    // Ce n'est pas impossible (astreintes, week-ends) : ça se vérifie.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    const { timesheet } = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 28 })
    expect(timesheet.anomalies.join(' ')).toContain('jours ouvrés')
    expect(timesheet.status).toBe('submitted')
  })

  it('signale une fraction de journée inhabituelle', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    const { timesheet } = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 18.25 })
    expect(timesheet.anomalies.join(' ')).toContain('demi-journées')
  })

  it('rattrape la course entre deux saisies simultanées', async () => {
    // C'est l'index unique qui tranche ; le perdant récupère le relevé du gagnant
    // plutôt que de doubler les jours facturables.
    const { service, missions, timesheets } = build()
    missions.findOne.mockResolvedValue(mission())
    timesheets.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't-winner', days: 20 })
    timesheets.save.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
    const { timesheet } = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 20 })
    expect(timesheet.id).toBe('t-winner')
  })

  // 21 = les jours ouvrés d'août 2026 sur la mission par défaut (démarrée avant,
  // sans fin) : aucun écart, donc aucune des quatre anomalies historiques ne se
  // déclenche. Ce qui reste dans `anomalies` ne peut venir QUE du nouveau signal
  // testé — sans ce choix, un test qui cherche « contient X » resterait vert
  // même si X n'était jamais construit, noyé dans un écart de jours par ailleurs.
  const CLEAN_DAYS = 21

  it('signale un mois à cheval sur deux missions — le consultant est aussi affecté ailleurs sur la période', async () => {
    // Le relevé porte sur UNE mission ; si ce même consultant a AUSSI une
    // affectation qui chevauche le même mois sur une AUTRE mission, les jours
    // du mois ont pu se partager entre les deux — c'est le cas qui manquait.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('mission_assignments')) {
        return [
          {
            mission_label: 'Refonte SI Client X',
            consultant_name: 'Jean Dupont',
            starts_on: '2026-08-15',
            ends_on: '2026-08-31',
          },
        ]
      }
      return []
    })
    const { timesheet } = await service.submitTimesheet(USER, 'm1', {
      periodMonth: '2026-08-01',
      days: CLEAN_DAYS,
      consultantId: 'consultant-1',
    })
    expect(timesheet.anomalies.join(' ')).toContain('Refonte SI Client X')
    expect(timesheet.anomalies.join(' ')).toContain('Jean Dupont')
    // Une anomalie se signale, elle ne bloque pas le dépôt (§5).
    expect(timesheet.status).toBe('submitted')
  })

  it('ne signale RIEN quand aucun identifiant de consultant n’est fourni — on ne sait pas qui vérifier', async () => {
    // Sans consultant, on ne peut pas dire QUI serait à cheval sur deux
    // missions : un signal qu'on ne peut pas rattacher à une personne n'est pas
    // un signal, c'est du bruit.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('mission_assignments')) return [{ mission_label: 'Une autre mission' }]
      return []
    })
    const { timesheet } = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: CLEAN_DAYS })
    expect(timesheet.anomalies).toEqual([])
  })

  it('signale un doublon — un autre relevé sur cette mission et ce mois est déjà validé', async () => {
    // Le doublon qui passe aujourd'hui : un relevé déposé sous un AUTRE
    // consultant, sur la même mission et le même mois, après qu'un premier a
    // déjà été validé par le client — rien ne le distinguait d'un second
    // consultant légitimement staffé sur la mission.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('mission_timesheets')) {
        return [{ consultant_name: 'Amina Diallo', validated_by_client_at: '2026-08-05T10:00:00.000Z' }]
      }
      return []
    })
    const { timesheet } = await service.submitTimesheet(USER, 'm1', {
      periodMonth: '2026-08-01',
      days: CLEAN_DAYS,
      consultantId: 'consultant-2',
    })
    expect(timesheet.anomalies.join(' ')).toContain('Amina Diallo')
    expect(timesheet.anomalies.join(' ')).toContain('2026-08-05')
    expect(timesheet.anomalies.join(' ')).toMatch(/doublon/i)
    expect(timesheet.status).toBe('submitted')
  })

  it('ne signale aucun doublon sur son PROPRE relevé déjà validé — c’est le refus de réécriture qui tranche', async () => {
    // La requête de doublon exclut explicitement CE consultant : sinon un
    // redépôt légitime (après correction) se signalerait lui-même.
    const { service, missions, timesheets } = build()
    missions.findOne.mockResolvedValue(mission())
    timesheets.findOne.mockResolvedValue(null)
    missions.manager.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('mission_timesheets')) {
        // Le mock renvoie une ligne SEULEMENT si la requête interroge un AUTRE
        // consultant que celui qui dépose — la même chose qu'un vrai
        // `IS DISTINCT FROM` ferait en base.
        const consultantParam = params[params.length - 1]
        if (consultantParam === 'consultant-3') return []
        return [{ consultant_name: 'Quelqu’un d’autre', validated_by_client_at: '2026-08-01T00:00:00.000Z' }]
      }
      return []
    })
    const { timesheet } = await service.submitTimesheet(USER, 'm1', {
      periodMonth: '2026-08-01',
      days: CLEAN_DAYS,
      consultantId: 'consultant-3',
    })
    expect(timesheet.anomalies).toEqual([])
  })

  it('les quatre anomalies historiques n’ont pas changé de comportement', async () => {
    // Régression : les nouveaux signaux (chevauchement, doublon) s'ajoutent
    // À CÔTÉ des quatre existants, ils ne les remplacent ni ne les masquent.
    // `missions.manager.query` reste au défaut `[]` — aucun nouveau signal ne
    // doit apparaître ici, la preuve que les deux familles sont indépendantes.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())

    const over = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 28 })
    expect(over.timesheet.anomalies.join(' ')).toContain('jours ouvrés')
    expect(over.timesheet.anomalies).toHaveLength(1)

    const under = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 5 })
    expect(under.timesheet.anomalies.join(' ')).toContain('Il manque')
    expect(under.timesheet.anomalies).toHaveLength(1)

    const empty = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 0 })
    expect(empty.timesheet.anomalies.join(' ')).toContain('Aucun jour déclaré')

    // 18.25 crée aussi un écart avec les 21 jours ouvrés du mois (`gap < 0`) :
    // la fraction n'est donc pas la SEULE anomalie, comme dans le test d'origine
    // qui ne vérifiait déjà que `.toContain`, jamais la longueur exacte.
    const fraction = await service.submitTimesheet(USER, 'm1', { periodMonth: '2026-08-01', days: 18.25 })
    expect(fraction.timesheet.anomalies.join(' ')).toContain('demi-journées')
  })
})

/**
 * Un identifiant ABSENT est refusé avant la lecture.
 *
 * TypeORM ignore une condition dont la valeur est `undefined` :
 * `findOne({ where: { id: undefined } })` rend la PREMIÈRE ligne, donc le garde
 * « compte introuvable » laissait passer, et la mission partait avec
 * `account_id = NULL`. C'est la contrainte SQL qui a fini par le dire, en
 * recette, sur une mission créée depuis un projet gagné.
 */
describe('DeliveryService.create — un compte absent est refusé', () => {
  it('refuse sans même lire la table', async () => {
    const accounts = { findOne: jest.fn() }
    const service = new DeliveryService(
      { save: jest.fn(), create: jest.fn() } as never,
      {} as never,
      accounts as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      // #2339.7 — le vivier des positionnements, non lu : le compte manque
      // avant même d'y arriver.
      { findOne: jest.fn() } as never,
      { assign: jest.fn() } as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) } as never,
      { record: jest.fn() } as never,
      // #2411.11 — les résolutions de risque, non lues par ce test de création.
      { find: jest.fn().mockResolvedValue([]), upsert: jest.fn() } as never,
      // #2411.6 — l'état de facturation, non lu par ce test de création.
      {
        list: jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-01', canReadFinance: true }),
      } as never,
    )

    await expect(
      service.create('u-1', { accountId: undefined as unknown as string, label: 'Mission' }),
    ).rejects.toThrow(/compte/i)
    // Le point du test : la lecture n'a même pas eu lieu, parce qu'elle aurait
    // rendu n'importe quel compte.
    expect(accounts.findOne).not.toHaveBeenCalled()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  « MES missions en cours » sont vraiment les miennes                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Le défaut, mesuré le 28/08/2026 : le cockpit annonce « **Mes** missions en
 * cours » et appelait `GET /delivery/missions` SANS aucun paramètre — il rendait
 * les missions de l'ESPACE. Sur une ESN à cinq commerciaux, les cinq voyaient la
 * même liste sous cinq « mes ». Un chiffre juste sur le mauvais périmètre est
 * pire qu'un chiffre absent : il ne se remarque pas.
 *
 * Le geste n'est PAS « la route devient personnelle » — l'écran `/missions` liste
 * l'espace, c'est son objet, et le pont du copilote aussi. C'est l'appelant qui
 * dit ce qu'il demande. Ce qui se prouve ici, c'est donc que les DEUX portées,
 * jouées sur le MÊME jeu, rendent des listes DIFFÉRENTES : sans ça, rien ne dit
 * que le paramètre sert à quelque chose — « paramètre déclaré, jamais passé » est
 * une cause racine nommée de ce dépôt.
 */
/**
 * #2194.7 / #2194.43 — LE VIVIER ENTIER, CROISÉ AU PLANNING.
 *
 * `planning-conflicts.ts` (web) reste borné aux missions ; ce compte-ci
 * répond à la question qu'il ne pouvait pas poser : combien de consultants du
 * vivier n'ont, aujourd'hui, aucune mission en cours — MÊME définition que
 * `deriveStaffing` (`availability === 'available'`), traduite en SQL.
 */
describe('DeliveryService.list — le vivier en intercontrat (#2194.7, #2194.43)', () => {
  it('interroge le vivier ACTIF, isolé par espace', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([])
    consultants.manager.query.mockResolvedValue([{ count: '3' }])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.intercontractCount).toBe(3)
    const [sql, params] = consultants.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('c.workspace_id = $1')
    expect(sql).toContain('c.archived_at IS NULL')
    // EXIGE au moins une affectation, un jour — sans elle, ce n'est pas
    // l'intercontrat, c'est n'avoir jamais été staffé.
    expect(sql).toContain('EXISTS (SELECT 1 FROM mission_assignments ma WHERE ma.consultant_id = c.id)')
    // EXCLUT quiconque a une affectation qui COURT aujourd'hui.
    expect(sql).toContain('ma2.starts_on <= CURRENT_DATE')
    expect(sql).toContain('ma2.ends_on IS NULL OR ma2.ends_on >= CURRENT_DATE')
    expect(params).toEqual([WORKSPACE])
  })

  it('rend le compte même quand un FILTRE de mission vide la liste des missions', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('mission_assignments ma WHERE ma.consultant_id')) return []
      return []
    })
    consultants.manager.query.mockResolvedValue([{ count: '2' }])
    // `consultantId` d'un consultant sans AUCUNE mission → `restrictedIds = []`
    // → la liste de missions rend `[]` AVANT même la requête `missions.find`.
    const result = await service.list(USER, { canReadFinance: false, filters: { consultantId: 'c-sans-mission' } })
    expect(result.missions).toEqual([])
    expect(result.intercontractCount).toBe(2)
  })

  it('rend 0 sans consultant en intercontrat, jamais `NaN` ni `undefined`', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.intercontractCount).toBe(0)
  })
})

/**
 * #2414.34/.40 (épopée #2986) — le déclencheur de repositionnement croise
 * désormais la demande marché des consultants affectés, PAR LOT
 * (`territory_snapshots`, zéro collecte nouvelle — voir la doc de
 * `marketDemandByConsultant`).
 */
describe('DeliveryService.list — la demande marché démarre le repositionnement (#2414.34/.40)', () => {
  it('un affecté dont la zone résout à un département EN DEMANDE bascule le déclencheur, palier loin', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return [{ id: 'c1', zones: ['Rhône'] }]
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return [{ department: 'Rhône' }]
      if (sql.includes('DISTINCT ON (department) department, offers')) return [{ department: 'Rhône', offers: 5 }]
      return [{ count: '0' }]
    })

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'market_demand' })
  })

  it('aucune zone d’aucun affecté ne résout à un département suivi — NON MESURÉ, jamais confondu avec « absent »', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return [{ id: 'c1', zones: ['Zone hors veille'] }]
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return [{ department: 'Rhône' }]
      return [{ count: '0' }]
    })

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    // Le palier loin ET le renouvellement non tranché retombent sur leur
    // sortie d'AVANT cette tranche — la demande non mesurée ne se déguise
    // jamais en signal négatif.
    expect(rendered[0].repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('aucun affecté — même sortie qu’avant cette tranche, `marketDemand` jamais évalué', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockResolvedValue([])
    consultants.manager.query.mockResolvedValue([{ count: '0' }])

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
    // Aucun consultant affecté → aucune requête de zones/relevés déclenchée.
    expect(consultants.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, zones FROM consultants'),
      expect.anything(),
    )
  })
})

/**
 * #2414.35 (reste, épopée #2986) — le déclencheur de repositionnement croise
 * désormais la rareté du profil des consultants affectés, PAR LOT
 * (`consultant_skills`, même seuil que le segment « profils rares » du
 * vivier — voir la doc de `profileScarcityByConsultant`).
 */
describe('DeliveryService.list — la rareté du profil démarre le repositionnement (#2414.35)', () => {
  it('un affecté qui porte une compétence tenue par MOINS de trois talents bascule le déclencheur, palier loin', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) {
        return [{ consultant_id: 'c1', skill: 'cobol' }]
      }
      if (sql.includes('SELECT cs.skill, count(DISTINCT cs.consultant_id)')) return [{ skill: 'cobol', holders: '1' }]
      return [{ count: '0' }]
    })

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'profile_scarcity' })
  })

  it('un affecté dont TOUTES les compétences sont COURANTES (≥ 3 porteurs) ne démarre rien', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) {
        return [{ consultant_id: 'c1', skill: 'react' }]
      }
      if (sql.includes('SELECT cs.skill, count(DISTINCT cs.consultant_id)')) return [{ skill: 'react', holders: '12' }]
      return [{ count: '0' }]
    })

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('aucune compétence typée connue sur aucun affecté — NON MESURÉ, jamais confondu avec « courant »', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) return []
      return [{ count: '0' }]
    })

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('aucun affecté — même sortie qu’avant cette tranche, `profileScarcity` jamais évalué', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockResolvedValue([])
    consultants.manager.query.mockResolvedValue([{ count: '0' }])

    const { missions: rendered } = await service.list(USER, { canReadFinance: false })

    expect(rendered[0].repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
    expect(consultants.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT consultant_id, skill FROM consultant_skills'),
      expect.anything(),
    )
  })
})

/**
 * #2414.41/.42 (épopée #2986) — un besoin OUVERT qui exige une compétence d'un
 * affecté démarre le repositionnement, palier loin ; jamais sans mesure.
 */
describe('DeliveryService.list — un besoin ouvert compatible démarre le repositionnement (#2414.41/.42)', () => {
  async function run(skills: { consultant_id: string; skill: string }[], needs: { skills: { term: string }[] }[]) {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) return skills
      if (sql.includes('SELECT cs.skill, count(DISTINCT cs.consultant_id)')) {
        return skills.map(row => ({ skill: row.skill, holders: '12' }))
      }
      if (sql.includes('FROM project_needs n')) return needs
      return [{ count: '0' }]
    })
    const { missions: rendered } = await service.list(USER, { canReadFinance: false })
    return rendered[0].repositionTrigger
  }

  it('un besoin ouvert exige une compétence de l’affecté (sans casse) → à commencer', async () => {
    expect(await run([{ consultant_id: 'c1', skill: 'React' }], [{ skills: [{ term: ' react ' }] }])).toEqual({
      state: 'a_commencer',
      reasonKey: 'open_needs',
    })
  })

  it('aucun besoin ne demande sa compétence → pas encore', async () => {
    expect(await run([{ consultant_id: 'c1', skill: 'react' }], [{ skills: [{ term: 'cobol' }] }])).toEqual({
      state: 'pas_encore',
      reasonKey: 'tier_far',
    })
  })

  it('aucune compétence typée → NON MESURÉ, jamais un besoin deviné', async () => {
    expect(await run([], [{ skills: [{ term: 'react' }] }])).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })
})

describe('DeliveryService.list — la portée', () => {
  const ME = USER
  const OTHER_ACCOUNT = '55555555-5555-4555-8555-555555555555'

  /** m1 : je la porte. m2 : le compte m'est attribué. m3 : ni l'un ni l'autre. */
  const MINE = ['m1', 'm2']
  const ALL = ['m1', 'm2', 'm3']

  function scoped() {
    const kit = build()
    const rows = ALL.map(id => mission({ id, account_id: id === 'm3' ? OTHER_ACCOUNT : ACCOUNT }))

    // Le fake APPLIQUE la restriction qu'on lui passe : c'est la requête
    // RÉELLEMENT construite qui est mise à l'épreuve, pas une intention.
    kit.missions.find.mockImplementation(async (options?: { where?: { id?: { value?: string[] } } }) => {
      const wanted = options?.where?.id?.value
      return wanted === undefined ? rows : rows.filter(row => wanted.includes(row.id))
    })
    kit.missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT m.id FROM missions m')) return MINE.map(id => ({ id }))
      if (sql.includes('COUNT(*)')) return [{ count: '2' }]
      if (sql.includes('mission_assignments')) return [{ mission_id: 'm2' }, { mission_id: 'm3' }]
      return []
    })
    return kit
  }

  it('rend des listes DIFFÉRENTES selon la portée, sur le même jeu', async () => {
    const { service } = scoped()

    const workspace = await service.list(ME, { canReadFinance: false, scope: { kind: 'workspace' } })
    const mine = await service.list(ME, { canReadFinance: false, scope: { kind: 'own', userId: ME } })

    expect(workspace.missions.map(view => view.id)).toEqual(ALL)
    expect(mine.missions.map(view => view.id)).toEqual(MINE)
    // C'est TOUT le défaut : les deux rendaient la même liste.
    expect(mine.missions.length).not.toBe(workspace.missions.length)
  })

  it('demande le périmètre par la clause UNIQUE — je la porte OU le compte est à moi', async () => {
    const { service, missions } = scoped()

    await service.list(ME, { canReadFinance: false, scope: { kind: 'own', userId: ME } })

    const [sql, params] = missions.manager.query.mock.calls.find(call =>
      String(call[0]).includes('SELECT m.id FROM missions m'),
    ) as [string, unknown[]]
    // Recopier la condition ici en ferait la seconde vérité — et une portée trop
    // LARGE recopiée de travers rend juste une liste plus longue, qui a l'air juste.
    expect(sql).toContain('m.owner_id = $2::uuid')
    expect(sql).toContain('a.assigned_to = $2::uuid')
    expect(params).toEqual([WORKSPACE, ME])
  })

  it('l’espace est le DÉFAUT — les deux appelants d’avant ne changent pas de réponse', async () => {
    const { service, missions } = scoped()

    // `GET /delivery/missions` sans paramètre, et le pont du copilote.
    const implicit = await service.list(ME, { canReadFinance: false })

    expect(implicit.missions.map(view => view.id)).toEqual(ALL)
    expect(implicit.scope).toEqual({ kind: 'workspace', outsideAnyPortfolio: null })
    // Aucune requête de périmètre ni de hors-périmètre n'est PARTIE : chemin
    // inchangé, pas seulement résultat inchangé. (Les autres lectures brutes du
    // service — les affectations affichées — partent, elles, comme avant.)
    const scopeQueries = missions.manager.query.mock.calls.filter(call => {
      const sql = String(call[0])
      return sql.includes('SELECT m.id FROM missions m') || sql.includes('COUNT(*)')
    })
    expect(scopeQueries).toEqual([])
  })

  it('INTERSECTE avec le filtre par consultant, il ne le remplace pas', async () => {
    const { service } = scoped()

    // Le consultant est sur m2 et m3 ; mon périmètre est m1 et m2. Le lien
    // « les missions de ce consultant » ouvert depuis un cockpit restreint doit
    // rendre m2, et m2 seulement.
    const both = await service.list(ME, {
      canReadFinance: false,
      filters: { consultantId: 'c-1' },
      scope: { kind: 'own', userId: ME },
    })

    expect(both.missions.map(view => view.id)).toEqual(['m2'])
  })

  it('NOMME ce qui n’est rattaché à personne — une liste vide n’est pas « tu n’as rien »', async () => {
    const { service } = scoped()

    const mine = await service.list(ME, { canReadFinance: false, scope: { kind: 'own', userId: ME } })

    // Sans ce compte, « Mes missions : aucune » se lirait « je n'ai rien en
    // cours » sur un espace où la vérité est « rien ne m'est rattaché ». Les
    // deux appellent des gestes opposés : prospecter, ou réclamer son portefeuille.
    expect(mine.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 2 })
  })

  it('garde `canReadFinance` À CÔTÉ de la portée — deux questions, jamais fondues', async () => {
    const { service } = scoped()

    const mine = await service.list(ME, { canReadFinance: false, scope: { kind: 'own', userId: ME } })

    // « pas le droit de voir la marge » et « rien ne m'est rattaché » appellent
    // des gestes opposés : demander un accès, ou réclamer son portefeuille.
    expect(mine.canReadFinance).toBe(false)
    expect(mine.scope.kind).toBe('own')
    expect(mine.missions[0]).toHaveProperty('marginPercent', null)
  })

  it('un périmètre ILLISIBLE fait échouer la liste — il ne la vide pas en silence', async () => {
    const { service, missions } = scoped()
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT m.id FROM missions m')) throw new Error('missions illisible')
      return []
    })

    // Un `[]` rendu ici écrirait « tu n'as aucune mission en cours » sur le
    // cockpit de quelqu'un qui en a douze — le faux zéro que ce dépôt refuse.
    // C'est la différence délibérée avec `missionIdsOf`, qui, lui, avale.
    await expect(service.list(ME, { canReadFinance: false, scope: { kind: 'own', userId: ME } })).rejects.toThrow(
      'missions illisible',
    )
  })
})

/**
 * #2194.22 — LE FILTRE PAR BU DU COMPTE PORTEUR.
 *
 * La BU n'est PAS une colonne de `missions` (voir `MissionListFilters.businessUnitId`,
 * `columns.ts`) : elle se lit sur le compte, jointe ici plutôt que dupliquée.
 */
describe('DeliveryService.list — le filtre par BU du compte porteur (#2194.22)', () => {
  it('interroge le compte JOINT, isolé par espace ET par BU', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN accounts a ON a.id = m.account_id')) return [{ id: 'm1' }]
      return []
    })
    await service.list(USER, { canReadFinance: false, filters: { businessUnitId: 'bu-1' } })
    const [sql, params] = missions.manager.query.mock.calls.find(call =>
      String(call[0]).includes('JOIN accounts a ON a.id = m.account_id'),
    ) as [string, unknown[]]
    expect(sql).toContain('COALESCE(m.business_unit_id, a.business_unit_id) = $2')
    expect(params).toEqual([WORKSPACE, 'bu-1'])
  })

  it('RESTREINT la liste rendue aux missions dont le compte est dans cette BU', async () => {
    const { service, missions } = build()
    const rows = [mission({ id: 'm1' }), mission({ id: 'm2' })]
    missions.find.mockImplementation(async (options?: { where?: { id?: { value?: string[] } } }) => {
      const wanted = options?.where?.id?.value
      return wanted === undefined ? rows : rows.filter(row => wanted.includes(row.id))
    })
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN accounts a ON a.id = m.account_id')) return [{ id: 'm1' }]
      return []
    })
    const result = await service.list(USER, { canReadFinance: false, filters: { businessUnitId: 'bu-1' } })
    expect(result.missions.map(view => view.id)).toEqual(['m1'])
  })
})

/**
 * #2194.22 — LA BU, DÉCORÉE sur la ligne — même mécanique qu'`accountName`.
 */
describe('DeliveryService.list — la BU du compte porteur, décorée', () => {
  it('rend businessUnitId ET businessUnitName depuis le compte porteur', async () => {
    const { service, missions, accounts } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT })])
    accounts.find.mockResolvedValue([
      { id: ACCOUNT, company_name: 'ACME', logo_url: null, website: null, business_unit_id: 'bu-1' },
    ])
    accounts.manager.query.mockResolvedValue([{ id: 'bu-1', name: 'Agence Lyon' }])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]).toMatchObject({ businessUnitId: 'bu-1', businessUnitName: 'Agence Lyon' })
  })

  it('#3413 — une mission TRANSFÉRÉE rend la BU posée par le transfert, pas celle de son compte', async () => {
    const { service, missions, accounts } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT, business_unit_id: 'bu-2' })])
    accounts.find.mockResolvedValue([
      { id: ACCOUNT, company_name: 'ACME', logo_url: null, website: null, business_unit_id: 'bu-1' },
    ])
    accounts.manager.query.mockResolvedValue([
      { id: 'bu-1', name: 'Agence Lyon' },
      { id: 'bu-2', name: 'BU Banque & Assurance' },
    ])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]).toMatchObject({ businessUnitId: 'bu-2', businessUnitName: 'BU Banque & Assurance' })
  })

  it('rend businessUnitId ET businessUnitName à NULL quand le compte n’a aucune BU déclarée', async () => {
    const { service, missions, accounts } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', account_id: ACCOUNT })])
    accounts.find.mockResolvedValue([
      { id: ACCOUNT, company_name: 'ACME', logo_url: null, website: null, business_unit_id: null },
    ])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]).toMatchObject({ businessUnitId: null, businessUnitName: null })
  })
})

/**
 * #2194.26 — LES COMPÉTENCES DES AFFECTÉS ACTIFS, DÉCORÉES sur la ligne — le
 * filtre Planning (côté client) en a besoin pour proposer des OPTIONS
 * RÉELLEMENT là, même doctrine que le filtre consultant.
 */
describe('DeliveryService.list — les compétences des affectés actifs, décorées (#2194.26)', () => {
  it('rend les compétences CANONIQUES des affectés actifs de la mission', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN consultant_skills cs') && sql.includes('ma.mission_id = ANY')) {
        return [
          { mission_id: 'm1', skill: 'kubernetes' },
          { mission_id: 'm1', skill: 'terraform' },
        ]
      }
      return []
    })
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]?.assignedSkills).toEqual(['kubernetes', 'terraform'])
  })

  it('rend `[]` — jamais `null` — quand la lecture a réussi sans trouver de compétence', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]?.assignedSkills).toEqual([])
  })

  it('rend `null` — jamais `[]` — quand la lecture des compétences a ÉCHOUÉ', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN consultant_skills cs') && sql.includes('ma.mission_id = ANY')) {
        throw new Error('compétences illisibles')
      }
      return []
    })
    const result = await service.list(USER, { canReadFinance: false })
    expect(result.missions[0]?.assignedSkills).toBeNull()
  })
})

/**
 * #2194.26 — LE FILTRE PAR COMPÉTENCE D'UN AFFECTÉ ACTIF.
 *
 * La compétence n'est PAS persistée sur la mission (même refus que la BU,
 * même raison) : elle se lit sur `consultant_skills`, via l'affectation
 * ACTIVE — `ASSIGNMENT_STILL_RUNNING`, le même filtre qu'`assigneesByMission`.
 */
describe('DeliveryService.list — le filtre par compétence d’un affecté actif (#2194.26)', () => {
  it('interroge les affectations ACTIVES jointes aux compétences, isolées par espace', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN consultant_skills cs')) return [{ mission_id: 'm1' }]
      return []
    })
    await service.list(USER, { canReadFinance: false, filters: { skill: 'kubernetes' } })
    const [sql, params] = missions.manager.query.mock.calls.find(call =>
      String(call[0]).includes('JOIN consultant_skills cs'),
    ) as [string, unknown[]]
    expect(sql).toContain('cs.skill = $2')
    expect(sql).toContain('ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE')
    expect(params).toEqual([WORKSPACE, 'kubernetes'])
  })

  it('RESTREINT la liste rendue aux missions dont un affecté actif porte cette compétence', async () => {
    const { service, missions } = build()
    const rows = [mission({ id: 'm1' }), mission({ id: 'm2' })]
    missions.find.mockImplementation(async (options?: { where?: { id?: { value?: string[] } } }) => {
      const wanted = options?.where?.id?.value
      return wanted === undefined ? rows : rows.filter(row => wanted.includes(row.id))
    })
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN consultant_skills cs')) return [{ mission_id: 'm1' }]
      return []
    })
    const result = await service.list(USER, { canReadFinance: false, filters: { skill: 'kubernetes' } })
    expect(result.missions.map(view => view.id)).toEqual(['m1'])
  })
})

/**
 * ───────────────────────────────────────────────────────────────────────────
 * LE FILTRE PAR IDENTITÉ — ce que lit le DOSSIER d'une mission (D200)
 * ───────────────────────────────────────────────────────────────────────────
 * La mission était le seul objet du back-office sans dossier : six routes
 * `/missions/*`, toutes des LISTES. Le dossier n'a besoin que d'UNE ligne, par
 * son identité — et il la lit ICI, sur la même lecture que la liste.
 *
 * ⚠️ Pourquoi un FILTRE et non `GET /delivery/missions/:id` : le précédent est
 * la fiche du besoin (`useOpenNeed` — « d'où le filtre `id` sur
 * `GET /projects/needs` »). Une seconde route serveur recomposerait la ligne
 * ailleurs — second `SELECT`, seconde décoration, seconde vérité — et « une
 * dérivation vit à un seul endroit » est précisément la loi qu'on paye quand
 * deux chemins la refont. La décoration porte ici la fenêtre de
 * renouvellement, la marge RÉDIGÉE, les risques et le nom du compte : la
 * refaire ailleurs ferait diverger le dossier de sa propre liste.
 *
 * ⚠️ ET L'ISOLATION EST LE SUJET. Un dossier s'ouvre par une URL, donc par un
 * identifiant que n'importe qui peut taper. `workspace_id` reste dans le
 * `where` À CÔTÉ de l'identité — un `where: { id }` seul serait exactement la
 * faille que ce dépôt nomme depuis des mois.
 */
describe('DeliveryService.list — le filtre par identité, ce que lit le dossier', () => {
  it('demande la mission ET son espace, jamais l’identité seule', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm7' })])

    await service.list(USER, { canReadFinance: false, filters: { id: 'm7' } })

    const where = missions.find.mock.calls[0]?.[0]?.where
    // Les DEUX clauses, dans la même requête. `In(['m7'])` et non `'m7'` parce
    // que l'identité s'INTERSECTE avec les deux autres resserrements (le
    // consultant, le portefeuille) au lieu de les remplacer.
    expect(where).toMatchObject({ id: In(['m7']), workspace_id: WORKSPACE })
  })

  it('ne rend RIEN sur une mission hors du portefeuille du lecteur — pas de porte dérobée', async () => {
    const { service, missions } = build()
    missions.manager.query.mockResolvedValue([{ id: 'm1' }])
    missions.find.mockResolvedValue([])

    const { missions: views } = await service.list(USER, {
      canReadFinance: false,
      filters: { id: 'm7' },
      scope: { kind: 'own', userId: USER },
    })

    // L'intersection est VIDE : la requête ne part même pas, et le dossier lit
    // « introuvable » — le même mot que depuis n'importe où ailleurs.
    expect(views).toEqual([])
    expect(missions.find).not.toHaveBeenCalled()
  })

  it('rend la ligne DÉCORÉE — la même que la liste, jamais une seconde vérité', async () => {
    const { service, missions, terms } = build()
    missions.find.mockResolvedValue([mission({ id: 'm7', ends_on: inDays(20), daily_rate: 600 })])
    terms.find.mockResolvedValue([{ mission_id: 'm7', loaded_daily_cost_cents: '42000' }])

    const { missions: views } = await service.list(USER, { canReadFinance: true, filters: { id: 'm7' } })

    expect(views).toHaveLength(1)
    // La fenêtre, la marge et les risques sont ceux de la liste — parce que
    // c'est la MÊME décoration, pas une recopie.
    expect(views[0].renewal).toBe('j30')
    expect(views[0].marginPercent).toBe(30)
    expect(views[0].risks).toContain('renewal_not_started')
  })

  it('une mission d’un AUTRE espace rend une liste vide — ni la ligne, ni une erreur', async () => {
    const { service, missions } = build()
    // Ce que rend le dépôt quand le `where` porte les DEUX clauses et que la
    // mission appartient à quelqu'un d'autre.
    missions.find.mockResolvedValue([])

    const { missions: views } = await service.list(USER, { canReadFinance: false, filters: { id: 'm-ailleurs' } })

    expect(views).toEqual([])
  })

  it('n’élargit rien quand personne ne demande d’identité', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission()])

    await service.list(USER, { canReadFinance: false })

    // Chemin inchangé pour les appelants d'avant : aucune clé `id` dans le
    // `where`, donc pas d'`undefined` que TypeORM traduirait en `IS NULL`.
    expect(missions.find.mock.calls[0]?.[0]?.where).not.toHaveProperty('id')
  })
})

describe('#2195.22 à .29 — poser le statut de renouvellement', () => {
  it('écrit la valeur, sa DATE et son AUTEUR ensemble', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    const now = new Date('2026-09-16T10:00:00.000Z')

    const view = await service.setRenewalStatus(USER, 'm1', { status: 'reconduction_annoncee' }, now)

    expect(view.renewal_status).toBe('reconduction_annoncee')
    // Sans la date, un « Reconduction annoncée » posé en mars se lirait comme
    // une nouvelle fraîche en septembre.
    expect(view.renewal_status_at).toEqual(now)
    expect(view.renewal_status_by).toBe(USER)
  })

  it('un statut nul remet la ligne à « non renseigné », ET efface la trace avec elle', async () => {
    // Une correction humaine gagne toujours. Garder l'auteur d'une décision qui
    // n'existe plus aurait laissé l'écran attribuer un statut effacé.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(
      mission({ renewal_status: 'bloque', renewal_status_at: new Date(), renewal_status_by: 'user-2' }),
    )

    const view = await service.setRenewalStatus(USER, 'm1', { status: null })

    expect(view.renewal_status).toBeNull()
    expect(view.renewal_status_at).toBeNull()
    expect(view.renewal_status_by).toBeNull()
  })

  it('ne trouve pas une mission d’un AUTRE espace — le périmètre voyage dans la clause de lecture', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(null)

    await expect(service.setRenewalStatus(USER, 'm9', { status: 'renouvele' })).rejects.toThrow(NotFoundException)
    // Refuser APRÈS lecture dirait que l'identifiant existe ; il doit être
    // introuvable.
    expect(missions.findOne).toHaveBeenCalledWith({ where: { id: 'm9', workspace_id: WORKSPACE } })
  })

  it('ne DÉDUIT rien — la fenêtre d’échéance ne fabrique aucun statut', async () => {
    // C'est le refus de #2195.25 tenu au niveau du service : un statut déduit de
    // l'échéance serait un pronostic, quel que soit le mot qui l'affiche.
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ ends_on: inDays(3) }))

    const view = await service.setRenewalStatus(USER, 'm1', { status: null })

    expect(view.renewal).toBe('imminent')
    expect(view.renewal_status).toBeNull()
  })
})

describe('#2413.49 à .57, .67 — le dual track de renouvellement (épopée #2965)', () => {
  it('écrit le rail CLIENT, avec sa date et son auteur', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission())
    const now = new Date('2026-09-25T10:00:00.000Z')

    const view = await service.setRenewalClientRail(
      USER,
      'm1',
      { intent: 'oui', scope: 'Même périmètre', budget: null, process: null },
      now,
    )

    expect(view.renewal_client_rail).toEqual({
      intent: 'oui',
      scope: 'Même périmètre',
      budget: null,
      process: null,
      updatedAt: now.toISOString(),
      updatedBy: USER,
    })
  })

  it('écrit le rail CONSULTANT indépendamment du rail client', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ renewal_client_rail: null }))
    const now = new Date('2026-09-25T10:00:00.000Z')

    const view = await service.setRenewalConsultantRail(
      USER,
      'm1',
      { intent: 'non', conditions: null, availability: 'non_demande', otherOptions: 'Une autre mission en vue' },
      now,
    )

    expect(view.renewal_consultant_rail).toEqual({
      intent: 'non',
      conditions: null,
      availability: 'non_demande',
      otherOptions: 'Une autre mission en vue',
      updatedAt: now.toISOString(),
      updatedBy: USER,
    })
    // Le rail client n'est pas touché par l'écriture du rail consultant.
    expect(view.renewal_client_rail).toBeNull()
  })

  it('ne trouve pas une mission d’un AUTRE espace sur les deux rails', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(null)

    await expect(
      service.setRenewalClientRail(USER, 'm9', { intent: 'oui', scope: null, budget: null, process: null }),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.setRenewalConsultantRail(USER, 'm9', {
        intent: 'oui',
        conditions: null,
        availability: 'non_demande',
        otherOptions: null,
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('#2413.67 NO-GO — refuse « renouvelé » quand aucun rail n’a été ouvert (l’oral manager seul ne suffit plus)', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ renewal_client_rail: null, renewal_consultant_rail: null }))

    await expect(service.setRenewalStatus(USER, 'm1', { status: 'renouvele' })).rejects.toThrow(BadRequestException)
  })

  it('#2413.57 — refuse « renouvelé » quand un seul rail est positif', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(
      mission({
        renewal_client_rail: {
          intent: 'oui',
          scope: null,
          budget: null,
          process: null,
          updatedAt: null,
          updatedBy: null,
        },
        renewal_consultant_rail: null,
      }),
    )

    await expect(service.setRenewalStatus(USER, 'm1', { status: 'renouvele' })).rejects.toThrow(BadRequestException)
  })

  it('confirme « renouvelé » quand les deux rails répondent oui', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(
      mission({
        renewal_client_rail: {
          intent: 'oui',
          scope: null,
          budget: null,
          process: null,
          updatedAt: null,
          updatedBy: null,
        },
        renewal_consultant_rail: {
          intent: 'oui',
          conditions: null,
          availability: 'oui',
          otherOptions: null,
          updatedAt: null,
          updatedBy: null,
        },
      }),
    )

    const view = await service.setRenewalStatus(USER, 'm1', { status: 'renouvele' })
    expect(view.renewal_status).toBe('renouvele')
  })

  it('les autres statuts ne sont PAS soumis au garde-fou — seul « renouvelé » l’est', async () => {
    const { service, missions } = build()
    missions.findOne.mockResolvedValue(mission({ renewal_client_rail: null, renewal_consultant_rail: null }))

    const view = await service.setRenewalStatus(USER, 'm1', { status: 'discussion_en_cours' })
    expect(view.renewal_status).toBe('discussion_en_cours')
  })
})

/**
 * #2414.41/.42 — recette prod 01/10 : un palier proche masquait le besoin
 * ouvert (une seule raison) et « Besoins adjacents » restait « Non mesuré »
 * alors que le croisement existait. Les deux lisent maintenant le MÊME signal.
 */
describe('DeliveryService.list — le besoin ouvert reste visible derrière un palier proche (#2414.41/.42)', () => {
  async function run(skills: { consultant_id: string; skill: string }[], needs: { skills: { term: string }[] }[]) {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(20), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) return skills
      if (sql.includes('SELECT cs.skill, count(DISTINCT cs.consultant_id)')) {
        return skills.map(row => ({ skill: row.skill, holders: '12' }))
      }
      if (sql.includes('FROM project_needs n')) return needs
      return [{ count: '0' }]
    })
    const { missions: rendered } = await service.list(USER, { canReadFinance: false })
    return rendered[0]
  }

  it('palier proche + besoin compatible : les deux raisons, et le facteur « Besoins adjacents » mesuré', async () => {
    const m = await run([{ consultant_id: 'c1', skill: 'react' }], [{ skills: [{ term: 'React' }] }])
    expect(m.repositionTrigger.reasonKey).toBe('tier_close')
    expect(m.repositionReasons).toEqual(['tier_close', 'open_needs'])
    expect(m.renewalEngineFactors.find(f => f.key === 'besoins_adjacents')).toMatchObject({
      status: 'mesure',
      value: true,
    })
  })

  it('aucune compétence typée : une seule raison, facteur toujours NON MESURÉ', async () => {
    const m = await run([], [{ skills: [{ term: 'react' }] }])
    expect(m.repositionReasons).toEqual(['tier_close'])
    expect(m.renewalEngineFactors.find(f => f.key === 'besoins_adjacents')).toMatchObject({ status: 'absent' })
  })
})

/**
 * #2414.44/.45 (épopée #2986) — un partenaire connu / une relation déclarée sur
 * le COMPTE client démarre le repositionnement ; sans mesure, rien ne change.
 */
describe('DeliveryService.list — partenaires et relations du compte (#2414.44/.45)', () => {
  async function run(
    partners: { account_id: string; total: number; allies: number }[],
    contacts: { account_id: string; total: number; known: number }[],
  ) {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockResolvedValue([])
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM account_partners')) return partners
      if (sql.includes('FROM contacts')) return contacts
      return [{ count: '0' }]
    })
    const { missions: rendered } = await service.list(USER, { canReadFinance: false })
    return rendered[0]
  }

  it('un partenaire non concurrent sur le compte → à commencer, raison « partners »', async () => {
    const m = await run([{ account_id: ACCOUNT, total: 3, allies: 1 }], [])
    expect(m.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'partners' })
  })

  it('une relation déclarée (CRM, saisie, import) → à commencer, raison « relations »', async () => {
    const m = await run([], [{ account_id: ACCOUNT, total: 4, known: 2 }])
    expect(m.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'relations' })
  })

  it('panel de concurrents seuls, contacts sans relation, ou rien de lu → pas encore (jamais déduit d’un silence)', async () => {
    const m = await run([{ account_id: ACCOUNT, total: 5, allies: 0 }], [{ account_id: ACCOUNT, total: 4, known: 0 }])
    expect(m.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
    const none = await run([], [])
    expect(none.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })
})

/**
 * #2414.37/.43 (épopée #2986) — une contrainte DÉCLARÉE chez un affecté, et la
 * mémoire marché du client qui retrouve une techno d'un affecté, démarrent le
 * repositionnement ; sans mesure, rien ne change.
 */
describe('DeliveryService.list — contraintes et mémoire marché (#2414.37/.43)', () => {
  async function run(opts: {
    declared?: boolean
    skills?: string[]
    stacks?: Map<string, readonly string[] | null> | 'throw' | null
  }) {
    const { service, missions, consultants, accounts } = build()
    accounts.find.mockResolvedValue([
      { id: ACCOUNT, company_name: 'Client', logo_url: null, website: null, business_unit_id: null },
    ])
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('non_negotiable_conditions')) {
        return [
          {
            id: 'c1',
            mobility: opts.declared ? 'Pas de déplacement hors Île-de-France en semaine.' : '',
            conditions: '',
          },
        ]
      }
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) {
        return (opts.skills ?? []).map(skill => ({ consultant_id: 'c1', skill }))
      }
      if (sql.includes('SELECT cs.skill, count(DISTINCT cs.consultant_id)')) {
        return (opts.skills ?? []).map(skill => ({ skill, holders: '12' }))
      }
      return [{ count: '0' }]
    })
    const clientStacks =
      opts.stacks === undefined || opts.stacks === null
        ? undefined
        : async () => {
            if (opts.stacks === 'throw') throw new Error('boom')
            return opts.stacks as Map<string, readonly string[] | null>
          }
    const { missions: rendered } = await service.list(USER, { canReadFinance: false, clientStacks })
    return rendered[0]
  }

  it('une contrainte déclarée chez un affecté → à commencer, raison « constraints »', async () => {
    const m = await run({ declared: true })
    expect(m.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'constraints' })
  })

  // #2986 — la contrainte est NOMMÉE : le texte saisi sur la fiche, avec qui la porte.
  it('#2986 une contrainte déclarée est nommée (affecté, nature, texte saisi)', async () => {
    const m = await run({ declared: true })
    expect(m.repositionConstraints).toEqual([
      { consultantName: 'Jane Doe', kind: 'mobility', text: 'Pas de déplacement hors Île-de-France en semaine.' },
    ])
  })

  it('#2986 aucune contrainte saisie → liste vide, jamais « aucune contrainte »', async () => {
    const m = await run({ declared: false })
    expect(m.repositionConstraints).toEqual([])
  })

  it('aucune contrainte saisie → pas encore (non mesuré, jamais « aucune contrainte »)', async () => {
    const m = await run({ declared: false })
    expect(m.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('une techno observée chez le client que porte un affecté → raison « market_memory »', async () => {
    const m = await run({ skills: ['Kafka'], stacks: new Map([[ACCOUNT, ['kafka', 'java']]]) })
    expect(m.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'market_memory' })
  })

  it('compte non couvert, aucun recoupement ou lecture en panne → pas encore', async () => {
    for (const stacks of [new Map([[ACCOUNT, null]]), new Map([[ACCOUNT, ['cobol']]]), 'throw' as const]) {
      const m = await run({ skills: ['kafka'], stacks })
      expect(m.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
    }
  })
})

describe('DeliveryService.list — historique de présentation récent (#2414.48, lot E09 08/10)', () => {
  async function run(opts: { stage?: string; submittedDaysAgo?: number; createdDaysAgo?: number }) {
    const { service, missions, consultants, accounts } = build()
    accounts.find.mockResolvedValue([
      { id: ACCOUNT, company_name: 'Client', logo_url: null, website: null, business_unit_id: null },
    ])
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma') && sql.includes('JOIN consultants c')) {
        return [{ mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 }]
      }
      return []
    })
    consultants.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, zones FROM consultants')) return []
      if (sql.includes('SELECT DISTINCT department FROM territory_snapshots')) return []
      if (sql.includes('non_negotiable_conditions')) return [{ id: 'c1', mobility: '', conditions: '' }]
      if (sql.includes('SELECT consultant_id, skill FROM consultant_skills')) return []
      if (sql.includes('FROM submissions')) {
        if (opts.stage === undefined) return []
        const daysAgo = opts.submittedDaysAgo ?? opts.createdDaysAgo ?? 0
        // #2414.48 — fenêtre de 90 jours (`PRESENTATION_HISTORY_RECENT_DAYS`) : le mock REJOUE la même borne
        // plutôt que de supposer que la requête a filtré, pour que le test dise NON si la fenêtre SQL change.
        return daysAgo <= 90 ? [{ consultant_id: 'c1' }] : []
      }
      return []
    })
    const { missions: rendered } = await service.list(USER, { canReadFinance: false })
    return rendered[0]
  }

  it('une présentation RÉCENTE (34 jours), tous besoins confondus → à commencer, raison « presentation_history »', async () => {
    const m = await run({ stage: 'accepted', submittedDaysAgo: 34 })
    expect(m.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'presentation_history' })
  })

  it('une présentation ANCIENNE (120 jours) ne démarre rien — la fenêtre de 90 jours est tenue', async () => {
    const m = await run({ stage: 'accepted', submittedDaysAgo: 120 })
    expect(m.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('aucune présentation → pas encore (jamais « non mesuré » : `submissions` est un journal complet)', async () => {
    const m = await run({})
    expect(m.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
  })

  it('la requête lit `COALESCE(submitted_at, created_at)` — jamais une présentation récente ignorée faute de date', async () => {
    const { service, missions, consultants } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1', ends_on: inDays(400), renewal_status: null })])
    missions.manager.query.mockResolvedValue([
      { mission_id: 'm1', consultant_id: 'c1', full_name: 'Jane Doe', photo_url: null, load_percent: 100 },
    ])
    await service.list(USER, { canReadFinance: false })
    const submissionsCall = consultants.manager.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('FROM submissions'),
    )
    expect(submissionsCall?.[0]).toContain('COALESCE(submitted_at, created_at)')
    expect(submissionsCall?.[1]).toEqual([WORKSPACE, ['c1'], PRESENTED_SUBMISSION_STAGES, expect.any(Date)])
  })
})

/**
 * #2979 (recette Z1 04/10) — « le tableau reste 8 à 18 s sur Chargement… ».
 *
 * Mesuré dans le code, pas deviné : après le `Promise.all` des lectures par lot, `list()` enchaînait SEPT (puis
 * HUIT, #2414.48 lot E09 08/10) lectures indépendantes (demande marché, rareté, besoins ouverts, signaux du
 * compte, noms de BU, contraintes, mémoire marché, historique de présentation) l'une APRÈS l'autre — la latence
 * de la liste était la SOMME des allers-retours, qui s'allonge sous un pool saturé. Elles ne dépendent que de
 * `assignedConsultantIds`/`missions` : elles partent ensemble. La mesure : huit lectures simulées à 60 ms
 * rendent la liste en ~60 ms, plus en ~480 ms.
 */
describe('DeliveryService.list — les lectures par lot partent ensemble (#2979)', () => {
  it('huit lectures indépendantes de 60 ms ne s’additionnent pas', async () => {
    const { service, missions } = build()
    missions.find.mockResolvedValue([mission({ id: 'm1' })])
    const slow = <T>(value: T) => jest.fn(async () => new Promise<T>(resolve => setTimeout(() => resolve(value), 60)))
    const internals = service as unknown as Record<string, unknown>
    internals['marketDemandByConsultant'] = slow(new Map())
    internals['profileScarcityByConsultant'] = slow(new Map())
    internals['openNeedsByConsultant'] = slow(new Map())
    internals['accountRepositionSignals'] = slow(new Map())
    internals['businessUnitNamesOf'] = slow(new Map())
    internals['constraintsByConsultant'] = slow(new Map())
    internals['marketMemoryByMission'] = slow(new Map())
    internals['presentationHistoryByConsultant'] = slow(new Map())

    const startedAt = Date.now()
    const result = await service.list(USER, { canReadFinance: false })
    const elapsed = Date.now() - startedAt

    expect(result.missions).toHaveLength(1)
    // Séquentiel : ≥ 480 ms. Ensemble : ~60 ms. La borne laisse de la marge à un runner lent.
    expect(elapsed).toBeLessThan(300)
  })
})
