import { apiFetch } from '@/lib/api'

/**
 * Le connecteur Odoo, côté web.
 *
 * ⚠️ Il n'y a PAS de `connectUrl()` ici, et c'est la différence de fond avec
 * les quatre autres CRM. HubSpot, Salesforce, Pipedrive et Attio rendent une
 * URL de consentement vers laquelle on redirige le navigateur ; Odoo
 * s'authentifie par identifiants, donc la connexion est un POST depuis
 * l'écran. Ajouter un `connectUrl()` ici pour « faire comme les autres »
 * donnerait une porte qui ne mène nulle part.
 */

export type OdooStatus = {
  /** Toujours `true` : Odoo n'a aucune configuration serveur à poser. */
  configured: boolean
  connected: boolean
  provider?: 'odoo'
  /** Le nom de la base branchée. */
  accountLabel?: string | null
  /** L'adresse de l'instance, pour vérifier qu'on a branché la bonne. */
  instanceUrl?: string | null
  connectedAt?: string
  lastUsedAt?: string | null
}

type OdooConnectInput = {
  baseUrl: string
  db: string
  login: string
  apiKey: string
}

/** `ok: false` porte la RAISON du refus, à afficher sous le formulaire. */
type OdooConnectResult = { ok: true; accountLabel: string | null } | { ok: false; reason: string }

export const odooApi = {
  status(): Promise<OdooStatus> {
    return apiFetch<OdooStatus>({ path: '/odoo/status' })
  },
  connect(input: OdooConnectInput): Promise<OdooConnectResult> {
    return apiFetch<OdooConnectResult, OdooConnectInput>({ path: '/odoo/connect', method: 'POST', body: input })
  },
  /**
   * Coupe le lien local. Rien n'est révoqué côté serveur — une clé d'API se
   * retire depuis le compte, et `warning` le DIT plutôt que de laisser croire
   * à un accès entièrement fermé.
   */
  disconnect(): Promise<{ removed: boolean; warning: string }> {
    return apiFetch<{ removed: boolean; warning: string }>({ path: '/odoo', method: 'DELETE' })
  },
}
