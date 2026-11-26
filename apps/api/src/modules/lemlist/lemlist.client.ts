import type { LemlistCampaign } from '@bellum/contracts'

/**
 * #4427 — le client Lemlist.
 *
 * Chaque endpoint est celui de la documentation PUBLIQUE, lue le 21/10/2026 —
 * « un contrat d'API non vérifiable ne se devine pas » :
 *
 * - base + authentification : https://developer.lemlist.com/api-reference/getting-started/authentication
 *   (`https://api.lemlist.com/api`, Basic, identifiant VIDE, mot de passe = la clé) ;
 * - débit : https://developer.lemlist.com/api-reference/getting-started/rate-limits
 *   (20 requêtes / 2 s par clé — chaque geste ici en coûte une ou deux).
 *
 * Aucun appel sans clé d'espace : sans connexion, le service ne construit
 * jamais d'appel (no-op strict). La clé n'est jamais journalisée.
 */

const LEMLIST_BASE = 'https://api.lemlist.com/api'

/** Plafond documenté de `limit` sur `/campaigns` et `/activities`. */
const PAGE_SIZE = 100

const TIMEOUT_MS = 15_000

export class LemlistApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LemlistApiError'
  }
}

/** `Basic base64(":<clé>")` — le deux-points AVANT la clé est exigé par la doc. */
export function lemlistAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`
}

async function call(apiKey: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`${LEMLIST_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: lemlistAuthorization(apiKey),
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** Le message d'erreur SANS le corps : il peut reprendre la donnée envoyée. */
function failure(res: Response, what: string): LemlistApiError {
  return new LemlistApiError(res.status, `Lemlist a refusé ${what} (HTTP ${res.status})`)
}

/**
 * #4427.1 — la clé est-elle acceptée ?
 * `GET /team` : https://developer.lemlist.com/api-reference/endpoints/team/get-team
 * `rejected` = 401 (« The authentication you supplied is incorrect ») ; toute
 * autre erreur LÈVE : une panne de Lemlist n'est pas une clé fausse.
 */
export async function verifyKey(apiKey: string): Promise<'valid' | 'rejected'> {
  const res = await call(apiKey, '/team')
  if (res.ok) return 'valid'
  if (res.status === 401) return 'rejected'
  throw failure(res, 'la vérification de la clé')
}

/**
 * #4427.2 — les campagnes EXISTANTES de l'équipe.
 * `GET /campaigns?version=v2` : https://developer.lemlist.com/api-reference/endpoints/campaigns/get-many-campaigns
 *
 * La page publique décrit un tableau nu ; la v2 rend `{ campaigns, pagination }` — recette du
 * 22/10 : « Aucune campagne » alors qu'un brouillon existait. Les deux formes se lisent ; toute
 * autre est une panne nommée, jamais une liste vide.
 */
export async function listCampaigns(apiKey: string): Promise<LemlistCampaign[]> {
  const res = await call(apiKey, `/campaigns?version=v2&limit=${PAGE_SIZE}`)
  if (!res.ok) throw failure(res, 'la lecture des campagnes')
  const body = (await res.json()) as unknown
  const wrapped = (body as { campaigns?: unknown } | null)?.campaigns
  const rows = Array.isArray(body) ? body : Array.isArray(wrapped) ? wrapped : null
  if (rows === null) throw new LemlistApiError(res.status, 'Lemlist a rendu une liste de campagnes illisible')
  return rows.flatMap((row: { _id?: unknown; name?: unknown; status?: unknown }) =>
    typeof row?._id === 'string' && typeof row?.name === 'string'
      ? [{ id: row._id, name: row.name, status: typeof row.status === 'string' ? row.status : null }]
      : [],
  )
}

/** Les champs documentés du corps de « Create Lead in Campaign » que Bellum renseigne
 *  (aucun n'y est obligatoire ; le service exige un e-mail OU un LinkedIn). */
export type LemlistLeadInput = {
  email?: string
  firstName?: string
  lastName?: string
  companyName?: string
  companyDomain?: string
  jobTitle?: string
  linkedinUrl?: string
  phone?: string
}

/**
 * #4427.2 — ajoute UN lead à UNE campagne.
 * `POST /campaigns/{campaignId}/leads/` : https://developer.lemlist.com/api-reference/endpoints/leads/create-lead-in-campaign
 *
 * Aucun paramètre d'enrichissement (`findEmail`, `findPhone`…) : ils consomment
 * les crédits Lemlist de l'ESN, ce que le geste « ajouter à la campagne » ne
 * dit pas. Le doublon (`400 LEAD_ALREADY_IN_CAMPAIGN`, rien n'est écrit) est
 * une issue nommée, pas une panne.
 */
export async function createLeadInCampaign(
  apiKey: string,
  campaignId: string,
  lead: LemlistLeadInput,
): Promise<{ outcome: 'pushed' | 'already_in_campaign'; leadId: string | null; campaignName: string | null }> {
  const res = await call(apiKey, `/campaigns/${encodeURIComponent(campaignId)}/leads/`, { method: 'POST', body: lead })
  if (res.ok) {
    const body = (await res.json()) as { _id?: unknown; campaignName?: unknown }
    return {
      outcome: 'pushed',
      leadId: typeof body?._id === 'string' ? body._id : null,
      campaignName: typeof body?.campaignName === 'string' ? body.campaignName : null,
    }
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => '')
    if (/LEAD_ALREADY_IN_CAMPAIGN|already in the campaign/i.test(text)) {
      return { outcome: 'already_in_campaign', leadId: null, campaignName: null }
    }
  }
  throw failure(res, "l'ajout du lead")
}

/**
 * #4427.3 — l'historique d'UN lead dans SA campagne.
 * `GET /activities?version=v2&leadId=…&campaignId=…` :
 * https://developer.lemlist.com/api-reference/endpoints/activities/get-many-activities
 * (`version=v2` obligatoire ; `type` est une valeur de l'énumération `ActivityType`).
 */
export async function listLeadActivities(
  apiKey: string,
  campaignId: string,
  leadId: string,
): Promise<Array<{ type: string; createdAt: string | null }>> {
  const params = new URLSearchParams({ version: 'v2', leadId, campaignId, limit: String(PAGE_SIZE) })
  const res = await call(apiKey, `/activities?${params.toString()}`)
  if (!res.ok) throw failure(res, 'la lecture des activités')
  const body = (await res.json()) as unknown
  const rows = Array.isArray(body) ? body : []
  return rows.flatMap((row: { type?: unknown; createdAt?: unknown }) =>
    typeof row?.type === 'string'
      ? [{ type: row.type, createdAt: typeof row.createdAt === 'string' ? row.createdAt : null }]
      : [],
  )
}
