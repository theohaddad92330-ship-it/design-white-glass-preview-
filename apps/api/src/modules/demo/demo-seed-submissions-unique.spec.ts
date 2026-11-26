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
import { createMockRepository } from '../../database/test-utils'
import { DemoSeedService } from './demo-seed.service'

/**
 * #3068 — reproduit, au niveau du SERVICE, l'erreur vue en production sur le
 * lien de démonstration public (28/09/2026, commit 1964f82bed) :
 *
 *   ERROR Demo pool: reset failed — the room is served AS IS rather than
 *   refused (DemoPoolService) : "duplicate key value violates unique
 *   constraint \"submissions_unique\""
 *
 * `submissions_unique` porte sur (project_id, consultant_id,
 * coalesce(need_id, uuid-zéro)) — voir la migration
 * `1789382641057-Submissions.ts`. Un doublon dans les DONNÉES du jeu de
 * démonstration (deux écritures qui visent le même triplet) ne se voit PAS en
 * lisant le SQL isolément : les trois `INSERT INTO submissions` de
 * `DemoSeedService` (positionnements directs, shortlist par besoin, refus
 * antérieur sur le pipe) sont chacun individuellement corrects. La collision
 * n'existe qu'à l'EXÉCUTION, quand des identifiants générés séparément
 * (`RETURNING id`) se recoupent sur le même triplet.
 *
 * Ce test simule donc la contrainte UNIQUE réelle sur chaque appel
 * `INSERT INTO submissions` intercepté, avec des identifiants FRAIS et
 * DISTINCTS à chaque `RETURNING id` (jamais une valeur fixe partagée entre
 * lignes, qui masquerait la collision) — exactement ce que Postgres ferait.
 */
