import type { EntityManager } from 'typeorm'
import { carriedLoadedDailyCostCents, deriveSubstatusFromStage, type SubmissionStage } from '@bellum/contracts'

/**
 * #4192 (épopée #4191, lot L1) — la colonne vertébrale CRM/ATS en démonstration.
 *
 * Un besoin chez Société Générale porte trois positionnements COMPLÉTÉS (jours
 * et coût journalier) : la fiche besoin, onglet Positionnements, montre la
 * marge prévue d'un retenu (« TJM 650 € · 120 j · marge prévue 24 000 € »),
 * celle d'un profil en entretien, et — à dessein — « marge non mesurée » sur
 * celui dont le coût n'est pas connu (jamais 0, jamais deviné).
 */
export const DEMO_CRM_BACKBONE = {
  account: 'Société Générale',
  project: {
    label: 'Renfort data — plateforme de pilotage des risques',
    detail: 'Renfort de l’équipe data pour la plateforme de pilotage des risques de crédit.',
  },
  need: { title: 'Ingénieur data senior — pilotage des risques', location: 'Paris La Défense' },
  /**
   * #4191 (G4) — l'affaire est SIGNÉE sur le positionnement retenu : la mission
   * née de la signature reprend le TJM vendu et le coût journalier chargé du
   * positionnement (D43), donc sa marge est mesurée à l'écran. Les deux autres
   * positionnements ne produisent pas de mission.
   */
  signedMission: {
    consultant: 'Yanis Berthier',
    label: 'Renfort data — plateforme de pilotage des risques',
    role_title: 'Ingénieur data senior',
    started_days_ago: 2,
    daily_rate: 650,
  },
  submissions: [
    {
      consultant: 'Yanis Berthier',
      stage: 'accepted' as SubmissionStage,
      stage_entered_days_ago: 4,
      submitted_days_ago: 18,
      proposed_rate_cents: 650_00,
      planned_days: 120,
      daily_cost_cents: 450_00,
    },
    {
      consultant: 'Salomé Dufour',
      stage: 'interview' as SubmissionStage,
      stage_entered_days_ago: 5,
      submitted_days_ago: 12,
      proposed_rate_cents: 620_00,
      planned_days: 60,
      daily_cost_cents: 430_00,
    },
    {
      consultant: 'Marc Ouedraogo',
      stage: 'submitted' as SubmissionStage,
      stage_entered_days_ago: 6,
      submitted_days_ago: 6,
      proposed_rate_cents: 580_00,
      planned_days: 90,
      // Coût inconnu : l'écran dit « marge non mesurée ».
      daily_cost_cents: null,
    },
  ],
}

/**
 * Idempotent : une salle réparée retrouve le même projet (garde `NOT EXISTS`)
 * et les positionnements existants (`ON CONFLICT DO NOTHING`). Un compte ou un
 * talent introuvable est SAUTÉ, jamais inventé.
 */
export async function seedDemoCrmBackbone(
  manager: EntityManager,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  const data = DEMO_CRM_BACKBONE
  const [account] = await manager.query<{ id: string }[]>(
    `SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`,
    [workspaceId, data.account],
  )
  if (!account) return

  let [project] = await manager.query<{ id: string }[]>(
    `SELECT id FROM opportunities WHERE workspace_id = $1 AND account_id = $2 AND label = $3 LIMIT 1`,
    [workspaceId, account.id, data.project.label],
  )
  if (!project) {
    ;[project] = await manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, currency, first_detected_at, source)
       VALUES ($1, $2, 'besoin', $3, $4, 'qualified', now() - interval '20 days', 'EUR', now() - interval '30 days', 'manual')
       RETURNING id`,
      [workspaceId, account.id, data.project.label, data.project.detail],
    )
  }
  if (!project) return

  let [need] = await manager.query<{ id: string }[]>(
    `SELECT id FROM project_needs WHERE project_id = $1 AND title = $2 LIMIT 1`,
    [project.id, data.need.title],
  )
  if (!need) {
    ;[need] = await manager.query<{ id: string }[]>(
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, headcount, location, status,
          status_changed_at, source, provenance, owner_id)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, 1, $5, 'shortlist_ready', now() - interval '10 days',
               'client_email', 'human', $6)
       RETURNING id`,
      [workspaceId, project.id, account.id, data.need.title, data.need.location, ownerUserId],
    )
  }

  for (const entry of data.submissions) {
    const [consultant] = await manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
      [workspaceId, entry.consultant],
    )
    if (!consultant) continue
    await manager.query(
      `INSERT INTO submissions
         (workspace_id, project_id, need_id, consultant_id, stage, substatus, stage_entered_at, submitted_at,
          proposed_rate_cents, owner_id, planned_days, daily_cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7::int), now() - make_interval(days => $8::int),
               $9, $10, $11, $12)
       ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
         DO NOTHING`,
      [
        workspaceId,
        project.id,
        need?.id ?? null,
        consultant.id,
        entry.stage,
        deriveSubstatusFromStage(entry.stage, null),
        entry.stage_entered_days_ago,
        entry.submitted_days_ago,
        entry.proposed_rate_cents,
        ownerUserId,
        entry.planned_days,
        entry.daily_cost_cents,
      ],
    )
  }

  await seedSignedMission(manager, workspaceId, ownerUserId, account.id, project.id, need?.id ?? null)
}

