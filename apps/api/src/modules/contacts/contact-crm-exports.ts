import type { ContactCrmExport, RecordContactCrmExport } from '@bellum/contracts'
import { crmRecordUrl, type CrmConnectionForLink } from './crm-record-url'

/** Ce qu'il faut de l'exécuteur SQL — `EntityManager` le satisfait, un double de spec aussi. */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type ExportRow = {
  provider: ContactCrmExport['provider']
  crm_record_id: string
  last_action: ContactCrmExport['last_action']
  destination_label: string | null
  exported_at: Date | string
  external_account_id: string | null
  instance_url: string | null
}

/**
 * #3719.4 — retrouver, après rechargement, OÙ et QUAND ce contact a été
 * exporté. Borné au workspace de l'appelant : l'export d'un autre espace n'est
 * ni nommé ni compté.
 *
 * #3719.5 — la jointure sur `crm_connections` (même workspace, même provider)
 * ne lit QUE ce qu'un lien demande (`external_account_id`, `instance_url`),
 * jamais un jeton : `crmRecordUrl` rend `null` dès qu'une connexion a disparu
 * ou qu'il lui manque la pièce nécessaire, plutôt qu'un lien mort.
 */
export async function loadContactCrmExports(
  runner: SqlRunner,
  contactId: string,
  workspaceId: string,
): Promise<ContactCrmExport[]> {
  const rows = (await runner.query(
    `SELECT e.provider, e.crm_record_id, e.last_action, e.destination_label, e.exported_at,
            c.external_account_id, c.instance_url
       FROM contact_crm_exports e
       LEFT JOIN crm_connections c
         ON c.workspace_id = e.workspace_id AND c.provider = e.provider
      WHERE e.contact_id = $1 AND e.workspace_id = $2
      ORDER BY e.exported_at DESC`,
    [contactId, workspaceId],
  )) as ExportRow[]
  return (rows ?? []).map(row => {
    // `LEFT JOIN` : une connexion disparue depuis l'export rend ces deux champs
    // `null` — exactement ce que `crmRecordUrl` traite déjà comme « pas assez
    // pour composer un lien », donc inutile de distinguer ce cas à part.
    const connection: CrmConnectionForLink = {
      external_account_id: row.external_account_id ?? null,
      instance_url: row.instance_url ?? null,
    }
    return {
      provider: row.provider,
      crm_record_id: row.crm_record_id,
      last_action: row.last_action,
      destination_label: row.destination_label ?? null,
      exported_at: row.exported_at instanceof Date ? row.exported_at.toISOString() : String(row.exported_at),
      record_url: crmRecordUrl(row.provider, row.crm_record_id, connection),
    }
  })
}

/**
 * #3719.4 — consigne le résultat d'un export RÉUSSI. Une ligne par
 * (contact, destination) : ré-exporter met à jour la ligne, n'en ajoute pas.
 *
 * Un export n'est pas une prise de contact : cette écriture ne touche NI
 * `last_contact` NI la chronologie d'activités. Le geste vient de l'utilisateur
 * qui a cliqué (`exported_by`), identifiable.
 */
export async function recordContactCrmExport(
  runner: SqlRunner,
  input: { contactId: string; workspaceId: string; userId: string; provider: string } & RecordContactCrmExport,
): Promise<void> {
  await runner.query(
    `INSERT INTO contact_crm_exports
       (workspace_id, contact_id, provider, crm_record_id, last_action, destination_label, exported_by, exported_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (contact_id, provider) DO UPDATE SET
       crm_record_id = EXCLUDED.crm_record_id,
       last_action = EXCLUDED.last_action,
       destination_label = COALESCE(EXCLUDED.destination_label, contact_crm_exports.destination_label),
       exported_by = EXCLUDED.exported_by,
       exported_at = EXCLUDED.exported_at`,
    [
      input.workspaceId,
      input.contactId,
      input.provider,
      input.crm_record_id,
      input.created ? 'created' : 'updated',
      input.destination_label ?? null,
      input.userId,
    ],
  )
}
