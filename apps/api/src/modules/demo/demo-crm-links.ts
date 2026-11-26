import type { EntityManager } from 'typeorm'

/**
 * #4194 (épopée #4191, lot L3) — la chaîne ORANGE complète de la salle, pour que
 * le panneau latéral unique ne s'ouvre jamais vide en démonstration :
 * opportunité → 2 besoins → 3 positionnements → 1 mission, avec `opportunity_id`,
 * `need_id` et `submission_id` posés (c'est ce qu'`GET /record-links` suit).
 *
 * Décision tranchée dans le brief du lot (Louis, 14/10/2026) : la chaîne pend du
 * compte Orange. Le garde `demo-seed.service.spec` « aucun rôle sur une société
 * RÉELLE » visait les rôles ouverts du client fictif ; il reconnaît ces deux
 * titres, nommés ICI et nulle part ailleurs.
 *
 * Indépendant des autres semis : sans compte Orange ni consultants, il ne pose rien.
 */
export const DEMO_CRM_LINKS_CHAIN = {
  account: 'Orange',
  opportunity: {
    label: 'Orange — renfort des équipes data & cloud',
    detail: 'Deux besoins ouverts, une mission déjà lancée.',
  },
  needs: [
    {
      key: 'cloud',
      title: 'Architecte cloud senior (démo)',
      status: 'client_review',
      bornDaysAgo: 40,
      changedDaysAgo: 6,
    },
    {
      key: 'data',
      title: 'Data engineer confirmé (démo)',
      status: 'shortlist_ready',
      bornDaysAgo: 30,
      changedDaysAgo: 3,
    },
  ],
  submissions: [
    { need: 'cloud', stage: 'accepted', submittedDaysAgo: 20 },
    { need: 'cloud', stage: 'interview', submittedDaysAgo: 12 },
    { need: 'data', stage: 'shortlisted', submittedDaysAgo: 3 },
  ],
  mission: {
    label: 'Mission Orange — architecture cloud (démo)',
    roleTitle: 'Architecte cloud senior',
    startedDaysAgo: 5,
    dailyRate: 780,
  },
} as const

type Query = EntityManager['query']

export async function seedDemoCrmLinks(
  manager: { query: Query },
  workspaceId: string,
  ownerUserId: string,
  now: number,
): Promise<void> {
  const day = 86_400_000
  const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString()
  const chain = DEMO_CRM_LINKS_CHAIN

  const accounts = await manager.query(
    `SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`,
    [workspaceId, chain.account],
  )
  const account = (accounts as { id: string }[] | undefined)?.[0]
  if (!account) return
  const people = (await manager.query(`SELECT id FROM consultants WHERE workspace_id = $1 ORDER BY full_name LIMIT 3`, [
    workspaceId,
  ])) as { id: string }[] | undefined
  if (!people || people.length < chain.submissions.length) return
  const already = (await manager.query(
    `SELECT id FROM opportunities WHERE workspace_id = $1 AND account_id = $2 AND label = $3 LIMIT 1`,
    [workspaceId, account.id, chain.opportunity.label],
  )) as { id: string }[] | undefined
  if (already && already.length > 0) return

  const [opp] = (await manager.query(
    `INSERT INTO opportunities
       (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, first_detected_at)
     VALUES ($1, $2, 'besoin', $3, $4, 'profiles_submitted', $5::timestamptz, $6::timestamptz)
     RETURNING id`,
    [workspaceId, account.id, chain.opportunity.label, chain.opportunity.detail, iso(10), iso(45)],
  )) as { id: string }[]
  if (!opp) return

  const needIds = new Map<string, string>()
  for (const need of chain.needs) {
    const [row] = (await manager.query(
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, headcount, contract_kind, status,
          status_changed_at, source, provenance, owner_id)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, 1, 'regie', $5, $6::timestamptz, 'manual', 'pipeline', $7)
       RETURNING id`,
      [workspaceId, opp.id, account.id, need.title, need.status, iso(need.changedDaysAgo), ownerUserId],
    )) as { id: string }[]
    if (!row) return
    needIds.set(need.key, row.id)
    for (const [from, to, at] of [
      [null, 'to_qualify', iso(need.bornDaysAgo)],
      ['to_qualify', need.status, iso(need.changedDaysAgo)],
    ] as const) {
      await manager.query(
        `INSERT INTO commercial_transitions (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, source, occurred_at)
         VALUES ($1, 'need', $2, $3, $4, $5, 'human', $6::timestamptz)`,
        [workspaceId, row.id, from, to, ownerUserId, at],
      )
    }
  }

  const submissionIds: string[] = []
  for (const [index, submission] of chain.submissions.entries()) {
    const consultant = people[index]
    const needId = needIds.get(submission.need)
    if (!consultant || !needId) return
    const [row] = (await manager.query(
      `INSERT INTO submissions
         (workspace_id, project_id, need_id, consultant_id, stage, stage_entered_at, submitted_at, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz, $7)
       ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING
       RETURNING id`,
      [workspaceId, opp.id, needId, consultant.id, submission.stage, iso(submission.submittedDaysAgo), ownerUserId],
    )) as { id: string }[]
    if (!row) return
    submissionIds.push(row.id)
  }

  const signedSubmission = submissionIds[0]
  const signedConsultant = people[0]
  const signedNeed = needIds.get('cloud')
  if (!signedSubmission || !signedConsultant || !signedNeed) return
  const [mission] = (await manager.query(
    `INSERT INTO missions
       (workspace_id, user_id, account_id, opportunity_id, need_id, submission_id, label, status, started_on,
        daily_rate, contract_kind, role_title, owner_id, stage_entered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::date, $9, 'regie', $10, $2, $11::timestamptz)
     RETURNING id`,
    [
      workspaceId,
      ownerUserId,
      account.id,
      opp.id,
      signedNeed,
      signedSubmission,
      chain.mission.label,
      iso(chain.mission.startedDaysAgo).slice(0, 10),
      chain.mission.dailyRate,
      chain.mission.roleTitle,
      iso(chain.mission.startedDaysAgo),
    ],
  )) as { id: string }[]
  if (!mission) return
  await manager.query(
    `INSERT INTO mission_assignments (mission_id, workspace_id, consultant_id, load_percent, starts_on, status)
     VALUES ($1, $2, $3, 100, $4::date, 'confirmed')`,
    [mission.id, workspaceId, signedConsultant.id, iso(chain.mission.startedDaysAgo).slice(0, 10)],
  )
  await manager.query(
    `INSERT INTO commercial_transitions (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, source, occurred_at)
     VALUES ($1, 'mission', $2, NULL, 'active', $3, 'human', $4::timestamptz)`,
    [workspaceId, mission.id, ownerUserId, iso(chain.mission.startedDaysAgo)],
  )
}
