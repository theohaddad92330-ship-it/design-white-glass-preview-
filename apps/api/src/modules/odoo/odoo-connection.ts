import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
// Le même chiffrement AES-256-GCM que les autres liens CRM (voir `odoo.service.ts`).
import { decryptToken } from '../crm/crm-token.crypto'
import { OdooClient } from './odoo.client'

/**
 * Le client d'une instance BRANCHÉE, construit depuis sa ligne `crm_connections`
 * — un seul endroit pour cette construction : l'export de contact
 * (`OdooService`) et la lecture des ventes (#2561/#2562,
 * `MissionOdooSalesService`) la partagent.
 *
 * `null` quand la ligne est incomplète (adresse absente, uid illisible) : à
 * l'appelant de le DIRE, jamais d'envoyer `NaN` au serveur.
 */
export function odooClientForConnection(
  row: Pick<CrmConnectionEntity, 'instance_url' | 'external_account_id' | 'account_label' | 'access_token_enc'>,
): { client: OdooClient; uid: number } | null {
  if (!row.instance_url || !row.external_account_id) return null
  const uid = Number(row.external_account_id)
  if (!Number.isInteger(uid) || uid <= 0) return null
  const client = new OdooClient({
    baseUrl: row.instance_url,
    db: row.account_label ?? '',
    login: '',
    apiKey: decryptToken(row.access_token_enc),
  })
  return { client, uid }
}
