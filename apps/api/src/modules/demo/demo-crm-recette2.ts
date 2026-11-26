import type { EntityManager } from 'typeorm'

/**
 * #4191 (recette 15/10, lot 2, E5) — L'EXEMPLE VITRINE DU PANNEAU « OBJETS LIÉS ».
 *
 * La salle de démo n'avait AUCUNE affaire chez Orange : la chaîne de `demo-crm-links.ts` (L3) ne se pose que
 * si le compte ET trois consultants sont là, et elle se tait sinon — le panneau latéral s'ouvrait alors sur
 * le seul compte. Ce semis, indépendant, pose sur Orange une affaire au stade AVANCÉ (`profiles_submitted`)
 * avec UN besoin et DEUX positionnements (un envoyé, un en entretien) sur deux consultants.
 *
 * Compte : Orange s'il existe dans la salle ; à défaut, le compte vitrine le plus riche — Société Générale
 * (premier dossier de `DEMO_DOSSIERS`, relevé complet). Jamais un compte inventé : aucun des deux = rien.
 *
 * Contraintes lues dans les migrations (job CI « Démo (semis sur vraie base) ») :
 *  · `opportunities` : `kind 'besoin'`, `stage 'profiles_submitted'` ;
 *  · `project_needs_status_check` : `'interview'` ; `source 'manual'`, `provenance 'pipeline'` (valeurs de L3) ;
 *  · `submissions` : `stage 'submitted' | 'interview'`, unicité (projet, consultant, besoin) → deux consultants
 *    DISTINCTS, `ON CONFLICT DO NOTHING` ;
 *  · `commercial_transitions` : `subject_type 'need'`, `source 'human'`.
 *
 * Idempotent sur le libellé de l'affaire. Le lien n'existe QUE dans le semis démo.
 */
export const DEMO_CRM_RECETTE2_DEAL = {
  /** Orange d'abord ; sinon le compte vitrine le plus riche. */
  accounts: ['Orange', 'Société Générale'],
  label: 'Renfort de la plateforme data (démo)',
  detail: 'Un besoin, deux profils présentés : un envoyé, un en entretien.',
  need: { title: 'Data engineer senior (démo)', status: 'interview', bornDaysAgo: 28, changedDaysAgo: 4 },
  submissions: [
    { stage: 'submitted', submittedDaysAgo: 9 },
    { stage: 'interview', submittedDaysAgo: 5 },
  ],
} as const

type Query = EntityManager['query']

export async function seedDemoCrmRecette2(
  manager: { query: Query },
  workspaceId: string,
  ownerUserId: string,
  now: number,
): Promise<void> {
  const day = 86_400_000
  const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString()
  const deal = DEMO_CRM_RECETTE2_DEAL

  let account: { id: string } | undefined
  for (const companyName of deal.accounts) {
    const rows = (await manager.query(`SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`, [
      workspaceId,
      companyName,
    ])) as { id: string }[] | undefined
    account = rows?.[0]
    if (account) break
  }
  if (!account) return

  const people = (await manager.query(`SELECT id FROM consultants WHERE workspace_id = $1 ORDER BY full_name LIMIT 2`, [
    workspaceId,
  ])) as { id: string }[] | undefined
  if (!people || people.length < deal.submissions.length) return

  const already = (await manager.query(
    `SELECT id FROM opportunities WHERE workspace_id = $1 AND account_id = $2 AND label = $3 LIMIT 1`,
    [workspaceId, account.id, deal.label],
  )) as { id: string }[] | undefined
  if (already && already.length > 0) return

  const [opportunity] = (await manager.query(
    `INSERT INTO opportunities
       (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, first_detected_at)
     VALUES ($1, $2, 'besoin', $3, $4, 'profiles_submitted', $5::timestamptz, $6::timestamptz)
     RETURNING id`,
    [workspaceId, account.id, deal.label, deal.detail, iso(5), iso(35)],
  )) as { id: string }[]
  if (!opportunity) return

  const [need] = (await manager.query(
    `INSERT INTO project_needs
       (workspace_id, project_id, account_id, title, skills, headcount, contract_kind, status,
        status_changed_at, source, provenance, owner_id)
     VALUES ($1, $2, $3, $4, '[]'::jsonb, 1, 'regie', $5, $6::timestamptz, 'manual', 'pipeline', $7)
     RETURNING id`,
    [
      workspaceId,
      opportunity.id,
      account.id,
      deal.need.title,
      deal.need.status,
      iso(deal.need.changedDaysAgo),
      ownerUserId,
    ],
  )) as { id: string }[]
  if (!need) return

  for (const [from, to, at] of [
    [null, 'to_qualify', iso(deal.need.bornDaysAgo)],
    ['to_qualify', deal.need.status, iso(deal.need.changedDaysAgo)],
  ] as const) {
    await manager.query(
      `INSERT INTO commercial_transitions (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, source, occurred_at)
       VALUES ($1, 'need', $2, $3, $4, $5, 'human', $6::timestamptz)`,
      [workspaceId, need.id, from, to, ownerUserId, at],
    )
  }

  for (const [index, submission] of deal.submissions.entries()) {
    const consultant = people[index]
    if (!consultant) return
    await manager.query(
      `INSERT INTO submissions
         (workspace_id, project_id, need_id, consultant_id, stage, stage_entered_at, submitted_at, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz, $7)
       ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING`,
      [
        workspaceId,
        opportunity.id,
        need.id,
        consultant.id,
        submission.stage,
        iso(submission.submittedDaysAgo),
        ownerUserId,
      ],
    )
  }
}
