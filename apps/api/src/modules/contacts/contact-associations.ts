import {
  contactEmploymentState,
  sortContactAssociations,
  type ContactAssociationItem,
  type ContactAssociations,
} from '@bellum/contracts'

/** Ce qu'il faut de l'exécuteur SQL — `EntityManager` le satisfait, un double de spec aussi. */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type ContactRow = {
  id: string
  account_id: string | null
  entity: string | null
  entity_id: string | null
  lifecycle_state: string | null
  employment_verified_at: Date | string | null
}

/** Qui lit la fiche : un objet privé n'est vu que de son porteur ou de qui gère l'équipe. */
type AssociationsViewer = { userId: string; canSeePrivate: boolean }

/** Plafond par nature : une fiche lit les dossiers pertinents, pas l'historique entier. */
const PER_KIND_LIMIT = 20

/**
 * #3712 — les dossiers associés à une personne, par IDENTITÉ d'objet.
 *
 * - projets : une ligne `project_contacts` (rôle documenté) — jamais « tous les
 *   projets du compte » ;
 * - besoins : la personne est l'interlocuteur (`contact_id`) ou le décideur
 *   (`decision_maker_contact_id`) du besoin ;
 * - missions : les trois liens que le modèle porte — manager client
 *   (`client_manager_contact_id`), validation du relevé (`cra_contact_id`) et
 *   facturation (`billing_contact_id`) — rôles DÉCLARÉS sur la mission, pas une
 *   affectation ; la correction passe par la mission elle-même.
 *
 * Tout est borné au workspace de l'appelant : un objet d'un autre espace n'est
 * ni nommé ni compté. #4158.34 — un objet PRIVÉ (`is_private`) ne fait AUCUNE ligne chez qui
 * n'est ni son porteur ni gestionnaire d'équipe : le filtre est dans le SQL, le
 * LIMIT ne compte donc que le visible.
 * Aucun rapprochement par nom, aucune fusion d'homonymes.
 */
export async function loadContactAssociations(
  runner: SqlRunner,
  contact: ContactRow,
  workspaceId: string,
  viewer: AssociationsViewer,
): Promise<ContactAssociations> {
  const [accountRows, entityRows, projectRows, needRows, missionRows] = await Promise.all([
    contact.account_id
      ? runner.query(`SELECT id, company_name FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
          contact.account_id,
          workspaceId,
        ])
      : Promise.resolve([]),
    contact.entity_id
      ? runner.query(`SELECT id, name FROM account_entities WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
          contact.entity_id,
          workspaceId,
        ])
      : Promise.resolve([]),
    runner.query(
      `SELECT p.id, p.label, p.stage, pc.role
         FROM project_contacts pc
         JOIN opportunities p ON p.id = pc.project_id
        WHERE pc.contact_id = $1 AND p.workspace_id = $2 AND p.archived_at IS NULL
          AND (p.is_private = false OR p.owner_id = $3 OR $4::boolean)
        ORDER BY p.updated_at DESC
        LIMIT ${PER_KIND_LIMIT}`,
      [contact.id, workspaceId, viewer.userId, viewer.canSeePrivate],
    ),
    runner.query(
      `SELECT n.id, n.title, n.status, n.project_id,
              CASE WHEN n.contact_id = $1 THEN 'interlocutor' ELSE 'decision_maker' END AS role
         FROM project_needs n
        WHERE (n.contact_id = $1 OR n.decision_maker_contact_id = $1) AND n.workspace_id = $2
          AND (n.is_private = false OR n.owner_id = $3 OR $4::boolean)
        ORDER BY n.updated_at DESC
        LIMIT ${PER_KIND_LIMIT}`,
      [contact.id, workspaceId, viewer.userId, viewer.canSeePrivate],
    ),
    runner.query(
      `SELECT m.id, m.label, m.status,
              (m.billing_contact_id = $1) AS is_billing,
              (m.cra_contact_id = $1) AS is_cra,
              (m.client_manager_contact_id = $1) AS is_client_manager
         FROM missions m
        WHERE (m.billing_contact_id = $1 OR m.cra_contact_id = $1 OR m.client_manager_contact_id = $1)
          AND m.workspace_id = $2
          AND (m.is_private = false OR m.owner_id = $3 OR $4::boolean)
        ORDER BY m.started_on DESC NULLS LAST
        LIMIT ${PER_KIND_LIMIT}`,
      [contact.id, workspaceId, viewer.userId, viewer.canSeePrivate],
    ),
  ])

  const first = <T>(rows: unknown): T | null => ((rows as T[])[0] as T | undefined) ?? null
  const account = first<{ id: string; company_name: string }>(accountRows)
  const entity = first<{ id: string; name: string }>(entityRows)

  const items: ContactAssociationItem[] = [
    ...(projectRows as { id: string; label: string; stage: string; role: string }[]).map(
      (row): ContactAssociationItem => ({
        kind: 'project',
        id: row.id,
        name: row.label,
        state: row.stage,
        role: row.role,
        basis: 'documented',
        project_id: null,
      }),
    ),
    ...(needRows as { id: string; title: string; status: string; project_id: string | null; role: string }[]).map(
      (row): ContactAssociationItem => ({
        kind: 'need',
        id: row.id,
        name: row.title,
        state: row.status,
        role: row.role,
        basis: 'documented',
        project_id: row.project_id,
      }),
    ),
    ...(
      missionRows as {
        id: string
        label: string
        status: string
        is_billing: boolean
        is_cra: boolean
        is_client_manager: boolean
      }[]
    ).map((row): ContactAssociationItem => {
      // Ordre de lecture : le plus opérationnel d'abord. Rôles DÉCLARÉS sur la
      // mission (jamais une affectation) — la correction passe par la mission.
      const roles = [
        row.is_client_manager ? 'client_manager' : null,
        row.is_cra ? 'cra' : null,
        row.is_billing ? 'billing' : null,
      ].filter((role): role is string => role !== null)
      return {
        kind: 'mission',
        id: row.id,
        name: row.label,
        state: row.status,
        role: roles[0] ?? null,
        roles,
        basis: 'declared',
        project_id: null,
      }
    }),
  ]

  return {
    contact_id: contact.id,
    account: account ? { id: account.id, name: account.company_name } : null,
    entity: entity ? { id: entity.id, name: entity.name } : null,
    entity_label: entity ? null : (contact.entity ?? null),
    employment: contactEmploymentState({
      lifecycle_state: contact.lifecycle_state,
      employment_verified_at: contact.employment_verified_at,
    }),
    items: sortContactAssociations(items),
  }
}
