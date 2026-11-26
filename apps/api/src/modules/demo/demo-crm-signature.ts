import type { EntityManager } from 'typeorm'
import { deriveSubstatusFromStage, type SubmissionStage } from '@bellum/contracts'

/**
 * #4195 (épopée #4191, lot L4) — la signature en démonstration.
 *
 * Une affaire SNCF en « Négociation », deux besoins d'effectif 1 chacun, un
 * positionnement RETENU par besoin : glisser l'affaire vers « Gagné » annonce
 * « 2 missions seront créées » et `/missions` en liste deux, avec consultant,
 * TJM et dates. Le deuxième besoin ne porte pas de durée : sa mission naît
 * SANS date de fin (jamais inventée).
 */
export const DEMO_CRM_SIGNATURE = {
  account: 'SNCF',
  project: {
    // #4195.5 — le NOM que cite la carte SNCF de /actions (`DEMO_CRM_WRITE_REQUESTS`, `update_deal_stage`) : l'affaire
    // qu'elle propose de passer en Négociation côté CRM existe dans /projects, déjà en Négociation côté Bellum.
    label: 'Renfort régie — entité numérique voyageurs',
    detail:
      'Deux profils en régie pour l’entité numérique voyageurs (squad paiement de l’application), retenus et prêts à signer.',
  },
  needs: [
    {
      title: 'Développeur back-end senior — paiement',
      // V4-CORRECTIFS-B (b) — un OFFSET depuis la visite, jamais une date en dur.
      start_in_days: 14,
      duration_months: 6,
      contract_kind: 'regie',
    },
    {
      title: 'Product owner technique — paiement',
      start_in_days: 42,
      duration_months: null,
      contract_kind: 'regie',
    },
  ],
  submissions: [
    {
      consultant: 'Salomé Dufour',
      need: 0,
      stage: 'accepted' as SubmissionStage,
      proposed_rate_cents: 640_00,
      planned_days: 130,
      daily_cost_cents: 440_00,
    },
    {
      consultant: 'Marc Ouedraogo',
      need: 1,
      stage: 'accepted' as SubmissionStage,
      proposed_rate_cents: 700_00,
      planned_days: 90,
      daily_cost_cents: null,
    },
  ],
}

/**
 * Idempotent (gardes `NOT EXISTS` / `ON CONFLICT DO NOTHING`). Un compte ou un
 * talent introuvable est SAUTÉ, jamais inventé. Aucune mission n'est semée ici :
 * c'est la signature, faite en réunion, qui les crée.
 */
export async function seedDemoCrmSignature(
  manager: EntityManager,
  workspaceId: string,
  ownerUserId: string,
  now: number = Date.now(),
): Promise<void> {
  const data = DEMO_CRM_SIGNATURE
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
       VALUES ($1, $2, 'besoin', $3, $4, 'negotiation', now() - interval '5 days', 'EUR', now() - interval '40 days', 'manual')
       RETURNING id`,
      [workspaceId, account.id, data.project.label, data.project.detail],
    )
  }
  if (!project) return

  const needIds: string[] = []
  for (const entry of data.needs) {
    let [need] = await manager.query<{ id: string }[]>(
      `SELECT id FROM project_needs WHERE project_id = $1 AND title = $2 LIMIT 1`,
      [project.id, entry.title],
    )
    if (!need) {
      ;[need] = await manager.query<{ id: string }[]>(
        `INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, headcount, status, status_changed_at,
            source, provenance, owner_id, start_on, duration_months, contract_kind)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, 1, 'negotiation', now() - interval '5 days',
                 'client_email', 'human', $5, $6, $7, $8)
         RETURNING id`,
        [
          workspaceId,
          project.id,
          account.id,
          entry.title,
          ownerUserId,
          new Date(now + entry.start_in_days * 86_400_000).toISOString().slice(0, 10),
          entry.duration_months,
          entry.contract_kind,
        ],
      )
    }
    if (need) needIds.push(need.id)
  }

  for (const entry of data.submissions) {
    const needId = needIds[entry.need]
    if (!needId) continue
    const [consultant] = await manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
      [workspaceId, entry.consultant],
    )
    if (!consultant) continue
    await manager.query(
      `INSERT INTO submissions
         (workspace_id, project_id, need_id, consultant_id, stage, substatus, stage_entered_at, submitted_at,
          proposed_rate_cents, owner_id, planned_days, daily_cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, now() - interval '4 days', now() - interval '15 days', $7, $8, $9, $10)
       ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
         DO NOTHING`,
      [
        workspaceId,
        project.id,
        needId,
        consultant.id,
        entry.stage,
        deriveSubstatusFromStage(entry.stage, null),
        entry.proposed_rate_cents,
        ownerUserId,
        entry.planned_days,
        entry.daily_cost_cents,
      ],
    )
  }
}
