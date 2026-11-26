import { RUNNING_MISSION_STATUSES } from '@bellum/contracts'
import type { EntityManager } from 'typeorm'

/**
 * #4191 (recette 15/10, D1) — L'ORIGINE DES MISSIONS DE LA SALLE.
 *
 * Les fiches SNCF « recette applicative lot A » et Société Générale « refonte du SI paiement,
 * phase 2 » affichaient « Besoin d'origine : non mesuré — aucun besoin d'origine n'est lié ». Elles
 * étaient insérées SANS `opportunity_id` (semis #4193 et #4196), et la fiche lit
 * `missions.opportunity_id` → `opportunities.label` : le produit n'invente aucun lien, il le dit.
 *
 * Ce semis passe APRÈS tous les autres (`seedDemoCrm*`) et relie, pour CHAQUE mission en cours
 * encore sans origine, une affaire GAGNÉE (au libellé de la mission) et son besoin pourvu
 * (`missions.need_id`). Une mission terminée n'est pas touchée, un lien existant n'est jamais
 * écrasé. Le lien n'existe QUE dans le semis démo : le code produit ne devine jamais une origine.
 *
 * Contraintes lues dans les migrations :
 *  · `opportunities` : `kind 'besoin'`, `stage 'won'` + `outcome 'won'` (ProjectPivot) ;
 *  · `missions_opportunity_nosub_uniq` : UNE affaire par mission sans positionnement → une affaire
 *    NEUVE par mission, jamais partagée ;
 *  · `project_needs_status_check` : `'staffed'` (NeedInterviewNegotiationStatuses) ;
 *  · `missions.need_id` / `opportunity_id` : FK `ON DELETE SET NULL`.
 */
type Query = EntityManager['query']

type OriginlessMission = {
  id: string
  account_id: string
  label: string
  role_title: string | null
  daily_rate: number | null
  started_on: string
}

export async function seedDemoCrmRecette(
  manager: { query: Query },
  workspaceId: string,
  ownerUserId: string,
  now: number = Date.now(),
): Promise<void> {
  const missions = (await manager.query(
    `SELECT m.id, m.account_id, m.label, m.role_title, m.daily_rate::float8 AS daily_rate,
            to_char(m.started_on, 'YYYY-MM-DD') AS started_on
       FROM missions m
      WHERE m.workspace_id = $1 AND m.status = ANY($2::text[]) AND m.opportunity_id IS NULL
      ORDER BY m.started_on, m.id`,
    [workspaceId, [...RUNNING_MISSION_STATUSES]],
  )) as OriginlessMission[] | undefined

  for (const mission of missions ?? []) {
    // V4-CORRECTIFS-B (b) — une affaire GAGNÉE est signée AVANT d'être datée : une mission qui démarre
    // dans quelques jours (`started_on` à venir) ne date jamais l'affaire dans le futur (brief du RDV
    // SNCF : « 01/11/2026 · affaire gagnée » le 20/10). Plafond : la veille de la visite.
    const startedAt = Date.parse(`${mission.started_on}T00:00:00Z`)
    const signedAt = startedAt <= now ? `${mission.started_on}T00:00:00Z` : new Date(now - 86_400_000).toISOString()
    const [opportunity] = (await manager.query(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
          amount_cents, estimated_amount, currency, closed_at, outcome, first_detected_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'won', $5::timestamptz, $6, $7, 'EUR', $5::timestamptz, 'won',
               $5::timestamptz - interval '30 days')
       RETURNING id`,
      [
        workspaceId,
        mission.account_id,
        mission.label,
        mission.daily_rate === null
          ? 'Prestation au forfait — le montant se facture aux jalons, pas au jour.'
          : 'Montant estimé sur vingt jours au tarif de la mission.',
        signedAt,
        mission.daily_rate === null ? null : Math.round(mission.daily_rate * 20 * 100),
        mission.daily_rate === null ? null : mission.daily_rate * 20,
      ],
    )) as { id: string }[]
    if (!opportunity) continue

    const [need] = (await manager.query(
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, headcount, status, status_changed_at,
          source, provenance, owner_id)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, 1, 'staffed', $5::timestamptz, 'client_email', 'human', $6)
       RETURNING id`,
      [workspaceId, opportunity.id, mission.account_id, mission.role_title ?? mission.label, signedAt, ownerUserId],
    )) as { id: string }[]
    if (!need) continue

    await manager.query(
      `UPDATE missions SET opportunity_id = $3, need_id = $4
        WHERE id = $1 AND workspace_id = $2 AND opportunity_id IS NULL`,
      [mission.id, workspaceId, opportunity.id, need.id],
    )
  }
}