describe('DemoSeedService — submissions_unique au re-semis (#3068)', () => {
  /** Ligne réellement posée en base, telle que `submissions_unique` la voit. */
  type SubmissionRow = { projectId: string; consultantId: string; needId: string | null }

  const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
  const rowKey = (row: SubmissionRow): string => `${row.projectId}::${row.consultantId}::${row.needId ?? ZERO_UUID}`

  /**
   * Le consultant est retrouvé PAR NOM dans les trois sites d'écriture
   * (`byName`/`consultantIdsByName` côté `seedDeliveryClient`, la ligne
   * `SELECT id FROM consultants WHERE full_name = 'Antoine Rivière'` côté
   * `advanceDemoPipeline`) : un id STABLE par nom, comme la vraie table.
   */
  const CONSULTANT_IDS: Record<string, string> = {
    'Yanis Berthier': 'consultant-yanis',
    'Salomé Dufour': 'consultant-salome',
    'Antoine Rivière': 'consultant-antoine',
    'Hakim Barreau': 'consultant-hakim',
    'Marc Ouedraogo': 'consultant-marc',
    'Inès Kaczmarek': 'consultant-ines',
  }

  /**
   * Construit l'implémentation PARTAGÉE de `manager.query`, posée à la fois
   * sur `accounts.manager` et `notes.manager` : en production les deux
   * pointent la MÊME connexion Postgres, et c'est justement le
   * rapprochement entre les écritures de `seedDeliveryClient` (côté
   * `accounts`) et celle d'`advanceDemoPipeline` (côté `notes`) qui doit
   * passer par une seule et même table simulée.
   *
   * `submissionRows` est passé en dehors de la fabrique : un second appel de
   * `seedDeliveryClient` sur la MÊME salle (repair après une salle trouvée
   * INCOMPLÈTE — `DemoPoolService.tidy` / `DemoResetService.repairIfIncomplete`,
   * PDF §« Mesuré en production le 28/08 ») retrouve son projet déjà posé —
   * exactement ce que `WHERE NOT EXISTS (SELECT 1 FROM project_needs WHERE
   * project_id = $2)` fait déjà pour `seedStaffedNeed` un peu plus bas dans le
   * même fichier — alors que les DEUX `INSERT INTO submissions` non gardés
   * (site 1 : `client.submissions` ; site 2 : la shortlist par besoin) ne
   * retrouvent rien : ils réinsèrent, et c'est `submissions_unique` qui
   * tranche.
   */
  function createSharedQuery(submissionRows: SubmissionRow[]) {
    let nextRowId = 1
    const freshId = (): string => `row-${nextRowId++}`
    // Le pool des projets DÉJÀ matérialisés (les 6 dossiers réels) quand
    // `advanceDemoPipeline` tourne — AVANT `seedDeliveryClient` dans
    // `seedWorkspace` (ligne 1707 avant 1712) : aucun projet du client
    // fictif n'existe encore à ce moment-là.
    const flagshipPool = ['opp-dossier-1', 'opp-dossier-2', 'opp-dossier-3', 'opp-dossier-4', 'opp-dossier-5'].map(
      id => ({ id, label: id }),
    )

    const query = jest.fn(async (sql: unknown, params: unknown[] = []) => {
      const text = String(sql)
      const p = params as unknown[]

      // ── Le vivier, par nom (les deux lectures documentées ligne 1680-1690) ──
      if (/SELECT\s+id,\s*full_name\s+FROM\s+consultants/i.test(text)) {
        return Object.entries(CONSULTANT_IDS).map(([full_name, id]) => ({ id, full_name }))
      }
      if (
        /SELECT\s+id\s+FROM\s+consultants\s+WHERE\s+workspace_id\s*=\s*\$1\s+AND\s+full_name\s*=\s*'Antoine Rivière'/i.test(
          text,
        )
      ) {
        return [{ id: CONSULTANT_IDS['Antoine Rivière'] }]
      }

      // ── Le pipe : les 9 projets les plus anciens (`advanceDemoPipeline`) ──
      if (text.includes('JOIN accounts a ON a.id = o.account_id') && text.includes('ORDER BY o.first_detected_at')) {
        return flagshipPool
      }

      // ── LA table qui nous intéresse ─────────────────────────────────────
      if (text.includes('INSERT INTO submissions')) {
        const notExistsGuarded = text.includes('WHERE NOT EXISTS')
        const onConflict = text.includes('ON CONFLICT')
        const hasSubstatus = /need_id,\s*consultant_id/i.test(text)

        let row: SubmissionRow
        if (notExistsGuarded) {
          // Site 3 — `advanceDemoPipeline`, le refus antérieur : colonnes
          // (workspace_id, project_id, consultant_id, …), sans need_id.
          row = { projectId: String(p[1]), consultantId: String(p[2]), needId: null }
        } else if (hasSubstatus) {
          // Site 2 — `seedOpenNeeds`, la shortlist : (workspace_id,
          // project_id, need_id, consultant_id, …).
          row = { projectId: String(p[1]), consultantId: String(p[3]), needId: String(p[2]) }
        } else {
          // Site 1 — `seedDeliveryClient`, `client.submissions` : pas de
          // need_id du tout, la colonne reste NULL.
          row = { projectId: String(p[1]), consultantId: String(p[2]), needId: null }
        }

        const key = rowKey(row)
        const exists = notExistsGuarded
          ? // La garde du site 3 ne filtre PAS par need_id (voir son propre
            // SQL) : elle saute l'insertion dès que le couple
            // (project_id, consultant_id) existe déjà, quel que soit le
            // besoin.
            submissionRows.some(r => r.projectId === row.projectId && r.consultantId === row.consultantId)
          : submissionRows.some(r => rowKey(r) === key)

        if (notExistsGuarded || onConflict) {
          // Site 3 (`WHERE NOT EXISTS`) ou sites 1/2 corrigés
          // (`ON CONFLICT (...) DO NOTHING`, #3068) : un doublon est
          // silencieusement sauté, exactement comme Postgres le ferait sur
          // `submissions_unique`. Une insertion RÉUSSIE rend son id, comme le
          // vrai `RETURNING id` sur la ligne effectivement écrite.
          if (exists) return []
          submissionRows.push(row)
          return text.includes('RETURNING id') ? [{ id: freshId() }] : []
        }

        // Sites 1 et 2 AVANT le correctif #3068 : un INSERT nu, sans garde —
        // c'est EXACTEMENT ce que `submissions_unique` refuse en production.
        if (exists) {
          throw new Error('duplicate key value violates unique constraint "submissions_unique"')
        }
        submissionRows.push(row)
        return text.includes('RETURNING id') ? [{ id: freshId() }] : []
      }

      // ── Défaut générique : un id FRAIS et DISTINCT par ligne ────────────
      if (text.includes('RETURNING id')) {
        return [{ id: freshId() }]
      }
      return []
    })

    return query
  }

  /**
   * Assemble un `DemoSeedService` dont `accounts.manager.query` ET
   * `notes.manager.query` partagent la MÊME table `submissions` simulée
   * (`submissionRows`, fournie par l'appelant — jamais réinitialisée entre
   * deux appels de cette fabrique dans le même test).
   */
  function buildService(submissionRows: SubmissionRow[]): DemoSeedService {
    const workspaces = createMockRepository<WorkspaceEntity>()
    const members = createMockRepository<WorkspaceMemberEntity>()
    const profiles = createMockRepository<ProfileEntity>()
    const accounts = createMockRepository<AccountEntity>()
    const favorites = createMockRepository<UserFavoriteEntity>()
    const contacts = createMockRepository<ContactEntity>()
    const attackAngles = createMockRepository<AttackAngleEntity>()
    const actionPlans = createMockRepository<ActionPlanEntity>()
    const consultants = createMockRepository<ConsultantEntity>()
    const consultantDocuments = createMockRepository<ConsultantDocumentEntity>()
    const userActions = createMockRepository<UserActionEntity>()
    const memberObjectives = createMockRepository<MemberObjectiveEntity>()
    const workflowRuns = createMockRepository<WorkflowRunEntity>()
    const ragDocuments = createMockRepository<RagDocumentEntity>()
    const notes = createMockRepository<NoteEntity>()
    const activities = createMockRepository<ActivityEntity>()
    const tasks = createMockRepository<TaskEntity>()
    const consultantSkills = createMockRepository<ConsultantSkillEntity>()
    const consultantExperiences = createMockRepository<ConsultantExperienceEntity>()
    const talentPreparedMessages = createMockRepository<TalentPreparedMessageEntity>()
    const accountEntities = createMockRepository<AccountEntityRow>()
    const rfps = createMockRepository<RfpEntity>()
    const chatMessages = createMockRepository<ChatMessageEntity>()
    const approvalRequests = createMockRepository<ApprovalRequestEntity>()

    const sharedQuery = createSharedQuery(submissionRows)
    accounts.manager.query.mockImplementation(sharedQuery)
    notes.manager.query.mockImplementation(sharedQuery)

    let nextContactId = 1
    contacts.save.mockImplementation(async (entities: Partial<ContactEntity>[]) =>
      entities.map(entity => ({ ...entity, id: entity.id ?? `contact-${nextContactId++}` })),
    )

    return new DemoSeedService(
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
      // BEL-SC-224 (#3253, P0) — hors du périmètre de ce fichier.
      { seedDiagnosisFor: jest.fn().mockResolvedValue(undefined) } as never,
      { put: jest.fn().mockResolvedValue(undefined) } as never,
      rfps as never,
      chatMessages as never,
      approvalRequests as never,
    )
  }

  it('un seul passage : sème le client d’exemple sans violer submissions_unique', async () => {
    const now = Date.now()
    const submissionRows: SubmissionRow[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = buildService(submissionRows) as any
    // #3068 — l'ordre RÉEL de `seedWorkspace` (ligne 1707 avant 1712) :
    // `advanceDemoPipeline` tourne AVANT `seedDeliveryClient`, sur les
    // projets déjà matérialisés des dossiers réels.
    await service.advanceDemoPipeline('ws-demo', now, 'owner-1')

    await expect(
      service.seedDeliveryClient('ws-demo', 'owner-1', now, new Map<string, string>(), new Map<string, string>()),
    ).resolves.toBeUndefined()
  })

  /**
   * #3068 — LA COLLISION, REPRODUITE.
   *
   * Une salle qu'un visiteur occupe ENCORE, trouvée INCOMPLÈTE (fingerprint
   * périmée, ou un semis précédent interrompu en cours de route), se répare
   * par `DemoPoolService.tidy('repair')` → `DemoResetService.repairIfIncomplete`
   * → `resetWorkspace` : la purge efface `submissions` PAR WORKSPACE, mais
   * `seedDeliveryClient` retrouve alors le MÊME projet (le compte « client
   * d'exemple » n'est, par construction du pool, jamais recréé sous un autre
   * identifiant applicatif pour cette salle) et réinsère.
   *
   * `client.submissions` (site 1, `DemoSeedService.seedDeliveryClient` —
   * apps/api/src/modules/demo/demo-seed.service.ts:4637) et la shortlist par
   * besoin (site 2, `seedOpenNeeds` — :7336) sont un `INSERT` NU : aucun
   * `ON CONFLICT`, aucun `WHERE NOT EXISTS`, contrairement à `seedStaffedNeed`
   * quelques dizaines de lignes plus loin qui, LUI, retrouve son
   * `project_needs` existant avant d'écrire. Un second passage sur la même
   * salle republie donc le MÊME triplet (project_id, consultant_id,
   * coalesce(need_id, 0)) — et `submissions_unique` (migration
   * `1789382641057-Submissions.ts`) le refuse.
   */
  it('second passage (réparation d’une salle incomplète) : ne casse plus sur submissions_unique', async () => {
    const now = Date.now()
    const submissionRows: SubmissionRow[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = buildService(submissionRows) as any
    await first.advanceDemoPipeline('ws-demo', now, 'owner-1')
    await first.seedDeliveryClient('ws-demo', 'owner-1', now, new Map<string, string>(), new Map<string, string>())

    // Même salle, même séquence d'identifiants retrouvés (même compte, même
    // projet) — `submissionRows` n'est PAS réinitialisé : c'est exactement ce
    // qu'une salle purgée sur `submissions` mais pas ailleurs donnerait à voir.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = buildService(submissionRows) as any
    await second.advanceDemoPipeline('ws-demo', now, 'owner-1')

    await expect(
      second.seedDeliveryClient('ws-demo', 'owner-1', now, new Map<string, string>(), new Map<string, string>()),
    ).resolves.toBeUndefined()
  })
})
