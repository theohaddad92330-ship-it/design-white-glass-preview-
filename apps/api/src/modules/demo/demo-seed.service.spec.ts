import { DEMO_OCCITANIE_CONTACTS } from './demo-occitanie-dossier'
import { DEMO_CRM_LINKS_CHAIN } from './demo-crm-links'
import { DEMO_CRM_RECETTE2_DEAL } from './demo-crm-recette2'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConflictException, NotFoundException } from '@nestjs/common'
import {
  ACCOUNT_FOLLOW_MAX_PER_USER,
  computeDso,
  INTERVENTION_THRESHOLDS,
  MANUAL_ACTION_WEEK_INDEX,
  NEED_OPEN_STATUSES,
  NEXT_ACTIONS_MAX,
  localMonthKey,
  normalizeTags,
  signalStateKey,
} from '@bellum/contracts'
import { COMMERCIAL_BRIEF_BY_COMPANY, DEMO_REAL_CONTACTS_COMPANIES } from './commercial-brief-seed'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { UserFavoriteEntity } from '../favorites/user-favorite.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { densifiedContactsFor } from './demo-contact-density'
import {
  DEMO_ACTIVITIES,
  DEMO_BUSINESS_UNITS,
  DEMO_CONSULTANTS,
  // #2569.4 — le parcours du lot N (import ZIP/messagerie).
  DEMO_CV_IMPORT_CONSULTANTS,
  DEMO_EXTERNAL_SOURCING_CONSULTANTS,
  DEMO_DELIVERY_CLIENT,
  DEMO_SIMILAR_CASES,
  DEMO_LOST_DEAL_REX,
  DEMO_START_READINESS_MISSION,
  DEMO_STAFFED_NEED,
  DEMO_MISSING_EXPERTISE,
  DEMO_NO_DEFENDABLE_PROFILE_NEED,
  DEMO_DOSSIERS,
  DEMO_ESN_PROFILE,
  DEMO_OWNER,
  DEMO_PLAN_TASKS,
  DEMO_PROFILE_CONTEXT,
  DEMO_USER_ACTIONS,
  DEMO_WORKFLOW_RUN,
  DEMO_ACTION_OS_APPROVAL,
  DEMO_RFP,
  demoUnmatchedPayments,
  demoOrgCorrections,
  demoOrgEnrichmentJobs,
  DEMO_EXTERNAL_SOURCING_PARTNER_NAME,
  DEMO_ANALYSED_ACCOUNTS,
  DEMO_EXTENSION_ACCOUNTS,
  DEMO_DOCUMENT_IDENTITY,
  demoContactSource,
} from './demo-dataset'
import { buildDemoCrmDeals } from './demo-crm-deals'
import { DEMO_PARITY_USER_ACTIONS } from './demo-parity-history'
import { DemoSeedService, esnProfileColumnType } from './demo-seed.service'
import { DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'
// #2571.5 — la même fonction PURE que l'écran (#2571.1/#2571.2) : le test
// vérifie que le dossier semé lui donne une vraie inconnue à nommer, pas
// seulement qu'une ligne existe.
import { previewNeedFromRfp } from '../rfp/rfp-to-need'
import { DEMO_FORFAIT_DOSSIERS, DEMO_FORFAIT_PROJECTS } from './demo-forfait-dataset'
import { demoSeedFingerprintFor } from './demo-room-variant'

/** #3246 — l'INSERT de la mission TERMINÉE du compte fictif des cas comparables (`DEMO_SIMILAR_CASES`). */
function isSimilarCasesMission(params: unknown): boolean {
  return Array.isArray(params) && params[4] === DEMO_SIMILAR_CASES.won.label
}

describe('DemoSeedService (demo mode C1)', () => {
  let service: DemoSeedService
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let profiles: MockRepository<ProfileEntity>
  let accounts: MockRepository<AccountEntity>
  let favorites: MockRepository<UserFavoriteEntity>
  let contacts: MockRepository<ContactEntity>
  let attackAngles: MockRepository<AttackAngleEntity>
  let actionPlans: MockRepository<ActionPlanEntity>
  let consultants: MockRepository<ConsultantEntity>
  // #2569.4 — les documents d'origine du lot N (import ZIP/messagerie).
  let consultantDocuments: MockRepository<ConsultantDocumentEntity>
  let userActions: MockRepository<UserActionEntity>
  let memberObjectives: MockRepository<MemberObjectiveEntity>
  let workflowRuns: MockRepository<WorkflowRunEntity>
  let ragDocuments: MockRepository<RagDocumentEntity>
  let notes: MockRepository<NoteEntity>
  let activities: MockRepository<ActivityEntity>
  let tasks: MockRepository<TaskEntity>
  let consultantSkills: MockRepository<ConsultantSkillEntity>
  let consultantExperiences: MockRepository<ConsultantExperienceEntity>
  let talentPreparedMessages: MockRepository<TalentPreparedMessageEntity>
  let accountEntities: MockRepository<AccountEntityRow>
  let rfps: MockRepository<RfpEntity>
  let chatMessages: MockRepository<ChatMessageEntity>
  let approvalRequests: MockRepository<ApprovalRequestEntity>

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    profiles = createMockRepository<ProfileEntity>()
    accounts = createMockRepository<AccountEntity>()
    favorites = createMockRepository<UserFavoriteEntity>()
    contacts = createMockRepository<ContactEntity>()
    attackAngles = createMockRepository<AttackAngleEntity>()
    actionPlans = createMockRepository<ActionPlanEntity>()
    consultants = createMockRepository<ConsultantEntity>()
    consultantDocuments = createMockRepository<ConsultantDocumentEntity>()
    userActions = createMockRepository<UserActionEntity>()
    memberObjectives = createMockRepository<MemberObjectiveEntity>()
    workflowRuns = createMockRepository<WorkflowRunEntity>()
    ragDocuments = createMockRepository<RagDocumentEntity>()
    notes = createMockRepository<NoteEntity>()
    activities = createMockRepository<ActivityEntity>()
    tasks = createMockRepository<TaskEntity>()
    consultantSkills = createMockRepository<ConsultantSkillEntity>()
    consultantExperiences = createMockRepository<ConsultantExperienceEntity>()
    talentPreparedMessages = createMockRepository<TalentPreparedMessageEntity>()
    accountEntities = createMockRepository<AccountEntityRow>()
    rfps = createMockRepository<RfpEntity>()
    chatMessages = createMockRepository<ChatMessageEntity>()
    approvalRequests = createMockRepository<ApprovalRequestEntity>()
    // Comme TypeORM, `save` d'un tableau rend les lignes AVEC leur id — c'est
    // ce que le seed relit pour rattacher chaque contact à sa division.
    let nextEntityId = 1
    accountEntities.save.mockImplementation(async (rows: Partial<AccountEntityRow>[]) =>
      rows.map(row => ({ ...row, id: row.id ?? `entity-${nextEntityId++}` })),
    )
    // Saved accounts get an id (the seeder wires contacts/angles/plan to it).
    let nextId = 1
    accounts.save.mockImplementation(async (entity: Partial<AccountEntity>) => ({
      ...entity,
      id: entity.id ?? `acc-${nextId++}`,
    }))
    // Comme TypeORM, `save` d'un tableau rend les entités AVEC leur id : c'est
    // ce que le seed relit pour relier l'historique aux contacts insérés.
    let nextContactId = 1
    contacts.save.mockImplementation(async (entities: Partial<ContactEntity>[]) =>
      entities.map(entity => ({ ...entity, id: entity.id ?? `contact-${nextContactId++}` })),
    )
    // #2866/#2200.34 — comme les autres, la ligne unique semée pour porter le
    // rollback du pas `schedule_decision` (`DemoSeedService`) reçoit un id : le
    // batch `DEMO_USER_ACTIONS` (un tableau) garde son comportement inchangé.
    let nextUserActionId = 1
    userActions.save.mockImplementation(async (entity: Partial<UserActionEntity> | Partial<UserActionEntity>[]) =>
      Array.isArray(entity) ? entity : { ...entity, id: entity.id ?? `ua-${nextUserActionId++}` },
    )
    // #2946 — comme les autres, le run posé pour la demande d'approbation EN
    // ATTENTE reçoit un id RÉEL : c'est celui que la tâche `action_os_approval`
    // doit porter dans `related_action_run_id`, jamais un id inventé.
    let nextRunId = 1
    workflowRuns.save.mockImplementation(async (entity: Partial<WorkflowRunEntity>) => ({
      ...entity,
      id: entity.id ?? `run-${nextRunId++}`,
    }))
    service = new DemoSeedService(
      workspaces as never,
      members as never,
      profiles as never,
      accounts as never,
      favorites as never,
      contacts as never,
      accountEntities as never,
      attackAngles as never,
      actionPlans as never,
      consultants as never,
      consultantDocuments as never,
      userActions as never,
      memberObjectives as never,
      workflowRuns as never,
      ragDocuments as never,
      notes as never,
      activities as never,
      tasks as never,
      consultantSkills as never,
      consultantExperiences as never,
      talentPreparedMessages as never,
      { materialize: jest.fn().mockResolvedValue(undefined) } as never,
      // BEL-SC-224 (#3253, P0) — un double générique : sa propre suite vit
      // dans `weakest-link-diagnosis.service.spec.ts`.
      { seedDiagnosisFor: jest.fn().mockResolvedValue(undefined) } as never,
      // Le dépôt des fichiers de la salle (31/08/2026). Un double qui accepte
      // tout : ce qui est vérifié ici est ce qui part en BASE, pas les octets.
      { put: jest.fn().mockResolvedValue(undefined) } as never,
      rfps as never,
      chatMessages as never,
      approvalRequests as never,
    )
  })

  describe('golden dataset (the fictional-by-design exception)', () => {
    it('ships the 14 target dossiers (6 of 01/10/2026 + 2 ESN Nantes demo accounts + 6 client-demo accounts of 04/10/2026) with contacts, angles and a plan each', () => {
      expect(DEMO_DOSSIERS).toHaveLength(14)
      for (const dossier of DEMO_DOSSIERS) {
        expect(dossier.account.company_name.length).toBeGreaterThan(0)
        expect(dossier.account.priority_score).toBeGreaterThanOrEqual(1)
        expect(dossier.account.it_challenges.length).toBeGreaterThan(0)
        expect(dossier.account.recent_signals.length).toBeGreaterThan(0)
        expect(dossier.contacts.length).toBeGreaterThanOrEqual(3)
        expect(dossier.attackAngles.length).toBeGreaterThanOrEqual(1)
        expect(dossier.actionPlan.weeks.length).toBeGreaterThanOrEqual(1)
      }
    })

    // Boucle de réparation du 29/09/2026 : les plans d'enrichissement visaient
    // « Societe Generale » (sans accents) alors que le dossier s'appelle
    // « Société Générale » -> jamais écrits -> `org_enrichment_jobs` vide -> la
    // salle se lisait INCOMPLÈTE à chaque entrée.
    it('chaque plan d’enrichissement et correction vise un dossier qui existe (nom exact)', () => {
      const names = new Set([
        ...DEMO_DOSSIERS.map(d => d.account.company_name),
        DEMO_DELIVERY_CLIENT.account.company_name,
      ])
      for (const job of demoOrgEnrichmentJobs()) expect(names.has(job.companyName)).toBe(true)
      for (const correction of demoOrgCorrections()) expect(names.has(correction.companyName)).toBe(true)
    })

    it('every dossier is honestly marked as a demo seed (raw_analysis.demo_seed)', () => {
      for (const dossier of DEMO_DOSSIERS) {
        expect(dossier.account.raw_analysis['demo_seed']).toBe(true)
      }
    })

    /**
     * La garde a CHANGÉ DE SENS avec les sociétés réelles.
     *
     * Elle vérifiait que tout vivait en `.example` (RFC 2606) — la bonne règle
     * quand les sociétés étaient inventées : personne ne pouvait être usurpé.
     * Les cinq dossiers portent maintenant de vraies sociétés, dont le site
     * officiel EST leur vrai domaine : l'afficher est exact, et un
     * `societegenerale.example` serait au contraire une adresse fabriquée.
     *
     * Ce qui reste interdit, et que ce test tient : la moindre COORDONNÉE
     * NOMINATIVE. Sur une personne réelle, en `.example` comme ailleurs, ce
     * serait une donnée inventée publiée sur un lien ouvert à tous.
     */
    it('ne publie une coordonnée que sur un interlocuteur SIMULÉ, et jamais routable', () => {
      const simulated = new Set(
        DEMO_DOSSIERS.flatMap(dossier =>
          densifiedContactsFor(dossier.account.company_name).map(contact => contact.full_name),
        ),
      )
      for (const dossier of DEMO_DOSSIERS) {
        expect(dossier.account.website).toMatch(/^https:\/\//)
        // EXEMPTION NOMMÉE — Groupe BPCE (décision Louis 30/09/2026, après
        // avertissement RGPD : « Tout, coordonnées incluses »). Ses coordonnées
        // sont celles du CSV importé ; `demo-dataset.spec.ts` vérifie qu'aucune
        // n'est inventée. La règle reste entière pour les six autres dossiers.
        // Étendue le 01/10/2026 aux cinq comptes à brief commercial (« coordonnées en clair »).
        if (DEMO_REAL_CONTACTS_COMPANIES.has(dossier.account.company_name)) continue
        for (const contact of dossier.contacts) {
          if (!contact.email) continue
          // Deux conditions, et il faut les DEUX : la personne est fabriquée, et
          // l'adresse ne mène nulle part. L'une sans l'autre laisserait passer
          // soit une donnée sur un humain, soit une adresse joignable.
          expect(simulated.has(contact.full_name)).toBe(true)
          expect(contact.email).toMatch(/@[a-z0-9-]+\.example$/)
        }
      }
    })

    it('exactly one recommended attack angle per dossier (rank 1)', () => {
      for (const dossier of DEMO_DOSSIERS) {
        const recommended = dossier.attackAngles.filter(angle => angle.is_recommended)
        expect(recommended).toHaveLength(1)
        expect(recommended[0]!.rank).toBe(1)
      }
    })

    it('la timeline d’exemple rattache chaque activité à un dossier existant', () => {
      // ⚠️ Les cinq dossiers RÉELS *et* le client d'exemple : `seedDeliveryClient`
      // enregistre lui aussi son compte dans `accountIds`, et il le fait AVANT
      // la boucle des activités. Une activité rattachée à un compte absent de
      // cette liste serait silencieusement jetée par le semis (`if (!accountId)
      // return null`) — c'est ce que ce test empêche, et le client d'exemple en
      // porte depuis que le brief d'avant rendez-vous a un historique à relire.
      const companies = new Set([
        ...DEMO_DOSSIERS.map(dossier => dossier.account.company_name),
        DEMO_DELIVERY_CLIENT.account.company_name,
      ])
      expect(DEMO_ACTIVITIES.length).toBeGreaterThan(0)
      for (const activity of DEMO_ACTIVITIES) {
        expect(companies.has(activity.company)).toBe(true)
        expect(Number.isFinite(activity.daysAgo)).toBe(true)
      }
    })

    // #3505 / #3532 (recette prod 02/10) — « démo SG : 0 consulté ton CRM, aucune
    // exécution semée ». Sans ces lignes, ni le regroupement des lectures (×12)
    // ni le libellé métier d'une action exécutée ne se voient devant un prospect.
    it('#3505/#3532 — SG porte douze consultations CRM identiques le même jour et une action exécutée', () => {
      const lookups = DEMO_ACTIVITIES.filter(
        activity => activity.company === 'Société Générale' && activity.kind === 'crm_lookup',
      )
      expect(lookups).toHaveLength(12)
      expect(new Set(lookups.map(activity => activity.daysAgo)).size).toBe(1)
      // Le GESTE, jamais le contenu : ni objet ni corps (`recordCrmLookup`).
      expect(lookups.every(activity => activity.subject === null && activity.body === null)).toBe(true)
      expect(
        DEMO_ACTIVITIES.some(
          activity =>
            activity.company === 'Société Générale' &&
            activity.kind === 'workflow' &&
            activity.subject === 'Préparer un message',
        ),
      ).toBe(true)
    })

    it('la timeline d’exemple contient un fil en attente ET un fil qui a répondu', () => {
      // Sans les deux, l'écran montre un seul état et le prospect ne voit pas
      // la distinction qui décide s'il faut relancer.
      expect(DEMO_ACTIVITIES.some(activity => activity.direction === 'inbound')).toBe(true)
      expect(DEMO_ACTIVITIES.some(activity => activity.direction === 'internal')).toBe(true)
    })
  })

  describe('seedWorkspace (idempotent lazy-seed)', () => {
    /**
     * #3135 — sans cette empreinte, une salle complète est indiscernable
     * d'une salle complète mais PÉRIMÉE (semée par un process antérieur).
     * `DemoResetService` la relit à chaque bail (`demo-reset.service.spec.ts`,
     * describe « #3135 »).
     */
    it('stamps the workspace with the current seed fingerprint on a REAL seed', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(workspaces.update).toHaveBeenCalledWith(
        { id: 'ws-demo' },
        { demo_seed_fingerprint: DEMO_SEED_FINGERPRINT },
      )
    })

    describe('#4291 J — la variante forfait / conseil, par le MÊME semis', () => {
      const forfaitNames = DEMO_FORFAIT_DOSSIERS.map(d => d.account.company_name)
      const savedNames = () => accounts.create.mock.calls.map(call => (call[0] as Partial<AccountEntity>).company_name)
      const rawSql = () => accounts.manager.query.mock.calls.map(call => [String(call[0]), call[1]] as const)

      it('une salle forfait (n° > 1000) reçoit le semis staffing ENTIER, puis ses dossiers, ses projets et son profil', async () => {
        accounts.count.mockResolvedValueOnce(0)
        workspaces.findOne.mockResolvedValue({ id: 'ws-f', demo_slot_index: 1001 } as WorkspaceEntity)

        await service.seedWorkspace('ws-f', 'owner-1')

        for (const dossier of DEMO_DOSSIERS) expect(savedNames()).toContain(dossier.account.company_name)
        for (const name of forfaitNames) expect(savedNames()).toContain(name)
        const profile = rawSql().find(([q]) => q.includes('SET workspace_profile'))
        expect(profile?.[1]).toEqual(['owner-1', 'ws-f', 'forfait_conseil'])
        const needs = rawSql().filter(([q]) => q.includes('#4291 J — projet à cadrer'))
        expect(needs.map(([, params]) => (params as unknown[])[2])).toEqual(DEMO_FORFAIT_PROJECTS.map(p => p.title))
        const missions = rawSql().filter(([q]) => q.includes('#4291 J — projet gagné suivi'))
        expect(missions).toHaveLength(DEMO_FORFAIT_PROJECTS.filter(p => p.mission).length)
        // L'empreinte FORFAIT, posée en dernier : une salle à moitié semée reste « périmée ».
        expect(workspaces.update).toHaveBeenLastCalledWith(
          { id: 'ws-f' },
          { demo_seed_fingerprint: demoSeedFingerprintFor('forfait_conseil') },
        )
      })

      it('une salle staffing : RIEN de la variante (la démo actuelle ne change pas)', async () => {
        accounts.count.mockResolvedValueOnce(0)
        workspaces.findOne.mockResolvedValue({ id: 'ws-demo', demo_slot_index: 3 } as WorkspaceEntity)

        await service.seedWorkspace('ws-demo', 'owner-1')

        for (const name of forfaitNames) expect(savedNames()).not.toContain(name)
        expect(rawSql().some(([q]) => q.includes('SET workspace_profile'))).toBe(false)
        expect(rawSql().some(([q]) => q.includes('#4291 J'))).toBe(false)
        expect(workspaces.update).toHaveBeenCalledWith(
          { id: 'ws-demo' },
          { demo_seed_fingerprint: DEMO_SEED_FINGERPRINT },
        )
      })
    })

    it('does NOT re-stamp — or write anything else — when the workspace already holds dossiers', async () => {
      accounts.count.mockResolvedValueOnce(3)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(workspaces.update).not.toHaveBeenCalled()
    })

    it('seeds all four tables, stamped with workspace/owner and source=demo', async () => {
      accounts.count.mockResolvedValueOnce(0)
      const result = await service.seedWorkspace('ws-demo', 'owner-1')

      expect(result).toEqual({ seeded: true, accounts: DEMO_DOSSIERS.length })
      // +1 — #2818 : l'ESN partenaire fictive de `seedExternalSourcingExamples`,
      // écrite en `.save()` comme les dossiers, jamais comptée parmi eux.
      // +1 — I31 (05/10) : l'ancre partenaire du consultant sous-traitant, posée AVANT lui
      // (`consultants_subcontracting_partner_check`), elle aussi en `.save()`.
      // +5 — D13 (06/10) : les comptes d'extension (#3294) s'écrivent désormais par `seedDossier`, comme les briefs.
      expect(accounts.save).toHaveBeenCalledTimes(
        DEMO_DOSSIERS.length + DEMO_EXTENSION_ACCOUNTS.length + DEMO_ANALYSED_ACCOUNTS.length + 2,
      )
      // Six, et pas sept : le client d'exemple porte lui aussi des
      // interlocuteurs depuis que « missions signées par contact » existe, mais
      // son compte s'insère en SQL brut et le doublon par défaut de ce test
      // rend `[]` — `seedDeliveryClient` sort sur son `if (!account) return`
      // avant d'écrire quoi que ce soit. Le septième appel est compté dans le
      // bloc « client d'exemple », où le doublon rend un compte.
      // ⚠️ #1473 — UN appel de plus que les dossiers : les contacts « à
      // qualifier » (sans entreprise) sont écrits par leur propre passage, en
      // un seul `save`. Les compter avec les dossiers ferait croire qu'un
      // sixième dossier existe.
      // ⚠️ #2648.1 — UN appel de plus encore : le contact dont l'accroche
      // échoue avec une raison nommée (`seedIcebreakerInsufficientContextContact`)
      // part lui aussi SANS compte, par son propre passage dédié — délibérément
      // séparé des contacts « à qualifier » (voir `demo-dataset.ts`).
      // ⚠️ Décision Louis 04/10/2026 — aucune personne RÉELLE créée pour le client de livraison
      // (sièges déjà semés par son dossier). Lot D01 (06/10/2026) : UN appel pour ses interlocuteurs
      // SIMULÉS (`.example`) — `DEMO_DELIVERY_CLIENT.contacts`, écrits en un seul `save`.
      // ⚠️ D13 : un `save` de plus par compte d'extension — leur siège de décision (un seul contact, sans nom).
      expect(contacts.save).toHaveBeenCalledTimes(
        DEMO_DOSSIERS.length + DEMO_EXTENSION_ACCOUNTS.length + DEMO_ANALYSED_ACCOUNTS.length + 3,
      )
      // Aucun angle ni plan sur un compte d’extension mince : on n’invente pas une stratégie (D13) — seuls les comptes ANALYSÉS (12/10) portent les leurs.
      // +1 — Louis 13/10/2026 (parité Orange / BPCE) : Orange, compte d’extension, porte désormais pistes d’approche et plan d’action.
      const ORANGE_WITH_STRATEGY = 1
      expect(attackAngles.save).toHaveBeenCalledTimes(
        DEMO_DOSSIERS.length + DEMO_ANALYSED_ACCOUNTS.length + ORANGE_WITH_STRATEGY,
      )
      expect(actionPlans.save).toHaveBeenCalledTimes(
        DEMO_DOSSIERS.length + DEMO_ANALYSED_ACCOUNTS.length + ORANGE_WITH_STRATEGY,
      )

      // Accounts land completed, scoped to the demo workspace + owner — sauf
      // l'ancre de l'ESN partenaire, `deleted` à dessein (hors liste, recette 05/10).
      // Lot D01 (06/10/2026) : le dossier qui déclare `analysis_status: 'analyzing'` est semé en cours d'analyse.
      const analyzingNames = new Set(
        DEMO_DOSSIERS.filter(dossier => dossier.account.analysis_status === 'analyzing').map(
          dossier => dossier.account.company_name,
        ),
      )
      expect(analyzingNames.size).toBe(1)
      for (const call of accounts.create.mock.calls) {
        const status =
          call[0].company_name === DEMO_EXTERNAL_SOURCING_PARTNER_NAME
            ? 'deleted'
            : analyzingNames.has(String(call[0].company_name))
              ? 'analyzing'
              : 'completed'
        expect(call[0]).toMatchObject({ workspace_id: 'ws-demo', user_id: 'owner-1', status })
      }
      // Every contact is stamped source='demo' (the honest provenance mark)
      // and never claims a verified email — SAUF le témoin unique de la cascade
      // « deviné puis vérifié SMTP » (#4107.4) : un seul contact, jamais un lot.
      const verified = contacts.create.mock.calls.filter(
        call => (call[0] as Partial<ContactEntity>).email_verified === true,
      )
      expect(verified).toHaveLength(1)
      for (const call of contacts.create.mock.calls) {
        // #4526.4 — seuls les contacts NOMMÉS d'origine CRM portent `crm` ; tous les autres restent `demo`.
        const seeded = call[0] as Partial<ContactEntity>
        expect(seeded).toMatchObject({ workspace_id: 'ws-demo', user_id: 'owner-1' })
        expect(seeded.source).toBe(demoContactSource(seeded.full_name ?? ''))
        if ((call[0] as Partial<ContactEntity>).email_verified !== true) {
          expect((call[0] as Partial<ContactEntity>).email_verified).toBe(false)
        }
      }
      // Contacts/angles/plans are wired to the saved account ids — SAUF les
      // contacts « à qualifier » (#1473), dont `account_id` est `null` par
      // construction. C'est ce que la capacité EST : les exiger rattachés
      // reviendrait à interdire ce que le chantier vient d'ouvrir.
      const contactAccountIds = contacts.create.mock.calls.map(call => (call[0] as Partial<ContactEntity>).account_id)
      for (const accountId of contactAccountIds) {
        if (accountId === null) continue
        expect(accountId).toMatch(/^acc-\d+$/)
      }
      // Et il y en a réellement, sinon l'assertion ci-dessus se contenterait
      // d'un jeu où tous sont rattachés.
      expect(contactAccountIds.filter(id => id === null).length).toBeGreaterThan(0)
    })

    /**
     * #3104 (27/09/2026) — LE CHEMIN RÉEL DE PRODUCTION : un conflit d'unicité
     * sur les contacts d'UN dossier ne doit PAS empêcher le reste de
     * `seedWorkspace` — en particulier la conversation d'exemple de
     * `chat_messages`, seedée PLUS LOIN dans la fonction. Mesuré en
     * production : sans repli, `seedWorkspace` levait une `QueryFailedError`
     * (`idx_contacts_account_normalized_name`) et le panneau « Conversations »
     * de /chat affichait « Aucune conversation » — la ligne n'était jamais
     * écrite, quel que soit le nombre de visiteurs suivants (le conflit est
     * déterministe, `DemoPoolService.tidy()` l'avale silencieusement).
     *
     * Le conflit mesuré en production venait de la paire d'homonymes de
     * SNCF (#2297.18, deux « Mathis Fontenelle ») — retirée depuis
     * (même ticket, revirement du 27/09 : l'ambiguïté qu'elle démontrait vient
     * du FOURNISSEUR, jamais de deux lignes en base, voir `demo-contact-
     * density.ts`). Ce test rejoue donc un AUTRE cas de conflit — un contact
     * laissé par un semis partiel/concurrent précédent, déjà présent en base
     * sous le même nom normalisé — pour continuer à prouver que le repli
     * ligne par ligne fonctionne, indépendamment de la paire corrigée.
     *
     * Le mock de `contacts.save` REJOUE la contrainte SQL réelle
     * (`idx_contacts_account_normalized_name`, code Postgres 23505) : deux
     * lignes du MÊME compte au même nom normalisé (accents/casse ignorés) ne
     * peuvent pas coexister, que ce soit dans le MÊME lot ou face à ce qui a
     * déjà été inséré avant (le repli ligne par ligne du correctif).
     */
    it('#3104 — un conflit de nom sur les contacts d’UN dossier n’empêche pas le reste du semis (chat_messages compris)', async () => {
      accounts.count.mockResolvedValueOnce(0)

      // Id stable par société — indépendant de l'ordre de traitement des
      // dossiers dans `seedWorkspace`, pour pouvoir amorcer un conflit
      // déterministe sur SNCF juste en dessous.
      accounts.save.mockImplementation(async (entity: Partial<AccountEntity>) => ({
        ...entity,
        id: entity.id ?? `acc-${entity.company_name}`,
      }))

      const normalize = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
      const uniqueViolation = Object.assign(
        new Error('duplicate key value violates unique constraint "idx_contacts_account_normalized_name"'),
        { code: '23505' },
      )
      // Amorce le conflit : « Guillaume Tanguy » chez SNCF existe déjà en
      // base (un semis partiel/concurrent précédent, par exemple) — le lot de
      // contacts de ce dossier va donc échouer en bloc, exactement comme un
      // VRAI conflit d'unicité sur l'`INSERT` en masse.
      const seenKeys = new Set<string>(['acc-SNCF::guillaume tanguy'])
      let nextId = 1
      contacts.save.mockImplementation(async (input: unknown) => {
        const rows = (Array.isArray(input) ? input : [input]) as Partial<ContactEntity>[]
        const keys = rows.map(row => `${row.account_id}::${normalize(row.full_name ?? '')}`)
        const intraBatchDuplicate = new Set(keys).size !== keys.length
        const priorConflict = keys.some(key => seenKeys.has(key))
        if (intraBatchDuplicate || priorConflict) throw uniqueViolation
        keys.forEach(key => seenKeys.add(key))
        const saved = rows.map(row => ({ ...row, id: row.id ?? `contact-${nextId++}` }))
        return Array.isArray(input) ? saved : saved[0]
      })

      // Rouge avant le correctif : `seedWorkspace` rejette (la même
      // `QueryFailedError` qu'en production) dès qu'il atteint SNCF, et
      // n'écrit donc jamais `chat_messages`. Vert après : le conflit est
      // écarté ligne par ligne (seul « Guillaume Tanguy » est écarté), les
      // AUTRES contacts de SNCF sont bien insérés malgré l'échec du lot,
      // et le reste du semis — chat_messages compris — s'exécute normalement.
      await expect(service.seedWorkspace('ws-demo', 'owner-1')).resolves.toMatchObject({ seeded: true })
      expect(chatMessages.save).toHaveBeenCalled()
      expect(seenKeys.has('acc-SNCF::mathis fontenelle')).toBe(true)
    })

    /**
     * Recette du 01/10/2026 — « Préparation » ≈ 60 s. Un seul homonyme déjà en base
     * (semis partiel) faisait retomber TOUT le dossier en insertion ligne par ligne :
     * ~1 900 allers-retours sur un compte à brief. Le repli se limite maintenant au
     * lot de 200 qui porte le conflit.
     *
     * Mesure (mock, ENGIE, un conflit dans le dernier lot) — appels à `contacts.save` :
     *   avant le correctif : 1 + N lignes (N = contacts d'ENGIE, > 400)
     *   après              : 1 + nombre de lots + ≤ 200 lignes (le lot fautif seul)
     */
    it('un conflit de nom ne fait pas retomber tout le dossier en insertion ligne par ligne', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.save.mockImplementation(async (entity: Partial<AccountEntity>) => ({
        ...entity,
        id: entity.id ?? `acc-${entity.company_name}`,
      }))
      const engieContacts = DEMO_DOSSIERS.find(d => d.account.company_name === 'ENGIE')!.contacts
      expect(engieContacts.length).toBeGreaterThan(400)
      const lastName = engieContacts[engieContacts.length - 1]!.full_name
      const normalize = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
      const seenKeys = new Set<string>([`acc-ENGIE::${normalize(lastName)}`])
      let nextId = 1
      let engieCalls = 0
      contacts.save.mockImplementation(async (input: unknown) => {
        const rows = (Array.isArray(input) ? input : [input]) as Partial<ContactEntity>[]
        if (rows.some(row => row.account_id === 'acc-ENGIE')) engieCalls += 1
        const keys = rows.map(row => `${row.account_id}::${normalize(row.full_name ?? '')}`)
        if (keys.some(key => seenKeys.has(key)) || new Set(keys).size !== keys.length) {
          throw Object.assign(new Error('duplicate key'), { code: '23505' })
        }
        keys.forEach(key => seenKeys.add(key))
        const saved = rows.map(row => ({ ...row, id: row.id ?? `contact-${nextId++}` }))
        return Array.isArray(input) ? saved : saved[0]
      })

      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(engieCalls).toBeLessThanOrEqual(Math.ceil(engieContacts.length / 200) + 201)
    })

    /**
     * #2150.14/.18 — REVIREMENT ASSUMÉ DE #1800 : sans cette ligne, le filtre
     * « Mes favoris » de `/accounts` s'ouvrirait sur du VIDE devant un
     * prospect (craft rule 9) — la table existe et est cloisonnée par
     * `user_id`, mais rien ne l'écrivait plus depuis #1800.
     */
    it('marque UN compte de la salle comme favori PERSONNEL du responsable (#2150.14/.18)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(favorites.save).toHaveBeenCalledTimes(1)
      const written = favorites.create.mock.calls[0]?.[0] as Partial<UserFavoriteEntity>
      expect(written).toMatchObject({ user_id: 'owner-1', entity_type: 'account' })
      // L'identifiant écrit suit le MÊME format que ceux que `accounts.save`
      // vient de générer (`acc-<n>`) — jamais un id deviné qui pointerait
      // dans le vide (même garde que `contactAccountIds` juste au-dessus).
      expect(written.entity_id).toMatch(/^acc-\d+$/)
    })

    /**
     * #4267 (craft rule 9) — /mes-cibles s'ouvre sur « Comptes suivis » : sans suivi semé, la salle
     * montrerait la carte « suis ton compte le plus récent » au lieu du produit en marche. Le responsable
     * suit AU PLUS le plafond, et seulement des comptes RÉELS du jeu (ids rendus par `accounts.save`).
     */
    it('#4267 — le responsable suit au plus 3 comptes RÉELS de la salle', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const inserts = accounts.manager.query.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO account_follows'),
      )
      expect(inserts).toHaveLength(1)
      const params = inserts[0]?.[1] as unknown[]
      expect(params[0]).toBe('owner-1')
      expect(params[1]).toBe('ws-demo')
      const followed = params[2] as string[]
      expect(followed.length).toBeGreaterThan(0)
      expect(followed.length).toBeLessThanOrEqual(ACCOUNT_FOLLOW_MAX_PER_USER)
      for (const id of followed) expect(id).toMatch(/^acc-\d+$/)
      expect(new Set(followed).size).toBe(followed.length)
    })

    /**
     * Théo A signaux (craft rule 9) — la bibliothèque `/signals` ne s'ouvre pas vide en démo : des signaux
     * ENREGISTRÉS, ÉCARTÉS et À LA CORBEILLE (sur les VRAIS faits des comptes semés, désignés par leur clé
     * normalisée), et deux veilles — une active, une en pause dont un compte n'est pas suivi.
     */
    it('Théo A signaux — sème des états de signaux réels et deux veilles (une active, une en pause)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const calls = accounts.manager.query.mock.calls
      const stateWrite = calls.find(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO signal_user_states'),
      )
      expect(stateWrite).toBeDefined()
      const params = stateWrite?.[1] as [string, string, string[], string[], string[]]
      expect(params[0]).toBe('owner-1')
      expect(params[1]).toBe('ws-demo')
      const [, , accountIds, keys, states] = params
      expect(accountIds.length).toBeGreaterThan(0)
      expect(new Set(states)).toEqual(new Set(['saved', 'discarded', 'trashed']))
      for (const id of accountIds) expect(id).toMatch(/^acc-\d+$/)
      // Chaque clé est celle d'un fait RÉEL d'un dossier semé — jamais un texte inventé pour l'occasion.
      const facts = new Set(
        DEMO_DOSSIERS.flatMap(dossier =>
          dossier.account.recent_signals.map(signal => signalStateKey(signal.signal ?? '')),
        ),
      )
      for (const key of keys) expect(facts.has(key)).toBe(true)

      const watchWrites = calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO signal_watches'),
      )
      expect(watchWrites).toHaveLength(2)
      const watchStates = watchWrites.map(call => (call[1] as unknown[])[6])
      expect([...watchStates].sort()).toEqual(['active', 'paused'])
    })

    it('écrit la fiche contact ENTIÈRE — aucun onglet ne doit s’ouvrir vide en démo', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Ce que le seed doit poser sur CHAQUE contact RATTACHÉ : le reste
      // (coordonnées, relations, profil enrichi) est ce que le clic
      // « Enrichir » ajoute.
      //
      // ⚠️ #1473 — les contacts « à qualifier » sont exclus, et ce n'est pas un
      // assouplissement : périmètre, script d'appel, cadence et signaux se
      // DÉDUISENT tous du dossier. Sans dossier, les fabriquer écrirait un
      // script d'appel qui ne parle d'aucune société — une donnée inventée
      // montrée à un prospect. Leur propre garde
      // (`demo-unqualified-contacts-coverage.spec.ts`) vérifie qu'ils portent
      // ce qu'ils DOIVENT porter : identité, provenance, coordonnée.
      const attachedContacts = contacts.create.mock.calls
        .map(call => call[0] as Partial<ContactEntity>)
        .filter(contact => contact.account_id !== null)
        // D13 : le siège sans nom d'un compte d'extension n'a, À DESSEIN, ni signal ni activité datés — aucun fait
        // daté n'est inventé sur une société réelle (voir `demo-extension-accounts-filled.spec.ts`).
        // 12/10 : Orange (alimenté par le relevé du Drive) range ses fiches sous ses entités (`subsidiaries`) — même raison.
        .filter(
          contact =>
            !DEMO_EXTENSION_ACCOUNTS.some(
              account => account.company_name === contact.entity || account.subsidiaries.includes(contact.entity ?? ''),
            ),
        )
      expect(attachedContacts.length).toBeGreaterThan(0)
      for (const contact of attachedContacts) {
        expect(contact.scope).toBeTruthy()
        expect(contact.budget_authority).toBeTruthy()
        expect(contact.phone_script).toBeTruthy()
        expect(contact.cadence_messages).toBeTruthy()
        expect(contact.followup_message).toBeTruthy()
        expect(contact.career_levers?.length).toBeGreaterThan(0)
        expect(contact.implicit_fears?.length).toBeGreaterThan(0)
        expect(contact.signals?.length).toBeGreaterThan(0)
        expect(contact.activity?.length).toBeGreaterThan(0)
        expect(contact.language).toBeTruthy()
        expect(contact.timezone).toBeTruthy()
      }
    })

    // #2196.31 — l'exception « non applicable » se voit en démonstration :
    // posée sur un mois SANS relevé d'une mission en régie, avec son motif, et
    // sa ligne au journal de la mission (l'historique du compte porteur).
    it('#2196.31 — une exception « non applicable » est semée, motif et journal compris', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const insert = accounts.manager.query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO mission_timesheet_exceptions'),
      )
      expect(insert).toBeDefined()
      const params = insert?.[1] as unknown[]
      expect(params[0]).toBe('ws-demo')
      expect(String(params[2]).trim().length).toBeGreaterThan(10)
      expect(params[3]).toBe('owner-1')

      const journal = activities.create.mock.calls
        .map(call => call[0] as Partial<ActivityEntity>)
        .find(row => String(row.subject ?? '').endsWith('— timesheet_not_applicable'))
      expect(journal).toMatchObject({ kind: 'workflow', source: 'system', body: params[2] })
    })

    // #2159.26 — les étiquettes se voient en démonstration : sur des contacts,
    // sur des comptes (création par l'entité ET insertion du client d'exemple),
    // toujours sous leur graphie normalisée — la contrainte SQL refuserait
    // sinon le semis entier.
    it('#2159.26 — des contacts et des comptes de la salle portent des étiquettes normalisées', async () => {
      accounts.count.mockResolvedValueOnce(0)
      // Le client d'exemple s'insère en SQL brut : sans id rendu, il sort en
      // `return` anticipé et ses interlocuteurs ne sont jamais créés.
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const contactTags = contacts.create.mock.calls.map(call => (call[0] as Partial<ContactEntity>).tags ?? [])
      expect(contactTags.filter(tags => tags.length > 0).length).toBeGreaterThanOrEqual(2)
      for (const tags of contactTags) expect(tags).toEqual(normalizeTags(tags))

      const accountTags = accounts.create.mock.calls.map(call => (call[0] as Partial<AccountEntity>).tags ?? [])
      expect(accountTags.filter(tags => tags.length > 0).length).toBeGreaterThanOrEqual(2)
      for (const tags of accountTags) expect(tags).toEqual(normalizeTags(tags))

      // Décision Louis 04/10/2026 — les étiquettes du client sont posées par l'UPDATE du compte porteur.
      const clientInsert = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE accounts') &&
          call[0].includes('business_unit_id = $5'),
      )
      expect(String(clientInsert?.[0])).toContain('tags')
      const clientTags = (clientInsert?.[1] as unknown[]).find(value => Array.isArray(value)) as string[] | undefined
      expect(clientTags?.length).toBeGreaterThan(0)
    })

    // #2165.38 — trou pré-existant depuis le 18/09, repéré le 21/09 : AUCUN
    // contact de démo ne portait de `location`. Invisible tant que rien ne
    // filtrait dessus ; le filtre pays par défaut de Découvrir (#2621.1)
    // exclut désormais toute localisation inconnue, donc l'onglet Contacts
    // s'ouvrait VIDE en démonstration. Rouge tant que `demoContactRow()` ne
    // transmet pas `location` à `.create({})`.
    it('#2165.38 — chaque contact du jeu de démo porte un LIEU DE TRAVAIL, sinon Découvrir sort vide', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const created = contacts.create.mock.calls.map(call => call[0] as Partial<ContactEntity>)
      expect(created.length).toBeGreaterThan(0)
      // #4556 — SEULE exception : le lieu INCONNU posé à dessein sur le dossier cadré (`DEMO_OCCITANIE_CONTACTS`,
      // `location: null`) — un contact sans lieu connu reste affiché, il n'est pas rangé « hors zone ».
      const unknownByDesign = new Set(DEMO_OCCITANIE_CONTACTS.filter(c => c.location === null).map(c => c.full_name))
      for (const contact of created) {
        if (unknownByDesign.has(contact.full_name as string)) {
          expect(contact.location).toBeNull()
          continue
        }
        expect(typeof contact.location).toBe('string')
        expect((contact.location as string).trim().length).toBeGreaterThan(0)
        // Forme brute Apollo attendue par `MARKET_COUNTRY_NAMES.FR` ('France')
        // et par `filterContactRows` (comparaison insensible à la casse) —
        // voir discover-contact-rows.demo-seed.test.ts (apps/web).
        expect(contact.location).toContain('France')
      }

      // Cohérente avec l'ENTREPRISE : la ville du siège, pas la rue entière
      // (bug de `headquartersCity` sur l'adresse complète — corrigé par ce lot).
      const marchand = created.find(contact => contact.full_name === 'Philippe Marchand')
      expect(marchand?.location).toBe('Saint-Denis, Île-de-France, France')

      // Un contact SANS entreprise connue (#1473) n'a pas de siège à suivre —
      // il porte quand même un lieu plausible, jamais `null`.
      const camilleRoussel = created.find(contact => contact.full_name === 'Camille Roussel')
      expect(camilleRoussel?.location).toBe('Paris, France')
    })

    // #2297.51 — la couverture de démo AFFIRME que `enrichment_archived_at` /
    // `enrichment_archive` sont seedées ; ce test le VÉRIFIE sur la ligne
    // réellement passée à `.create({})` — rouge si `demoContactRow()` cesse de
    // les transmettre, ou si le jeu de données perd sa fiche archivée.
    it('une personne simulée porte des coordonnées ARCHIVÉES par la rétention, datées (#2297.51)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const created = contacts.create.mock.calls.map(call => call[0] as Partial<ContactEntity>)
      const archived = created.filter(contact => contact.enrichment_archived_at instanceof Date)
      expect(archived.map(contact => contact.full_name)).toEqual(['Hervé Lacombe'])
      const [row] = archived
      // Archivé = la colonne lue est VIDE (inconnue), la valeur est dans l'archive.
      expect(row.email ?? null).toBeNull()
      expect(row.phone ?? null).toBeNull()
      expect(row.enrichment_archive).toMatchObject({ email: expect.stringMatching(/\.example$/) })
      expect(row.enrichment_archived_at!.getTime()).toBeLessThan(Date.now())
      // Les autres fiches n'ont rien d'archivé : `null`, jamais un trou.
      expect(created.filter(c => c.enrichment_archive != null)).toHaveLength(1)
    })

    // #2120.68 — la confiance se voit aussi dans la salle de démo : un
    // interlocuteur SIMULÉ joignable (`demo-contact-density.ts`, `toContact()`)
    // porte sa confiance et son coût par champ jusqu'à la ligne écrite en base.
    // Rouge si `demoContactRow()` cesse de les transmettre à `.create({})` —
    // c'est exactement ce qui manquait avant ce lot : la classification de
    // couverture (`demo-coverage.ts`) AFFIRMAIT que ces colonnes étaient
    // remplies sans qu'aucun test ne le vérifie.
    it('un interlocuteur simulé joignable porte sa confiance et son coût par champ (#2120.68, #2120.70)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const created = contacts.create.mock.calls.map(call => call[0] as Partial<ContactEntity>)

      // La liste INDÉPENDANTE des interlocuteurs simulés JOIGNABLES, telle que
      // `demo-contact-density.ts` la produit — pas un filtre par domaine, qui
      // attraperait aussi les contacts `.example` du client d'exemple (une
      // société fictive distincte, qui ne passe pas par ce mécanisme).
      const reachableEmails = new Set(
        DEMO_DOSSIERS.flatMap(dossier => densifiedContactsFor(dossier.account.company_name))
          .map(contact => contact.email)
          .filter((email): email is string => email !== null),
      )
      // Si ce compte tombe à zéro, le test ne prouve plus rien : le jeu de
      // données doit réellement contenir des interlocuteurs simulés joignables.
      expect(reachableEmails.size).toBeGreaterThan(0)

      const reachableSimulated = created.filter(
        contact => typeof contact.email === 'string' && reachableEmails.has(contact.email),
      )
      expect(reachableSimulated.length).toBe(reachableEmails.size)

      for (const contact of reachableSimulated) {
        expect(contact.email_confidence).toBe('medium')
        expect(contact.email_cost_credits).toBeGreaterThan(0)
        expect(contact.phone_cost_credits).toBeGreaterThan(0)
        // Aucun signal fiable n'existe pour un numéro, en démo comme en réel
        // (GA-18/19 — non mesurée, jamais devinée) : `phone_confidence` reste
        // absent même sur un interlocuteur joignable.
        expect(contact.phone_confidence ?? null).toBeNull()
      }

      // Un mandataire social RÉEL, rattaché à un dossier mais sans coordonnée,
      // ne porte ni confiance ni coût : « non mesuré » n'est jamais « 0 »
      // (GA-18/19). Si ce compte tombe à zéro, le contraste ne prouve plus rien.
      const unreachableNamed = created.filter(contact => contact.account_id !== null && contact.email == null)
      expect(unreachableNamed.length).toBeGreaterThan(0)
      for (const contact of unreachableNamed) {
        expect(contact.email_confidence ?? null).toBeNull()
        expect(contact.email_cost_credits ?? null).toBeNull()
        expect(contact.phone_cost_credits ?? null).toBeNull()
      }
    })

    // #1473 — et symétriquement : la fiche d'un contact à qualifier NE porte
    // PAS ce qui se déduit d'un dossier. C'est l'autre moitié de la règle, et
    // sans elle le filtre ci-dessus ne serait qu'une exemption.
    it('n’invente RIEN sur un contact sans entreprise', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const unqualified = contacts.create.mock.calls
        .map(call => call[0] as Partial<ContactEntity>)
        .filter(contact => contact.account_id === null)

      expect(unqualified.length).toBeGreaterThan(0)
      for (const contact of unqualified) {
        expect(contact.scope).toBeNull()
        expect(contact.phone_script).toBeNull()
        expect(contact.cadence_messages).toBeNull()
        expect(contact.followup_message).toBeNull()
        expect(contact.signals).toEqual([])
        expect(contact.activity).toEqual([])
        // Ce qu'il porte, en revanche : de quoi le reconnaître et le rappeler.
        expect(contact.full_name).toBeTruthy()
        expect(contact.why_contact).toBeTruthy()
      }
    })

    it('seeds what lives AROUND the dossiers too (vivier, historique, objectifs)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      // Le client d'exemple s'insère en SQL brut : sans cet id rendu, il sort
      // en `return` anticipé, il n'entre pas au registre partagé des comptes,
      // et les traces d'ISSUE qui le désignent partiraient avec
      // `account_id: null` — orphelines. C'est exactement ce que l'assertion
      // « chaque ligne est reliée à un compte » plus bas existe pour attraper.
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Trois écrans entiers dépendent de ces lignes : sans elles, « Vivier »,
      // « Historique » et « Pilotage » s'ouvrent vides pendant une démo.
      // #2569.4 — le second appel est `seedCvImportExamples` : le parcours du
      // lot N (doublon résolu, exception isolée), EN PLUS du vivier.
      // #2818 — le troisième est `seedExternalSourcingExamples` : une fiche
      // par source du port de sourcing externe, EN PLUS des deux groupes.
      expect(consultants.save).toHaveBeenCalledTimes(3)
      expect(consultants.create).toHaveBeenCalledTimes(
        DEMO_CONSULTANTS.length + DEMO_CV_IMPORT_CONSULTANTS.length + DEMO_EXTERNAL_SOURCING_CONSULTANTS.length,
      )
      // #2866/#2200.34 — +1 : la ligne `user_actions` réelle que porte
      // désormais `externalRef` du pas `schedule_decision`, pour que le geste
      // UNDO de l'Action Center fonctionne en démo (voir plus bas).
      expect(userActions.create).toHaveBeenCalledTimes(DEMO_USER_ACTIONS.length + DEMO_PARITY_USER_ACTIONS.length + 1)
      expect(memberObjectives.create).toHaveBeenCalledTimes(1)

      for (const call of consultants.create.mock.calls) {
        expect(call[0]).toMatchObject({ workspace_id: 'ws-demo', user_id: 'owner-1' })
      }

      // #2948 (#2329.12-.16) — le TJM et ses métadonnées sont deux axes
      // indépendants : la majorité des fiches n'a AUCUNE métadonnée (`null`),
      // et celles qui en portent une la relaient telle quelle, `observed_at`
      // converti en date ISO plutôt qu'un décalage en jours.
      const created = consultants.create.mock.calls.map(call => call[0] as Partial<ConsultantEntity>)
      const withoutMetadata = created.filter(row => row.tjm_metadata === null)
      expect(withoutMetadata.length).toBeGreaterThan(0)
      const hakim = created.find(row => row.full_name === 'Hakim Barreau')
      expect(hakim?.tjm_metadata).toMatchObject({ currency: 'EUR', confidential: false })
      expect(typeof (hakim?.tjm_metadata as { observed_at?: unknown })?.observed_at).toBe('string')
      const yanis = created.find(row => row.full_name === 'Yanis Berthier')
      expect(yanis?.tjm_metadata).toMatchObject({ confidential: true, source: 'Grille salariale interne' })

      // L'historique est relié aux lignes réellement insérées — un id manquant
      // afficherait une trace orpheline, sans compte ni contact cliquable.
      const linked = userActions.create.mock.calls.map(call => call[0] as Partial<UserActionEntity>)
      expect(linked.every(action => action.account_id)).toBe(true)
      expect(linked.some(action => action.contact_id)).toBe(true)

      // Les objectifs portent sur le mois EN COURS, sinon le cockpit est vide.
      const objective = memberObjectives.create.mock.calls[0]![0] as Partial<MemberObjectiveEntity>
      const now = new Date()
      expect(objective.period_month).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
    })

    /**
     * #2420.17 — le seuil d'alerte de marge de l'espace de démonstration.
     *
     * `PATCH delivery/finance/margin-threshold` n'avait aucun appelant web :
     * « Seuil d'alerte · non réglé » restait en lecture seule sur
     * `/pilotage/finance` chez tous les clients, y compris la salle de
     * démonstration. Sans ce semis, le formulaire des Réglages qui vient
     * d'être livré n'aurait rien de RÉGLÉ à montrer devant un prospect.
     */
    it('règle le seuil d’alerte de marge — sans lui, Réglages › Finance reste « non réglé »', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const update = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('UPDATE workspaces SET margin_alert_threshold_percent'),
      )
      expect(update).toBeDefined()
      expect(update?.[1]).toEqual(['ws-demo', 20])
    })

    /**
     * Théo D settings-espace.N5 — la signature proposée et le pied de document : Réglages › Marque & documents les
     * montre RÉGLÉS en salle de démonstration, avec les valeurs du jeu de données (jamais des coordonnées réelles).
     */
    it('règle la signature et le pied de document de l’espace — Marque & documents n’est pas vide en démo', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const update = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('UPDATE workspaces SET document_signature'),
      )
      expect(update).toBeDefined()
      expect(update?.[1]).toEqual(['ws-demo', DEMO_DOCUMENT_IDENTITY.signature, DEMO_DOCUMENT_IDENTITY.footer])
    })

    /**
     * #2866/#2200.34 — LE GESTE UNDO DE L'ACTION CENTER FONCTIONNE EN DÉMO.
     *
     * `UndoStepButton` (web) ne s'affiche que pour un pas `done` dont
     * `externalRef` n'est pas `null` — sans une vraie ligne `user_actions`
     * derrière le pas `schedule_decision` du run de démonstration, le bouton
     * resterait invisible devant un prospect (exactement le défaut que
     * `demo-coverage.ts` existe pour attraper). Ce test prouve que le pas
     * porte l'id RÉEL de la ligne semée, jamais un id inventé.
     */
    it('donne au pas `schedule_decision` du run de démo l’id RÉEL de sa ligne `user_actions`', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const reminderCall = userActions.create.mock.calls.find(
        call => (call[0] as Partial<UserActionEntity>).action_type === 'plan_action_added',
      )
      expect(reminderCall).toBeDefined()

      const runCall = workflowRuns.create.mock.calls[0]?.[0] as Partial<WorkflowRunEntity> | undefined
      expect(runCall).toBeDefined()
      const steps = runCall?.steps as { key: string; externalRef: string | null }[]
      const scheduleStep = steps.find(step => step.key === 'schedule_decision')
      expect(scheduleStep?.externalRef).toMatch(/^ua-\d+$/)

      // Les AUTRES pas gardent l'absence honnête que `DEMO_WORKFLOW_RUN` leur
      // donne déjà — aucun id inventé pour un pas qui n'en produit pas.
      const otherSteps = DEMO_WORKFLOW_RUN.steps.filter(step => step.key !== 'schedule_decision')
      for (const original of otherSteps) {
        const matching = steps.find(step => step.key === original.key)
        expect(matching?.externalRef).toBe(original.externalRef)
      }
    })

    /**
     * #3532 (lot X80) — « Actions exécutées » de Société Générale était VIDE en salle : aucun run
     * de carte n'y était semé. Un run `card_prepare_message` terminé, son activité
     * `workflow:<runId>` (la ligne que lit « Actions exécutées » et que le fil dédoublonne).
     */
    it('sème un run de carte « Préparer un message » terminé sur SG, avec son activité `workflow:<runId>` (#3532)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const runResults = (await Promise.all(
        workflowRuns.save.mock.results.map(result => result.value),
      )) as Partial<WorkflowRunEntity>[]
      const cardRun = runResults.find(run => run.definition_key === 'card_prepare_message')
      expect(cardRun?.status).toBe('done')
      expect(cardRun?.account_id).toBeTruthy()
      expect(cardRun?.result?.outcome).toMatch(/Aucun message n’a été envoyé/)
      expect((cardRun?.steps as { outcome: string }[]).every(step => step.outcome === 'done')).toBe(true)

      const activityIds = activities.create.mock.calls.map(call => (call[0] as Partial<ActivityEntity>).external_id)
      expect(activityIds).toContain(`workflow:${cardRun?.id}`)
    })

    /**
     * #2946 — LA TÂCHE `action_os_approval` EST SEMÉE, PAS SEULEMENT LE CODE
     * QUI LA PRODUIT.
     *
     * `WorkflowRunnerService.createApprovalTasks` pose une tâche « Valider : … »
     * dès qu'un run se fige en attente d'accord (le pont Action OS → Tâche) —
     * mais aucune salle de démonstration n'en portait une avant ce lot : la
     * table `tasks` était bien SEEDÉE (d'autres lignes), donc invisible à la
     * garde par table (`demo-coverage.spec.ts`), alors que CE type de tâche
     * précis n'existait nulle part. Ce test prouve le pont RÉELLEMENT tenu : un
     * run `awaiting_approval`, une demande `pending` qui le porte, et une
     * tâche dont `related_action_run_id` pointe vers ce run RÉEL — jamais un
     * id inventé (même exigence que le test `schedule_decision` juste
     * au-dessus pour `DEMO_WORKFLOW_RUN`).
     */
    it('sème une demande d’approbation Action OS EN ATTENTE et sa tâche `action_os_approval` (#2946)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const runResults = (await Promise.all(
        workflowRuns.save.mock.results.map(result => result.value),
      )) as Partial<WorkflowRunEntity>[]
      const pendingRun = runResults.find(run => run.status === 'awaiting_approval')
      expect(pendingRun).toBeDefined()
      expect(pendingRun?.id).toBeDefined()
      expect(pendingRun?.definition_key).toBe(DEMO_ACTION_OS_APPROVAL.definition_key)

      const approvalCall = approvalRequests.create.mock.calls[0]?.[0] as Partial<ApprovalRequestEntity> | undefined
      expect(approvalCall).toBeDefined()
      expect(approvalCall?.state).toBe('pending')
      expect(approvalCall?.required_level).toBe(DEMO_ACTION_OS_APPROVAL.requiredLevel)
      expect(approvalCall?.run_id).toBe(pendingRun?.id)

      const taskCall = tasks.create.mock.calls.find(
        call => (call[0] as Partial<TaskEntity>).source === 'action_os_approval',
      )?.[0] as Partial<TaskEntity> | undefined
      expect(taskCall).toBeDefined()
      expect(taskCall?.owner_id).toBe('owner-1')
      expect(taskCall?.related_action_run_id).toBe(pendingRun?.id)
      expect(taskCall?.title).toContain('Valider')
    })

    /**
     * #2582.2 — LE PÉRIMÈTRE DE TRAVAIL (`business_units`), VRAIMENT SEMÉ.
     *
     * Avant ce lot, aucune assertion ne portait sur `seedBusinessUnits` dans ce
     * fichier : la seule preuve que la table se remplissait était la présence
     * textuelle de `INSERT INTO business_units` dans `demo-seed.service.ts`
     * (`demo-coverage.spec.ts`), jamais qu'elle s'exécute avec les bons
     * paramètres. Sans ce test, un semis qui perd son `workspace_id`, inverse
     * un paramètre ou casse le lien vers `business_unit_members` resterait
     * invisible jusqu'à la réunion devant un prospect
     * (`/settings/business-units` vide, #2005.5).
     */
    it('sème au moins un périmètre de travail (business_units), avec son responsable', async () => {
      accounts.count.mockResolvedValueOnce(0)
      let nextBusinessUnitId = 0
      accounts.manager.query.mockImplementation(async (query: string) => {
        const text = String(query)
        if (text.includes('INSERT INTO business_units')) return [{ id: `bu-${nextBusinessUnitId++}` }]
        if (text.includes('RETURNING id')) return [{ id: 'acc-client-exemple' }]
        return []
      })
      await service.seedWorkspace('ws-demo', 'owner-1')

      const businessUnitInserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO business_units'),
      )
      // UN par périmètre du jeu de données — pas seulement « au moins un » :
      // un semis qui n'en pose qu'un seul laisserait `DEMO_BUSINESS_UNITS`
      // mentir sur ce que la salle montre.
      expect(businessUnitInserts).toHaveLength(DEMO_BUSINESS_UNITS.length)
      for (const call of businessUnitInserts) {
        expect(call[1]![0]).toBe('ws-demo') // workspace_id posé sur CHAQUE périmètre
      }

      // #3384.1 — la couche BU que Laura lit (effectif, consultants, disponibles,
      // objectif) est POSÉE par le semis, telle que le jeu de données la déclare ;
      // les deux périmètres du visiteur la portent, le troisième reste « non
      // renseigné » (null, jamais 0).
      businessUnitInserts.forEach((call, index) => {
        const unit = DEMO_BUSINESS_UNITS[index]!
        expect(call[1]!.slice(5)).toEqual([
          unit.consultantCount,
          unit.teamSize,
          'owner-1',
          unit.portfolioNote,
          unit.capacityAvailableConsultants,
          unit.quarterObjective,
          'owner-1',
        ])
      })
      for (const unit of DEMO_BUSINESS_UNITS.slice(0, 2)) {
        expect(unit.consultantCount).toBeGreaterThan(0)
        expect(unit.teamSize).toBeGreaterThan(0)
        expect(unit.capacityAvailableConsultants).toBeGreaterThan(0)
        expect((unit.quarterObjective ?? '').length).toBeGreaterThan(0)
      }
      expect(DEMO_BUSINESS_UNITS[2]!.consultantCount).toBeNull()

      const memberInserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO business_unit_members'),
      )
      // Le responsable de la salle porte au moins un périmètre — sinon aucun
      // compte ni bouton « Rejoindre »/« Demander l'accès » n'a de sens, et
      // l'écran s'ouvrirait aussi vide qu'un espace jamais alimenté.
      expect(memberInserts.length).toBeGreaterThan(0)
      expect(memberInserts.length).toBeLessThan(DEMO_BUSINESS_UNITS.length) // le 3e reste SANS membre, à dessein
      for (const call of memberInserts) {
        expect(call[1]).toEqual(['ws-demo', expect.stringMatching(/^bu-\d+$/), 'owner-1', 'lead'])
      }
    })

    /**
     * #2989 — le filtre BU de `/missions/planification` lit `businessUnitName`
     * DÉRIVÉ de `accounts.business_unit_id` (`delivery.service.ts:97`), jamais
     * une colonne à part sur la mission. Sans lui posé sur le compte du client
     * d'exemple, `businessUnitOptions` reste vide et le filtre ne s'affiche
     * jamais en démonstration — exactement le défaut vu en recette écran le
     * 26/09 (le filtre Compétence a des options, celui-ci n'en a aucune).
     */
    it('#2989 — le compte du client d’exemple porte une BU, sinon le filtre Planning n’a aucune option en démo', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) => {
        const text = String(query)
        if (text.includes('INSERT INTO business_units')) return [{ id: 'bu-lyon' }]
        if (text.includes('SELECT id FROM business_units')) return [{ id: 'bu-lyon' }]
        if (text.includes('RETURNING id')) return [{ id: 'acc-client-exemple' }]
        return []
      })
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Décision Louis 04/10/2026 — la BU est posée par l'UPDATE du compte porteur.
      const clientInsert = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE accounts') &&
          call[0].includes('business_unit_id = $5'),
      )
      expect(String(clientInsert?.[0])).toContain('business_unit_id')
      expect(clientInsert?.[1]).toContain('bu-lyon')
    })

    // Boucle du 29/09/2026 : le test ci-dessus répond « BU trouvée » à TOUTE
    // requête, même avant que le périmètre existe — il ne prouvait donc pas
    // l'ORDRE. Ici la BU n'existe qu'APRÈS son INSERT, comme en base : le compte
    // client posé avant elle gardait `business_unit_id` NULL, la salle se lisait
    // incomplète (`accounts.business_unit_id`) à chaque entrée.
    it('#2989 — la BU est écrite AVANT le compte client qui la porte (ordre réel)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      const created = new Set<string>()
      accounts.manager.query.mockImplementation(async (query: string) => {
        const text = String(query)
        if (text.includes('INSERT INTO business_units')) {
          created.add('bu')
          return [{ id: 'bu-lyon' }]
        }
        if (text.includes('SELECT id FROM business_units')) return created.has('bu') ? [{ id: 'bu-lyon' }] : []
        if (text.includes('RETURNING id')) return [{ id: 'acc-client-exemple' }]
        return []
      })
      await service.seedWorkspace('ws-demo', 'owner-1')

      const clientInsert = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE accounts') &&
          call[0].includes('business_unit_id = $5'),
      )
      expect(clientInsert?.[1]).toContain('bu-lyon')
    })

    // Boucle du 29/09/2026 : un semis complet doit ÉCRIRE ce que la complétude
    // exige (`org_enrichment_jobs`), sinon la 2e entrée re-purge.
    it('écrit les deux plans d’enrichissement (org_enrichment_jobs) — la salle se lit complète', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) => {
        if (String(query).includes('RETURNING id')) return [{ id: 'acc-1' }]
        return []
      })
      await service.seedWorkspace('ws-demo', 'owner-1')
      const inserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO org_enrichment_jobs'),
      )
      expect(inserts).toHaveLength(demoOrgEnrichmentJobs().length)
    })

    /**
     * LE NOM DE LA SALLE — l'autre moitié du défaut du 28/08.
     *
     * Le critère de complétude sait maintenant qu'une salle anonymisée n'est pas
     * complète (`demo-reset.service.spec.ts`). Encore faut-il que le semis
     * RÉTABLISSE quelque chose : un critère qui détecte sans réparation purge la
     * salle à chaque prise de bail et ne la répare jamais — la boucle serait pire
     * que le défaut. C'est le motif « chemin d'écriture non branché » du dépôt.
     */
    it('rétablit le NOM du propriétaire — une salle sans identité n’est pas une salle', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(profiles.update).toHaveBeenCalledWith(
        { user_id: 'owner-1' },
        // Le nom vient du JEU DE DONNÉES, jamais d'un générateur.
        expect.objectContaining({ first_name: DEMO_OWNER.first_name, last_name: DEMO_OWNER.last_name }),
      )

      // #2075 — plus la SEULE écriture sur `profiles.update` depuis que
      // `seedProfileContext` en pose une seconde (le contexte du Profileur) :
      // on retrouve celle de l'IDENTITÉ par son contenu, jamais par position.
      const identityCall = profiles.update.mock.calls.find(
        call => (call[1] as Partial<ProfileEntity>).first_name !== undefined,
      )
      const patch = identityCall?.[1] as Partial<ProfileEntity>
      // ⚠️ La marque d'anonymisation repart avec le nom. Sans elle, le critère
      // de complétude verrait une salle éternellement anonymisée et la
      // purgerait à CHAQUE bail, sous les yeux de celui qui la présente.
      expect(patch.anonymized_at).toBeNull()
      // L'ADRESSE n'est pas réécrite : elle appartient au compte
      // d'authentification de la salle, et en fabriquer une la ferait diverger.
      expect(patch).not.toHaveProperty('email')
    })

    /**
     * #1921 (13/09/2026, Louis) — L'ONBOARDING DE LA SALLE, TERMINÉ.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * LE TROU
     * ─────────────────────────────────────────────────────────────────────────
     * `user_onboarding_state` n'était écrite nulle part dans ce service. Une
     * ligne absente vaut `not_started` par défaut (`OnboardingService.ensureState`),
     * et `/welcome` (`routes/welcome.tsx`) redirige tant que le statut n'est pas
     * `completed` : un visiteur de la salle ne pouvait donc JAMAIS atteindre
     * l'écran qui fait parler Laura en premier — il rebondissait sur le
     * questionnaire, dans une salle censée déjà l'avoir rempli.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * POURQUOI ICI, ET POURQUOI JAMAIS PURGÉE
     * ─────────────────────────────────────────────────────────────────────────
     * `restoreOwnerIdentity` est déjà l'endroit qui RÉTABLIT ce qu'un visiteur
     * a pu abîmer sur la salle partagée (le nom, ci-dessus) — le même geste
     * s'applique à l'onboarding. `demo-reset.service.ts` le dit explicitement
     * depuis longtemps : `user_onboarding_state` est déjà listée dans les
     * tables délibérément NON purgées entre deux visiteurs (« purging
     * re-triggers the questionnaire on every visit ») — ce test prouve qu'elle
     * est désormais aussi RÉTABLIE au premier semis, pas seulement épargnée.
     */
    it('marque l’onboarding TERMINÉ pour le propriétaire de la salle — sinon /welcome est inatteignable', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const upsert = accounts.manager.query.mock.calls.find(call => String(call[0]).includes('user_onboarding_state'))
      expect(upsert).toBeDefined()
      const [sql, params] = upsert as [string, unknown[]]
      expect(sql).toContain("'completed'")
      expect(sql).toContain('ON CONFLICT')
      // Seul le PROPRIÉTAIRE de la salle est visé — jamais un compte réel codé
      // en dur, jamais un second paramètre qui désignerait quelqu'un d'autre.
      expect(params).toEqual(['owner-1'])
    })

    /** #3238.8 — les niveaux vendus sont semés (seul réglage du portefeuille), lexique vide. */
    it('sème les niveaux de séniorité vendus dans le portefeuille d’offre, sans lexique', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const update = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('UPDATE esn_profiles SET offer_portfolio'),
      )
      expect(update).toBeDefined()
      const stored = JSON.parse(String((update as [string, unknown[]])[1][2]))
      expect(stored.sold_seniority_levels).toEqual(['confirme', 'senior'])
      expect(stored.lexicon.overrides).toEqual([])
    })

    /**
     * #1921 (13/09/2026, Louis) — LE PROFIL ESN DE LA SALLE, SEMÉ.
     *
     * La raison « esn_profiles est vide à dessein, c'est l'onboarding qui le
     * remplit » (`demo-coverage.ts`) est devenue fausse le jour où la salle a
     * marqué l'onboarding TERMINÉ (test précédent) : plus personne n'y passe,
     * donc plus personne ne le remplit — et `/welcome` affichait « À
     * compléter » ×4 sur la carte « Ton profil » à un prospect.
     */
    it('sème un profil d’ESN FICTIF cohérent — « Bellum Conseil », comme partout ailleurs dans la salle', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const upsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO esn_profiles'),
      )
      expect(upsert).toBeDefined()
      const [sql, params] = upsert as [string, unknown[]]
      expect(sql).toContain('ON CONFLICT')
      // Les paramètres sont DÉRIVÉS de `DEMO_ESN_PROFILE`, dans son ordre : un
      // décalage entre la liste de colonnes et la liste de valeurs romprait ce
      // test avant de corrompre une vraie ligne.
      //
      // ⚠️ #2582 — une colonne `jsonb` part en JSON, pas en tableau Postgres.
      // Ce test comparait les valeurs SANS regarder le cast SQL : il est resté
      // VERT pendant que la production jetait
      // « column "esn_objectives" is of type jsonb but expression is of type
      // text[] » à chaque visite de la salle. Il compare maintenant ce qui part
      // RÉELLEMENT, et `demo-seed-esn-profile-casts.spec.ts` garde le cast.
      const attendu = Object.entries(DEMO_ESN_PROFILE).map(([column, value]) =>
        esnProfileColumnType(column) === 'jsonb' ? JSON.stringify(value) : value,
      )
      expect(params).toEqual(['owner-1', 'ws-demo', ...attendu])
      // Le Lexique (`offer_portfolio`, D17) reste HORS de ce semis — sa propre
      // raison, documentée dans `demo-coverage.ts`, n'a rien à voir avec
      // l'identité de l'ESN et reste entièrement valide.
      expect(sql).not.toContain('offer_portfolio')
    })

    /**
     * Lot « la parité démo du questionnaire » (15/09/2026) — la garde qui
     * aurait attrapé le trou : 37+ colonnes neuves du questionnaire restaient
     * hors du semis pendant que la garde par TABLE restait verte. Ce test
     * prouve que la requête porte bien CHAQUE colonne du jeu de données, dans
     * les DEUX moitiés de la requête (la liste de colonnes ET les assignations
     * `ON CONFLICT ... DO UPDATE SET`).
     */
    it('porte CHAQUE colonne de DEMO_ESN_PROFILE, y compris les 76 ajoutées par le lot du 15/09', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const upsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO esn_profiles'),
      )
      const [sql] = upsert as [string, unknown[]]
      const missing = Object.keys(DEMO_ESN_PROFILE).filter(column => {
        const wholeWord = new RegExp(`\\b${column}\\b`)
        return !wholeWord.test(sql)
      })
      expect(missing).toEqual([])
      expect(Object.keys(DEMO_ESN_PROFILE).length).toBeGreaterThan(80)
    })

    /**
     * #2075 — LE CONTEXTE DE PROFIL (sortie du Profileur), SEMÉ.
     *
     * Second câble nommé par l'écrivain de la page d'audit commercial
     * (`/settings/profile/audit`, branche `page-restitution-audit`) :
     * `esn_profiles` (test précédent) porte les RÉPONSES BRUTES au
     * questionnaire, `profiles.profile_context` porte la lecture DÉRIVÉE que
     * l'écran lit — deux objets, jamais confondus, et le second n'était semé
     * nulle part. Voir {@link DEMO_PROFILE_CONTEXT} (`demo-dataset.ts`) pour le
     * détail de chaque champ.
     *
     * D9 (14/09/2026) — VALIDÉ, plus « succeeded » : le geste de validation
     * (`POST /profile-context/validate`) est lui-même une capacité livrée
     * (bouton « Valider » sur `/settings/profile/audit`), donc l'écran de
     * démonstration doit la MONTRER, pas seulement la rendre possible — sinon
     * un prospect qui ouvre cet écran ne voit jamais l'état qu'il produirait
     * en cliquant. Ça change la raison d'avant (« un contexte fraîchement
     * resemé n'a pas encore été relu par personne ») : elle reste vraie pour
     * un compte réel, mais la salle de démonstration n'est relue par
     * personne non plus — c'est un décor, pas un historique.
     */
    it('sème le CONTEXTE DE PROFIL du Profileur, déjà VALIDÉ — l’audit commercial montre le geste, pas seulement l’écran vide', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(profiles.update).toHaveBeenCalledWith(
        { user_id: 'owner-1' },
        expect.objectContaining({
          profile_context: DEMO_PROFILE_CONTEXT,
          profile_context_status: 'validated',
          profile_context_version: 1,
          profile_context_validated_at: expect.any(Date),
          // #2073.8 — le champ CHOISI, délibérément DIFFÉRENT du champ
          // CALCULÉ (`DEMO_PROFILE_CONTEXT.idealAccountProfile.entryStrategy`
          // = `bottomUp`) : une salle qui montre les deux valeurs égales ne
          // prouverait rien.
          chosen_entry_strategy: 'multiThread',
          // #2074.16 — UNE SEULE des deux ruptures démo (voir
          // `demo-audit-first-moves-coverage.spec.ts`) porte une décision :
          // la salle doit voir le badge « Validé » ET le badge « Proposé »
          // par défaut, jamais les deux mouvements à l'état identique.
          audit_move_decisions: { tooManySimultaneousMarkets: { status: 'valide', decidedAt: expect.any(String) } },
        }),
      )
      expect(DEMO_PROFILE_CONTEXT.idealAccountProfile?.entryStrategy).not.toBe('multiThread')

      const revisionInsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO profile_context_revisions'),
      )
      expect(revisionInsert).toBeDefined()
      const [sql, params] = revisionInsert as [string, unknown[]]
      // Sans quoi l'entête de l'écran affiche « Aucune version enregistrée ».
      expect(sql).toContain('ON CONFLICT')
      expect(params[0]).toBe('owner-1')
      expect(JSON.parse(params[2] as string)).toEqual(DEMO_PROFILE_CONTEXT)

      // #2084.14 — l'état « audit ancien » (`AuditHero`, seuil
      // `AUDIT_STALE_AFTER_DAYS` = 180 jours, `apps/web/.../audit-freshness.ts`)
      // doit être ATTEIGNABLE en démo, pas seulement prouvé par un test
      // unitaire : le décor sème donc cet instantané à plus de 200 jours,
      // au lieu de laisser le défaut SQL `now()` le rendre toujours frais.
      expect(params[3]).toBeInstanceOf(Date)
      const revisionAgeDays = Math.floor((Date.now() - (params[3] as Date).getTime()) / 86_400_000)
      expect(revisionAgeDays).toBeGreaterThanOrEqual(200)
    })

    /**
     * #2075.12 / #2075.13 (épopée #2774) — UNE note de chaque genre, pour
     * que la salle prouve les DEUX gestes, même principe que
     * `audit_move_decisions` juste au-dessus (un « Validé », un « Proposé »).
     */
    it('sème un commentaire sur le verdict ET un refus sur « Arrêter » — les deux gestes, pas un seul répété', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const feedbackInsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO commercial_audit_feedback'),
      )
      expect(feedbackInsert).toBeDefined()
      const [sql, params] = feedbackInsert as [string, unknown[]]
      expect(sql).toContain("'verdict', 'comment'")
      expect(sql).toContain("'stop', 'refused'")
      // #2075.14 — un bloc validé seul, même clé que `AuditConsequences.tsx`.
      expect(sql).toContain("'consequence:accounts', 'validated'")
      expect(params[0]).toBe('owner-1')
    })

    /**
     * #2123.46/#2123.47 (16/09/2026, parité démo demandée par le
     * coordinateur) — LES TÂCHES DU PLAN, SEMÉES POUR `/actions`.
     *
     * `action_plan_items` est purgée par UTILISATEUR
     * (`DEMO_PURGE_USER_TABLES`), donc invisible aux deux gardes de tête de
     * `demo-coverage.spec.ts` — MÊME angle mort que `profile_context` /
     * `profile_context_revisions` ci-dessus, MÊME raison de le semer quand
     * même. `restoreOwnerIdentity` ne peut PAS l'écrire : `account_id` n'est
     * pas nullable et aucun compte n'existe encore à cet instant du semis.
     * Elle est donc écrite plus loin, une fois les comptes créés — voir
     * `seedPlanTasks` (`demo-seed.service.ts`).
     */
    it('sème les TÂCHES DU PLAN — avec échéance, sans échéance, sur des comptes RÉELS', async () => {
      accounts.count.mockResolvedValueOnce(0)
      // #2715.1 — le client d'exemple s'insère en SQL brut (`seedDeliveryClient`) :
      // sans id rendu, sa tâche du plan (SNCF) sortirait en
      // `continue` faute de compte résolu, et `inserts` en compterait une de
      // moins que `DEMO_PLAN_TASKS`.
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const inserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO action_plan_items'),
      )
      expect(inserts).toHaveLength(DEMO_PLAN_TASKS.length)
      expect(DEMO_PLAN_TASKS.length).toBeGreaterThanOrEqual(3)

      const params = inserts.map(call => call[1] as unknown[])
      // Chaque ligne appartient au PRENEUR DE BAIL, sur un compte qui a
      // vraiment été inséré (jamais `null`/`undefined` — la salle referme un
      // dossier existant, elle n'en invente pas un).
      for (const row of params) {
        expect(row).toContain('owner-1')
      }

      // #2123.46 : au moins une échéance posée, ET au moins une tâche SANS —
      // absente n'est pas la même chose que « pas de date écrite en dur ».
      const dueDates = params.map(row =>
        row.find(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)),
      )
      expect(dueDates.some(value => value !== undefined)).toBe(true)
      expect(dueDates.some(value => value === undefined)).toBe(true)

      // #2123.46 — la carte du plan affiche le résultat attendu et l'indicateur
      // d'une action : au moins une tâche semée les porte, écrits dans LEURS
      // colonnes (jamais dans le libellé).
      expect(String(inserts[0]?.[0])).toMatch(/expected_outcome/)
      expect(String(inserts[0]?.[0])).toMatch(/\bkpi\b/)
      const withOutcome = DEMO_PLAN_TASKS.filter(task => task.expectedOutcome && task.kpi)
      expect(withOutcome.length).toBeGreaterThanOrEqual(1)
      for (const task of withOutcome) {
        const row = params.find(values => values.includes(task.label))
        expect(row).toContain(task.expectedOutcome)
        expect(row).toContain(task.kpi)
      }

      // #2715.1 — la tâche SNCF porte le `contact_id` (dernier
      // paramètre positionnel) de Directeur technique — entité numérique voyageurs, RÉSOLU depuis la même
      // fiche que `message_sent` (voir le test plus bas) : c'est ce qui
      // permet à `ActionPlanItemsService.withSendStatus` de rattacher l'envoi
      // VÉRIFIÉ à CET item plutôt qu'au compte entier.
      const withContact = DEMO_PLAN_TASKS.filter(task => task.contact !== null)
      expect(withContact.length).toBeGreaterThanOrEqual(1)
      for (const task of withContact) {
        const row = params.find(values => values.includes(task.label))
        expect(row?.at(-1)).not.toBeNull()
        expect(row?.at(-1)).not.toBeUndefined()
      }
      const withoutContact = DEMO_PLAN_TASKS.filter(task => task.contact === null)
      for (const task of withoutContact) {
        const row = params.find(values => values.includes(task.label))
        expect(row?.at(-1)).toBeNull()
      }
    })

    /**
     * #2923 (#2317.6/.7) — recette 27/09 (« NON PROUVÉ ICI ») : le plan
     * d'action vérifié sur 5 comptes n'a jamais dépassé 3 actions dans une même
     * section, donc le bouton « voir plus » n'était jamais apparu en salle de
     * démo. Vérifié ici plutôt que re-semé : SNCF porte déjà CINQ tâches
     * manuelles (`DEMO_PLAN_TASKS`), toutes posées sur la MÊME bande de
     * position (`MANUAL_ACTION_WEEK_INDEX`) — la section « Ajoutées »
     * (`UserActionSection`, `ActionPlanBoard.tsx`) les lit comme une seule
     * liste plate, jamais réparties en phases hebdomadaires (ça, c'est le plan
     * GÉNÉRÉ, une section distincte). Au-delà de `NEXT_ACTIONS_MAX` (3), ce
     * test prouve que le compte réellement semé en dépasse le plafond.
     */
    it('#2923 — SNCF dépasse NEXT_ACTIONS_MAX (3) sur la MÊME bande manuelle, pour que « voir plus » se voie', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const thalesTasks = DEMO_PLAN_TASKS.filter(task => task.company === 'SNCF')
      expect(thalesTasks.length).toBeGreaterThan(NEXT_ACTIONS_MAX)

      const inserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO action_plan_items'),
      )
      const thalesRows = inserts
        .map(call => call[1] as unknown[])
        .filter(row => thalesTasks.some(task => row.includes(task.label)))
      expect(thalesRows).toHaveLength(thalesTasks.length)
      // week_index (4e paramètre positionnel) : LA MÊME bande pour toutes —
      // sans quoi elles se répartiraient sur des phases distinctes et
      // resteraient sous le plafond dans chacune.
      for (const row of thalesRows) {
        expect(row[3]).toBe(MANUAL_ACTION_WEEK_INDEX)
      }
    })

    /**
     * #2396.1 (24/09/2026, recette salle de démo f9f23f887) — LA PUCE DE MODE
     * DE COMPLÉTION (`PlanItemFacts.tsx`, `facts.status === 'done' &&
     * facts.completionMode`) n'apparaissait sur AUCUNE tâche démo : les sept
     * tâches d'origine sont toutes `execution_status: 'todo'`. Ce test lit la
     * COLONNE, pas une position supposée : il retrouve l'index de chaque
     * colonne dans la liste déclarée par la requête, comme
     * `ActionPlanItemsService` l'écrit réellement (`applyStatus` pour
     * `'manual'`, `CadenceService.completeOpenItemsByProof` pour `'proof'`).
     */
    it('#2396.1 — sème au moins une action FAITE `manual` et une `proof`, pour que le chip se voie', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const insert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO action_plan_items'),
      )
      expect(insert).toBeDefined()
      const query = String(insert?.[0])
      // Lit la colonne RÉELLEMENT déclarée par la requête, pas une position
      // supposée : les colonnes ne sont pas dans le même ordre que leurs
      // `$N` (`done`/`execution_status` pointent vers `$10`/`$11`, pas
      // `$7`/`$8`) — un index en dur mentirait au premier réordonnancement.
      // `lastIndexOf(')')`, pas une regex paresseuse : `now()` porte SA
      // PROPRE paire de parenthèses au milieu du bloc `VALUES`, qui coupe
      // une capture `[\s\S]*?\)` avant la vraie fin.
      const columnsStart = query.indexOf('action_plan_items (') + 'action_plan_items ('.length
      const columns = query
        .slice(columnsStart, query.indexOf(')', columnsStart))
        .split(',')
        .map(name => name.trim())
      const valuesStart = query.indexOf('VALUES (') + 'VALUES ('.length
      const valueTokens = query
        .slice(valuesStart, query.lastIndexOf(')'))
        .split(',')
        .map(token => token.trim())
      expect(valueTokens.length).toBe(columns.length)
      const paramIndexOf = (column: string): number => {
        const columnIndex = columns.indexOf(column)
        expect(columnIndex).toBeGreaterThanOrEqual(0)
        const placeholder = valueTokens[columnIndex]?.match(/^\$(\d+)$/)
        expect(placeholder).not.toBeNull()
        return Number(placeholder?.[1]) - 1
      }
      const executionStatusIdx = paramIndexOf('execution_status')
      const completionModeIdx = paramIndexOf('completion_mode')
      const outcomeIdx = paramIndexOf('outcome')
      const completedAtIdx = paramIndexOf('completed_at')

      const doneTasks = DEMO_PLAN_TASKS.filter(task => task.executionStatus === 'done')
      expect(doneTasks.length).toBeGreaterThanOrEqual(2)
      expect(doneTasks.some(task => task.completionMode === 'manual')).toBe(true)
      expect(doneTasks.some(task => task.completionMode === 'proof')).toBe(true)

      const inserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO action_plan_items'),
      )
      for (const task of doneTasks) {
        const row = inserts.find(call => (call[1] as unknown[]).includes(task.label))?.[1] as unknown[]
        expect(row).toBeDefined()
        expect(row[executionStatusIdx]).toBe('done')
        expect(row[completionModeIdx]).toBe(task.completionMode)
        expect(row[outcomeIdx]).toBe(task.outcome ?? null)
        expect(row[completedAtIdx]).toBeInstanceOf(Date)
      }

      // Les sept tâches d'origine, elles, restent `todo` — comportement
      // inchangé, jamais devenues `done` par accident de refactor.
      const openTasks = DEMO_PLAN_TASKS.filter(task => task.executionStatus !== 'done')
      for (const task of openTasks) {
        const row = inserts.find(call => (call[1] as unknown[]).includes(task.label))?.[1] as unknown[]
        expect(row[executionStatusIdx]).toBe('todo')
        expect(row[completionModeIdx]).toBeNull()
        expect(row[completedAtIdx]).toBeNull()
      }
    })

    // #2974 (X64) — le sélecteur « Événement » de l'audience lit `activity_participants`. Le jeu de
    // données porte les participants (`DEMO_EVENT_PARTICIPANTS`) ; CE test prouve que le SEMIS les
    // écrit, avec l'id de l'activité semée et le contact RÉSOLU — jamais un handle sans contact.
    it('#2974 — le semis écrit les participants d’événement, activité et contact résolus', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      // Comme TypeORM : `save` d'un tableau renseigne l'id des entités passées.
      let nextActivityId = 1
      activities.save.mockImplementation(async (rows: Partial<ActivityEntity> | Partial<ActivityEntity>[]) => {
        for (const row of Array.isArray(rows) ? rows : [rows]) row.id = `act-${nextActivityId++}`
        return rows
      })
      const insert = jest.fn().mockResolvedValue(undefined)
      ;(activities as unknown as { manager: { insert: jest.Mock } }).manager.insert = insert

      await service.seedWorkspace('ws-demo', 'owner-1')

      const call = insert.mock.calls.find(([entity]) => entity?.name === 'ActivityParticipantEntity')
      expect(call).toBeDefined()
      const rows = call?.[1] as { activity_id: string; contact_id: string; is_self: boolean; handle: string }[]
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.activity_id).toMatch(/^act-/)
        expect(row.contact_id).toBeTruthy()
        expect(row.is_self).toBe(false)
      }
    })

    /**
     * #2715.1 (correction du coordinateur, 23/09) — LE PLAN MONTRE UN E-MAIL
     * VÉRIFIÉ, EN DÉMONSTRATION.
     *
     * Sans cette ligne, `/accounts/{SNCF}?tab=plan` s'ouvrirait avec une tâche
     * ordinaire, sans badge « E-mail envoyé » — la capacité que le client
     * réclamait (voir le registre) resterait invisible sur le lien public,
     * découverte en réunion plutôt qu'en CI (craft rule n°9).
     *
     * Preuve à deux bouts, tenus ENSEMBLE : le `contact_id` que porte l'item
     * du plan (dernier paramètre positionnel de son `INSERT`) doit être
     * EXACTEMENT celui du `user_actions` `message_sent`/`via:'bellum'` créé
     * pour Directeur technique — entité numérique voyageurs — sinon `ActionPlanItemsService.withSendStatus`
     * ne les rapprocherait jamais et le badge ne s'afficherait pas.
     */
    it('#2715.1 — la tâche SNCF vise un siège ; l’e-mail vérifié est vide à dessein (décision Louis 04/10)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const planInsert = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO action_plan_items') &&
          (call[1] as unknown[]).includes('Relancer sur la reprise du run après l’envoi de la synthèse'),
      )
      expect(planInsert).toBeDefined()
      const planContactId = (planInsert?.[1] as unknown[]).at(-1)
      expect(planContactId).not.toBeNull()

      // Décision Louis 04/10/2026 — aucun `message_sent` : le siège visé n'a
      // pas d'adresse, et un envoi vérifié sur une personne réelle serait une
      // déclaration inventée. Le badge « Marqué fait » (déclaratif) reste.
      const emailSent = userActions.create.mock.calls
        .map(call => call[0] as Partial<UserActionEntity>)
        .find(action => action.action_type === 'message_sent')
      expect(emailSent).toBeUndefined()
    })

    /**
     * #4418 (craft n°9) — UNE RELANCE ISSUE D'UN « MARQUER ENVOYÉ » EST VISIBLE DANS AUJOURD'HUI.
     * Une ligne de cadence = `cadence_step` posé + un contact + une échéance qui tombe aujourd'hui, ouverte ;
     * et AUCUN `message_sent` n'est semé (« fait » reste déclaratif : pas de preuve d'envoi).
     */
    it('#4418 — la relance planifiée par « Marquer envoyé » est semée avec sa touche de cadence, due aujourd’hui', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const relance = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO action_plan_items') &&
          (call[1] as unknown[]).includes('Relance — Directeur technique — entité numérique voyageurs'),
      )
      expect(relance).toBeDefined()
      const params = relance?.[1] as unknown[]
      expect(String(relance?.[0])).toContain('cadence_step')
      expect(params).toContain('relance')
      expect(params.at(-1)).not.toBeNull() // le contact reste le DERNIER paramètre
      expect(
        userActions.create.mock.calls.some(
          call => (call[0] as Partial<UserActionEntity>).action_type === 'message_sent',
        ),
      ).toBe(false)
    })

    /**
     * #3068 — L'INTERRUPTION NON CONFIRMÉE, SEMÉE — LE PRÉDICAT DU BADGE
     * « INTERRUPTION À CONFIRMER » DU VIVIER VOIT ENFIN UNE LIGNE.
     *
     * `deriveStaffing` rend `a_confirmer` dès qu'une affectation porte
     * `interruptionUnconfirmed: true`, lu sur `mission_interruptions
     * .availability_confirmed = false`. Le prédicat était câblé, testé, et
     * ne recevait jamais de ligne en démo — cette garde échoue si
     * `seedMissionInterruption` disparaît du semis.
     */
    it('#3068 — sème une déclaration d’interruption NON confirmée sur une mission réelle', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const interruptionInsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO mission_interruptions'),
      )
      expect(interruptionInsert).toBeDefined()
      const [query, params] = interruptionInsert as [string, unknown[]]
      // `availability_confirmed` n'apparaît dans AUCUNE colonne écrite : c'est
      // le défaut de la table (`false`) qui doit tenir — jamais un `true`
      // écrit par accident qui viderait le prédicat qu'on vient de seeder.
      expect(query).not.toContain('availability_confirmed')
      expect(params).toContain('acc-client-exemple')
      // Les deux accusés sont OBLIGATOIRES (contrainte SQL de la table,
      // `mission_interruptions_ack_check`) et écrits en dur `true` — sans eux,
      // l'INSERT échouerait en base même si le mock, lui, l'accepte.
      expect(query).toMatch(/VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*true,\s*true,\s*\$5,\s*\$6\)/)
    })

    /**
     * #2873 (#2367.14) — LA SÉQUENCE TERMINÉE PORTE ENFIN SA DATE DE
     * COMPLÉTION.
     *
     * `sequence_completed_crm_update` filtre sur `outreach_sequences
     * .completed_at`, jamais sur `status` seul (`OutreachSequenceCompletedAt`,
     * additive et sans défaut deviné) — une ligne `completed` semée SANS cette
     * date restait invisible à la routine par construction. Vérifie que
     * `seedOutreachSequences` pose maintenant cette date sur la ligne
     * `completed` du plan (Isabelle Rouault), et la laisse `null` sur une ligne
     * `active` — jamais une date inventée sur une séquence qui n'est pas
     * terminée.
     */
    it('#2873 — la séquence `completed` du plan porte une `completed_at` récente, les `active` restent `null`', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const sequenceInserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO outreach_sequences'),
      )
      expect(sequenceInserts.length).toBeGreaterThanOrEqual(4)

      const completedInsert = sequenceInserts.find(call => (call[1] as unknown[]).includes('completed'))
      expect(completedInsert).toBeDefined()
      const completedAt = (completedInsert?.[1] as unknown[]).at(-1) as string | null
      expect(completedAt).not.toBeNull()
      const daysAgo = (Date.now() - new Date(completedAt as string).getTime()) / (24 * 3600_000)
      expect(daysAgo).toBeGreaterThanOrEqual(0)
      expect(daysAgo).toBeLessThanOrEqual(7)

      const activeInserts = sequenceInserts.filter(call => (call[1] as unknown[]).includes('active'))
      expect(activeInserts.length).toBeGreaterThanOrEqual(1)
      for (const call of activeInserts) {
        expect((call[1] as unknown[]).at(-1)).toBeNull()
      }
    })

    /**
     * #2873 (recette salle démo 28/09/2026, Maëlle Lorquin) — LA CARTE
     * EXISTE APRÈS LE SEMIS, PAS SEULEMENT LA DATE DE CLÔTURE.
     *
     * Constat de recette : la séquence portait déjà sa `completed_at` (test
     * ci-dessus), mais AUCUNE carte de proposition de mise à jour CRM
     * n'apparaissait nulle part — le balayeur de routines ne tourne jamais en
     * démo (`RoutinesService.runDueFor`). Vérifie que le semis pose
     * directement les DEUX écritures que la routine réelle aurait produites :
     * une trace d'exécution (`routine_runs`, pour que le catalogue affiche
     * une dernière exécution) et la notification qui PORTE la proposition,
     * sur le contact Isabelle Rouault.
     */
    it('#2873 — sème la trace d’exécution ET la carte de proposition de mise à jour CRM (Isabelle Rouault)', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const runInsert = accounts.manager.query.mock.calls.find(call =>
        String(call[0]).includes('INSERT INTO routine_runs'),
      )
      expect(runInsert).toBeDefined()
      // #2873 (recette 29/09) — `run_key` est UNIQUE par utilisateur ET par jour : un
      // second semis le même jour (compte de démo partagé, salle ré-amorcée) faisait
      // lever le semis ENTIER au milieu, avant les messages — et `tidy` avale l'erreur,
      // donc la salle restait sans la carte. Le semis est idempotent sur cette clé.
      expect(String(runInsert?.[0])).toMatch(/ON CONFLICT \(run_key\) DO NOTHING/)
      const runParams = runInsert?.[1] as unknown[]
      expect(runParams).toContain('sequence_completed_crm_update')
      // `notified: false` au niveau global — MÊME doctrine que l'exécuteur
      // réel (`sequenceCompletedCrmUpdate`) : elle signale via `items`,
      // jamais une notification globale.
      expect(runParams).toContain(false)
      expect(runParams.some(value => typeof value === 'string' && value.includes('CRM à proposer'))).toBe(true)

      const notificationInsert = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO notifications') &&
          (call[1] as unknown[]).some(value => typeof value === 'string' && value.includes('Isabelle Rouault')),
      )
      expect(notificationInsert).toBeDefined()
      const notifParams = notificationInsert?.[1] as unknown[]
      expect(notifParams).toContain('system')
      expect(notifParams).toContain('proactive')
      // Le lien pointe vers LA FICHE DU CONTACT, jamais une écriture CRM :
      // cette routine SIGNALE, elle n'écrit rien (doctrine « une écriture
      // CRM/ERP passe par une porte »).
      expect(notifParams.some(value => typeof value === 'string' && value.startsWith('/contacts/'))).toBe(true)
    })

    /**
     * #3920.1 (craft rule n°9) — « couvrir toutes les sources » : la cloche de démonstration
     * montre UNE alerte « Nouveau signal » PAR SOURCE (presse, annonce BODACC, registre Sirene,
     * page carrières), chacune menant à la VEILLE du compte où le signal porte son lien.
     */
    it('#3920.1 — la cloche sème une alerte « Nouveau signal » par source, vers la veille du compte', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const buySignals = accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO notifications'))
        .map(call => call[1] as unknown[])
        .filter(params => params[1] === 'buy_signal')
      const sources = buySignals.map(params => params[10])
      expect(sources).toEqual(
        expect.arrayContaining([
          'Communiqué de presse',
          'Annonces légales officielles',
          'Registre officiel des entreprises (Sirene)',
          'Page carrières du groupe',
        ]),
      )
      // #3920.5 — la cloche dit « via … » : aucun sigle de registre (garde aucune-source-ne-se-nomme).
      expect(sources.map(String).join('|')).not.toMatch(/BODACC|Sirene(?!\))/)
      // Chaque alerte porte un titre NOMMÉ et mène à l'onglet veille — jamais une cloche muette.
      for (const params of buySignals) {
        expect(String(params[2])).toMatch(/^Nouveau signal — /)
      }
    })

    it('#3922.n — chaque alerte « Nouveau signal » de la salle porte le lien vérifiable du signal cité', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const buySignals = accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO notifications'))
        .map(call => call[1] as unknown[])
        .filter(params => params[1] === 'buy_signal')
      expect(buySignals.length).toBeGreaterThan(0)
      for (const params of buySignals) {
        // #3920.crm (lot M01) — une affaire CRM n'a pas d'URL externe : « sans lien
        // vérifiable », jamais un lien deviné. Toutes les autres portent le leur.
        if (params[10] === 'Votre CRM') {
          expect(params[11]).toBeNull()
          continue
        }
        // Théo A (Louis 22/10) — la page d'accueil RÉELLE de l'éditeur nommé, sinon le domaine RÉSERVÉ
        // (RFC 2606) : jamais un article inventé sous un vrai domaine.
        expect(String(params[11])).toMatch(/^https:\/\/(example\.org\/demo\/|www\.[a-z.-]+\/$)/)
      }
      expect(buySignals.map(params => params[12])).toEqual(
        expect.arrayContaining(['press', 'bodacc', 'official', 'job']),
      )
    })

    /**
     * #3920.crm (lot M01, 09/10) — la cloche couvre aussi le CRM : UNE alerte, source « Votre CRM »
     * (jamais l'éditeur), dont le texte est le fait que les règles de production tirent de la
     * première affaire semée (`buildDemoCrmDeals`), et qui mène à la veille du compte.
     */
    it('#3920.crm — la cloche sème UNE alerte « Nouveau signal » CRM, mot pour mot le fait de la veille', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const crmAlerts = accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO notifications'))
        .map(call => call[1] as unknown[])
        .filter(params => params[1] === 'buy_signal' && params[10] === 'Votre CRM')
      expect(crmAlerts).toHaveLength(1)
      const first = buildDemoCrmDeals(new Date()).signals[0]
      expect(String(crmAlerts[0]?.[3])).toContain(String(first?.evidence))
      expect(String(crmAlerts[0]?.[2])).toBe('Nouveau signal — Société Générale')
    })

    /**
     * #2798 — recette écran 27/09 : le badge de mode de campagne
     * (`campaignModeLabel`, `sequences-cockpit.ts`) lit `template_key` — une
     * colonne que `seedOutreachSequences` n'écrivait pas avant ce lot (elle
     * ne lisait `entry.template` que pour retrouver le NOM du gabarit, jamais
     * pour le stocker). La salle de démo aurait montré un cockpit sans un
     * seul badge — exactement le défaut de parité que craft rule n°9 existe
     * pour empêcher.
     */
    it('#2798 — chaque séquence semée porte le `template_key` de son gabarit — le badge de mode a de quoi s’afficher en démo', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const sequenceInserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO outreach_sequences'),
      )
      expect(sequenceInserts.length).toBeGreaterThanOrEqual(4)
      for (const call of sequenceInserts) {
        const params = call[1] as unknown[]
        // `template_key` est l'AVANT-DERNIER paramètre — `completed_at`,
        // lu par position ailleurs dans cette suite, reste en dernier.
        const templateKey = params.at(-2)
        expect(typeof templateKey).toBe('string')
        expect(templateKey).not.toBe('')
      }
    })

    /**
     * #3421 lot G03 (30/09) — retour prod : « frise et condition d'arrêt de
     * séquence, à voir sur une séquence réelle ». `cancel_reason` du contrat
     * se lit depuis `outreach_transitions` (`OutreachService.cancelReasons`),
     * jamais une colonne d'`outreach_sequences` — sans cette ligne, la
     * séquence `cancelled` du plan resterait `cancel_reason: null` à
     * l'écran, exactement le point mort que le retour pointait.
     */
    it('#3421 — la séquence `cancelled` du plan écrit sa cause d’arrêt dans `outreach_transitions`', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const sequenceInserts = accounts.manager.query.mock.calls.filter(call =>
        String(call[0]).includes('INSERT INTO outreach_sequences'),
      )
      const cancelledInsert = sequenceInserts.find(call => (call[1] as unknown[]).includes('cancelled'))
      expect(cancelledInsert).toBeDefined()

      // `subject_kind` et `to_state` sont écrits en dur dans le SQL (comme les
      // deux autres `INSERT INTO outreach_transitions` de ce fichier, message
      // et call_task) — jamais des paramètres liés.
      const sequenceTransition = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO outreach_transitions') &&
          String(call[0]).includes("'sequence'") &&
          String(call[0]).includes("'cancelled'"),
      )
      expect(sequenceTransition).toBeDefined()
      const params = sequenceTransition?.[1] as unknown[]
      // workspace_id, user_id, subject_id, cause — la même forme que
      // `stopSequencesForContact` (`mailbox.service.ts`) produirait en vrai.
      expect(params).toContain('ws-demo')
      expect(params).toContain('owner-1')
      expect(params).toContain('refusal')
    })

    // #3406 — une salle déjà semée AVANT que son profil porte un nom (ex.
    // `demo@bellum-ai.com`) ne repasse jamais par `restoreOwnerIdentity` : le
    // dialogue terrain y retombait sur l'e-mail brut. On ne rétablit QUE les
    // deux champs de nom, et seulement s'ils sont vides.
    it('names a demo owner whose profile has no name, without touching anything else (#3406)', async () => {
      accounts.count.mockResolvedValueOnce(3)
      profiles.findOne.mockResolvedValueOnce({ user_id: 'owner-1', first_name: null, last_name: null } as ProfileEntity)
      await service.seedWorkspace('ws-demo', 'owner-1')
      expect(profiles.update).toHaveBeenCalledTimes(1)
      expect(profiles.update).toHaveBeenCalledWith(
        { user_id: 'owner-1' },
        { first_name: DEMO_OWNER.first_name, last_name: DEMO_OWNER.last_name },
      )
    })

    it('leaves a demo owner who already has a name alone (#3406)', async () => {
      accounts.count.mockResolvedValueOnce(3)
      profiles.findOne.mockResolvedValueOnce({
        user_id: 'owner-1',
        first_name: 'Jade',
        last_name: null,
      } as ProfileEntity)
      await service.seedWorkspace('ws-demo', 'owner-1')
      expect(profiles.update).not.toHaveBeenCalled()
    })

    it('#2959 — rattrape la route recommandée d’une salle DÉJÀ semée, sans écraser (recette prod 03/10)', async () => {
      // Une salle occupée n'est jamais purgée sous les yeux de son visiteur : celle de la
      // recette gardait son dossier d'avant #2959 — « Route recommandée » absente.
      accounts.count.mockResolvedValueOnce(3)
      await service.seedWorkspace('ws-demo', 'owner-1')
      const patch = accounts.manager.query.mock.calls.find(call => String(call[0]).includes('{recommendedRoute}'))
      expect(patch).toBeDefined()
      const sql = String(patch?.[0])
      // Ne pose la route QUE si elle manque, et QUE sur un compte de démonstration.
      expect(sql).toContain("raw_analysis -> 'recommendedRoute' IS NULL")
      expect(sql).toContain("raw_analysis ->> 'demo_seed' = 'true'")
      expect(patch?.[1]).toEqual(['ws-demo', 'Groupe BPCE', expect.stringContaining('"route":"partenaire"')])
      // Un seul compte porte une route (jamais inventée ailleurs).
      expect(
        accounts.manager.query.mock.calls.filter(call => String(call[0]).includes('{recommendedRoute}')),
      ).toHaveLength(1)
    })

    it('is idempotent: a workspace that already has accounts is left untouched', async () => {
      accounts.count.mockResolvedValueOnce(3)
      const result = await service.seedWorkspace('ws-demo', 'owner-1')
      expect(result).toEqual({ seeded: false, accounts: 3 })
      expect(accounts.save).not.toHaveBeenCalled()
      expect(contacts.save).not.toHaveBeenCalled()
      expect(attackAngles.save).not.toHaveBeenCalled()
      expect(actionPlans.save).not.toHaveBeenCalled()
      expect(consultants.save).not.toHaveBeenCalled()
      expect(userActions.save).not.toHaveBeenCalled()
      expect(memberObjectives.save).not.toHaveBeenCalled()
      // Ni l'identité ni l'onboarding ni le profil ESN ne sont retouchés
      // quand la salle a déjà ses dossiers — `restoreOwnerIdentity` n'est
      // appelée que sur un semis NEUF (court-circuit `existing > 0` ci-dessus).
      expect(profiles.update).not.toHaveBeenCalled()
      expect(accounts.manager.query.mock.calls.some(call => String(call[0]).includes('user_onboarding_state'))).toBe(
        false,
      )
      expect(accounts.manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO esn_profiles'))).toBe(
        false,
      )
      expect(
        accounts.manager.query.mock.calls.some(call =>
          String(call[0]).includes('INSERT INTO profile_context_revisions'),
        ),
      ).toBe(false)
      // #2123.46/#2123.47 — même court-circuit pour les tâches du plan.
      expect(
        accounts.manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO action_plan_items')),
      ).toBe(false)
    })
  })

  /**
   * #2571.5 — RÉFUTÉ EN RECETTE le 18/09/2026 : `/rfp` s'ouvrait sur « Aucun
   * appel d'offres importé » alors que la prévisualisation de besoin
   * (#2571.1/#2571.2) était juste, calculée, testée. La garde qui compte est
   * celle-ci : si `seedRfp` disparaît du semis, ce test doit rougir.
   */
  describe('l’appel d’offres scripté de la salle (#2571.5)', () => {
    it('sème UN dossier, avec le titre du jeu de démonstration', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      expect(rfps.save).toHaveBeenCalledTimes(1)
      const written = rfps.create.mock.calls[0]?.[0] as Partial<RfpEntity>
      expect(written).toMatchObject({
        workspace_id: 'ws-demo',
        user_id: 'owner-1',
        title: DEMO_RFP.title,
        // Analysé, pas décidé — le bid/no-bid reste une proposition tant que
        // l'humain n'a pas tranché (même invariant que `RfpService.create`).
        status: 'analysed',
      })
      expect((written.requirements ?? []).length).toBeGreaterThan(0)
    })

    it('la prévisualisation du dossier semé nomme une vraie inconnue, jamais une liste vide', async () => {
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const written = rfps.create.mock.calls[0]?.[0] as Partial<RfpEntity>
      const preview = previewNeedFromRfp({
        title: written.title as string,
        due_at: (written.due_at as Date).toISOString(),
        issuer: written.issuer as string,
        lots: written.lots as string[],
        requirements: written.requirements as RfpEntity['requirements'],
        account_id: written.account_id ?? null,
      })

      // Les compétences ne sont JAMAIS dérivées d'une prose : c'est une
      // inconnue nommée systématiquement (voir `previewNeedFromRfp`).
      expect(preview.unknowns.some(unknown => unknown.kind === 'skills')).toBe(true)
      // ET l'exigence volontairement AMBIGUË du script (`demoRfpAnalysis`) —
      // celle qui prouve que le produit AVOUE ce qu'il ignore plutôt que de
      // trancher à la place du client.
      const ambiguous = preview.unknowns.find(unknown => unknown.kind === 'ambiguous_requirement')
      expect(ambiguous?.value).toBeTruthy()
      // Une inconnue n'est jamais devinée : sa valeur n'est JAMAIS vide-string,
      // seulement `null` ou le texte source de l'exigence.
      for (const unknown of preview.unknowns) {
        expect(unknown.value === null || unknown.value.length > 0).toBe(true)
      }
    })

    it('ne sème pas un second dossier si la salle en a déjà un (idempotent)', async () => {
      accounts.count.mockResolvedValueOnce(3)
      await service.seedWorkspace('ws-demo', 'owner-1')
      expect(rfps.save).not.toHaveBeenCalled()
    })
  })

  describe('pipe de démonstration', () => {
    it('sélectionne les projets COMME L’ÉCRAN, pas sur la seule colonne d’espace', async () => {
      // Défaut observé en production : les cinq colonnes du pipe s'ouvraient à
      // zéro alors que 73 projets étaient matérialisés. Le seed filtrait sur
      // `opportunities.workspace_id` seul, quand toutes les lectures du pipe
      // acceptent aussi le rattachement par le COMPTE — la colonne pouvant être
      // transitoirement NULL. Le seed ne trouvait rien à avancer et sortait en
      // silence.
      accounts.count.mockResolvedValueOnce(0)
      await service.seedWorkspace('ws-demo', 'owner-1')

      const select = notes.manager.query.mock.calls
        .map(call => String(call[0]))
        .find(query => query.includes('FROM opportunities o'))

      expect(select).toBeDefined()
      expect(select).toContain('JOIN accounts a ON a.id = o.account_id')
      // Le rattachement de vérité est celui du compte : les deux doivent compter.
      expect(select).toContain('o.workspace_id = $1 OR a.workspace_id = $1')
    })
  })

  describe('client d’exemple — la moitié « après la signature »', () => {
    /** Les requêtes SQL brutes émises par le seed, dans l'ordre. */
    function sql(): string[] {
      return accounts.manager.query.mock.calls.map(call => String(call[0]))
    }

    /** Les paramètres de chaque `INSERT INTO missions`, dans l'ordre du seed. */
    function missionInserts(): unknown[][] {
      return accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO missions'))
        .map(call => call[1] as unknown[])
    }

    /** Les paramètres de chaque `INSERT INTO mission_assignments`. */
    function assignmentInserts(): { workspaceId: string; consultantId: string; startsOn: string; endsOn: string }[] {
      return accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO mission_assignments'))
        .map(call => {
          const params = call[1] as unknown[]
          return {
            workspaceId: String(params[1]),
            consultantId: String(params[2]),
            startsOn: String(params[3]),
            endsOn: params[4] === null ? '' : String(params[4]),
          }
        })
    }

    /** Aujourd'hui au format que Postgres compare à `current_date`. */
    function today(): string {
      return new Date().toISOString().slice(0, 10)
    }

    /** `current_date + offset`, en date nue — la même arithmétique que les sondes. */
    function dayShift(offset: number): string {
      return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
    }

    let nextMissionId = 1
    let nextNeedId = 1

    beforeEach(() => {
      nextMissionId = 1
      nextNeedId = 1
      accounts.count.mockResolvedValueOnce(0)
      // Le seed relit ses insertions : compte, projet, consultants, missions.
      accounts.manager.query.mockImplementation(async (query: string) => {
        const text = String(query)
        if (text.includes('FROM consultants')) {
          return [
            { id: 'cons-1', full_name: 'Yanis Berthier' },
            { id: 'cons-2', full_name: 'Salomé Dufour' },
            { id: 'cons-3', full_name: 'Antoine Rivière' },
            { id: 'cons-4', full_name: 'Inès Kaczmarek' },
            // Elle porte l'INTERCONTRAT du jeu de données. Absente de ce
            // doublon, le seed sauterait son affectation en silence
            // (`if (consultantId)`), et la garde de forme d'en dessous
            // rendrait vert un intercontrat qui n'existe pas.
            { id: 'cons-5', full_name: 'Camille Roussel' },
            { id: 'cons-6', full_name: 'Hakim Barreau' },
            { id: 'cons-7', full_name: 'Marc Ouedraogo' },
          ]
        }
        // Chaque mission doit rendre un id DISTINCT : partagé, deux
        // affectations pendraient de la même mission et le miroir des sondes
        // de Laura lirait un jeu de dates qui n'existe pas en base.
        if (text.includes('INSERT INTO missions')) return [{ id: `mission-${nextMissionId++}` }]
        // Idem pour les rôles : `shortlist_count` compte les positionnements
        // PAR `need_id`. Un id partagé rassemblerait toutes les shortlists sur
        // une seule ligne et rendrait vert un kanban qui ne l'est pas.
        if (text.includes('INSERT INTO project_needs')) return [{ id: `need-${nextNeedId++}` }]
        if (text.includes('RETURNING id')) return [{ id: 'row-1' }]
        return []
      })
    })

    // Décision Louis 04/10/2026 — plus de client fictif : la livraison est posée
    // sur le VRAI compte porteur, sans créer de compte.
    it('pose la livraison sur le VRAI compte porteur, sans créer de compte fictif', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const update = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('UPDATE accounts') && String(call[0]).includes('declared_internal_client_mode = $6'),
      )
      expect(update).toBeDefined()
      const params = update?.[1] as unknown[]
      // Marqué client : il n'a rien à faire dans les vues de conquête.
      expect(params[2]).toBe('customer')
      const fictive = accounts.manager.query.mock.calls.filter(
        call => String(call[0]).includes('INSERT INTO accounts') && JSON.stringify(call[1] ?? []).includes('exemple'),
      )
      expect(fictive).toEqual([])
    })

    // #2189.39 (épopée #2940) — la prochaine action d'UN positionnement du
    // client d'exemple, toujours datée ET attribuée, même en démo.
    it('pose une prochaine action datée ET attribuée sur au moins un positionnement', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const inserts = accounts.manager.query.mock.calls
        .filter(
          call => String(call[0]).includes('INSERT INTO submissions') && String(call[0]).includes('next_action_label'),
        )
        .map(call => call[1] as unknown[])
      const withNextAction = inserts.filter(params => params[17] !== null)
      expect(withNextAction.length).toBeGreaterThan(0)
      for (const params of withNextAction) {
        // label (17), due_at (18), owner_id (19) : les trois ou aucun.
        expect(params[17]).not.toBeNull()
        expect(params[18]).not.toBeNull()
        expect(params[19]).not.toBeNull()
      }
    })

    it('remplit les trois écrans qui s’ouvraient vides', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')
      const queries = sql()

      for (const table of ['submissions', 'missions', 'mission_assignments', 'mission_commercial_terms']) {
        expect(queries.some(query => query.includes(`INSERT INTO ${table}`))).toBe(true)
      }
    })

    it('pose un positionnement SANS RETOUR — le motif qu’aucun CRM ne propose', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Le filtre nomme la COLONNE, pas seulement la table : depuis que les
      // rôles ouverts portent eux aussi des positionnements, deux inserts
      // différents visent `submissions` et leur neuvième paramètre ne dit pas
      // la même chose. Lire une position sur la mauvaise requête est le défaut
      // « jointure par position », en plus discret.
      // #2335.1 — `substatus` s'est inséré en position 5 (`INSERT INTO
      // submissions ... stage, substatus, stage_entered_at, ...`), décalant
      // `outcome_reason` de l'index 8 à l'index 9.
      const reasons = accounts.manager.query.mock.calls
        .filter(
          call => String(call[0]).includes('INSERT INTO submissions') && String(call[0]).includes('outcome_reason'),
        )
        .map(call => (call[1] as unknown[])[9])
      // Sans lui, le taux d'acceptation afficherait 50 % là où la vérité est
      // « un sur deux a répondu ».
      expect(reasons).toContain('no_feedback')
    })

    it('montre les états de mission, dont le forfait sans relevé et la mission terminée', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      // On assert les ÉTATS, pas un compte : un total se met à jour sans qu'on
      // relise ce qu'il compte, et c'est ainsi qu'une mission de plus peut
      // arriver sans que personne ne se demande ce qu'elle montre de neuf.
      const statuses = missionInserts().map(params => params[5])
      // Une vue qui n'afficherait que des lignes prêtes ne dirait pas à quoi
      // elle sert : une est bloquée faute de relevé, une est un FORFAIT qui n'en
      // attend aucun — l'état qu'on oublie de montrer et qui fait croire à un
      // bug quand il apparaît en clientèle — et une est TERMINÉE, l'après que
      // le jeu de données ne montrait nulle part.
      expect(statuses.filter(status => status === 'active').length).toBeGreaterThanOrEqual(4)
      // ⚠️ `>= 1` depuis le 29/08/2026, et non plus « exactement une ».
      //
      // Ce test dit lui-même ce qu'il garde — « on assert les ÉTATS, pas un
      // compte » — et il écrivait pourtant un compte exact sur cette seule
      // ligne. Le canal `portage` a amené une seconde mission close, et la
      // salle n'en est pas moins juste : ce qui doit être tenu sur une mission
      // close, c'est qu'elle reste HORS de la fenêtre de facturation du mois
      // précédent, et ce contrôle-là porte sur TOUTES les missions closes (voir
      // « garde la mission terminée HORS de la fenêtre … » plus bas). Un compte
      // exact ici n'ajoutait rien à cette protection ; il interdisait seulement
      // d'enrichir la salle.
      expect(statuses.filter(status => status === 'ended').length).toBeGreaterThanOrEqual(1)

      // Autant de relevés que de missions qui en portent un dans le jeu — LU,
      // jamais recopié : le nombre en dur disait « 2 » et il a fallu le
      // changer à la main le jour où le rejet est arrivé en démonstration.
      const expectedTimesheets =
        DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.timesheet !== null).length +
        // ⚠️ Plus l'HISTORIQUE de la mission qui dérape (PDF 5 §7.2) : un relevé
        // unique ne peut PAS montrer une dérive — « deux signaux minimum, sur
        // trois mois minimum ». Lu et jamais recopié, pour la raison écrite
        // juste au-dessus.
        DEMO_DELIVERY_CLIENT.missions.reduce(
          (total, mission) => total + ((mission as { driftHistory?: unknown[] }).driftHistory?.length ?? 0),
          0,
        )
      expect(expectedTimesheets).toBeGreaterThanOrEqual(4)
      // ⚠️ #2567.3 (18/09/2026) — `gap_explanation` en plus du nom de table :
      // `mission_timesheets` a un SECOND écrivain depuis ce lot
      // (`seedRetentionDomainsSource`, un relevé `missing` pour que
      // `detectMissingTimesheets` ait une ligne réelle à lire), et son INSERT
      // ne porte pas cette colonne — jamais un écart à expliquer sur un relevé
      // qui n'a jamais été déposé. `gap_explanation` est commune aux DEUX
      // écritures que ce compte veut tenir (le relevé courant de la boucle des
      // missions ET l'historique de dérive juste au-dessus), donc le filtre
      // reste exact pour elles deux et exclut la nouvelle sans se resserrer.
      const timesheets = sql().filter(
        query => query.includes('INSERT INTO mission_timesheets') && query.includes('gap_explanation'),
      ).length
      expect(timesheets).toBe(expectedTimesheets)
    })

    /**
     * #2567.3 — LA GARDE QUI MANQUAIT SUR LES DEUX ÉCRITURES DE
     * `seedRetentionDomainsSource` (CRA et FACTURATION/BONS DE COMMANDE).
     *
     * ─────────────────────────────────────────────────────────────────────────
     * LE DÉFAUT MESURÉ, EN LE PROVOQUANT
     * ─────────────────────────────────────────────────────────────────────────
     * `demo-retention-domains-coverage.spec.ts` rejoue les fonctions PURES du
     * balayeur (`detectMissingTimesheets`, `detectBlockedInvoicing`) sur des
     * lignes RECOPIÉES à la main — jamais sur ce que `seedWorkspace` écrit
     * réellement. Et les deux tests juste au-dessus EXCLUENT explicitement la
     * ligne de `seedRetentionDomainsSource` (filtre `gap_explanation` ici,
     * filtre `invoice_reference` pour `invoice_readiness` un peu plus bas) —
     * à dessein, pour ne pas fausser un compte qui n'est pas le leur. Résultat
     * mesuré en commentant les deux `INSERT` de `seedRetentionDomainsSource`
     * dans `demo-seed.service.ts` : les 147 tests de `demo-coverage.spec.ts` +
     * `demo-retention-domains-coverage.spec.ts` + ce fichier restaient TOUS
     * verts. Une classification « SEEDÉE » que rien ne vérifie à l'exécution —
     * exactement le défaut que la mémoire du dépôt nomme « une classification
     * affirme, une garde vérifie ».
     */
    describe('CRA et facturation/bons de commande — les deux écritures de `seedRetentionDomainsSource` (#2567.3)', () => {
      /** Un `INSERT` dont certaines colonnes sont écrites en LITTÉRAL SQL
       *  (`'missing'`, `'blocked'`) plutôt qu'en paramètre — les colonnes
       *  nommées sont appariées à leur `VALUES` dans l'ORDRE, littéraux compris,
       *  même garde-fou que `byColumn` plus bas dans ce fichier. */
      function byColumn(sql: string, params: unknown[]): Record<string, unknown> {
        const columns = /INSERT INTO \w+\s*\(([^)]+)\)/.exec(sql)?.[1] ?? ''
        const values = /VALUES\s*\(([\s\S]+?)\)/.exec(sql)?.[1] ?? ''
        const names = columns.split(',').map(name => name.trim())
        const slots = values.split(',').map(slot => slot.trim())
        expect(names).toHaveLength(slots.length)
        const row: Record<string, unknown> = {}
        names.forEach((name, index) => {
          const placeholder = /^\$(\d+)/.exec(slots[index])
          row[name] = placeholder ? params[Number(placeholder[1]) - 1] : slots[index].replace(/^'|'$/g, '')
        })
        return row
      }

      it('CRA — écrit le relevé `missing` que `detectMissingTimesheets` doit pouvoir lire', async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')

        // Marqueur du SECOND écrivain (`seedRetentionDomainsSource`) : LES DEUX
        // autres écritures de `mission_timesheets` (le relevé courant de la
        // boucle des missions, et l'historique de dérive PDF 5 §7.2) portent
        // TOUTES les deux `gap_explanation` — absente ici, comme le filtre
        // d'exclusion du test juste au-dessus le documente déjà.
        const call = accounts.manager.query.mock.calls.find(
          entry =>
            String(entry[0]).includes('INSERT INTO mission_timesheets') &&
            String(entry[0]).includes('last_reminder_at') &&
            !String(entry[0]).includes('gap_explanation'),
        )
        expect(call).toBeDefined()
        const row = byColumn(String(call?.[0]), call?.[1] as unknown[])

        expect(row['status']).toBe('missing')
        expect(row['days']).toBe('0')
        expect(row['expected_days']).toBe('20')
        expect(row['reminders_sent']).toBe(INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert)
        expect(row['reminders_sent']).toBeGreaterThanOrEqual(INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert)
      })

      it('FACTURATION + BONS DE COMMANDE — écrit le mois `blocked` où `missing_po` figure', async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')

        // Marqueur du SECOND écrivain d'`invoice_readiness` : `blockers` n'est
        // porté que par cette ligne — l'historique D42 (`invoiceInserts()` plus
        // bas) ne connaît pas cette colonne.
        const call = accounts.manager.query.mock.calls.find(
          entry => String(entry[0]).includes('INSERT INTO invoice_readiness') && String(entry[0]).includes('blockers'),
        )
        expect(call).toBeDefined()
        const row = byColumn(String(call?.[0]), call?.[1] as unknown[])

        expect(row['state']).toBe('blocked')
        const blockers = JSON.parse(String(row['blockers'])) as string[]
        // Le domaine BONS DE COMMANDE n'ouvre pas de ligne à lui : il se lit ICI,
        // dans les bloqueurs de la même ligne que FACTURATION.
        expect(blockers).toContain('missing_po')
        expect(blockers).toContain('missing_timesheet')
      })
    })

    /**
     * LE REJET D'UN RELEVÉ, DANS SES DEUX MOITIÉS.
     *
     * Rejeter ne supprime pas : le relevé repart vers son auteur, qui le
     * corrige et le redépose — et le motif reste lisible APRÈS le redépôt.
     * L'écran lit cette différence sur le statut (`TimesheetsPage.tsx`), donc
     * la salle doit porter les deux lignes, pas une.
     *
     * Ce test regarde ce qui part vraiment en SQL, et pas seulement le jeu de
     * données : c'est la moitié que `demo-coverage.spec.ts` ne peut pas voir.
     */
    it('fait partir la TRACE du rejet en base, dans ses deux moitiés', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      // ⚠️ Les relevés COURANTS seulement : l'historique de dérive (PDF 5 §7.2)
      // part par un second INSERT, qui ne porte pas la trace du rejet et n'a
      // aucune raison de la porter — un mois d'il y a trois mois n'est pas en
      // aller-retour. Les mélanger ferait échouer ce test pour un motif qui
      // n'est pas le sien.
      const inserts = accounts.manager.query.mock.calls.filter(
        entry =>
          String(entry[0]).includes('INSERT INTO mission_timesheets') && String(entry[0]).includes('rejected_at'),
      )
      expect(inserts.length).toBeGreaterThanOrEqual(4)

      // La colonne doit être NOMMÉE dans la requête : un paramètre de plus sans
      // sa colonne s'insérerait dans la mauvaise, en silence.
      for (const entry of inserts) {
        expect(String(entry[0])).toContain('rejected_at')
        expect(String(entry[0])).toContain('rejection_reason')
        // ⚠️ Le cast n'est pas décoratif : c'est un `null` non typé qui avait
        // mis `POST /demo/session` en 500 sur ce même INSERT.
        expect(String(entry[0])).toContain('$8::timestamptz')
        expect(String(entry[0])).toContain('$9::text')
      }

      // Position 4 = statut, 7 = date de rejet, 8 = motif.
      const rows = inserts.map(entry => entry[1] as unknown[])
      const rejected = rows.filter(params => params[4] === 'rejected')
      const resubmitted = rows.filter(params => params[4] !== 'rejected' && params[7] !== null)

      expect(rejected).toHaveLength(1)
      expect(resubmitted).toHaveLength(1)
      // Le relevé redéposé est bien REPASSÉ en « soumis » : c'est ce statut-là
      // qui fait écrire « rejeté le …, puis redéposé » plutôt que « rejeté le … ».
      expect(resubmitted[0]?.[4]).toBe('submitted')

      for (const params of [...rejected, ...resubmitted]) {
        // Une date ISO lisible par `new Date(...).toISOString()` côté lecture.
        expect(String(params[7])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        // La contrainte `mission_timesheets_rejection_reason_check` refuse en
        // BASE une date sans motif : le couple ne se dépareille jamais.
        expect(String(params[8]).trim().length).toBeGreaterThan(20)
      }

      // Un relevé jamais rejeté ne porte NI date NI motif — « pas rejeté » ne
      // s'écrit pas avec une chaîne vide.
      for (const params of rows.filter(entry => entry[4] === 'validated')) {
        expect(params[7]).toBeNull()
        expect(params[8]).toBeNull()
      }
    })

    it('ne date JAMAIS un rejet avant la clôture du mois que le relevé couvre', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Le défaut que le plancher évite : `rejected_days_ago` se compte depuis
      // aujourd'hui, donc les premiers jours d'un mois « il y a onze jours »
      // tombe DANS le mois couvert par le relevé. La salle afficherait alors
      // « rejeté le 20 » sur le relevé de ce même mois — quelques jours par
      // mois seulement, c'est-à-dire découvert en réunion.
      // ⚠️ #2567.3 — `gap_explanation` en plus du nom de table, même raison que
      // le compte exact plus haut : sans elle, la ligne à HUIT paramètres de
      // `seedRetentionDomainsSource` (position 7 = `last_reminder_at`, jamais
      // `rejected_at`) s'y glisserait et ce test comparerait une date de
      // relance à une clôture de mois — pas ce qu'il veut mesurer.
      const rows = accounts.manager.query.mock.calls
        .filter(
          entry =>
            String(entry[0]).includes('INSERT INTO mission_timesheets') && String(entry[0]).includes('gap_explanation'),
        )
        .map(entry => entry[1] as unknown[])
        .filter(params => params[7] !== null)

      expect(rows.length).toBeGreaterThanOrEqual(2)
      for (const params of rows) {
        const period = String(params[2]) // `YYYY-MM-01` du mois PRÉCÉDENT
        const rejectedAt = new Date(String(params[7]))
        // Le premier jour du mois SUIVANT la période : le rejet est après.
        // ⚠️ Sans `Z`, la chaîne s'analyse en heure LOCALE — c'est voulu, et
        // c'est le point du test. Le semis pose ses dates sur le calendrier
        // local ; mesurer sa clôture en UTC comparerait deux horloges, et le
        // test rougirait deux heures chaque nuit sans qu'aucun défaut existe.
        const periodEnd = new Date(`${period}T00:00:00`)
        periodEnd.setMonth(periodEnd.getMonth() + 1)
        expect(rejectedAt.getTime()).toBeGreaterThanOrEqual(periodEnd.getTime())
        // …et jamais dans le futur.
        expect(rejectedAt.getTime()).toBeLessThanOrEqual(Date.now())
      }
    })

    it('déclare la NATURE du contrat sur chaque mission de démonstration', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const calls = accounts.manager.query.mock.calls.filter(entry => String(entry[0]).includes('INSERT INTO missions'))
      const kinds = calls.map(entry => (entry[1] as unknown[])[9])
      // Sans `contract_kind`, l'écran des relevés réclamerait un CRA au
      // forfait — le faux positif qu'on vient de supprimer.
      expect(kinds).toContain('forfait')
      expect(kinds).toContain('regie')
    })

    // #2944 (recette écran, 26/09) — `/missions/facturation` affichait
    // « Société facturante : non mesuré » sur ses 9 lignes en prod : la
    // société de démonstration existait (`legal_entities`) mais aucune
    // mission ne la portait (`legal_entity_id`). Toujours UNE SEULE société —
    // ce n'est pas un second groupe, c'est la même ESN qui facture chacune de
    // ses missions.
    it('#2944 — rattache la société facturante de la salle à TOUTES ses missions', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const update = accounts.manager.query.mock.calls.find(
        entry =>
          typeof entry[0] === 'string' && entry[0].includes('UPDATE missions') && entry[0].includes('legal_entity_id'),
      )
      expect(update).toBeDefined()
      const params = update?.[1] as unknown[]
      // `row-1` est l'id que le double `RETURNING id` générique rend pour
      // CETTE société — pas une valeur inventée par le test.
      expect(params[0]).toBe('row-1')
      expect(params[1]).toBe('ws-demo')
    })

    it('pose le relevé sur le mois PRÉCÉDENT — celui que l’écran regarde', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const call = accounts.manager.query.mock.calls.find(entry =>
        String(entry[0]).includes('INSERT INTO mission_timesheets'),
      )
      // Le CONSULTANT est en position 2 : la maille de l'écran est
      // mission × consultant. Le mois suit.
      const period = String((call?.[1] as unknown[])[2])
      const expected = new Date()
      expected.setDate(1)
      expected.setMonth(expected.getMonth() - 1)
      // Un relevé posé sur le mois courant n'apparaîtrait nulle part.
      // ⚠️ `localMonthKey` et non `toISOString()` : le 1er du mois à 00 h 30 à
      // Paris, l'instant UTC est encore le mois d'AVANT. Ce test rougissait donc
      // deux heures chaque nuit, en accusant le semis d'un défaut qu'il n'avait
      // pas — et il aurait masqué le vrai, qui était dans le semis (GA-126).
      expect(period).toBe(`${localMonthKey(expected)}-01`)
    })

    it('RÉUTILISE les consultants du vivier au lieu d’en recréer', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      // Un profil dupliqué dans le vivier se verrait tout de suite.
      expect(sql().some(query => query.includes('FROM consultants'))).toBe(true)
      expect(sql().some(query => query.includes('INSERT INTO consultants'))).toBe(false)
    })

    /**
     * LE KANBAN DES BESOINS, ET LA COLONNE SHORTLIST.
     *
     * Trois trous mesurés le 28/08/2026, tous invisibles pour la garde par
     * table (`project_needs` était bien seedée) :
     *  1. un seul rôle, dans un seul état — le kanban n'avait qu'une colonne
     *     remplie, donc son pied contextuel ne pouvait pas se voir changer ;
     *  2. aucun positionnement ne portait de `need_id`, si bien que
     *     `shortlist_count` valait ZÉRO sur tous les besoins de la salle ;
     *  3. aucun rôle ne portait de `location`, donc la ligne « lieu · mode »
     *     de la carte n'affichait que le mode.
     *
     * Ces tests rejouent le prédicat du LECTEUR, cité au-dessus de chacun, sur
     * les lignes que le seed écrit réellement. Un seed qui pose la bonne donnée
     * sous la mauvaise forme remplit la base et laisse l'écran vide.
     */
    describe('le kanban des besoins et la colonne Shortlist', () => {
      /** Les paramètres de chaque `INSERT INTO project_needs` du client d'exemple. */
      /** Les rôles du kanban : exclut l'annonce interne et les besoins posés par d'autres gardes. */
      function isKanbanNeedInsert(sql: string): boolean {
        return (
          sql.includes('INSERT INTO project_needs') &&
          // #3681 — l'annonce de recrutement INTERNE n'est pas un rôle du kanban
          // (`contract_kind` littéral `recrutement`) : elle a sa propre garde.
          !sql.includes("'recrutement'") &&
          // #3895 — l'historique des besoins FERMÉS d'un dossier réel (Sanofi, et Société Générale depuis #4755)
          // a sa propre garde : ce ne sont pas des rôles du client fictif.
          !sql.includes('#3895') &&
          // #4270.5 — les deux besoins du profil FORFAIT (au forfait encadré, sans projet) ont leur garde.
          !sql.includes('#4270.5') &&
          // #4349 V.2 — les refus faute de profil (clos) ont leur garde : `demo-missing-expertise-coverage.spec.ts`.
          !sql.includes('#4349 V.2')
        )
      }

      /** Les paramètres de chaque `INSERT INTO project_needs` du client d'exemple. */
      function needInserts(): unknown[][] {
        return accounts.manager.query.mock.calls
          .filter(call => isKanbanNeedInsert(String(call[0])))
          .map(call => call[1] as unknown[])
      }

      /**
       * #4755 — l'id que le faux a RENDU à chaque rôle du kanban : son rang parmi TOUTES les insertions de
       * `project_needs` (le compteur est global), pas son rang dans la liste filtrée — un besoin fermé semé avant
       * le client d'exemple décalerait sinon chaque id d'un cran.
       */
      function needInsertIds(): string[] {
        return accounts.manager.query.mock.calls
          .filter(call => String(call[0]).includes('INSERT INTO project_needs'))
          .map((call, index) => ({ kanban: isKanbanNeedInsert(String(call[0])), id: `need-${index + 1}` }))
          .filter(row => row.kanban)
          .map(row => row.id)
      }

      /** Les positionnements rattachés à un RÔLE — ceux que le compteur lit. */
      function shortlistInserts(): unknown[][] {
        return accounts.manager.query.mock.calls
          .filter(
            call =>
              String(call[0]).includes('INSERT INTO submissions') &&
              // #3068 — la colonne `need_id` seule ne suffit plus à distinguer
              // ce site : `ON CONFLICT (project_id, consultant_id,
              // coalesce(need_id, …))` (le correctif d'idempotence sur
              // `submissions_unique`) pose le mot `need_id` aussi sur le site
              // SANS cette colonne (`client.submissions`, `need_id` reste
              // NULL). La liste des colonnes est le seul marqueur qui reste
              // propre au site RATTACHÉ à un besoin.
              String(call[0]).includes('project_id, need_id, consultant_id'),
          )
          .map(call => call[1] as unknown[])
      }

      /**
       * `shortlist_count`, calculé EXACTEMENT comme `OpenNeedsService.list` :
       *   (SELECT COUNT(*) FROM submissions sub WHERE sub.need_id = need.id)
       * — donc sur `submissions.need_id`, et jamais sur la table `shortlists`,
       * qui est vide à dessein.
       */
      function shortlistCountByNeed(): Map<string, number> {
        // Tous les rôles insérés partent à ZÉRO, y compris ceux que personne
        // n'a positionnés : c'est le seul moyen de distinguer « aucun profil »
        // d'un rôle absent du calcul.
        const counts = new Map<string, number>(seededNeedIds().map(id => [id, 0]))
        for (const params of shortlistInserts()) {
          const needId = String(params[2])
          counts.set(needId, (counts.get(needId) ?? 0) + 1)
        }
        return counts
      }

      /** Les identifiants rendus par le doublon, dans l'ordre des insertions. */
      function seededNeedIds(): string[] {
        return needInsertIds()
      }

      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      /**
       * Les rôles OUVERTS — ceux dont le kanban est fait.
       *
       * ⚠️ Le semis pose depuis le 31/08/2026 un rôle de plus qui n'est PAS
       * destiné au kanban : {@link DEMO_STAFFED_NEED}, un rôle POURVU
       * (`status: 'won'`) posé sur le projet gagné du client, et rattaché à la
       * mission qui en est née. Il existe pour que le quatrième chiffre du
       * bandeau « Staffing » d'une FICHE besoin — « Mission attribuée » — ne
       * soit pas « 0 » partout dans la salle. Il a sa propre suite juste après
       * celle-ci ; l'inclure ici ferait échouer « toutes ouvertes » pour la
       * mauvaise raison, et l'exclure sans le dire l'enterrerait.
       */
      function openNeedInserts(): unknown[][] {
        /**
         * ⚠️ Les besoins REFUSÉS sortent aussi (01/09/2026), et pour la même
         * raison que le rôle déjà staffé juste au-dessus : ils sont en `lost`,
         * un statut qui n'a AUCUNE colonne sur le kanban.
         *
         * Ils existent pour le détecteur d'expertise manquante (PDF 4 §8.4) —
         * « trois besoins refusés sur la même compétence » ne peut se montrer
         * que sur des refus déjà passés. Ils ont leur propre test juste après
         * celui-ci ; les exclure SANS le dire les enterrerait.
         */
        const closed = new Set([DEMO_STAFFED_NEED.title, ...DEMO_DELIVERY_CLIENT.refusedNeeds.map(n => n.title)])
        return needInserts().filter(params => !closed.has(String(params[2])))
      }

      it('remplit au moins TROIS colonnes du kanban, toutes ouvertes', () => {
        const statuses = openNeedInserts().map(params => String(params[9]))
        expect(statuses.length).toBeGreaterThanOrEqual(3)
        // Un état hors des OUVERTS n'a pas de colonne : le rôle serait écrit en
        // base et invisible sur l'écran qu'on cherche justement à remplir.
        for (const status of statuses) expect(NEED_OPEN_STATUSES).toContain(status)
        expect(new Set(statuses).size).toBeGreaterThanOrEqual(3)
      })

      it('sème les TROIS refus faute de profil, avec leur verdict et leur date', () => {
        // Sans eux, le détecteur d'expertise manquante serait livré et muet en
        // démonstration : un écran vide se découvre en réunion, pas en CI.
        const refusedTitles = new Set(DEMO_DELIVERY_CLIENT.refusedNeeds.map(need => need.title))
        const rows = needInserts().filter(params => refusedTitles.has(String(params[2])))
        expect(rows.length).toBe(DEMO_DELIVERY_CLIENT.refusedNeeds.length)
        for (const params of rows) {
          // `status` en position 9, `staffable` en 27 — les deux vont ensemble :
          // la porte G3 force `lost` quand elle refuse.
          expect(String(params[9])).toBe('lost')
          expect(String(params[27])).toBe('no')
          expect(String(params[28]).length).toBeGreaterThan(0)
          expect(params[29]).not.toBeNull()
        }
      })

      it('#2173.29 — sème le télétravail depuis le jeu de données, avec au moins un « non renseigné »', () => {
        // `remote` voyage en position 31 sur CETTE requête (AJOUTÉE EN FIN DE
        // LISTE) — voir `demo-seed.service.ts`. Résolu PAR TITRE, jamais par
        // position dans `needInserts()` : ce tableau mélange aussi l'insertion
        // de {@link DEMO_STAFFED_NEED}, dont la requête (et donc la position du
        // même paramètre) est différente.
        const byTitle = new Map(needInserts().map(params => [String(params[2]), params]))
        for (const need of [...DEMO_DELIVERY_CLIENT.openNeeds, ...DEMO_DELIVERY_CLIENT.refusedNeeds]) {
          expect(byTitle.get(need.title)?.[31]).toBe(need.remote)
        }
        // Craft rule n°9 : au moins une valeur réaliste ET au moins un
        // `null` — jamais un `'sur_site'` deviné pour ce qui manque.
        const remoteValues = [...DEMO_DELIVERY_CLIENT.openNeeds, ...DEMO_DELIVERY_CLIENT.refusedNeeds].map(
          need => need.remote,
        )
        expect(remoteValues.some(value => value !== null)).toBe(true)
        expect(remoteValues.some(value => value === null)).toBe(true)
      })

      /**
       * #2173.49 — LE BESOIN ARCHIVÉ de la salle, pour que la vue « Archivés »
       * ne soit pas vide (règle « parité démo »).
       *
       * ⚠️ LE POINT DU TEST : `status` (position 9) reste `to_qualify`, celui
       * du jeu de données — archiver n'est PAS une clôture (décision Louis,
       * 17/09/2026). Une implémentation pressée aurait posé `lost` ou
       * `cancelled` ; ce test tombe si c'est le cas.
       */
      it('sème le besoin ARCHIVÉ, statut inchangé — position 30 est la SEULE qui bouge', () => {
        const rows = needInserts().filter(
          params => String(params[2]) === 'Data analyst reporting — tableau de bord d’exploitation',
        )
        expect(rows).toHaveLength(1)
        const [params] = rows
        expect(params).toBeDefined()
        expect(String(params?.[9])).toBe('to_qualify')
        expect(params?.[30]).not.toBeNull()
      })

      it('donne un LIEU à chaque rôle — la ligne « lieu · mode » de la carte', () => {
        const rows = needInserts()
        expect(rows.length).toBeGreaterThanOrEqual(3)
        for (const params of rows) {
          const location = params[7]
          expect(typeof location).toBe('string')
          expect(String(location).trim().length).toBeGreaterThan(0)
        }
      })

      it('écrit les compétences en OBJETS `{ term }`, la forme que le filtre lit', () => {
        // Le filtre par compétence fait `jsonb_array_elements(need.skills) s
        // WHERE s->>'term' ILIKE …`. Des chaînes nues passeraient le typage,
        // rempliraient la colonne, et rendraient `s->>'term'` NULL sur chaque
        // ligne : c'est le défaut « un seed doit avoir la forme que l'écran
        // lit », déjà payé sur la pile technique du même client.
        for (const params of needInserts()) {
          const skills: unknown = JSON.parse(String(params[3]))
          expect(Array.isArray(skills)).toBe(true)
          expect((skills as unknown[]).length).toBeGreaterThan(0)
          for (const skill of skills as Record<string, unknown>[]) {
            expect(typeof skill).toBe('object')
            expect(typeof skill['term']).toBe('string')
            expect(String(skill['term']).trim().length).toBeGreaterThan(0)
          }
        }
      })

      it('date l’ÉTAPE de chaque rôle — la moitié « âge » du pied de carte', () => {
        for (const params of needInserts()) {
          const changedAt = String(params[11])
          // Un horodatage lisible, et dans le PASSÉ : un âge d'étape négatif se
          // lirait « posé demain ».
          expect(Number.isNaN(Date.parse(changedAt))).toBe(false)
          expect(Date.parse(changedAt)).toBeLessThanOrEqual(Date.now())
        }
      })

      it('RATTACHE les positionnements à leur rôle — sans `need_id`, la shortlist reste à zéro', () => {
        const rows = shortlistInserts()
        expect(rows.length).toBeGreaterThanOrEqual(2)
        const needIds = new Set(seededNeedIds())
        for (const params of rows) {
          // La clé étrangère doit pointer un rôle RÉELLEMENT inséré : un
          // `need_id` orphelin compte pour zéro exactement comme un `null`.
          expect(needIds.has(String(params[2]))).toBe(true)
          expect(String(params[0])).toBe('ws-demo')
        }
      })

      it('laisse `shortlist_count` NON NUL sur au moins un rôle, et un VRAI zéro sur un autre', () => {
        const counts = shortlistCountByNeed()
        const seeded = needInsertIds()

        const filled = seeded.filter(id => (counts.get(id) ?? 0) > 0)
        // Le défaut mesuré : la colonne Shortlist affichait « aucune » sur TOUS
        // les besoins de la salle, parce qu'aucun positionnement ne portait de
        // `need_id`.
        expect(filled.length).toBeGreaterThanOrEqual(1)

        // …et la contrepartie, qui est la règle et non son exception : une
        // shortlist vide est un VRAI zéro, pas une mesure absente. La fabriquer
        // non nulle partout effacerait la distinction que la colonne existe pour
        // montrer.
        const empty = seeded.filter(id => (counts.get(id) ?? 0) === 0)
        expect(empty.length).toBeGreaterThanOrEqual(1)
      })

      it('n’annonce jamais un rôle plus loin que ses profils — « shortlist prête » sans profil se contredit', () => {
        const counts = shortlistCountByNeed()
        const advanced = needInserts()
          .map((params, index) => ({ status: String(params[9]), id: needInsertIds()[index] ?? '' }))
          .filter(need => need.status === 'shortlist_ready' || need.status === 'client_review')
        expect(advanced.length).toBeGreaterThanOrEqual(1)
        for (const need of advanced) expect(counts.get(need.id) ?? 0).toBeGreaterThan(0)
      })

      it('ne pose aucun de ces rôles sur l’une des six sociétés RÉELLES', () => {
        // Le lien de démonstration est PUBLIC : « cherche un ingénieur sécurité »
        // au nom d'une société réelle serait une affirmation sur son
        // recrutement que personne n'a vérifiée. Les rôles ouverts pendent donc
        // du projet du client FICTIF, inséré juste avant eux.
        const projects = accounts.manager.query.mock.calls
          .filter(call => String(call[0]).includes('INSERT INTO opportunities'))
          .map(call => (call[1] as unknown[])[2])
        expect(projects).toContain(DEMO_DELIVERY_CLIENT.openProject.label)

        // Et chaque rôle vient bien du jeu de données : un titre qui n'y
        // figurerait pas serait une demande inventée ailleurs. Le rôle POURVU
        // (31/08/2026) est nommé dans cet ensemble au même titre que les
        // autres — il vit dans `DEMO_STAFFED_NEED`, pas en dur dans le semis,
        // précisément pour qu'une garde puisse le reconnaître ici.
        const known = new Set([
          ...DEMO_DELIVERY_CLIENT.openNeeds.map(need => need.title),
          // Les refus faute de profil (PDF 4 §8.4) sont des rôles du client
          // d'exemple comme les autres — clos, mais nommés dans le jeu.
          ...DEMO_DELIVERY_CLIENT.refusedNeeds.map(need => need.title),
          DEMO_STAFFED_NEED.title,
          // #2558.1 — le besoin SANS PROJET pend du même compte fictif, posé
          // par `seedNeedWithoutProject` : même règle, même raison.
          DEMO_DELIVERY_CLIENT.needWithoutProject.title,
          // #2178 — le besoin sans profil défendable pend du même compte
          // fictif, posé par `seedNoDefendableProfileNeed` : même règle.
          DEMO_NO_DEFENDABLE_PROFILE_NEED.title,
          // #4194 (L3) — la chaîne ORANGE du panneau latéral unique (décision du brief) :
          // posée par `seedDemoCrmLinks`, titres nommés dans `DEMO_CRM_LINKS_CHAIN`.
          ...DEMO_CRM_LINKS_CHAIN.needs.map(need => need.title),
          // #4191 (recette 2, E5) — l'affaire vitrine du panneau « Objets liés », posée par `seedDemoCrmRecette2`.
          DEMO_CRM_RECETTE2_DEAL.need.title,
          // #4349 V.2 — les compétences sans profil : refus fictifs du même compte, posés par `seedMissingExpertise`.
          ...DEMO_MISSING_EXPERTISE.needs.map(need => need.title),
        ])
        for (const params of needInserts()) expect(known.has(String(params[2]))).toBe(true)
      })
    })

    /**
     * LE RÔLE POURVU, ET SA MISSION (31/08/2026, colonne `missions.need_id`).
     *
     * Ce que ce semis rend visible et que rien d'autre ne rend : le quatrième
     * chiffre du bandeau « Staffing » d'une fiche besoin. Sans lui, la salle
     * n'affiche « Mission attribuée » que sur des besoins encore ouverts, donc
     * « 0 » partout — une capacité livrée qui a l'air d'une capacité vide.
     *
     * ⚠️ Les tests lisent le SEMIS, pas la base : ce qui compte est que
     * l'`UPDATE` parte APRÈS l'insertion des missions et qu'il porte la MÊME
     * règle que la production — ne lier que si l'affaire ne porte qu'un rôle.
     */
    describe('le rôle POURVU et sa mission', () => {
      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      it('pose un rôle GAGNÉ — un rôle dont une mission est née n’est pas un rôle ouvert', () => {
        const staffed = accounts.manager.query.mock.calls
          .filter(call => String(call[0]).includes('INSERT INTO project_needs'))
          .map(call => call[1] as unknown[])
          .filter(params => String(params[2]) === DEMO_STAFFED_NEED.title)
        expect(staffed).toHaveLength(1)
        expect(String(staffed[0]?.[9])).toBe('won')
        // La date d'étape est lisible et dans le passé, comme pour les autres.
        expect(Number.isNaN(Date.parse(String(staffed[0]?.[11])))).toBe(false)
      })

      it('RATTACHE la mission à ce rôle — sans quoi le bandeau reste « non mesuré »', () => {
        const links = accounts.manager.query.mock.calls.filter(call =>
          String(call[0]).includes('UPDATE missions SET need_id'),
        )
        expect(links).toHaveLength(1)
      })

      it('ne lie QUE si l’affaire ne porte qu’un seul rôle — la règle de la production', () => {
        // `ProjectsController.soleNeedOf` refuse de deviner sur une affaire à
        // plusieurs rôles. La salle montre ce que le produit fait, pas une
        // version arrangée : le jour où quelqu'un pose un second rôle sur ce
        // projet, elle bascule d'elle-même sur « non mesuré ».
        const [call] = accounts.manager.query.mock.calls.filter(entry =>
          String(entry[0]).includes('UPDATE missions SET need_id'),
        )
        expect(String(call?.[0])).toContain('COUNT(*) FROM project_needs')
        expect(String(call?.[0])).toContain('need_id IS NULL')
      })

      it('lie APRÈS avoir écrit les missions — « ce qui LIT avant ce qui ÉCRIT »', () => {
        const calls = accounts.manager.query.mock.calls.map(call => String(call[0]))
        // Les missions du CLIENT D'EXEMPLE : celle du compte fictif des cas
        // comparables (#3246) s'écrit après lui et ne porte aucun besoin.
        const lastMissionInsert = accounts.manager.query.mock.calls
          .map(call => String(call[0]).includes('INSERT INTO missions') && !isSimilarCasesMission(call[1]))
          .lastIndexOf(true)
        const link = calls.findIndex(sql => sql.includes('UPDATE missions SET need_id'))
        expect(lastMissionInsert).toBeGreaterThanOrEqual(0)
        expect(link).toBeGreaterThan(lastMissionInsert)
      })

      /**
       * #2191.17/#2191.18 (24/09/2026, recette f9f23f887) — RÉFUTÉ EN
       * DÉMONSTRATION : `MissionDetailTabs.tsx` lit `mission.remote_preference`
       * / `mission.location`, jamais `project_needs.remote`/`.location`
       * directement — exactement comme `DeliveryService.inheritNeedContext`,
       * qui copie `need.remote`/`need.location` SUR la mission au moment du
       * handoff réel. L'`UPDATE` ci-dessus ne posait que `need_id` : la
       * SEULE mission démo qui porte un besoin affichait donc « Télétravail :
       * non repris du besoin » / « Lieu : non repris du besoin », alors que
       * {@link DEMO_STAFFED_NEED} porte `remote: 'sur_site'` et
       * `location: 'Lyon'` depuis toujours — la valeur existait, elle
       * n'était simplement jamais copiée sur la ligne que l'écran lit.
       */
      it('#2191.17/#2191.18 — copie `remote_preference`/`location` du besoin SUR la mission liée', () => {
        const [call] = accounts.manager.query.mock.calls.filter(entry =>
          String(entry[0]).includes('UPDATE missions SET need_id'),
        )
        expect(String(call?.[0])).toContain('remote_preference')
        expect(String(call?.[0])).toContain('location')
        const params = call?.[1] as unknown[]
        expect(params).toContain(DEMO_STAFFED_NEED.remote)
        expect(params).toContain(DEMO_STAFFED_NEED.location)
      })
    })

    /**
     * #2402.13 (24/09/2026, recette f9f23f887) — RÉFUTÉ EN DÉMONSTRATION :
     * `interventions.opened_at` retombe sur son défaut SQL `now()`
     * (migration `1789419374625`) tant qu'aucun paramètre ne l'écrase — les
     * trois lignes de `seedInterventions` s'ouvraient donc TOUJOURS « il y a
     * 15 minutes », l'âge du semis, jamais au-delà de
     * `INTERVENTION_STALE_DAYS` (60 j, `@bellum/contracts/schemas/playbook
     * .ts`). `InterventionsBlock.tsx` (`/pilotage`) ne pouvait donc JAMAIS
     * montrer le badge « Périmé », une capacité livrée et testée
     * (`playbook.interventions.test.ts`) mais invisible en démonstration.
     */
    it('#2402.13 — l’intervention sur « Socle conteneurisé … — run » est ouverte depuis PLUS de 60 jours', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const insert = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO interventions') &&
          (call[1] as unknown[]).some(value => String(value).includes('Socle conteneurisé des applications terrain')),
      )
      expect(insert).toBeDefined()
      expect(String(insert?.[0])).toContain('opened_at')
      // Une date ISO complète, jamais « tout ce que `Date.parse` accepte » —
      // `Date.parse('owner-1')` rend une date VALIDE (heuristique V8), ce qui
      // ferait lire le mauvais paramètre.
      const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      const params = insert?.[1] as unknown[]
      const openedAt = params.find(value => typeof value === 'string' && isoDate.test(value))
      expect(openedAt).toBeDefined()
      const daysOpen = (Date.now() - Date.parse(String(openedAt))) / 86_400_000
      expect(daysOpen).toBeGreaterThan(60)

      // Les deux autres lignes, elles, restent RÉCENTES — comportement
      // inchangé, jamais devenues périmées par accident de refactor.
      const recentInsert = accounts.manager.query.mock.calls.find(
        call =>
          String(call[0]).includes('INSERT INTO interventions') &&
          (call[1] as unknown[]).some(value =>
            String(value).includes('Industrialisation d’un cas d’usage de recherche'),
          ),
      )
      const recentParams = recentInsert?.[1] as unknown[]
      const recentOpenedAt = recentParams?.find(value => typeof value === 'string' && isoDate.test(value))
      expect(recentOpenedAt).toBeDefined()
      expect((Date.now() - Date.parse(String(recentOpenedAt))) / 86_400_000).toBeLessThan(1)
    })

    /**
     * LE SEED LU COMME LA SONDE LE LIRA.
     *
     * Les détecteurs de Laura n'interrogent aucun service : ce sont des
     * requêtes SQL directes, sur des colonnes et des tables précises. Un seed
     * qui écrit la bonne donnée dans la mauvaise FORME — un horodatage là où la
     * requête compare à `current_date`, une affectation sans `workspace_id` —
     * remplit la base et laisse la bulle muette, sans faire tomber un seul test.
     * C'est le défaut « un seed doit avoir la forme que l'écran lit », déjà payé
     * deux fois ici.
     *
     * Chaque test rejoue donc le PRÉDICAT de la sonde, cité au-dessus de lui, sur
     * les lignes que le seed a réellement écrites. Il ne vérifie pas qu'une
     * bulle s'affiche — le plafond de proactivité arbitre ensuite — mais que la
     * mesure sur laquelle elle repose n'est pas à zéro.
     */
    describe('les mesures que les bulles de Laura liront', () => {
      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      it('écrit des DATES NUES et l’espace sur chaque affectation — la forme que la sonde compare', () => {
        const rows = assignmentInserts()
        expect(rows.length).toBeGreaterThanOrEqual(4)
        for (const row of rows) {
          // `WHERE a.workspace_id = $1` : sans elle, aucune sonde ne voit la ligne.
          expect(row.workspaceId).toBe('ws-demo')
          // `a.starts_on <= current_date` compare des DATES. Un `toISOString()`
          // complet passerait le typage et rendrait la comparaison dépendante de
          // l'heure de la visite.
          expect(row.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          if (row.endsOn) expect(row.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      })

      /*
       * consultantsFreeingSoon (laura-probe.service.ts) :
       *   SELECT a.consultant_id FROM mission_assignments a
       *     JOIN consultants c ON c.id = a.consultant_id AND c.archived_at IS NULL
       *    WHERE a.workspace_id = $1
       *      AND a.starts_on <= current_date
       *      AND (a.ends_on IS NULL OR a.ends_on >= current_date)
       *    GROUP BY a.consultant_id
       *   HAVING count(*) FILTER (WHERE a.ends_on IS NULL) = 0
       *      AND max(a.ends_on) <= (current_date + '30 days')::date
       */
      it('laisse au moins une personne dont TOUTES les affectations en cours finissent sous 30 jours', () => {
        const now = today()
        const horizon = dayShift(30)
        const current = assignmentInserts().filter(row => row.startsOn <= now && (!row.endsOn || row.endsOn >= now))
        const byConsultant = new Map<string, string[]>()
        for (const row of current) {
          byConsultant.set(row.consultantId, [...(byConsultant.get(row.consultantId) ?? []), row.endsOn])
        }

        const freeingSoon = [...byConsultant.entries()]
          .filter(([, ends]) => ends.every(end => end !== '' && end <= horizon))
          .map(([id]) => id)
        expect(freeingSoon.length).toBeGreaterThanOrEqual(1)

        // …et la contrepartie : quelqu'un dont une affectation n'a PAS de fin
        // doit rester hors du compte, sinon la sonde annoncerait une libération
        // qu'on ne peut promettre. Sans cette moitié, le test passerait aussi
        // sur un seed qui aurait rendu tout le monde « bientôt libre ».
        const openEnded = [...byConsultant.entries()]
          .filter(([, ends]) => ends.some(end => end === ''))
          .map(([id]) => id)
        expect(openEnded.length).toBeGreaterThanOrEqual(1)
        expect(freeingSoon.filter(id => openEnded.includes(id))).toEqual([])
      })

      /*
       * consultantsOnLongBench (laura-probe.service.ts) :
       *   ... GROUP BY a.consultant_id
       *   HAVING count(*) FILTER (WHERE a.starts_on <= current_date
       *                             AND (a.ends_on IS NULL OR a.ends_on >= current_date)) = 0
       *      AND count(*) FILTER (WHERE a.ends_on IS NULL) = 0
       *      AND max(a.ends_on) < (current_date - '30 days')::date
       */
      it('laisse au moins une personne SANS affectation en cours depuis plus de 30 jours', () => {
        const now = today()
        const bench = dayShift(-30)
        const byConsultant = new Map<string, { startsOn: string; endsOn: string }[]>()
        for (const row of assignmentInserts()) {
          byConsultant.set(row.consultantId, [...(byConsultant.get(row.consultantId) ?? []), row])
        }

        const onBench = [...byConsultant.entries()].filter(([, rows]) => {
          const hasCurrent = rows.some(row => row.startsOn <= now && (!row.endsOn || row.endsOn >= now))
          const hasOpenEnded = rows.some(row => row.endsOn === '')
          const last =
            rows
              .map(row => row.endsOn)
              .sort()
              .at(-1) ?? ''
          return !hasCurrent && !hasOpenEnded && last !== '' && last < bench
        })
        expect(onBench.length).toBeGreaterThanOrEqual(1)
      })

      /*
       * endedMissionsWithoutFeedback (laura-probe.service.ts) :
       *   SELECT count(*) FROM missions m
       *    WHERE m.workspace_id = $1
       *      AND m.status IN ('ended', 'terminated')
       *      AND m.ends_on IS NOT NULL
       *      AND m.ends_on < (current_date - interval '14 days')::date
       *      AND NOT EXISTS (SELECT 1 FROM rex_entries r WHERE r.mission_id = m.id)
       */
      it('laisse au moins une mission TERMINÉE depuis plus de deux semaines, et aucun retour d’expérience', () => {
        const cutoff = dayShift(-14)
        const ended = missionInserts().filter(params => {
          const status = String(params[5])
          const endsOn = params[7] === null ? '' : String(params[7])
          return (status === 'ended' || status === 'terminated') && endsOn !== '' && endsOn < cutoff
        })
        expect(ended.length).toBeGreaterThanOrEqual(1)
        for (const params of ended) expect(String(params[7])).toMatch(/^\d{4}-\d{2}-\d{2}$/)

        // L'autre moitié de la condition. Le seul retour semé est celui du compte
        // FICTIF des cas comparables (#3246, `DEMO_SIMILAR_CASES`) : il laisse
        // au moins une mission terminée SANS retour, et c'est ce reste qui rend
        // la bulle vraie plutôt qu'un oubli.
        const rexInserts = sql().filter(query => query.includes('INSERT INTO rex_entries'))
        expect(rexInserts.length).toBeLessThanOrEqual(1)
        expect(ended.length).toBeGreaterThan(rexInserts.length)
      })

      // #3295 — démo des pertes. Décision Louis (brief P01 07/10) : le REX de perte vit sur la MÊME
      // opportunité perdue que `DEMO_SIMILAR_CASES.lost` (BNP Paribas), jamais un dossier fictif.
      it('sème le REX de perte sur l’opportunité PERDUE déjà semée (#3295), jamais un compte fictif', async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')

        const opportunityInsert = accounts.manager.query.mock.calls.find(
          call => String(call[0]).includes('INSERT INTO opportunities') && String(call[0]).includes('RETURNING id'),
        )
        expect(opportunityInsert).toBeDefined()

        const rexInsert = accounts.manager.query.mock.calls.find(call =>
          String(call[0]).includes('INSERT INTO lost_deal_rex'),
        )
        expect(rexInsert).toBeDefined()
        const [query, params] = rexInsert as [string, unknown[]]

        // La même opportunité que le semis vient d'insérer — jamais un id fabriqué.
        expect(query).toContain('project_id')
        expect(params).toContain('row-1')
        expect(params).toContain(DEMO_LOST_DEAL_REX.sponsor)
        expect(params).toContain(DEMO_LOST_DEAL_REX.route_used)
        expect(params).toContain(DEMO_LOST_DEAL_REX.last_action.value)
        expect(params).toContain(DEMO_LOST_DEAL_REX.declared_motif)
        expect(params).toContain(DEMO_LOST_DEAL_REX.suspected_motif_note.value)
        expect(params).toContain(DEMO_LOST_DEAL_REX.what_team_knows_now.value)
      })

      it('garde la mission terminée HORS de la fenêtre de facturation du mois précédent', () => {
        // `invoice-readiness.service` retient `m.ends_on >= $2::date`, où `$2`
        // est le premier jour du mois PRÉCÉDENT. Au plus, ce jour-là est à
        // soixante et un jours d'aujourd'hui (un 31 précédé d'un mois de 31
        // jours) : en deçà, la mission terminée réapparaîtrait certains jours du
        // mois comme un bloqueur de facturation qui n'en est pas un — et la
        // démonstration montrerait un défaut un mois sur deux.
        const ended = missionInserts().filter(params => String(params[5]) === 'ended')
        expect(ended.length).toBeGreaterThanOrEqual(1)
        const floor = dayShift(-61)
        expect(ended.filter(params => String(params[7]) >= floor)).toEqual([])
      })
    })

    /**
     * L'HISTORIQUE DE FACTURATION — D42, ce qui part vraiment en base.
     *
     * `demo-dataset.spec.ts` vérifie le JEU (le chiffre, le calendrier, les
     * contraintes). Ce bloc-ci vérifie l'autre moitié, celle qu'un jeu juste ne
     * garantit pas : que les lignes sont ÉCRITES, avec la mission à laquelle
     * elles pendent, et après elle.
     *
     * Le défaut qu'il attrape a déjà été payé deux fois dans ce fichier : un
     * semis qui LIT avant que l'écrivain ait écrit saute en silence
     * (`if (!missionId) continue`) et rend une salle vide sans casser un test.
     */
    describe('l’historique de facturation du client d’exemple (D42)', () => {
      /**
       * Les paramètres d'un `INSERT`, indexés PAR NOM DE COLONNE.
       *
       * Lire `params[9]` sur une liste de quinze colonnes est le défaut
       * « jointure par position » : la colonne insérée au milieu décale tout, et
       * le test continue de passer sur la mauvaise valeur. On apparie donc la
       * liste des colonnes avec celle des `VALUES`, littéraux compris.
       */
      function byColumn(sql: string, params: unknown[]): Record<string, unknown> {
        const columns = /INSERT INTO invoice_readiness\s*\(([^)]+)\)/.exec(sql)?.[1] ?? ''
        const values = /VALUES\s*\(([\s\S]+?)\)/.exec(sql)?.[1] ?? ''
        const names = columns.split(',').map(name => name.trim())
        const slots = values.split(',').map(slot => slot.trim())
        // Une longueur qui diverge veut dire qu'on n'a pas compris la requête :
        // mieux vaut un test rouge qu'un appariement décalé d'un cran.
        expect(names).toHaveLength(slots.length)
        const row: Record<string, unknown> = {}
        names.forEach((name, index) => {
          const placeholder = /^\$(\d+)/.exec(slots[index])
          row[name] = placeholder ? params[Number(placeholder[1]) - 1] : slots[index].replace(/^'|'$/g, '')
        })
        return row
      }

      /**
       * Les lignes `invoice_readiness` de l'HISTORIQUE (D42), colonne par
       * colonne — et seulement elles.
       *
       * ⚠️ #2567.3 (18/09/2026) — le filtre exige `invoice_reference` en plus
       * du nom de table. Depuis ce lot, `invoice_readiness` a un SECOND
       * écrivain : `DemoSeedService.seedRetentionDomainsSource` y pose un mois
       * BLOQUÉ (jamais facturé, donc sans `invoice_reference` — c'est le sens
       * même de « pas encore facturable ») pour que `detectBlockedInvoicing`
       * (`playbooks/intervention-rules.ts`) ait une ligne réelle à lire. Sans
       * cette précision, cette ligne rejoignait `invoiceInserts()` : `paid_at`
       * et `disputed_at`, absents de SA liste de colonnes à elle, valaient
       * `undefined` — jamais `null` — et passaient les filtres `!== null` du
       * dessous comme si le mois était payé ET contesté. `invoice_reference`
       * est la colonne qui distingue une FACTURE (l'historique D42) d'un mois
       * encore bloqué : aucune ligne bloquée n'en porte, par construction.
       */
      function invoiceInserts(): Record<string, unknown>[] {
        return accounts.manager.query.mock.calls
          .filter(
            call =>
              String(call[0]).includes('INSERT INTO invoice_readiness') &&
              String(call[0]).includes('invoice_reference') &&
              // Les règlements de la semaine du Cockpit (refonte Pilotage L1) sont un jeu distinct,
              // tenu par `demo-pilotage-week-delta-coverage.spec.ts` : ils ne font pas partie de D42.
              !String(call[0]).includes('pilotage-week-payments'),
          )
          .map(call => byColumn(String(call[0]), call[1] as unknown[]))
      }

      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      it('écrit CHAQUE facture du jeu — une de moins et la tuile se tait', () => {
        // Le compte est LU, jamais recopié : un nombre en dur se met à jour à la
        // main, et c'est comme ça qu'on ne remarque pas qu'il en manque une.
        expect(invoiceInserts()).toHaveLength(DEMO_DELIVERY_CLIENT.invoices.length)
        for (const row of invoiceInserts()) {
          expect(row['workspace_id']).toBe('ws-demo')
          // `mission_id` est une clé étrangère NOT NULL : une ligne qui n'aurait
          // pas retrouvé sa mission serait sautée en silence par le seed.
          expect(String(row['mission_id'])).toMatch(/^mission-\d+$/)
        }
      })

      it('écrit APRÈS les missions dont elles pendent — l’ordre est la contrainte', () => {
        const queries = sql()
        const lastMission = accounts.manager.query.mock.calls
          .map(call => String(call[0]).includes('INSERT INTO missions') && !isSimilarCasesMission(call[1]))
          .lastIndexOf(true)
        const firstInvoice = queries.findIndex(query => query.includes('INSERT INTO invoice_readiness'))
        expect(lastMission).toBeGreaterThanOrEqual(0)
        expect(firstInvoice).toBeGreaterThan(lastMission)
      })

      it('rend le délai de paiement MESURABLE — 32 jours, une mal datée, deux contestées', () => {
        // Le calcul de l'écran, rejoué sur ce qui part en base : le `WHERE` du
        // SQL écarte les contestées (`revenue.service.ts:305`), `computeDso`
        // écarte les mal datées et compte les deux exclusions.
        const rows = invoiceInserts().filter(row => row['paid_at'] !== null)
        const disputed = rows.filter(row => row['disputed_at'] !== null).length
        const result = computeDso(
          rows
            .filter(row => row['disputed_at'] === null)
            .map(row => ({
              invoicedAt: String(row['invoiced_at']).slice(0, 10),
              paidAt: String(row['paid_at']).slice(0, 10),
            })),
          { disputed },
        )

        expect(result.measurability.measurable).toBe(true)
        expect(result.days).toBe(32)
        expect(result.undatable).toBe(1)
        expect(result.disputed).toBe(2)
      })

      it('n’annonce AUCUNE relance envoyée — D42, `reminders_sent` reste à zéro', () => {
        // On ne montre pas des relances parties chez des clients fictifs qui
        // n'en ont jamais reçu. Le zéro est un LITTÉRAL dans la requête : un
        // paramètre se remplirait un jour depuis le jeu de données.
        for (const row of invoiceInserts()) {
          expect(row['reminders_sent']).toBe('0')
          expect(row['last_reminder_at']).toBeUndefined()
        }
      })

      it('déclare le mois en DATE NUE — l’index unique porte sur `(mission_id, period_month)`', () => {
        const keys = invoiceInserts().map(row => {
          expect(String(row['period_month'])).toMatch(/^\d{4}-\d{2}-01$/)
          return `${String(row['mission_id'])}|${String(row['period_month'])}`
        })
        expect(new Set(keys).size).toBe(keys.length)
      })
    })

    /**
     * #2419.9 — LE PAIEMENT NON RAPPROCHÉ du client d'exemple.
     *
     * `invoice_payments` était classée « vide à dessein » dans
     * `demo-coverage.ts` (#2419.1) : aucun écran ne la lisait encore. Le seau
     * « Non rapproché » de `/pilotage/finance` la lit désormais — un tableau
     * vide y serait un écran livré, muet devant un prospect (craft rule n°9),
     * la leçon déjà payée par l'onglet « Sites ».
     */
    describe('le paiement NON RAPPROCHÉ du client d’exemple (#2419.9)', () => {
      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      /** Même appariement colonnes/valeurs que `byColumn` ci-dessus, sur `invoice_payments`. */
      function paymentInserts(): Record<string, unknown>[] {
        return accounts.manager.query.mock.calls
          .filter(call => String(call[0]).includes('INSERT INTO invoice_payments'))
          .map(call => {
            const sqlText = String(call[0])
            const columns = /INSERT INTO invoice_payments\s*\(([^)]+)\)/.exec(sqlText)?.[1] ?? ''
            const values = /VALUES\s*\(([\s\S]+?)\)/.exec(sqlText)?.[1] ?? ''
            const names = columns.split(',').map(name => name.trim())
            const slots = values.split(',').map(slot => slot.trim())
            expect(names).toHaveLength(slots.length)
            const row: Record<string, unknown> = {}
            const params = call[1] as unknown[]
            names.forEach((name, index) => {
              const placeholder = /^\$(\d+)/.exec(slots[index])
              row[name] = placeholder ? params[Number(placeholder[1]) - 1] : slots[index].replace(/^'|'$/g, '')
            })
            return row
          })
      }

      it('écrit CHAQUE paiement du jeu, SANS facture rattachée — « à rapprocher »', () => {
        // Le compte est LU, jamais recopié (même défaut que l'historique D42
        // au-dessus : un nombre en dur se met à jour à la main).
        expect(paymentInserts()).toHaveLength(demoUnmatchedPayments(Date.now()).length)
        for (const row of paymentInserts()) {
          expect(row['workspace_id']).toBe('ws-demo')
          // `null` explicite : un paiement non rattaché, jamais une facture
          // devinée. C'est exactement ce que le seau « Non rapproché » compte.
          expect(row['invoice_readiness_id']).toBeNull()
          expect(Number(row['amount_cents'])).toBeGreaterThan(0)
          expect(row['source']).toBe('manual')
        }
      })
    })

    /**
     * LE CONTACT DE FACTURATION DU CLIENT D'EXEMPLE — ET L'ORDRE QUI LE DÉCIDE.
     *
     * ────────────────────────────────────────────────────────────────────────
     * CE QUE CE BLOC TIENT, QUE LE JEU DE DONNÉES NE PEUT PAS TENIR
     * ────────────────────────────────────────────────────────────────────────
     * `demo-dataset.spec.ts` vérifie que le jeu NOMME un contact sur des
     * missions et que ce nom existe. Il ne peut rien dire de la moitié qui
     * compte : que la ligne part vraiment en base, avec l'IDENTIFIANT d'un
     * contact réellement écrit, et APRÈS lui.
     *
     * C'est la cause racine « ce qui LIT avant ce qui ÉCRIT », déjà payée deux
     * fois dans ce fichier — sept missions et « Personne d'affecté » sur toutes,
     * mesuré en production le 28/08. Un semis qui résout un nom sur une table
     * pas encore remplie n'échoue pas : il écrit `null` et rend une salle qui a
     * l'air pleine.
     *
     * L'ordre est mesuré sur `invocationCallOrder`, le compteur global de Jest :
     * il compare deux mocks DIFFÉRENTS (un dépôt TypeORM et du SQL brut), ce
     * qu'aucune liste de requêtes ne sait faire.
     */
    describe('le contact de facturation — ce qui écrit avant ce qui lit', () => {
      /** Le rang de l'appel `contacts.save` qui écrit les fiches du client de livraison (par leur nom). */
      // Décision Louis 04/10/2026 — les signataires sont des SIÈGES du dossier
      // SNCF, écrits par le passage du dossier : aucun interlocuteur créé.
      const signerNames = new Set(
        DEMO_DELIVERY_CLIENT.missions
          .map(mission => mission.billing_contact)
          .filter((name): name is string => name !== null),
      )
      function clientContactSaveIndex(): number {
        return contacts.save.mock.calls.findIndex(call =>
          (call[0] as Partial<ContactEntity>[]).some(row => signerNames.has(String(row.full_name ?? ''))),
        )
      }

      /** Les fiches du client d'exemple RÉELLEMENT écrites, avec leur id. */
      async function clientContacts(): Promise<{ full_name: string; id: string }[]> {
        const index = clientContactSaveIndex()
        expect(index).toBeGreaterThanOrEqual(0)
        const saved = (await contacts.save.mock.results[index]!.value) as Partial<ContactEntity>[]
        return saved
          .filter(row => signerNames.has(String(row.full_name ?? '')))
          .map(row => ({ full_name: String(row.full_name), id: String(row.id) }))
      }

      /** Le `billing_contact_id` de chaque `INSERT INTO missions`, par libellé. */
      function billingContactByMission(): Map<string, string | null> {
        const rows = new Map<string, string | null>()
        for (const call of accounts.manager.query.mock.calls) {
          const sqlText = String(call[0])
          if (!sqlText.includes('INSERT INTO missions')) continue
          // La colonne est lue PAR SON NOM, jamais par un rang : une colonne
          // insérée au milieu décalerait tout et le test resterait vert sur la
          // mauvaise valeur (« jointure par position »).
          const columns = /INSERT INTO missions\s*\(([\s\S]+?)\)\s*VALUES/.exec(sqlText)?.[1] ?? ''
          const values = /VALUES\s*\(([\s\S]+?)\)/.exec(sqlText)?.[1] ?? ''
          const names = columns.split(',').map(name => name.trim())
          const slots = values.split(',').map(slot => slot.trim())
          expect(names).toHaveLength(slots.length)
          const params = call[1] as unknown[]
          const at = (column: string): unknown => {
            const slot = slots[names.indexOf(column)] ?? ''
            const placeholder = /^\$(\d+)/.exec(slot)
            return placeholder ? params[Number(placeholder[1]) - 1] : slot
          }
          const contactId = at('billing_contact_id')
          rows.set(String(at('label')), contactId === null || contactId === undefined ? null : String(contactId))
        }
        return rows
      }

      beforeEach(async () => {
        await service.seedWorkspace('ws-demo', 'owner-1')
      })

      it('aucun interlocuteur créé — les deux sièges signataires sont écrits par le dossier, marqués comme du semis', async () => {
        // Lot D01 (06/10/2026) : seuls des interlocuteurs SIMULÉS (`.example`) sont créés pour le client de livraison.
        for (const contact of DEMO_DELIVERY_CLIENT.contacts) expect(contact.email ?? '').toMatch(/\.example$/)
        const written = await clientContacts()
        expect(written.map(row => row.full_name).sort()).toEqual([...signerNames].sort())
        const created = contacts.create.mock.calls
          .map(call => call[0] as Partial<ContactEntity>)
          .filter(row => signerNames.has(String(row.full_name ?? '')))
        expect(created.length).toBeGreaterThanOrEqual(signerNames.size)
        for (const row of created) {
          expect(row).toMatchObject({ workspace_id: 'ws-demo', user_id: 'owner-1', source: 'demo' })
          expect(row.email ?? null).toBeNull()
        }
      })

      it('⚠️ ORDRE — les fiches sont écrites AVANT la première mission qui les cite', async () => {
        await clientContacts()
        const savedAt = contacts.save.mock.invocationCallOrder[clientContactSaveIndex()]!
        const missionCalls = accounts.manager.query.mock.calls
          .map((call, index) => ({ index, sql: String(call[0]) }))
          .filter(entry => entry.sql.includes('INSERT INTO missions'))
        expect(missionCalls.length).toBeGreaterThanOrEqual(5)
        const firstMissionAt = accounts.manager.query.mock.invocationCallOrder[missionCalls[0]!.index]!
        // Le défaut qu'on empêche : écrites APRÈS, les fiches ne sont pas là au
        // moment où la boucle des missions résout le nom, et chaque mission
        // part avec `null` — sans erreur, sans trace, sans test rouge.
        expect(savedAt).toBeLessThan(firstMissionAt)
      })

      it('reprend `billing_contact_id` dans l’INSERT des missions — la colonne n’y était pas', () => {
        const missionSql = sql().filter(query => query.includes('INSERT INTO missions'))
        expect(missionSql.length).toBeGreaterThanOrEqual(5)
        for (const query of missionSql) expect(query).toContain('billing_contact_id')
      })

      it('résout au moins DEUX missions sur un contact réellement écrit', async () => {
        const known = new Set((await clientContacts()).map(row => row.id))
        // Décision Louis 04/10/2026 — les deux sièges signataires du dossier SNCF.
        expect(known.size).toBe(2)
        const signed = [...billingContactByMission().entries()].filter(([, contactId]) => contactId !== null)
        expect(signed.length).toBeGreaterThanOrEqual(2)
        for (const [, contactId] of signed) {
          // Un id orphelin compte pour zéro exactement comme un `null` : la
          // clé étrangère refuserait la ligne, et le semis passerait en 500.
          expect(known.has(String(contactId))).toBe(true)
        }
        // Et l'agrégat rend PLUS D'UNE ligne : une seule montrerait un badge,
        // jamais la comparaison entre deux interlocuteurs.
        expect(new Set(signed.map(([, contactId]) => contactId)).size).toBeGreaterThanOrEqual(2)
      })

      it('laisse `null` sur les autres — le bloqueur « contact inconnu » reste montrable', () => {
        // La contrepartie obligatoire : sans une mission sans contact, le
        // bloqueur disparaît de la salle et le test ci-dessus resterait vert
        // sur un semis qui aurait rempli les sept.
        const unsigned = [...billingContactByMission().values()].filter(contactId => contactId === null)
        expect(unsigned.length).toBeGreaterThanOrEqual(1)
      })
    })

    /**
     * ET QUAND UN NOM NE RÉSOUT PAS : LA LIGNE LE DIT.
     *
     * Un `billing_contact` qui ne retrouve personne ne doit pas casser le semis
     * — une salle amputée vaut mieux qu'une salle en 500 — mais il ne doit pas
     * passer en SILENCE non plus. C'est le silence, et lui seul, qui a produit
     * « Personne d'affecté » sur sept missions sans qu'un seul test rougisse.
     */
    describe('un contact de facturation qui ne résout pas', () => {
      it('écrit `null`, ne casse rien, et le DIT dans le journal du semis', async () => {
        const warned: string[] = []
        jest.spyOn(service['logger'], 'warn').mockImplementation(message => {
          warned.push(String(message))
        })
        // On force l'échec de résolution : la base rend des fiches dont AUCUNE
        // ne porte le nom que les missions citent. C'est la preuve que la garde
        // sait dire NON — sans elle, elle ne vérifierait que le chemin heureux.
        contacts.save.mockImplementation(async (entities: Partial<ContactEntity>[]) =>
          entities.map((entity, index) => ({ ...entity, id: `contact-${index + 1}`, full_name: 'Personne Inconnue' })),
        )

        await expect(service.seedWorkspace('ws-demo', 'owner-1')).resolves.toMatchObject({ seeded: true })

        const expected = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.billing_contact !== null)
        expect(expected.length).toBeGreaterThanOrEqual(2)
        for (const mission of expected) {
          expect(warned.some(line => line.includes(String(mission.billing_contact)))).toBe(true)
        }
      })
    })
  })

  /**
   * GA-55 — LE VIVIER EXISTE AVANT CE QUI LE CITE.
   *
   * Défaut MESURÉ en production le 28/08, sur le lien de démonstration public :
   * la colonne « Qui est dessus » de `/missions` affichait « Personne d'affecté »
   * sur TOUTES les lignes, alors que le jeu de données rattache un consultant à
   * chacune.
   *
   * Cause : `seedCompanionData` appelait `advanceDemoPipeline` puis
   * `seedDeliveryClient` — les deux seuls endroits qui LISENT le vivier — AVANT
   * d'écrire les consultants. Les deux `SELECT … FROM consultants` rendaient
   * donc zéro ligne, et chaque `if (!consultantId) continue` sautait en silence :
   * aucune affectation, aucun positionnement clos, aucun refus antérieur. Les
   * missions, elles, s'insèrent sans consultant — d'où six lignes bien nommées
   * et personne dessus.
   *
   * Pourquoi 10 000 tests verts ne l'ont pas vu : le doublon de `manager.query`
   * répondait la liste COMPLÈTE des sept consultants à tout `FROM consultants`,
   * quel que soit le moment. Le mock décrivait un monde où le vivier existe
   * toujours — c'est-à-dire l'inverse du monde qu'on testait.
   *
   * Ce bloc-ci répond avec le vivier RÉELLEMENT écrit à l'instant de la lecture.
   */
  describe('GA-55 — le vivier est écrit AVANT ce qui le cite', () => {
    /** Le vivier tel qu'il est en base À CET INSTANT — vide tant que rien n'a été sauvé. */
    let vivier: { id: string; full_name: string }[]

    beforeEach(() => {
      vivier = []
      accounts.count.mockResolvedValueOnce(0)
      // #2569.4 — `seedCvImportExamples` appelle `.save([...])` une SECONDE
      // fois, après `seedVivier` : la base ACCUMULE les lignes écrites, un
      // second appel qui écraserait `vivier` ferait disparaître les sept
      // profils déjà là — exactement le défaut que ce bloc existe pour attraper.
      consultants.save.mockImplementation(async (rows: Partial<ConsultantEntity>[]) => {
        const saved = rows.map((row, index) => ({ ...row, id: row.id ?? `cons-${vivier.length + index + 1}` }))
        vivier = [...vivier, ...saved.map(row => ({ id: String(row.id), full_name: String(row.full_name) }))]
        return saved
      })

      let nextMissionId = 1
      let nextNeedId = 1
      const answer = async (query: string): Promise<unknown[]> => {
        const text = String(query)
        // ⚠️ LE POINT DE CE BLOC : la base rend ce qu'elle CONTIENT, pas ce que
        // le jeu de données déclare. Un doublon qui répond toujours les sept
        // consultants rend vert un seed qui les cherche avant de les écrire.
        if (text.includes('FROM consultants')) {
          const named = /full_name = '([^']+)'/.exec(text)?.[1]
          return named ? vivier.filter(row => row.full_name === named) : vivier
        }
        // De quoi faire tourner `advanceDemoPipeline` : sans projet à avancer,
        // il sort avant de lire le vivier, et la moitié du chemin ne serait
        // pas couverte.
        if (text.includes('FROM opportunities o')) {
          return Array.from({ length: 6 }, (_, index) => ({ id: `proj-${index + 1}`, label: `Projet ${index + 1}` }))
        }
        if (text.includes('INSERT INTO missions')) return [{ id: `mission-${nextMissionId++}` }]
        if (text.includes('INSERT INTO project_needs')) return [{ id: `need-${nextNeedId++}` }]
        if (text.includes('RETURNING id')) return [{ id: 'row-1' }]
        return []
      }
      accounts.manager.query.mockImplementation(answer)
      notes.manager.query.mockImplementation(answer)
    })

    /** Les missions du jeu dont le consultant EXISTE dans le vivier d'exemple. */
    function missionsWithAConsultant(): string[] {
      const vivierNames = new Set(DEMO_CONSULTANTS.map(consultant => consultant.full_name))
      // #2338 / #2409 — la mission PAS ENCORE DÉMARRÉE a aussi son consultant (planifié).
      return [...DEMO_DELIVERY_CLIENT.missions, DEMO_START_READINESS_MISSION]
        .filter(mission => vivierNames.has(mission.consultant))
        .map(mission => mission.label)
    }

    it('lit un corpus NON VIDE — sans ça, la garde compare deux fois rien', () => {
      // Bornes basses volontairement sous le réel : elles disent « il y a un
      // corpus », pas « il y en a exactement sept ».
      expect(DEMO_CONSULTANTS.length).toBeGreaterThanOrEqual(5)
      expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThanOrEqual(5)
      // Et le jeu de données tient bien sa promesse : chaque mission NOMME
      // quelqu'un du vivier. Sans cette ligne, le test ci-dessous pourrait
      // attendre zéro affectation et rester vert sur une salle vide.
      expect(missionsWithAConsultant()).toHaveLength(DEMO_DELIVERY_CLIENT.missions.length + 1)
    })

    it('affecte quelqu’un à CHAQUE mission — « Personne d’affecté » partout était le défaut', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const assignments = accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO mission_assignments'))
        .map(call => call[1] as unknown[])

      expect(assignments).toHaveLength(missionsWithAConsultant().length)
      // Et chaque affectation pointe un talent RÉELLEMENT écrit — jamais un id
      // deviné : c'est la seule façon que la ligne existe côté écran.
      const ids = new Set(vivier.map(row => row.id))
      for (const params of assignments) expect(ids.has(String(params[2]))).toBe(true)
    })

    it('pose aussi les positionnements CLOS et le refus antérieur — même cause, mêmes victimes', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const queries = accounts.manager.query.mock.calls.map(call => String(call[0]))
      // Les trois positionnements clos du client d'exemple (`outcome_reason`).
      const closed = queries.filter(
        query => query.includes('INSERT INTO submissions') && query.includes('outcome_reason'),
      )
      expect(closed.length).toBeGreaterThanOrEqual(DEMO_DELIVERY_CLIENT.submissions.length)

      // Le refus ANTÉRIEUR d'`advanceDemoPipeline`, qui relit le vivier par nom.
      const rejected = notes.manager.query.mock.calls
        .map(call => String(call[0]))
        .filter(query => query.includes('INSERT INTO submissions') && query.includes("'rejected'"))
      expect(rejected).toHaveLength(1)
    })

    /**
     * #2542.3 — Samir Ouazani (`DEMO_CV_IMPORT_CONSULTANTS`) porte le seul
     * document en échec NOMMÉ que la démo puisse montrer : une lecture
     * TOTALEMENT ratée n'écrit rien (#2542.1, « rien n'est écrit sans texte »),
     * donc la fiche ET le document doivent tous deux dire `partial`, sans quoi
     * la capacité reste invisible en salle de démonstration.
     */
    it('#2542.3 — la salle montre un document lu PARTIELLEMENT, jamais silencieusement', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const samirDocument = consultantDocuments.create.mock.calls
        .map(call => call[0] as Partial<ConsultantDocumentEntity>)
        .find(row => row.filename === 'Samir_Ouazani_dossier_competences.pdf')
      expect(samirDocument?.extraction_partial).toBe(true)

      const samirConsultant = vivier.find(row => row.full_name === 'Samir Ouazani')
      const samirCreateCall = consultants.create.mock.calls
        .map(call => call[0] as Partial<ConsultantEntity>)
        .find(row => row.full_name === 'Samir Ouazani')
      expect(samirConsultant).toBeDefined()
      expect(samirCreateCall?.cv_extraction_partial).toBe(true)

      // Contrôle négatif : une fiche dont la lecture a pleinement abouti ne se
      // dit jamais partielle.
      const inesCreateCall = consultants.create.mock.calls
        .map(call => call[0] as Partial<ConsultantEntity>)
        .find(row => row.full_name === 'Inès Castel')
      expect(inesCreateCall?.cv_extraction_partial).toBe(false)
    })

    /**
     * #2183.21/#2183.26 (#2784) — recette écran du 27/09/2026 : la ville et
     * les formations restaient « Non renseigné » même sur une fiche née d'un
     * CV déposé. Inès Castel porte désormais les deux, sans quoi la salle de
     * démo reproduit exactement le défaut constaté.
     */
    it('#2784 — une fiche née d’un CV déposé porte sa ville et ses formations en démo', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')

      const inesCreateCall = consultants.create.mock.calls
        .map(call => call[0] as Partial<ConsultantEntity>)
        .find(row => row.full_name === 'Inès Castel')
      expect(inesCreateCall?.location).toBe('Lyon (69)')
      expect(inesCreateCall?.education).toEqual(['Master MIAGE — Université Lyon 1 — 2019'])

      // Contrôle négatif : une fiche que le jeu n'a jamais voulu remplir
      // (homonyme sans clé forte) reste honnêtement vide, pas devinée.
      const julienCvCreateCall = consultants.create.mock.calls
        .map(call => call[0] as Partial<ConsultantEntity>)
        .find(row => row.full_name === 'Julien Fabre' && row.source === 'cv')
      expect(julienCvCreateCall?.location ?? null).toBeNull()
      expect(julienCvCreateCall?.education ?? null).toBeNull()
    })

    // #3935.2a (lot M07, 09/10) — environnements, outils et certifications lus
    // dans le CV sont visibles en démo, cités par le CV seedé, rien d'inventé.
    it('#3935.2a — une fiche née d’un CV déposé porte environnements, outils et certifications en démo', async () => {
      await service.seedWorkspace('ws-demo', 'owner-1')
      const created = consultants.create.mock.calls.map(call => call[0] as Partial<ConsultantEntity>)
      const ines = created.find(row => row.full_name === 'Inès Castel')
      expect(ines?.environments).toEqual(['Azure', 'SQL Server', 'Agile Scrum'])
      expect(ines?.tools).toEqual(['Jira', 'Confluence', 'MS Project'])
      expect(ines?.certifications).toEqual(['PMP — PMI'])
      for (const value of [...(ines?.environments ?? []), ...(ines?.tools ?? []), ...(ines?.certifications ?? [])]) {
        expect(ines?.cv_text).toContain(value)
      }
      // #3935.2b — ses expériences lues dans le CV, provenance model.
      // #3935 (lot P03, décision Louis 09/10) — « 2023-2025 » est GARDÉE à l'année :
      // l'année au 1er janvier (convention de stockage) ET la précision `year`.
      const experienceCreates = consultantExperiences.create.mock.calls.map(call => call[0] as Record<string, unknown>)
      const inesExperience = experienceCreates.find(row => row['role'] === 'Cheffe de projet SI senior')
      expect(inesExperience?.['field_provenance']).toEqual({
        role: 'model',
        entreprise: 'model',
        date_debut: 'model',
        date_fin: 'model',
        realisations: 'model',
      })
      expect(inesExperience).toMatchObject({
        date_debut: '2023-01-01',
        date_debut_precision: 'year',
        date_fin: '2025-01-01',
        date_fin_precision: 'year',
      })
      // Rien d'inventé : chaque année seedée est écrite dans l'extrait du CV qui la porte.
      for (const row of experienceCreates.filter(row => row['date_debut_precision'] === 'year')) {
        expect(String(row['preuve'])).toContain(String(row['date_debut']).slice(0, 4))
        expect(String(row['preuve'])).toContain(String(row['date_fin']).slice(0, 4))
      }
      expect(ines?.cv_text).toContain(String(inesExperience?.['preuve']))
      // #3895 (arbitrage Louis 11/10) — le CV nomme Sanofi comme CLIENT : `search_talents.experience_client`
      // (#3889.1) retrouve l'expérience sur `entreprise`, et la preuve citée est une ligne du CV déposé.
      const atSanofi = experienceCreates.find(row => row['entreprise'] === 'Sanofi')
      expect(atSanofi).toBeDefined()
      expect(ines?.cv_text).toContain(String(atSanofi?.['preuve']))
      // Contrôle négatif : l'homonyme jamais lu reste « non lu » (null), pas vide.
      const julienCv = created.find(row => row.full_name === 'Julien Fabre' && row.source === 'cv')
      expect(julienCv?.environments ?? null).toBeNull()
      expect(julienCv?.certifications ?? null).toBeNull()
    })
  })

  describe('createDemoWorkspace (admin backoffice)', () => {
    it('404s when the owner profile does not exist', async () => {
      profiles.findOne.mockResolvedValueOnce(null)
      await expect(service.createDemoWorkspace('ghost')).rejects.toThrow(NotFoundException)
    })

    it('with ensureProfile, creates the missing profile instead of 404 (one-shot provisioning)', async () => {
      // Le profil est créé paresseusement au premier chargement de l'app ; un
      // compte démo tout juste créé côté Supabase Auth n'en a pas encore. Le
      // flag laisse le provisioning one-shot le poser sans ouvrir l'app.
      profiles.findOne.mockResolvedValueOnce(null)
      profiles.save.mockResolvedValueOnce({ user_id: 'demo-user' } as ProfileEntity)
      workspaces.findOne.mockResolvedValueOnce(null)
      workspaces.save.mockResolvedValueOnce({
        id: 'ws-new',
        name: 'Démo Bellum',
        owner_user_id: 'demo-user',
        is_demo: true,
      } as WorkspaceEntity)
      accounts.count.mockResolvedValueOnce(0)

      const result = await service.createDemoWorkspace('demo-user', undefined, { ensureProfile: true })

      expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'demo-user' }))
      expect(result.isDemo).toBe(true)
    })

    it('converts the owner’s EMPTY workspace to demo and seeds it (fresh demo user flow)', async () => {
      profiles.findOne.mockResolvedValueOnce({ user_id: 'demo-user' } as ProfileEntity)
      workspaces.findOne.mockResolvedValueOnce({
        id: 'ws-1',
        name: 'Mon espace',
        owner_user_id: 'demo-user',
        is_demo: false,
      } as WorkspaceEntity)
      // First count = the conversion safety check (0 real accounts), second =
      // the idempotence check inside seedWorkspace.
      accounts.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0)

      const result = await service.createDemoWorkspace('demo-user')

      expect(workspaces.save).toHaveBeenCalledWith(
        // #4173 — allumé par défaut depuis ce lot ; une salle de démonstration
        // n'a pas le droit de le cocher, forcé ici plutôt que confié au
        // défaut de colonne (qui ne distingue pas démo/réel).
        expect.objectContaining({
          id: 'ws-1',
          is_demo: true,
          name: 'Démo Bellum',
          chat_eval_sampling_enabled: false,
        }),
      )
      expect(result).toMatchObject({ workspaceId: 'ws-1', isDemo: true, seeded: true, accounts: DEMO_DOSSIERS.length })
      // No new member row — the owner already belongs to their workspace.
      expect(members.save).not.toHaveBeenCalled()
    })

    it('REFUSES (409) to convert a workspace that already holds real dossiers', async () => {
      profiles.findOne.mockResolvedValueOnce({ user_id: 'real-user' } as ProfileEntity)
      workspaces.findOne.mockResolvedValueOnce({
        id: 'ws-real',
        name: 'ESN Réelle',
        owner_user_id: 'real-user',
        is_demo: false,
      } as WorkspaceEntity)
      accounts.count.mockResolvedValueOnce(12) // real dossiers present

      await expect(service.createDemoWorkspace('real-user')).rejects.toThrow(ConflictException)
      expect(workspaces.save).not.toHaveBeenCalled()
      expect(accounts.save).not.toHaveBeenCalled()
    })

    it('re-calling on an existing demo workspace is idempotent (no duplicate seed)', async () => {
      profiles.findOne.mockResolvedValueOnce({ user_id: 'demo-user' } as ProfileEntity)
      workspaces.findOne.mockResolvedValueOnce({
        id: 'ws-1',
        name: 'Démo Bellum',
        owner_user_id: 'demo-user',
        is_demo: true,
      } as WorkspaceEntity)
      // Conversion check sees the seeded dossiers, but the workspace is already
      // demo → allowed; seedWorkspace then skips (idempotent).
      accounts.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3)

      const result = await service.createDemoWorkspace('demo-user')
      expect(result).toMatchObject({ workspaceId: 'ws-1', isDemo: true, seeded: false, accounts: 3 })
      expect(accounts.save).not.toHaveBeenCalled()
    })

    it('creates a workspace (+ owner membership) when the user owns none', async () => {
      profiles.findOne.mockResolvedValueOnce({ user_id: 'invitee' } as ProfileEntity)
      workspaces.findOne.mockResolvedValueOnce(null)
      workspaces.save.mockImplementationOnce(async (entity: Partial<WorkspaceEntity>) => ({
        ...entity,
        id: 'ws-new',
      }))
      accounts.count.mockResolvedValueOnce(0)

      const result = await service.createDemoWorkspace('invitee', 'Démo Skaizen')

      expect(workspaces.create).toHaveBeenCalledWith(
        // #4173 — voir le commentaire de « converts the owner's EMPTY workspace ».
        expect.objectContaining({
          owner_user_id: 'invitee',
          is_demo: true,
          name: 'Démo Skaizen',
          chat_eval_sampling_enabled: false,
        }),
      )
      expect(members.save).toHaveBeenCalled()
      expect(result).toMatchObject({ workspaceId: 'ws-new', isDemo: true, seeded: true })
    })
  })

  // #3404.5 — LE LIEN ENTRE UNE PRÉSENCE RANG 2 ET LE CADRE GOUVERNÉ, EN
  // DÉMONSTRATION. Sans lui, l'onglet Partenaires du compte fictif ne
  // montrerait jamais qu'un rang 2 peut être un objet métier structuré.
  it('#3404.5 — la présence rang 2 « mc2i » est liée à son cadre de gouvernance', async () => {
    accounts.count.mockResolvedValueOnce(0)
    accounts.manager.query.mockImplementation(async (query: string) =>
      String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
    )
    await service.seedWorkspace('ws-demo', 'owner-1')

    const relationInsert = accounts.manager.query.mock.calls.find(
      call =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO partner_relations') &&
        (call[1] as unknown[])[1] === 'mc2i',
    )
    expect(relationInsert).toBeDefined()

    const link = accounts.manager.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE account_partners SET partner_relation_id'),
    )
    expect(link).toBeDefined()
    const [relationId, workspaceId, accountId, name] = link?.[1] as unknown[]
    expect(relationId).toBe('acc-client-exemple')
    expect(workspaceId).toBe('ws-demo')
    // Décision Louis 04/10/2026 — le compte porteur est un VRAI dossier, semé avant.
    expect(String(accountId)).toMatch(/^acc-/)
    expect(name).toBe('mc2i')
  })

  // X66 / #3547 — le forfait encadré se lit AUSSI sur la fiche d'un besoin : le besoin
  // au forfait de la salle (« Chef de projet — programme de refonte applicative »)
  // porte le mode, le rôle tenu et l'équipe côté client.
  it('#3547 — un besoin au forfait de la salle est semé en forfait encadré', async () => {
    accounts.count.mockResolvedValueOnce(0)
    accounts.manager.query.mockImplementation(async (query: string) =>
      String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
    )
    await service.seedWorkspace('ws-demo', 'owner-1')

    const update = accounts.manager.query.mock.calls.find(
      call =>
        typeof call[0] === 'string' &&
        call[0].includes('UPDATE project_needs') &&
        call[0].includes("delivery_mode = 'supervised'"),
    )
    expect(update).toBeDefined()
    const params = update?.[1] as unknown[]
    expect(params).toContain('Chef de projet — programme de refonte applicative')
    expect(params).toContain('framing')
    expect(params).toContainEqual(['Camille Girard', 'Hugo Lemaire'])
  })

  // #3270.6 (recette prod 02/10, Y16) — le panneau « Cadre des partenaires
  // rang 2 » du tiroir d'opportunité restait vide sur le tiroir SG : la seule
  // ESN rang 2 gouvernée de la salle vivait sur le client d'exemple. La même
  // présence, liée au même cadre, est posée sur Société Générale.
  it('#3270.6 — Société Générale porte aussi une ESN rang 2 liée à son cadre de gouvernance', async () => {
    accounts.count.mockResolvedValueOnce(0)
    accounts.manager.query.mockImplementation(async (query: string) =>
      String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
    )
    await service.seedWorkspace('ws-demo', 'owner-1')

    const sgRank2 = accounts.manager.query.mock.calls.find(
      call =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO account_partners') &&
        call[0].includes('FROM accounts') &&
        (call[1] as unknown[]).includes('Société Générale'),
    )
    expect(sgRank2).toBeDefined()
    const params = sgRank2?.[1] as unknown[]
    expect(params).toContain('mc2i')
    expect(params).toContain('acc-client-exemple') // l'id de la relation de gouvernance
    expect(String(sgRank2?.[0])).toContain("'rank2'")
  })

  /**
   * Briefs commerciaux du 01/10/2026 — « le seed n'a pas la forme que l'écran lit » :
   * ces tests lisent ce que le SEMIS écrit (pas le jeu de données) pour les
   * ESN présentes (`account_partners`, source de `TabPartners`), et bornent
   * le coût du semis de ~3 400 personnes (écriture par lots, un UPDATE par
   * entité et non par contact).
   */
  describe('briefs commerciaux (01/10/2026) — ce que le semis écrit', () => {
    async function seedAndMeasure(): Promise<number> {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      const started = performance.now()
      await service.seedWorkspace('ws-demo', 'owner-1')
      return performance.now() - started
    }

    async function accountIdOf(companyName: string): Promise<string> {
      const index = accounts.save.mock.calls.findIndex(
        call => (call[0] as Partial<AccountEntity>).company_name === companyName,
      )
      expect(index).toBeGreaterThanOrEqual(0)
      return ((await accounts.save.mock.results[index]!.value) as { id: string }).id
    }

    // Décision Louis 04/10/2026 — une DÉCLARATION de partenaire (vraie ESN
    // observée) PROMEUT la ligne observée (`DO UPDATE`) : ce n'est pas une
    // seconde écriture de relevé, elle n'entre pas dans ce compte.
    function partnerInserts(accountId: string): { name: string; certainty: string; note: string }[] {
      return accounts.manager.query.mock.calls
        .filter(
          call =>
            typeof call[0] === 'string' &&
            call[0].includes('INSERT INTO account_partners') &&
            !call[0].includes('DO UPDATE') &&
            (call[1] as unknown[])[1] === accountId,
        )
        .map(call => {
          const params = call[1] as string[]
          return { name: params[2]!, certainty: params[7]!, note: params[5]! }
        })
    }

    // #3532 (recette Y20) — « Message copié » / « Analyse terminée » semés à 4-5 h mais ABSENTS des
    // 12 lignes de tête : `materialize` écrit les besoins, défis et programmes avec
    // `first_detected_at = now()`, donc plus récents que toute action semée. Le fil
    // (récent d'abord, 12 lignes) ne montrait que ces besoins. Ils naissent à
    // l'analyse qui les a trouvés : `analysis_completed` du jeu de données.
    it('#3532 — les besoins matérialisés de SG sont datés de son analyse, pas de l’instant du semis', async () => {
      await seedAndMeasure()
      const sg = await accountIdOf('Société Générale')
      // La PREMIÈRE analyse (la plus ancienne) : c'est elle qui a trouvé ces besoins.
      const analysisHoursAgo = Math.max(
        ...DEMO_USER_ACTIONS.filter(
          a => a.company === 'Société Générale' && a.action_type === 'analysis_completed',
        ).map(a => a.hours_ago),
      )
      expect(analysisHoursAgo).toBe(74)
      const dating = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE opportunities') &&
          call[0].includes('first_detected_at') &&
          (call[1] as unknown[])[0] === sg,
      )
      expect(dating).toBeDefined()
      expect((dating?.[1] as unknown[])[1]).toBe(analysisHoursAgo)
    })

    // #3678.2 (recette G5, 11/10) — « Ce que ça change » : 0 occurrence en démo SNCF. La file ne montre que les
    // 3 pistes les plus récentes ; celles que `materialize` écrit (fraîches, sans primary_domain_code) passaient
    // devant, et une piste sans domaine n'écrit AUCUNE ligne d'impact. Le semis leur pose le pack de l'offre.
    it('#3678.2 — les pistes matérialisées de SNCF portent un domaine d’offre (sinon aucune ligne d’impact)', async () => {
      await seedAndMeasure()
      const sncf = await accountIdOf('SNCF')
      const domaining = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE opportunities') &&
          call[0].includes('primary_domain_code') &&
          (call[1] as unknown[])[0] === sncf,
      )
      expect(domaining).toBeDefined()
      expect((domaining?.[1] as unknown[])[1]).toBe('esn_it')
    })

    // #3895 (arbitrage Louis 11/10) — la démo sème un BESOIN FERMÉ sur le VRAI compte Sanofi : sans lui,
    // « Sanofi a-t-il eu des besoins fermés ? » (find_needs.include_closed, #3889.2) n'a rien à retrouver.
    it('#3895 — Sanofi porte un besoin FERMÉ, avec son motif, écrit en projet ET en besoin', async () => {
      await seedAndMeasure()
      const sanofi = await accountIdOf('Sanofi')
      const dossier = DEMO_DOSSIERS.find(item => item.account.company_name === 'Sanofi')
      const closed = dossier?.closedNeeds ?? []
      expect(closed.length).toBeGreaterThan(0)
      for (const need of closed) {
        expect(['won', 'lost', 'cancelled']).toContain(need.status)
        expect(need.status_reason.length).toBeGreaterThan(0)
        const project = accounts.manager.query.mock.calls.find(
          call =>
            typeof call[0] === 'string' &&
            call[0].includes('INSERT INTO opportunities') &&
            (call[1] as unknown[]).includes(need.title) &&
            (call[1] as unknown[]).includes(sanofi),
        )
        expect(project).toBeDefined()
        const row = accounts.manager.query.mock.calls.find(
          call =>
            typeof call[0] === 'string' &&
            call[0].includes('INSERT INTO project_needs') &&
            (call[1] as unknown[]).includes(need.title) &&
            (call[1] as unknown[]).includes(need.status),
        )
        expect(row).toBeDefined()
      }
    })

    it('écrit les ESN du brief dans account_partners, niveau de preuve conservé (ENGIE, TotalEnergies)', async () => {
      await seedAndMeasure()
      for (const company of ['ENGIE', 'TotalEnergies']) {
        const brief = COMMERCIAL_BRIEF_BY_COMPANY[company]!
        expect(brief.esn.length).toBeGreaterThan(0)
        const written = partnerInserts(await accountIdOf(company))
        expect(written.map(row => row.name)).toEqual(brief.esn.map(esn => esn.name))
        // Le niveau de preuve voyage : dans la certitude ET en toutes lettres.
        for (const [index, esn] of brief.esn.entries()) {
          const expected = { confirmed: 'forte', observed: 'moyenne', hint: 'faible' }[esn.evidence_level]
          expect(written[index]!.certainty).toBe(expected)
          expect(written[index]!.note).toContain('Niveau de preuve')
        }
      }
    })

    it('Alstom : le brief ne cite aucune ESN — aucune ligne partenaire n’est inventée', async () => {
      await seedAndMeasure()
      expect(COMMERCIAL_BRIEF_BY_COMPANY['Alstom']!.esn).toHaveLength(0)
      expect(partnerInserts(await accountIdOf('Alstom'))).toEqual([])
    })

    it('SNCF (aucun brief) : aucune ESN du brief n’y est semée', async () => {
      await seedAndMeasure()
      expect(
        partnerInserts(await accountIdOf('SNCF')).filter(row => String(row.note ?? '').includes('Niveau de preuve')),
      ).toEqual([])
    })

    it('SG et BPCE : une ESN déjà posée par le relevé du compte n’est pas redoublée', async () => {
      await seedAndMeasure()
      for (const company of ['Société Générale', 'Groupe BPCE']) {
        const names = partnerInserts(await accountIdOf(company)).map(row => row.name.toLowerCase())
        expect(new Set(names).size).toBe(names.length)
        expect(names.length).toBeGreaterThan(0)
      }
    })

    it('contacts écrits par lots, rattachement d’entité groupé : pas un aller-retour par personne', async () => {
      await seedAndMeasure()
      const total = DEMO_DOSSIERS.reduce((sum, dossier) => sum + dossier.contacts.length, 0)
      // Les dossiers à brief portent des milliers de personnes : au-delà de ~1 300
      // lignes par INSERT, le protocole Postgres refuse (65 535 paramètres).
      expect(total).toBeGreaterThan(2500)
      const chunked = contacts.save.mock.calls.filter(
        call => (call[1] as { chunk?: number } | undefined)?.chunk === 200,
      )
      expect(chunked.length).toBeGreaterThanOrEqual(DEMO_DOSSIERS.length)
      // Un UPDATE par (entité, lot de 200), jamais un par contact.
      expect(contacts.update.mock.calls.length).toBeLessThan(total / 4)
      // AUCUNE borne en millisecondes ici. Il y en a eu une (`elapsed < 10_000`)
      // dont le commentaire promettait qu'elle « tombe si le semis cesse d'être
      // linéaire, pas sur une machine lente » : elle a fait exactement le
      // contraire. Le 31/10/2026, sur le run de main qui suivait la fusion de
      // 21 PR, les 23 runners étaient saturés et elle a rendu 14 113 ms pour un
      // semis inchangé — seule ligne rouge de 4 885 tests. Ce que le test
      // PROMET, c'est « pas un aller-retour par personne » : les deux bornes
      // ci-dessus (INSERT par lots de 200, UPDATE < total/4) le prouvent en
      // comptant les allers-retours, et elles ne dépendent d'aucune horloge.
    })
  })

  /**
   * #3095 (lot N05, 08/10/2026) — ROUVERTE sur la foi que la disparition de la
   * ligne « crédit de site » (ci-dessous, hors de ce describe) prouvait
   * l'absence de détection en PRODUCTION. Elle ne la prouvait pas :
   * `collect_subdomain_partners` (crt.sh, épopée #3239) et
   * `collect_site_credit_partners`/`collect_legal_notice_partners`/
   * `collect_partner_page_mentions` tournent déjà sur chaque analyse réelle
   * (`phase1_research.py:1499-1522`, fusionnés dans `esnPresence`). Ce qui
   * manquait vraiment est réparé ici : la preuve se rejoue en salle, SUR UN
   * VRAI COMPTE (Société Générale, qui porte déjà ses dizaines d'ESN réelles
   * du brief — cette ligne-ci est volontairement hors de ce référentiel,
   * donc jamais un doublon fusionné avec elles).
   */
  describe('#3095 — une ligne « sous-domaine » (illustrative) prouve le circuit sur un vrai compte', () => {
    it('Société Générale porte la ligne, certitude « moyenne », note nommant le sous-domaine', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const sgIndex = accounts.save.mock.calls.findIndex(
        call => (call[0] as Partial<AccountEntity>).company_name === 'Société Générale',
      )
      expect(sgIndex).toBeGreaterThanOrEqual(0)
      const sgId = ((await accounts.save.mock.results[sgIndex]!.value) as { id: string }).id

      const insert = accounts.manager.query.mock.calls.find(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO account_partners') &&
          (call[1] as unknown[])[2] === 'Structura Web (exemple)' &&
          (call[1] as unknown[])[1] === sgId,
      )
      expect(insert).toBeDefined()
      const params = insert?.[1] as unknown[]
      expect(params[0]).toBe('ws-demo')
      expect(String(params[3])).toContain('Sous-domaine détecté')
      expect(String(params[3])).toContain('certificats publics')
      // Doctrine `provider_footprint_subdomains.py` : un CNAME montre qu'un
      // service répond sous le nom du compte, pas une preuve de prestation
      // IT — certitude MOYENNE, jamais forte.
      expect(String(insert?.[0])).toContain("'moyenne'")
      expect(String(insert?.[0])).not.toContain("'forte'")
    })

    it('ne redouble jamais une ESN déjà citée par le brief réel de Société Générale', async () => {
      accounts.count.mockResolvedValueOnce(0)
      accounts.manager.query.mockImplementation(async (query: string) =>
        String(query).includes('RETURNING id') ? [{ id: 'acc-client-exemple' }] : [],
      )
      await service.seedWorkspace('ws-demo', 'owner-1')

      const sgIndex = accounts.save.mock.calls.findIndex(
        call => (call[0] as Partial<AccountEntity>).company_name === 'Société Générale',
      )
      const sgId = ((await accounts.save.mock.results[sgIndex]!.value) as { id: string }).id

      const sgPartnerNames = accounts.manager.query.mock.calls
        .filter(
          call =>
            typeof call[0] === 'string' &&
            call[0].includes('INSERT INTO account_partners') &&
            (call[1] as unknown[])[1] === sgId,
        )
        .map(call => (call[1] as unknown[])[2] as string)
      // La ligne illustrative apparaît UNE fois, et ne chasse aucune des ESN
      // réellement citées par le classeur commercial du compte.
      expect(sgPartnerNames.filter(name => name === 'Structura Web (exemple)')).toHaveLength(1)
      expect(sgPartnerNames).toContain('Capgemini')
    })
  })
})

// #3095 — la ligne « crédit de site » a disparu avec le client fictif (décision
// Louis 04/10/2026) : le semis n'en pose plus aucune SUR LE CLIENT FICTIF.
describe('#3095 — aucune ligne « crédit de site » inventée sur le client fictif', () => {
  it('le semis ne pose plus de partenaire détecté par crédit de site sur ce symbole-là', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).not.toContain('siteCreditPartner')
  })
})
