import type { CallRecord } from '@bellum/contracts'
import { Logger } from '@nestjs/common'
import {
  parseAircallCall,
  parseAircallTranscript,
  parseAlloCall,
  parseAlloTranscript,
  parseRingoverCall,
} from './call-parse'

/**
 * Les clients de téléphonie.
 *
 * Trois fournisseurs livrés, et la raison du choix vaut d'être écrite : ce
 * sont ceux dont le contrat d'API est PUBLIC et vérifiable. Modjo n'est pas
 * ici pour la même raison que Kaspr côté enrichissement — sa documentation vit
 * derrière un compte client, et un client écrit sur un contrat deviné rendrait
 * une liste vide qui se lirait « aucun appel ».
 *
 * Allo (SRC8, 28/09/2026) : base, endpoint, auth et forme des champs vérifiés
 * sur la spécification publique (`help.withallo.com/en/v2/api-reference` +
 * l'OpenAPI qu'elle référence). ⚠️ Le webhook natif d'Allo (`CALL_RECEIVED`,
 * signé Standard Webhooks) n'est PAS branché ici : c'est le SEUL évènement
 * d'appel qu'Allo publie, et il ne part qu'APRÈS la fin de l'appel (le
 * payload porte déjà `summary`/`transcript`/`length_in_minutes`) — Allo ne
 * peut donc jamais dire « appel EN COURS », seulement « appel terminé ».
 * Le poser comme source de #2403.12 (webhook générique
 * `TelephonyWebhookController`, délibérément vendor-agnostic — voir
 * `callStateEventSchema`) demanderait en plus une correspondance
 * numéro-de-téléphone → utilisateur Bellum qui n'existe nulle part dans ce
 * dépôt : l'inventer fabriquerait une fonctionnalité. Ce lot livre donc la
 * lecture du journal (valeur réelle, #2995 pt. « lecture du journal d'appels »)
 * et laisse #2403.12 tel que SRC3 l'a construit (agenda + webhook générique).
 *
 * Aucun des trois n'est appelé sans identifiants d'espace : sans connexion, le
 * service ne construit même pas de client.
 */

const AIRCALL_BASE = 'https://api.aircall.io/v1'
const RINGOVER_BASE = 'https://public-api.ringover.com/v2'
const ALLO_BASE = 'https://api.withallo.com/v1/api'

/** Fenêtre de lecture par défaut. Trente jours : au-delà, on rejoue un journal
 *  que le commercial a déjà traité, et chaque appel relu coûte un appel d'API. */
export const DEFAULT_CALL_WINDOW_DAYS = 30

/** Borne de page. Les deux fournisseurs plafonnent autour de cette valeur. */
const PAGE_SIZE = 50

const logger = new Logger('TelephonyClient')

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body?.message || body?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export type TelephonyAccess =
  | { provider: 'aircall'; apiId: string; apiKey: string }
  | { provider: 'ringover'; apiKey: string }
  | { provider: 'allo'; apiKey: string; alloNumber: string }

/**
 * Les appels de la fenêtre, normalisés.
 *
 * `since` est calculé par l'appelant : le client ne lit pas l'horloge, pour la
 * même raison que le rapport de pipeline — une fenêtre implicite ne se teste pas.
 */
