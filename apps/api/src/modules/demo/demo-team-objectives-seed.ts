/**
 * Théo D team-business.N2 (craft rule n°9) — la démonstration de « Un objectif
 * choisi, pas imposé en silence ».
 *
 * Les collègues fictifs viennent de `DEMO_COLLEAGUES` (créés par `seedColleagues`) :
 * ce module ne fabrique aucun compte, il PREND ceux qui sont membres de l'espace.
 * Sans collègue, il ne fait RIEN (jamais une cible attribuée à quelqu'un qui
 * n'existe pas).
 *
 * Il sème, pour le MOIS COURANT :
 *  · la cible déclarée de Léa et de Karim (`member_objectives`) — « Objectifs &
 *    affaires » montre alors une équipe, pas le seul occupant ;
 *  · UNE proposition de cible, de l'occupant à Léa, en attente de sa réponse
 *    (`objective_proposals`) — le badge « proposée · en attente » et le bloc
 *    « Une cible t'est proposée » se voient en salle.
 *
 * Aucun réalisé n'est écrit : il se calcule sur les tables déjà semées. IDEMPOTENT
 * (`ON CONFLICT` / `NOT EXISTS`) : la salle se remet à neuf à chaque visite.
 */
import { DEMO_COLLEAGUES } from './demo-dataset'

type Queryable = { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T> }

/** La cible déclarée de chaque collègue, par clé de {@link DEMO_COLLEAGUES}. */
const COLLEAGUE_TARGETS: Record<string, { revenue: number; meetings: number; accounts: number }> = {
  lea: { revenue: 60000, meetings: 10, accounts: 6 },
  karim: { revenue: 45000, meetings: 8, accounts: 4 },
}

/** La cible PROPOSÉE à Léa : au-dessus de la sienne, avec la raison écrite par la direction. */
export const DEMO_PROPOSED_TARGET = {
  colleague: 'lea',
  revenue: 75000,
  meetings: 12,
  reason: 'Léa porte Alstom et Naval Group : on vise un mois plus ambitieux, à valider ensemble.',
} as const

function firstOfMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function seedTeamObjectives(
  db: Queryable,
  input: { workspaceId: string; ownerUserId: string; now: Date },
): Promise<{ seeded: boolean }> {
  const { workspaceId, ownerUserId, now } = input
  const period = firstOfMonth(now)
  const members = await db.query<{ user_id: string }[] | undefined>(
    `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2::uuid[])`,
    [workspaceId, DEMO_COLLEAGUES.map(colleague => colleague.userId)],
  )
  const present = new Set((members ?? []).map(row => row.user_id))
  const colleagues = DEMO_COLLEAGUES.filter(colleague => present.has(colleague.userId))
  if (colleagues.length === 0) return { seeded: false }

  for (const colleague of colleagues) {
    const target = COLLEAGUE_TARGETS[colleague.key]
    if (!target) continue
    await db.query(
      `INSERT INTO member_objectives (user_id, workspace_id, period_month, target_meetings, target_accounts, target_revenue)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       ON CONFLICT (user_id, workspace_id, period_month) DO NOTHING`,
      [colleague.userId, workspaceId, period, target.meetings, target.accounts, target.revenue],
    )
  }

  const proposed = colleagues.find(colleague => colleague.key === DEMO_PROPOSED_TARGET.colleague)
  if (proposed) {
    await db.query(
      `INSERT INTO objective_proposals
         (workspace_id, user_id, proposed_by, period_month, target_meetings, target_revenue, reason, status)
       SELECT $1, $2, $3, $4::date, $5, $6, $7, 'proposed'
        WHERE NOT EXISTS (
          SELECT 1 FROM objective_proposals
           WHERE workspace_id = $1 AND user_id = $2 AND period_month = $4::date AND status = 'proposed')`,
      [
        workspaceId,
        proposed.userId,
        ownerUserId,
        period,
        DEMO_PROPOSED_TARGET.meetings,
        DEMO_PROPOSED_TARGET.revenue,
        DEMO_PROPOSED_TARGET.reason,
      ],
    )
  }
  return { seeded: true }
}