/**
 * La mission signée depuis le positionnement RETENU, avec son coût reporté.
 * Idempotente : une mission déjà rattachée au positionnement n'est pas dupliquée.
 * Un talent ou un positionnement introuvable est SAUTÉ, jamais inventé.
 */
async function seedSignedMission(
  manager: EntityManager,
  workspaceId: string,
  ownerUserId: string,
  accountId: string,
  projectId: string,
  needId: string | null,
): Promise<void> {
  const { signedMission, submissions } = DEMO_CRM_BACKBONE
  const retained = submissions.find(entry => entry.consultant === signedMission.consultant)
  const [submission] = await manager.query<{ id: string; consultant_id: string }[]>(
    `SELECT s.id, s.consultant_id
       FROM submissions s JOIN consultants c ON c.id = s.consultant_id
      WHERE s.workspace_id = $1 AND s.project_id = $2 AND s.stage = 'accepted' AND c.full_name = $3
      LIMIT 1`,
    [workspaceId, projectId, signedMission.consultant],
  )
  if (!submission) return
  const [existing] = await manager.query<{ id: string }[]>(`SELECT id FROM missions WHERE submission_id = $1 LIMIT 1`, [
    submission.id,
  ])
  if (existing) return
  const [mission] = await manager.query<{ id: string }[]>(
    `INSERT INTO missions
       (workspace_id, user_id, account_id, opportunity_id, need_id, submission_id, label, status, started_on,
        daily_rate, contract_kind, role_title, owner_id, stage_entered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_DATE - $8::int, $9::numeric, 'regie', $10, $2, now())
     RETURNING id`,
    [
      workspaceId,
      ownerUserId,
      accountId,
      projectId,
      needId,
      submission.id,
      signedMission.label,
      signedMission.started_days_ago,
      signedMission.daily_rate,
      signedMission.role_title,
    ],
  )
  if (!mission) return
  // #4191 R22 (G4) — le consultant retenu est AFFECTÉ à la mission (comme `DeliveryService.create`) : sans
  // affectation, `/missions` ne nomme personne sur cette mission et la recette ne retrouve pas Yanis Berthier.
  await manager.query(
    `INSERT INTO mission_assignments (mission_id, workspace_id, consultant_id, load_percent, starts_on, status)
     VALUES ($1, $2, $3, 100, CURRENT_DATE - $4::int, 'confirmed')`,
    [mission.id, workspaceId, submission.consultant_id, signedMission.started_days_ago],
  )
  // Même règle que `DeliveryService.create` : le coût du positionnement, absent = absent.
  const cost = carriedLoadedDailyCostCents(retained?.daily_cost_cents, null)
  if (cost !== null) {
    await manager.query(
      `INSERT INTO mission_commercial_terms (mission_id, workspace_id, loaded_daily_cost_cents, channel, requires_po)
       VALUES ($1, $2, $3, 'direct', false)
       ON CONFLICT (mission_id) DO NOTHING`,
      [mission.id, workspaceId, cost],
    )
  }
  // L'affaire est signée : le Pipe ne la compte plus parmi les affaires actives.
  await manager.query(
    `UPDATE opportunities
        SET stage = 'won', outcome = 'won', closed_at = now() - interval '2 days',
            stage_entered_at = now() - interval '2 days'
      WHERE id = $1 AND stage <> 'won'`,
    [projectId],
  )
}
