import { BadRequestException, NotFoundException } from '@nestjs/common'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ProjectPipelineService } from './project-pipeline.service'
import type { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import type { PipelineStageLabelEntity } from '../../database/entities/pipeline-stage-label.entity'
import type { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'

/**
 * Ce qui entoure le projet : le pipe, les rôles recherchés, le comité.
 *
 * Les preuves portent sur les décisions, pas sur le SQL : un projet d'une autre
 * équipe est un 404 (jamais une écriture chez le voisin), un rôle rattaché à
 * quelqu'un d'un autre compte est refusé, et un libellé vide REMET le défaut au
 * lieu d'afficher une colonne sans nom.
 */
describe('ProjectPipelineService', () => {
  let projects: MockRepository<ProjectEntity>
  let needs: MockRepository<ProjectNeedEntity>
  let links: MockRepository<ProjectContactEntity>
  let labels: MockRepository<PipelineStageLabelEntity>
  let lossReasons: MockRepository<LossReasonEntity>
  let service: ProjectPipelineService

  const PROJECT = '11111111-1111-4111-8111-111111111111'
  const OWNER = '33333333-3333-4333-8333-333333333333'

  /** Un besoin déjà en base, tel que `findOne` le rend. */
  function existingNeed(over: Partial<ProjectNeedEntity> = {}): ProjectNeedEntity {
    return {
      id: 'n-1',
      workspace_id: 'ws-1',
      project_id: PROJECT,
      title: 'Tech lead Java',
      skills: [],
      seniority: null,
      headcount: 1,
      target_tjm_cents: null,
      start_on: null,
      duration_months: null,
      location: null,
      contract_kind: 'inconnu',
      status: 'to_qualify',
      status_reason: null,
      status_changed_at: null,
      urgency: null,
      owner_id: null,
      deadline_at: null,
      archived_at: null,
      created_at: new Date('2026-08-19T10:00:00.000Z'),
      updated_at: new Date('2026-08-19T10:00:00.000Z'),
      ...over,
    } as ProjectNeedEntity
  }

  beforeEach(() => {
    projects = createMockRepository<ProjectEntity>()
    needs = createMockRepository<ProjectNeedEntity>()
    links = createMockRepository<ProjectContactEntity>()
    labels = createMockRepository<PipelineStageLabelEntity>()
    lossReasons = createMockRepository<LossReasonEntity>()
    service = new ProjectPipelineService(
      projects as never,
      needs as never,
      links as never,
      labels as never,
      lossReasons as never,
      {
        find: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn(() => ({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn(),
        })),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    )
  })

  /** Le projet existe dans l'espace de l'appelant. */
  function projectFound(accountId = 'acc-1') {
    projects.manager.query.mockResolvedValue([{ account_id: accountId }])
  }

  describe('le pipe', () => {
    it('compte les montants saisis et sort les projets sans montant à part', async () => {
      projects.manager.query.mockResolvedValueOnce([
        { stage: 'qualified', amount_cents: 500_000 },
        { stage: 'qualified', amount_cents: null },
        { stage: 'detected', amount_cents: null },
      ])
      labels.find.mockResolvedValue([])

      const summary = await service.summary('ws-1')

      const qualified = summary.columns.find(column => column.stage === 'qualified')
      expect(qualified).toMatchObject({ count: 2, amount_cents: 500_000, without_amount: 1 })
      expect(summary.intake).toBe(1)
    })

    it('#3714 — une généralité sans travail sort de `intake`, une affaire travaillée mal intitulée y reste', async () => {
      projects.manager.query.mockResolvedValueOnce([
        { stage: 'detected', kind: 'implication', amount_cents: null, source: null },
        { stage: 'detected', kind: 'implication', amount_cents: null, source: null, owner_id: 'u-1' },
        { stage: 'detected', kind: 'program', amount_cents: null, source: 'Rapport annuel' },
      ])
      labels.find.mockResolvedValue([])

      const summary = await service.summary('ws-1')

      expect(summary.generic_deductions).toBe(1)
      expect(summary.intake).toBe(2)
      // La requête lit bien ce qui prouve le travail humain.
      const [sql] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      for (const column of ['o.source', 'o.owner_id', 'o.btmmp', 'o.objective', 'o.risks', 'o.scope_label']) {
        expect(sql).toContain(column)
      }
    })

    it('scope la lecture sur l’espace de l’appelant', async () => {
      projects.manager.query.mockResolvedValueOnce([])
      labels.find.mockResolvedValue([])

      await service.summary('ws-1')

      const [sql, params] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1'])
      // ⚠️ L'alias du compte est `acc` depuis que la clause de périmètre déclare
      // son propre `FROM accounts a` : deux `a` imbriqués se lisent de travers
      // même quand PostgreSQL, lui, les résout correctement.
      expect(sql).toContain('o.workspace_id = $1 OR acc.workspace_id = $1')
      expect(sql).toContain("acc.status <> 'deleted'")
    })
  })

  /**
   * #2939 (#2174.10) — RATTACHER LE PROJET À UNE ENTITÉ DU COMPTE, la sixième
   * porte de « colonne lue, jamais écrite » de ce fichier (voir `contact_id`
   * pour la cinquième).
   */
  describe('setProjectEntity (#2939, #2174.10)', () => {
    it('pose l’entité quand elle appartient au compte du projet', async () => {
      projects.manager.query.mockResolvedValueOnce([{ account_id: 'acc-1' }]).mockResolvedValueOnce([{ id: 'ent-1' }])
      projects.update.mockResolvedValue(undefined)

      const result = await service.setProjectEntity('ws-1', PROJECT, 'ent-1')

      expect(result).toEqual({ entity_id: 'ent-1' })
      expect(projects.update).toHaveBeenCalledWith({ id: PROJECT }, { entity_id: 'ent-1' })
    })

    it('refuse une entité d’un AUTRE compte', async () => {
      projects.manager.query.mockResolvedValueOnce([{ account_id: 'acc-1' }]).mockResolvedValueOnce([])

      await expect(service.setProjectEntity('ws-1', PROJECT, 'ent-from-another-account')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(projects.update).not.toHaveBeenCalled()
    })

    it('détache sur `null`, sans vérifier d’appartenance', async () => {
      projects.manager.query.mockResolvedValueOnce([{ account_id: 'acc-1' }])
      projects.update.mockResolvedValue(undefined)

      const result = await service.setProjectEntity('ws-1', PROJECT, null)

      expect(result).toEqual({ entity_id: null })
      expect(projects.manager.query).toHaveBeenCalledTimes(1)
    })

    it('404 sur un projet d’une autre équipe', async () => {
      projects.manager.query.mockResolvedValueOnce([])
      await expect(service.setProjectEntity('ws-1', 'p-9', 'ent-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  /**
   * #2324.40/43/44/46/47/48 — le calcul NOMMÉ (`pipelineHealth`, `@bellum/contracts`)
   * est testé pour lui-même ; ici, on prouve seulement que le SERVICE lit la
   * bonne portée, passe le bon seuil, et relaie les compteurs (chaînes Postgres
   * `bigint`) en NOMBRES.
   */
  describe('le diagnostic de pipe (#2324)', () => {
    it('scope la lecture sur l’espace, comme le pipe, et passe le seuil de #2324.44', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      const [sql, params] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('o.workspace_id = $1 OR acc.workspace_id = $1')
      expect(params).toEqual(['ws-1', 14])
    })

    it('convertit les compteurs Postgres (bigint en chaîne) en nombres avant de nommer les raisons', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '1',
            needs_without_profile: '1',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.needsAttention).toEqual([
        {
          id: 'opp-1',
          stage: 'qualified',
          freshness: 'fresh',
          reasons: ['need_without_profile'],
          stageDetail: null,
          // #2325.13 — aucune des colonnes d'évidence n'est fournie par ce
          // mock : `projectEvidence` les lit toutes absentes et nomme les
          // quatre manques du niveau `detected_project`, jamais un tableau
          // deviné à vide.
          evidenceGaps: ['no_fit', 'no_perimeter', 'no_decision_maker', 'no_next_action'],
        },
      ])
    })

    // #3904 — « Lequel de mes comptes est à deux doigts de signer ? » : Laura
    // « ne peut pas nommer le compte ». Les lignes du diagnostic ne portaient
    // que l'identifiant de l'affaire ; le NOM du compte (et le libellé) voyage
    // maintenant à côté, par identifiant — le compte lu, jamais deviné.
    it('#3904 — nomme le compte et le libellé de chaque affaire lue, par identifiant', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-9',
            stage: 'negotiation',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: false,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            account_id: 'acc-7',
            account_name: 'Altran',
            label: 'Renfort data',
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.opportunityNames).toEqual({
        'opp-9': { accountId: 'acc-7', companyName: 'Altran', label: 'Renfort data' },
      })
    })

    it('exclut un signal sans porteur ni prochaine action — #2324.48 — et le compte', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'sig-1',
            stage: 'qualified',
            kind: 'signal',
            owner_id: null,
            stage_entered_at: '2025-01-01',
            has_next_action: false,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.needsAttention).toHaveLength(0)
      expect(health.excludedUnapprovedSignals).toBe(1)
    })

    it('relaie most_advanced_need_status jusqu’au stageDetail — #2324.20/21/23', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-2',
            stage: 'confirmed',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: false,
            needs_total: '1',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            most_advanced_need_status: 'shortlist_ready',
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.needsAttention[0]?.stageDetail).toBe('profiles_prepared')
    })

    /**
     * #2325.13 — axe CONFIANCE : le SERVICE calcule les manques avec le MÊME
     * barème que `ProjectsService` (`opportunityEvidenceGaps`, réutilise
     * `projectEvidenceInput`), jamais un second calcul de fit/périmètre/
     * décideur/prochaine action.
     */
    it('calcule evidenceGaps depuis les colonnes d’évidence, sans les recalculer différemment de ProjectsService', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-3',
            stage: 'negotiation',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: false,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            source: 'BODACC',
            offer: 'TMA',
            primary_domain_code: null,
            amount_cents: '12000000',
            expected_close_on: null,
            btmmp: { management: 'DSI groupe', nextStep: 'Atelier de cadrage le 12' },
            first_detected_at: '2026-08-01T00:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      // Tout est là (offre, montant, décideur, prochaine action) : AUCUN manque.
      expect(health.needsAttention[0]?.evidenceGaps).toEqual([])
    })

    it('un montant/BTMMP absent dans la ligne SQL ne devient jamais un périmètre inventé (NaN)', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-4',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: false,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            // Aucune colonne d'évidence fournie par ce mock (comme une jointure
            // partielle en base) — `amount_cents` est `undefined`, jamais `NaN`.
          },
        ])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.needsAttention[0]?.evidenceGaps).toEqual([
        'no_fit',
        'no_perimeter',
        'no_decision_maker',
        'no_next_action',
      ])
    })
  })

  /**
   * #2325.27-.31 — tranché sans Louis, reco appliquée le 25/09/2026 : le calcul
   * PUR (`pipelineCapacity`, `@bellum/contracts`) est testé pour lui-même ; ici,
   * on prouve seulement que le service lit les CINQ entrées réelles et les lui
   * relaie sans les recalculer.
   */
  describe('la capacité du pipe (#2325.27-.31)', () => {
    it('sans aucune entrée déclarée, les quatre axes sont NON ÉVALUABLES — jamais un zéro deviné', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      // Les quatre lectures de capacité tombent sur le défaut `[]` du dépôt
      // mocké (`createMockRepository`) : aucun membre, aucun secteur prioritaire.

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.capacity.capacity).toEqual({ measured: false })
      expect(health.capacity.sectorFit).toEqual({ measured: false })
      // Les besoins ouverts et les consultants disponibles sont des COMPTAGES,
      // toujours mesurés (0 est une vraie réponse, jamais une absence).
      expect(health.capacity.needsCoverage).toEqual({
        measured: true,
        alert: false,
        openNeedsCount: 0,
        presentationDossiersCount: 0,
      })
    })

    it('additionne les tranches déclarées des membres actifs pour juger le volume de dossiers actifs', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          { id: 'opp-1', stage: 'qualified', account_sector: 'banque' },
          { id: 'opp-2', stage: 'confirmed', account_sector: 'retail' },
        ])
        .mockResolvedValueOnce([]) // staffing collisions
        .mockResolvedValueOnce([]) // contact solicitation collisions
        .mockResolvedValueOnce([
          { weekly_sales_time_residual: '5 à 10 heures par semaine' },
          { weekly_sales_time_residual: 'Je ne sais pas' },
        ]) // membres
        .mockResolvedValueOnce([{ priority_sectors: ['banque'] }]) // secteurs prioritaires
        .mockResolvedValueOnce([{ count: '3' }]) // besoins ouverts
        .mockResolvedValueOnce([{ count: '1' }]) // consultants dispo sous 30j

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      // Une seule tranche mesurable (5h, borne basse) ÷ 1,5 = 3,33 dossiers —
      // deux dossiers actifs ne dépassent pas la capacité.
      expect(health.capacity.capacity).toMatchObject({
        measured: true,
        measuredMembers: 1,
        totalMembers: 2,
        alert: false,
      })
      // Un dossier « banque » (prioritaire) et un « retail » (hors priorité) :
      // 1 sur 2 hors priorité, pile la moitié — jamais une alerte.
      expect(health.capacity.sectorFit).toMatchObject({
        measured: true,
        knownSectorCount: 2,
        outsidePriorityCount: 1,
        alert: false,
      })
      expect(health.capacity.needsCoverage).toMatchObject({ openNeedsCount: 3, presentationDossiersCount: 0 })
      expect(health.capacity.staffingAvailability).toMatchObject({
        openNeedsCount: 3,
        consultantsAvailableSoonCount: 1,
        alert: true,
      })
    })

    it('lit les besoins ouverts et les consultants disponibles sur l’espace de l’appelant', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      const openNeedsCall = projects.manager.query.mock.calls[5] as [string, unknown[]]
      expect(openNeedsCall[0]).toContain('FROM project_needs')
      expect(openNeedsCall[1]).toEqual(['ws-1'])

      const consultantsCall = projects.manager.query.mock.calls[6] as [string, unknown[]]
      expect(consultantsCall[0]).toContain('FROM consultants')
      expect(consultantsCall[1]).toEqual(['ws-1'])
    })
  })

  /**
   * #2325.34 — « détecte les mêmes consultants sollicités ailleurs ». Le
   * calculateur PUR (`detectStaffingCollisions`, `@bellum/contracts`,
   * #2107.17/#2108.18/#2108.30) existait déjà, testé, mais SANS appelant nulle
   * part dans le produit — le motif nommé par CLAUDE.md : « du code juste,
   * calculé, testé, que personne n'appelle ». Cette lecture le BRANCHE au
   * diagnostic de pipe déjà exposé au chat (`get_pipeline_health`), par une
   * SECONDE requête scopée espace (les positionnements ne sont pas des
   * opportunités : les mélanger romprait la lecture pure de #2324/#2325).
   */
  describe('les collisions de staffing (#2325.34)', () => {
    it('scope la lecture des positionnements sur l’espace de l’appelant', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      const [sql, params] = projects.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain('s.workspace_id = $1')
      expect(params).toEqual(['ws-1'])
    })

    it('un même consultant ouvert sur deux besoins distincts remonte en collision', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { id: 'sub-1', need_id: 'need-1', consultant_id: 'cons-1', consultant_name: 'Dana Diallo', stage: 'submitted' },
        { id: 'sub-2', need_id: 'need-2', consultant_id: 'cons-1', consultant_name: 'Dana Diallo', stage: 'interview' },
      ])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.staffingCollisions).toEqual([
        {
          consultantId: 'cons-1',
          consultantName: 'Dana Diallo',
          submissionIds: ['sub-1', 'sub-2'],
          needIds: ['need-1', 'need-2'],
        },
      ])
    })

    it('aucune collision quand chaque consultant n’a qu’un seul besoin ouvert — jamais un tableau vide silencieux, un VRAI vide', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'sub-1',
          need_id: 'need-1',
          consultant_id: 'cons-1',
          consultant_name: 'Dana Diallo',
          stage: 'submitted',
        },
      ])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.staffingCollisions).toEqual([])
    })

    /**
     * #2325.43 — LE SCÉNARIO DE RECETTE « CONSULTANT CONCURRENT » (issue #2325,
     * neuvième scénario nommé), manquant : `opportunity-pipeline-health.test.ts`
     * NOMME les huit autres (#2325.37-.42/.44-.46) mais documente explicitement
     * que celui-ci N'Y EST PAS, renvoyant à ce fichier — sans qu'aucun test
     * n'y porte réellement son nom. Ce test comble ce trou : PAS un troisième
     * calcul (GA-26), seulement la preuve que les deux lectures déjà livrées
     * (`priorityDeals` de #2325, `staffingCollisions` de #2325.34) COEXISTENT
     * sur le MÊME appel `health()` sans se marcher dessus, sur un pipe où une
     * affaire prioritaire dépend justement d'un consultant sollicité ailleurs.
     */
    it('#2325.43 — consultant concurrent : la collision et la priorisation cohabitent sur le même diagnostic', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-framatome',
            stage: 'confirmed',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: false,
            needs_total: '1',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            most_advanced_need_status: 'shortlist_ready',
          },
        ])
        .mockResolvedValueOnce([
          // Le SEUL consultant de la shortlist est déjà ouvert sur un besoin
          // d'une AUTRE affaire — la raison précise pour laquelle « sécuriser
          // le consultant » ne peut pas encore être tenue pour acquis.
          {
            id: 'sub-1',
            need_id: 'need-framatome',
            consultant_id: 'cons-1',
            consultant_name: 'Dana Diallo',
            stage: 'submitted',
          },
          {
            id: 'sub-2',
            need_id: 'need-ailleurs',
            consultant_id: 'cons-1',
            consultant_name: 'Dana Diallo',
            stage: 'interview',
          },
        ])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      // La priorisation continue de désigner l'affaire (#2325) …
      expect(health.priorityDeals[0]?.id).toBe('opp-framatome')
      expect(health.priorityDeals[0]?.decision).toBe('get_shortlist_feedback')
      // … et la collision de staffing reste NOMMÉE à côté, jamais absorbée ou
      // masquée par la priorisation — deux lectures distinctes, une réponse.
      expect(health.staffingCollisions).toEqual([
        {
          consultantId: 'cons-1',
          consultantName: 'Dana Diallo',
          submissionIds: ['sub-1', 'sub-2'],
          needIds: ['need-framatome', 'need-ailleurs'],
        },
      ])
    })
  })

  /**
   * #2325.35 — « détecte les mêmes contacts sollicités [ailleurs] ». Même geste
   * que #2325.34 : `detectContactSolicitationCollisions` (`@bellum/contracts`)
   * existait comme calcul pur ; cette lecture le BRANCHE par une TROISIÈME
   * requête scopée espace, sur `outreach_sequences` — jamais un filtre sur
   * `user_id` (l'auteur de la séquence), pour la même raison de doctrine que
   * #2325.34.
   */
  describe('les collisions de sollicitation de contacts (#2325.35)', () => {
    it('scope la lecture des séquences sur l’espace de l’appelant', async () => {
      projects.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      const [sql, params] = projects.manager.query.mock.calls[2] as [string, unknown[]]
      expect(sql).toContain('s.workspace_id = $1')
      expect(params).toEqual(['ws-1'])
    })

    it('le même contact visé par deux séquences ACTIVES remonte en collision', async () => {
      projects.manager.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'seq-1', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
          { id: 'seq-2', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
        ])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.contactSolicitationCollisions).toEqual([
        { contactId: 'contact-1', contactName: 'Alex Martin', sequenceIds: ['seq-1', 'seq-2'] },
      ])
    })

    it('une séquence pausée/terminée n’entre pas en collision — elle ne sollicite plus personne', async () => {
      projects.manager.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'seq-1', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
          { id: 'seq-2', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'completed' },
        ])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.contactSolicitationCollisions).toEqual([])
    })
  })

  /**
   * #3264.14 (épopée #3264, lot R11 29/09) — la MÊME collision que
   * #2325.35, réduite à UN contact : le pont interne (`apps/ia` →
   * `POST /internal/copilot/outreach/contact-collision`) que
   * `prepare_message_for_contact` appelle AVANT de préparer un message.
   */
  describe('contactSolicitationCollisionFor (#3264.14)', () => {
    it('rend la collision du contact demandé quand elle existe', async () => {
      projects.manager.query.mockResolvedValueOnce([
        { id: 'seq-1', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
        { id: 'seq-2', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
      ])

      const collision = await service.contactSolicitationCollisionFor('ws-1', 'contact-1')

      expect(collision).toEqual({ contactId: 'contact-1', contactName: 'Alex Martin', sequenceIds: ['seq-1', 'seq-2'] })
    })

    it('rend `null` quand ce contact précis n’est pas en collision', async () => {
      projects.manager.query.mockResolvedValueOnce([
        { id: 'seq-1', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
        { id: 'seq-2', contact_id: 'contact-1', contact_name: 'Alex Martin', status: 'active' },
      ])

      const collision = await service.contactSolicitationCollisionFor('ws-1', 'contact-9')

      expect(collision).toBeNull()
    })

    it('scope la lecture sur l’espace, sans filtre sur `user_id` — même doctrine que #2325.35', async () => {
      projects.manager.query.mockResolvedValueOnce([])

      await service.contactSolicitationCollisionFor('ws-1', 'contact-1')

      const [sql, params] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('s.workspace_id = $1')
      expect(sql).not.toContain('user_id')
      expect(params).toEqual(['ws-1'])
    })
  })

  /**
   * #2325.33 — « détecte les doublons [d'affaires] ». `detectDuplicateOpportunities`
   * (`@bellum/contracts`) lit les MÊMES lignes que le diagnostic de pipe —
   * jamais une seconde requête (GA-26) — et groupe par compte + titre EXACT.
   */
  describe('les doublons d’affaires (#2325.33)', () => {
    it('deux affaires ACTIVES du même compte, même titre, remontent en doublon', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            account_id: 'acc-1',
            label: 'Socle data',
          },
          {
            id: 'opp-2',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-2',
            stage_entered_at: '2026-09-16',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            account_id: 'acc-1',
            label: 'Socle data',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.duplicateOpportunities).toEqual([
        { accountId: 'acc-1', label: 'Socle data', opportunityIds: ['opp-1', 'opp-2'] },
      ])
    })

    it('un titre différent sur le même compte ne remonte rien', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            account_id: 'acc-1',
            label: 'Socle data',
          },
          {
            id: 'opp-2',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-2',
            stage_entered_at: '2026-09-16',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            account_id: 'acc-1',
            label: 'Migration cloud',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.duplicateOpportunities).toEqual([])
    })

    it('sans colonne de titre fournie par une ligne mockée, jamais un crash — jamais un doublon deviné', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.duplicateOpportunities).toEqual([])
    })
  })

  /**
   * #2325.32 — « détecte [les affaires avec] plusieurs owners ». Une affaire a
   * UN `owner_id`, mais ses tâches OUVERTES portent chacune le leur : rien
   * n'empêche une divergence. `detectMultiOwnerOpportunities`
   * (`@bellum/contracts`) lit les MÊMES lignes que le diagnostic de pipe.
   */
  describe('les affaires à plusieurs porteurs (#2325.32)', () => {
    it('le porteur de l’affaire et celui d’une tâche ouverte divergent → remonte', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            task_owner_ids: ['user-2'],
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.multiOwnerOpportunities).toEqual([{ opportunityId: 'opp-1', ownerIds: ['user-1', 'user-2'] }])
    })

    it('le même porteur partout ne remonte rien', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
            task_owner_ids: ['user-1'],
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.multiOwnerOpportunities).toEqual([])
    })

    it('sans task_owner_ids fourni par une ligne mockée, jamais un crash', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.multiOwnerOpportunities).toEqual([])
    })
  })

  /**
   * #2325.36 — « actions contradictoires », bornée à la SEULE contradiction
   * mesurable sans rien deviner : une affaire à l'ISSUE CONNUE (gagnée/perdue)
   * qui porte encore une tâche ouverte. `has_next_action` est DÉJÀ calculé
   * pour `pipelineHealth` — aucun second calcul.
   */
  describe('les actions contradictoires (#2325.36)', () => {
    it('une affaire GAGNÉE avec une tâche encore ouverte remonte', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'won',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.contradictoryActionOpportunities).toEqual([{ opportunityId: 'opp-1', stage: 'won' }])
    })

    it('une affaire EN COURS avec une tâche ouverte n’est pas contradictoire — c’est le cours normal', async () => {
      projects.manager.query
        .mockResolvedValueOnce([
          {
            id: 'opp-1',
            stage: 'qualified',
            kind: 'pain',
            owner_id: 'user-1',
            stage_entered_at: '2026-09-15',
            has_next_action: true,
            needs_total: '0',
            needs_without_profile: '0',
            needs_awaiting_feedback: '0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const health = await service.health('ws-1', new Date('2026-09-22T10:00:00Z'))

      expect(health.contradictoryActionOpportunities).toEqual([])
    })
  })

  /* ─────────────────────────────────────────────────────────────────────────
     « MON pipe » est vraiment le mien — et `/projects` reste celui de l'espace
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Le défaut : le cockpit écrit « Mon pipe » et lisait le pipe de l'ESPACE. Sur
   * une ESN à cinq commerciaux, le même chiffre s'affichait cinq fois sous cinq
   * « mon » — la seule chose FAUSSE à l'écran plutôt qu'absente.
   *
   * Ce qui se prouve ici n'est pas que le SQL contient une chaîne : c'est que les
   * DEUX portées, jouées sur le MÊME jeu, rendent des chiffres DIFFÉRENTS. Sans
   * ça, rien ne dit que le paramètre sert à quelque chose — un paramètre déclaré
   * et jamais passé est une cause racine nommée de ce dépôt.
   */
  describe('la portée du pipe', () => {
    const ME = '44444444-4444-4444-8444-444444444444'

    /** Trois projets : un à moi, un sur un compte qui m'est attribué, un ni l'un
     *  ni l'autre. Le fake APPLIQUE la clause qu'il reçoit — c'est le SQL généré
     *  qui est mis à l'épreuve, pas une intention. */
    const ROWS = [
      { stage: 'qualified', kind: 'pain', amount_cents: 100_000, owner: ME, accountAssignedTo: null },
      { stage: 'qualified', kind: 'pain', amount_cents: 200_000, owner: null, accountAssignedTo: ME },
      { stage: 'qualified', kind: 'pain', amount_cents: 900_000, owner: 'someone-else', accountAssignedTo: null },
    ]

    function fakeDatabase() {
      projects.manager.query.mockImplementation(async (sql: string, params: unknown[]) => {
        const restricted = sql.includes('o.owner_id = $2::uuid')
        const me = params[1]
        const visible = ROWS.filter(row => !restricted || row.owner === me || row.accountAssignedTo === me)
        if (sql.includes('COUNT(*)')) {
          // Le compte « rattaché à personne » : ni porteur, ni compte attribué.
          const orphans = ROWS.filter(row => row.owner === null && row.accountAssignedTo === null)
          return [{ count: String(orphans.length) }]
        }
        return visible.map(row => ({ stage: row.stage, kind: row.kind, amount_cents: row.amount_cents }))
      })
      labels.find.mockResolvedValue([])
    }

    it('rend des chiffres DIFFÉRENTS selon la portée, sur le même jeu', async () => {
      fakeDatabase()

      const workspace = await service.summary('ws-1', 'fr', { kind: 'workspace' })
      const mine = await service.summary('ws-1', 'fr', { kind: 'own', userId: ME })

      // L'espace voit les trois ; moi, les deux qui me sont rattachées.
      expect(workspace.total_count).toBe(3)
      expect(workspace.total_amount_cents).toBe(1_200_000)
      expect(mine.total_count).toBe(2)
      expect(mine.total_amount_cents).toBe(300_000)
      // Et surtout : les deux ne sont pas le même chiffre. C'est TOUT le défaut.
      expect(mine.total_amount_cents).not.toBe(workspace.total_amount_cents)
    })

    it('prend les DEUX rattachements — je le porte, ou le compte m’est attribué', async () => {
      fakeDatabase()

      const mine = await service.summary('ws-1', 'fr', { kind: 'own', userId: ME })

      // 100 000 (je le porte) + 200 000 (le compte est à moi). Ne garder que le
      // premier rendrait une liste trop courte, et une liste trop courte se croit.
      expect(mine.total_amount_cents).toBe(300_000)
      const [sql] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('o.owner_id = $2::uuid')
      expect(sql).toContain('a.assigned_to = $2::uuid')
    })

    it('l’espace est le DÉFAUT — les appelants d’avant ne changent pas de réponse', async () => {
      fakeDatabase()

      const implicit = await service.summary('ws-1')
      const explicit = await service.summary('ws-1', 'fr', { kind: 'workspace' })

      expect(implicit).toEqual(explicit)
      expect(implicit.total_count).toBe(3)
      // Et la requête ne porte AUCUN second paramètre : chemin inchangé.
      const [sql, params] = projects.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1'])
      expect(sql).not.toContain('$2')
    })

    it('sur la portée « espace », le compte hors périmètre ne PART PAS — et vaut `null`', async () => {
      fakeDatabase()

      const workspace = await service.summary('ws-1', 'fr', { kind: 'workspace' })

      expect(workspace.scope).toEqual({ kind: 'workspace', outsideAnyPortfolio: null })
      // « 0 hors périmètre » affiché en permanence est un bruit qui cesse d'être
      // lu ; la requête ne part donc pas du tout.
      const counts = projects.manager.query.mock.calls.filter(call => String(call[0]).includes('COUNT(*)'))
      expect(counts).toHaveLength(0)
    })

    it('NOMME les projets que personne ne porte — « 0 » ne veut pas dire « je n’ai rien »', async () => {
      fakeDatabase()

      const mine = await service.summary('ws-1', 'fr', { kind: 'own', userId: ME })

      // Le troisième projet est porté par quelqu'un : il n'est hors du périmètre
      // de personne. Un projet sans porteur NI compte attribué le serait.
      expect(mine.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 0 })
    })

    it('une lecture du hors-périmètre en échec fait ÉCHOUER le bloc, elle ne rassure pas', async () => {
      labels.find.mockResolvedValue([])
      projects.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) throw new Error('accounts illisible')
        return []
      })

      // Un `null` rendu ici se lirait « rien n'est hors de ton portefeuille »,
      // ce qui est une AFFIRMATION, pas une absence.
      await expect(service.summary('ws-1', 'fr', { kind: 'own', userId: ME })).rejects.toThrow('accounts illisible')
    })
  })

  describe('les libellés d’étape', () => {
    it('rend le défaut quand l’espace n’a rien renommé', async () => {
      labels.find.mockResolvedValue([])
      const stages = await service.effectiveStageLabels('ws-1', 'fr')
      expect(stages).toHaveLength(5)
      // Théo C projects-pipeline.R2 (Louis 22/10/2026, b0c930e8d8) — les cinq colonnes de Théo remplacent #4338.1 : « À qualifier » ouvre le pipe, « Cadrage » le suit.
      expect(stages[0]).toEqual({ stage: 'confirmed', label: 'À qualifier', isDefault: true })
      expect(stages[1]).toEqual({ stage: 'qualified', label: 'Cadrage', isDefault: true })
    })

    it('rend le libellé de l’espace quand il existe', async () => {
      labels.find.mockResolvedValue([
        { workspace_id: 'ws-1', stage: 'profiles_submitted', label: 'Shortlist envoyée' } as PipelineStageLabelEntity,
      ])
      const stages = await service.effectiveStageLabels('ws-1', 'fr')
      expect(stages.find(s => s.stage === 'profiles_submitted')).toEqual({
        stage: 'profiles_submitted',
        label: 'Shortlist envoyée',
        isDefault: false,
      })
    })

    it('ignore une étape inconnue lue en base plutôt que de la propager', async () => {
      labels.find.mockResolvedValue([
        { workspace_id: 'ws-1', stage: 'etape_du_futur', label: 'X' } as PipelineStageLabelEntity,
      ])
      const custom = await service.stageLabels('ws-1')
      expect(custom).toEqual({})
    })

    it('un libellé vide REMET le défaut au lieu d’afficher une colonne sans nom', async () => {
      await service.renameStage('ws-1', 'negotiation', '   ')
      expect(labels.delete).toHaveBeenCalledWith({ workspace_id: 'ws-1', stage: 'negotiation' })
      expect(labels.manager.query).not.toHaveBeenCalled()
    })
  })

  describe('les motifs de perte', () => {
    it('refuse un motif vide', async () => {
      await expect(service.addLossReason('ws-1', '   ')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('réutilise un motif existant à la casse près plutôt que d’en créer un jumeau', async () => {
      lossReasons.manager.query.mockResolvedValue([{ id: 'r-1', label: 'Trop cher' }])

      const result = await service.addLossReason('ws-1', 'TROP CHER')

      expect(result).toEqual({ id: 'r-1', label: 'Trop cher' })
      expect(lossReasons.save).not.toHaveBeenCalled()
      // Un motif archivé qu'on re-propose redevient actif : c'est le même motif.
      expect(lossReasons.update).toHaveBeenCalledWith({ id: 'r-1' }, { archived: false })
    })

    it('archive au lieu de supprimer — un projet perdu garde sa raison', async () => {
      await service.archiveLossReason('ws-1', 'r-1')
      expect(lossReasons.delete).not.toHaveBeenCalled()
      expect(lossReasons.update).toHaveBeenCalledWith({ id: 'r-1', workspace_id: 'ws-1' }, { archived: true })
    })
  })

  describe('les rôles recherchés', () => {
    it('refuse un projet hors du périmètre de l’appelant', async () => {
      projects.manager.query.mockResolvedValue([])
      await expect(service.listNeeds('ws-1', PROJECT)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('crée un rôle avec un effectif de 1 par défaut — jamais 0', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ headcount: 1, contract_kind: 'inconnu' }))
      expect(created.headcount).toBe(1)
      expect(created.target_tjm_cents).toBeNull()
    })

    describe('#3547 — le forfait encadré, sans consultants', () => {
      const saveEcho = () =>
        needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
          ...row,
          id: 'n-1',
          created_at: new Date(),
          updated_at: new Date(),
        }))

      it('PERSISTE le mode, le rôle tenu et l’équipe côté client, et les REND', async () => {
        projectFound()
        needs.count.mockResolvedValue(0)
        saveEcho()

        const created = await service.addNeed('ws-1', PROJECT, {
          title: 'Cadrage du forfait paiement',
          contract_kind: 'forfait',
          delivery_mode: 'supervised',
          supervision_role: 'framing',
          client_team_names: ['Marie Dupont', 'Paul Martin'],
        })

        expect(needs.create).toHaveBeenCalledWith(
          expect.objectContaining({
            contract_kind: 'forfait',
            delivery_mode: 'supervised',
            supervision_role: 'framing',
            client_team_size: null,
            client_team_names: ['Marie Dupont', 'Paul Martin'],
          }),
        )
        expect(created.delivery_mode).toBe('supervised')
        expect(created.supervision_role).toBe('framing')
        expect(created.client_team_names).toEqual(['Marie Dupont', 'Paul Martin'])
      })

      it('sans le mode, tout reste comme avant : staffed, rien d’inventé', async () => {
        projectFound()
        needs.count.mockResolvedValue(0)
        saveEcho()

        const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

        expect(needs.create).toHaveBeenCalledWith(
          expect.objectContaining({
            delivery_mode: 'staffed',
            supervision_role: null,
            client_team_size: null,
            client_team_names: [],
          }),
        )
        expect(created.delivery_mode).toBe('staffed')
      })

      it('REFUSE le mode encadré hors forfait : le CHECK SQL ne doit jamais être le premier à le dire', async () => {
        projectFound()
        needs.count.mockResolvedValue(0)
        saveEcho()

        await expect(
          service.addNeed('ws-1', PROJECT, { title: 'x', contract_kind: 'regie', delivery_mode: 'supervised' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(needs.save).not.toHaveBeenCalled()
      })

      it('REFUSE un rôle tenu sans le mode encadré', async () => {
        projectFound()
        needs.count.mockResolvedValue(0)

        await expect(
          service.addNeed('ws-1', PROJECT, { title: 'x', contract_kind: 'forfait', supervision_role: 'both' }),
        ).rejects.toBeInstanceOf(BadRequestException)
      })
    })

    it('PERSISTE la source et la provenance', async () => {
      // Elles étaient acceptées par le contrat, lues par la projection… et
      // jetées à l'écriture. Tout besoin sortait donc en `source: null`, et le
      // badge « détecté » n'avait rien à afficher — alors qu'un commentaire du
      // dépôt affirmait déjà que « la provenance voyage AVEC le besoin ».
      // Trouvé en recette de production le 26/08, en créant un besoin depuis un
      // appel d'offres (#1097).
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'AO SIRH',
        source: 'tender',
        provenance: 'human',
      })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'tender', provenance: 'human' }))
      expect(created.source).toBe('tender')
      expect(created.provenance).toBe('human')
    })

    it('#2323.1 — démarre au statut DÉTECTÉ un besoin de provenance modèle, jamais directement « à qualifier »', async () => {
      // `detected` existe dans le schéma et la garde d'état depuis le 25/09
      // (#2323.1), mais aucun appelant ne l'écrivait : `saveNeed` posait
      // toujours le défaut `to_qualify` de la colonne, quelle que soit la
      // provenance. Trouvé en recette écran le 26/09 — le statut « Détecté »
      // n'apparaissait jamais avant « à qualifier ».
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-3',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Besoin suggéré par le compte-rendu de réunion',
        source: 'meeting_notes',
        provenance: 'model',
      })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'detected' }))
      expect(created.status).toBe('detected')
    })

    it('laisse la source à null quand personne ne l’a dite', async () => {
      // « Non renseigné » n'est pas « saisie manuelle » : deviner une origine
      // rendrait le badge menteur plutôt qu'absent.
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-2',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.source).toBeNull()
      expect(created.provenance).toBeNull()
    })

    it('borne le nombre de rôles — au-delà c’est un appel d’offres, pas un projet', async () => {
      projectFound()
      needs.count.mockResolvedValue(50)
      await expect(service.addNeed('ws-1', PROJECT, { title: 'Encore un' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rend le TJM en nombre, jamais en chaîne pg', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte', target_tjm_cents: 65_000 })
      expect(created.target_tjm_cents).toBe(65_000)
    })

    it('PERSISTE l’urgence et le propriétaire', async () => {
      // Les deux colonnes existaient, les deux étaient LUES (le badge d'urgence
      // de la colonne « Rôle », `owner_id` dans la liste transverse) — et
      // aucune n'était écrite. Troisième occurrence du défaut « colonne lue,
      // jamais écrite » dans ce dépôt.
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Tech lead Java',
        urgency: 'haute',
        owner_id: OWNER,
      })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ urgency: 'haute', owner_id: OWNER }))
      expect(created.urgency).toBe('haute')
      expect(created.owner_id).toBe(OWNER)
    })

    it('laisse l’urgence à null quand personne ne l’a dite — jamais « normale » par défaut', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-2',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.urgency).toBeNull()
      expect(created.owner_id).toBeNull()
    })

    it('#2173.29 — PERSISTE le télétravail', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte', remote: 'hybride' })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ remote: 'hybride' }))
      expect(created.remote).toBe('hybride')
    })

    it('#2173.29 — laisse le télétravail à null quand personne ne l’a dit — jamais `sur_site` par défaut', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-2',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.remote).toBeNull()
    })

    /**
     * #2174.17 — LE PROBLÈME. La colonne `context` existe depuis `NeedFields`
     * (migration `1789537604211`) et est LUE par `open-needs.service.ts` et
     * `NeedDetailPage.tsx` — cette porte de création la jetait jusqu'ici.
     */
    it('#2174.17 — PERSISTE le problème à résoudre', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-1',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Architecte',
        context: 'La supervision repose sur un seul expert, en partance.',
      })

      expect(needs.create).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'La supervision repose sur un seul expert, en partance.' }),
      )
      expect(created.context).toBe('La supervision repose sur un seul expert, en partance.')
    })

    it('#2174.17 — laisse le problème à null quand personne ne l’a dit — jamais une phrase inventée', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-2',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.context).toBeNull()
    })

    /**
     * #2939 (#2174.16) — LA CAPACITÉ RECHERCHÉE. La colonne `expertise` existe
     * depuis `NeedFields` (migration `1789537604211`) et est LUE par
     * `open-needs.service.ts` et `NeedDetailPage.tsx` (« Expertise attendue »)
     * — cette porte de création la jetait jusqu'ici, même patron que `context`
     * (#2174.17) juste au-dessus.
     */
    it('#2939 (#2174.16) — PERSISTE la capacité recherchée', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-3',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Architecte',
        expertise: 'Architecture cloud AWS',
      })

      expect(needs.create).toHaveBeenCalledWith(expect.objectContaining({ expertise: 'Architecture cloud AWS' }))
      expect(created.expertise).toBe('Architecture cloud AWS')
    })

    it('#2939 (#2174.16) — laisse la capacité recherchée à null quand personne ne l’a dite', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-4',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.expertise).toBeNull()
    })

    /**
     * #2939 (#2174.31) — LES CONTRAINTES ADMINISTRATIVES. La colonne
     * `constraints` existe depuis `NeedFields` et est LUE par
     * `NeedDetailPage.tsx` (« Contraintes ») — même patron que `expertise`
     * (#2174.16) et `context` (#2174.17) juste au-dessus.
     */
    it('#2939 (#2174.31) — PERSISTE les contraintes administratives', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-5',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, {
        title: 'Architecte',
        constraints: 'Astreinte un week-end sur trois',
      })

      expect(needs.create).toHaveBeenCalledWith(
        expect.objectContaining({ constraints: 'Astreinte un week-end sur trois' }),
      )
      expect(created.constraints).toBe('Astreinte un week-end sur trois')
    })

    it('#2939 (#2174.31) — laisse les contraintes à null quand personne ne les a dites', async () => {
      projectFound()
      needs.count.mockResolvedValue(0)
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => ({
        ...row,
        id: 'n-6',
        created_at: new Date(),
        updated_at: new Date(),
      }))

      const created = await service.addNeed('ws-1', PROJECT, { title: 'Architecte' })

      expect(created.constraints).toBeNull()
    })

    it('#2173.29 — change le télétravail par le patch, et le retire sur `null` sans toucher au reste', async () => {
      needs.findOne.mockResolvedValue(existingNeed())
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const updated = await service.updateNeed('ws-1', 'n-1', { remote: 'full_remote' })
      expect(updated.remote).toBe('full_remote')

      needs.findOne.mockResolvedValue(existingNeed({ remote: 'full_remote', urgency: 'haute' }))
      const cleared = await service.updateNeed('ws-1', 'n-1', { remote: null })
      expect(cleared.remote).toBeNull()
      expect(cleared.urgency).toBe('haute')
    })

    it('change l’urgence et attribue le propriétaire par le patch', async () => {
      needs.findOne.mockResolvedValue(existingNeed())
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const updated = await service.updateNeed('ws-1', 'n-1', { urgency: 'critique', owner_id: OWNER })

      expect(updated.urgency).toBe('critique')
      expect(updated.owner_id).toBe(OWNER)
    })

    it('libère le propriétaire sur `null`, et ne touche à rien sur `undefined`', async () => {
      // La distinction porte tout le patch : « je n'en parle pas » et « je le
      // retire » ne sont pas la même demande, et les confondre effacerait
      // l'attribution de tous les besoins à chaque modification de titre.
      needs.findOne.mockResolvedValue(existingNeed({ urgency: 'haute', owner_id: OWNER }))
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const cleared = await service.updateNeed('ws-1', 'n-1', { owner_id: null })
      expect(cleared.owner_id).toBeNull()
      expect(cleared.urgency).toBe('haute')

      needs.findOne.mockResolvedValue(existingNeed({ urgency: 'haute', owner_id: OWNER }))
      const untouched = await service.updateNeed('ws-1', 'n-1', { title: 'Autre titre' })
      expect(untouched.owner_id).toBe(OWNER)
      expect(untouched.urgency).toBe('haute')
    })

    it('404 sur un rôle d’une autre équipe', async () => {
      needs.findOne.mockResolvedValue(null)
      await expect(service.updateNeed('ws-1', 'n-9', { title: 'X' })).rejects.toBeInstanceOf(NotFoundException)
    })

    it('#2323.22 — change le processus de présentation par le patch, et le retire sur `null` sans toucher au reste', async () => {
      needs.findOne.mockResolvedValue(existingNeed())
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const updated = await service.updateNeed('ws-1', 'n-1', {
        presentation_process: 'Un entretien technique, puis un entretien client',
      })
      expect(updated.presentation_process).toBe('Un entretien technique, puis un entretien client')

      needs.findOne.mockResolvedValue(
        existingNeed({ presentation_process: 'Un entretien technique, puis un entretien client', urgency: 'haute' }),
      )
      const cleared = await service.updateNeed('ws-1', 'n-1', { presentation_process: null })
      expect(cleared.presentation_process).toBeNull()
      expect(cleared.urgency).toBe('haute')
    })

    /**
     * #2939 (#2174.32/.34) — LE PROCESSUS DE DÉCISION ET LES ACHATS, même
     * patron `undefined`/`null` que `presentation_process` juste au-dessus.
     */
    it('#2939 — change le processus de décision et les achats par le patch, et les retire sur `null`', async () => {
      needs.findOne.mockResolvedValue(existingNeed())
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const updated = await service.updateNeed('ws-1', 'n-1', {
        decision_process: 'Comité technique, puis validation budgétaire par la DSI',
        procurement_involvement: 'implique',
      })
      expect(updated.decision_process).toBe('Comité technique, puis validation budgétaire par la DSI')
      expect(updated.procurement_involvement).toBe('implique')

      needs.findOne.mockResolvedValue(
        existingNeed({
          decision_process: 'Comité technique, puis validation budgétaire par la DSI',
          procurement_involvement: 'implique',
          urgency: 'haute',
        }),
      )
      const cleared = await service.updateNeed('ws-1', 'n-1', { decision_process: null, procurement_involvement: null })
      expect(cleared.decision_process).toBeNull()
      expect(cleared.procurement_involvement).toBeNull()
      expect(cleared.urgency).toBe('haute')
    })

    /**
     * #2939 (#2174.33) — LE DÉCIDEUR : même garde que `contact_id`
     * (l'interlocuteur) — un contact d'un AUTRE compte est REFUSÉ, jamais
     * posé, sous peine d'afficher la mauvaise personne sur le dossier client.
     */
    it('#2939 — pose le décideur quand il appartient au compte du besoin', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ account_id: 'acc-1' }))
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)
      needs.manager.query.mockResolvedValue([{ id: 'contact-1' }])

      const updated = await service.updateNeed('ws-1', 'n-1', { decision_maker_contact_id: 'contact-1' })
      expect(updated.decision_maker_contact_id).toBe('contact-1')
    })

    it('#2939 — refuse un décideur d’un AUTRE compte', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ account_id: 'acc-1' }))
      needs.manager.query.mockResolvedValue([])

      await expect(
        service.updateNeed('ws-1', 'n-1', { decision_maker_contact_id: 'contact-from-another-account' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('#2323.18 — la porte PRÉSENTER, accord sur le type de profil', () => {
    it('pose le verdict transmis, sans effet de bord sur le statut', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ profile_type_agreement: 'unknown' }))
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const agreed = await service.crossProfileTypeAgreementGate('ws-1', 'n-1', 'agreed')
      expect(agreed.profile_type_agreement).toBe('agreed')
      expect(agreed.status).toBe(existingNeed().status)

      needs.findOne.mockResolvedValue(existingNeed({ profile_type_agreement: 'agreed' }))
      const refused = await service.crossProfileTypeAgreementGate('ws-1', 'n-1', 'not_agreed')
      expect(refused.profile_type_agreement).toBe('not_agreed')
    })

    it('404 sur un rôle d’une autre équipe', async () => {
      needs.findOne.mockResolvedValue(null)
      await expect(service.crossProfileTypeAgreementGate('ws-1', 'n-9', 'agreed')).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  /**
   * #2173.49 — ARCHIVER, décision Louis 17/09/2026 : un rangement NEUTRE, le
   * statut ne bouge JAMAIS. Trois preuves, chacune contre un défaut qu'une
   * implémentation pressée aurait produit.
   */
  describe('archiver un besoin', () => {
    it('archive SANS jamais toucher au statut', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ status: 'won' }))
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const archived = await service.archiveNeed('ws-1', 'n-1', true)

      expect(archived.archived_at).not.toBeNull()
      expect(archived.status).toBe('won')
    })

    it('se retrouve et se désarchive — l’aller ET le retour', async () => {
      needs.findOne.mockResolvedValue(existingNeed())
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)
      const archived = await service.archiveNeed('ws-1', 'n-1', true)
      expect(archived.archived_at).not.toBeNull()

      needs.findOne.mockResolvedValue(existingNeed({ archived_at: new Date('2026-09-17T09:00:00.000Z') }))
      const restored = await service.archiveNeed('ws-1', 'n-1', false)
      expect(restored.archived_at).toBeNull()
      expect(restored.status).toBe('to_qualify')
    })

    it('ne réécrase pas une correction humaine posée sur un autre champ', async () => {
      // Une personne a corrigé le propriétaire et l'urgence à la main : ce
      // geste ne les recroise jamais, la relecture de la ligne le prouve.
      needs.findOne.mockResolvedValue(existingNeed({ owner_id: OWNER, urgency: 'critique' }))
      needs.save.mockImplementation(async (row: Partial<ProjectNeedEntity>) => row)

      const archived = await service.archiveNeed('ws-1', 'n-1', true)

      expect(archived.owner_id).toBe(OWNER)
      expect(archived.urgency).toBe('critique')
    })

    it('nomme l’échec plutôt qu’un succès qui n’a rien fait — déjà archivé, déjà actif', async () => {
      needs.findOne.mockResolvedValue(existingNeed({ archived_at: new Date('2026-09-17T09:00:00.000Z') }))
      await expect(service.archiveNeed('ws-1', 'n-1', true)).rejects.toBeInstanceOf(BadRequestException)

      needs.findOne.mockResolvedValue(existingNeed({ archived_at: null }))
      await expect(service.archiveNeed('ws-1', 'n-1', false)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('404 sur un rôle d’une autre équipe', async () => {
      needs.findOne.mockResolvedValue(null)
      await expect(service.archiveNeed('ws-1', 'n-9', true)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('le comité du projet', () => {
    it('refuse de rattacher quelqu’un d’un AUTRE compte', async () => {
      // Le projet existe (1re requête), mais le contact n'appartient pas à son
      // compte (2e requête vide) : le rattacher ferait apparaître, dans le comité
      // d'un client, une personne qui travaille ailleurs.
      projects.manager.query.mockResolvedValue([{ account_id: 'acc-1' }])
      links.manager.query.mockResolvedValue([])

      await expect(
        service.linkContact('ws-1', PROJECT, '22222222-2222-4222-8222-222222222222', 'sponsor'),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('corrige le rôle au lieu d’ajouter une seconde ligne', async () => {
      projects.manager.query.mockResolvedValue([{ account_id: 'acc-1' }])
      links.manager.query.mockResolvedValueOnce([{ id: 'c-1' }]).mockResolvedValueOnce([])

      await service.linkContact('ws-1', PROJECT, '22222222-2222-4222-8222-222222222222', 'acheteur')

      const [sql] = links.manager.query.mock.calls[1] as [string]
      expect(sql).toContain('ON CONFLICT (project_id, contact_id) DO UPDATE SET role = EXCLUDED.role')
    })
  })
})