export async function listCalls(access: TelephonyAccess, since: Date, limit = PAGE_SIZE): Promise<CallRecord[]> {
  if (access.provider === 'allo') {
    const params = new URLSearchParams({
      allo_number: access.alloNumber,
      size: String(Math.min(Math.max(limit, 1), PAGE_SIZE)),
    })
    const res = await fetch(`${ALLO_BASE}/calls?${params.toString()}`, {
      headers: { Authorization: access.apiKey, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Allo calls failed: ${await readError(res)}`)
    // Enveloppe vérifiée sur l'OpenAPI publique : `{ data: { results: [...],
    // metadata: { pagination: {...} } } }` — pas un tableau nu, pas `data[]`.
    const payload = (await res.json()) as { data?: { results?: unknown[] } }
    const rows = payload?.data?.results ?? []
    // `since` n'est PAS un paramètre `/calls` documenté (page/size seulement) —
    // filtré ICI plutôt que d'envoyer un paramètre inconnu que l'API ignorerait
    // en silence en laissant croire à une fenêtre honorée.
    return rows.flatMap(raw => {
      const call = parseAlloCall(raw)
      if (!call || !call.startedAt) return call ? [call] : []
      return new Date(call.startedAt) >= since ? [call] : []
    })
  }

  if (access.provider === 'aircall') {
    const params = new URLSearchParams({
      per_page: String(Math.min(Math.max(limit, 1), PAGE_SIZE)),
      order: 'desc',
      from: String(Math.floor(since.getTime() / 1000)),
    })
    const auth = Buffer.from(`${access.apiId}:${access.apiKey}`).toString('base64')
    const res = await fetch(`${AIRCALL_BASE}/calls?${params.toString()}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Aircall calls failed: ${await readError(res)}`)
    const data = (await res.json()) as { calls?: unknown[] }
    return (data?.calls ?? []).flatMap(raw => {
      const call = parseAircallCall(raw)
      return call ? [call] : []
    })
  }

  const params = new URLSearchParams({
    limit_count: String(Math.min(Math.max(limit, 1), PAGE_SIZE)),
    start_date: since.toISOString(),
    end_date: new Date().toISOString(),
  })
  const res = await fetch(`${RINGOVER_BASE}/calls?${params.toString()}`, {
    headers: { Authorization: access.apiKey, Accept: 'application/json' },
  })
  // Une fenêtre sans aucun appel répond 204 sans corps chez Ringover : ce n'est
  // pas une erreur, c'est « rien à dire ».
  if (res.status === 204) return []
  if (!res.ok) throw new Error(`Ringover calls failed: ${await readError(res)}`)
  const data = (await res.json()) as { call_list?: unknown[] }
  return (data?.call_list ?? []).flatMap(raw => {
    const call = parseRingoverCall(raw)
    return call ? [call] : []
  })
}

/**
 * La transcription d'un appel, quand l'outil en a produit une.
 *
 * Rend `null` sur TOUT ce qui n'est pas une transcription lisible : option non
 * souscrite chez le fournisseur (402), appel non transcrit (404), portée
 * refusée. Un échec ici ne doit jamais empêcher le journal de l'appel — le fait
 * qu'un appel ait eu lieu vaut déjà mieux que rien.
 *
 * Aircall uniquement : le contrat de transcription de Ringover n'est pas public,
 * et deviner une forme de réponse produirait une note vide plutôt qu'une absence
 * de note.
 */
export async function fetchTranscript(access: TelephonyAccess, callId: string): Promise<string | null> {
  if (access.provider === 'allo') {
    // Le schéma `Call` d'Allo porte `transcript` en ligne (vérifié sur
    // l'OpenAPI publique) — mais AUCUN endpoint `GET /calls/{id}` n'y est
    // documenté. Plutôt que d'en deviner un, on relit `/calls` (le SEUL
    // endpoint confirmé) et on prend le tour de parole de CET appel — un appel
    // réseau de plus par appel journalisé, le prix de ne rien inventer.
    try {
      const params = new URLSearchParams({ allo_number: access.alloNumber, size: String(PAGE_SIZE) })
      const res = await fetch(`${ALLO_BASE}/calls?${params.toString()}`, {
        headers: { Authorization: access.apiKey, Accept: 'application/json' },
      })
      if (!res.ok) return null
      const payload = (await res.json()) as { data?: { results?: unknown[] } }
      const rows = payload?.data?.results ?? []
      const match = rows.find(
        raw => raw && typeof raw === 'object' && (raw as Record<string, unknown>)['id'] === callId,
      )
      return match ? parseAlloTranscript(match) : null
    } catch (error) {
      logger.warn('Transcription Allo indisponible — l’appel est journalisé sans elle', {
        error: error instanceof Error ? error.message : String(error),
        callId,
      })
      return null
    }
  }
  if (access.provider !== 'aircall') return null
  try {
    const auth = Buffer.from(`${access.apiId}:${access.apiKey}`).toString('base64')
    const res = await fetch(`${AIRCALL_BASE}/calls/${encodeURIComponent(callId)}/transcription`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    return parseAircallTranscript(await res.json())
  } catch (error) {
    logger.warn('Transcription indisponible — l’appel est journalisé sans elle', {
      error: error instanceof Error ? error.message : String(error),
      callId,
    })
    return null
  }
}

/** Les identifiants répondent-ils ? Une liste vide reste une réponse valable :
 *  le fournisseur a répondu, il n'a simplement rien à dire. */
export async function probe(access: TelephonyAccess): Promise<boolean> {
  try {
    await listCalls(access, new Date(Date.now() - 86_400_000), 1)
    return true
  } catch (error) {
    logger.warn(`Telephony reachability probe failed: ${(error as Error).message}`)
    return false
  }
}
