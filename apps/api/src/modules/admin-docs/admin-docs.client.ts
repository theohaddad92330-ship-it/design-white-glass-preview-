import type { AdminDocsProvider } from '@bellum/contracts'
import { Logger } from '@nestjs/common'

/**
 * Les appels aux outils administratifs.
 *
 * Deux fournisseurs ont un contrat public et vérifiable — Yousign v3 et Qonto
 * v2 — et sont branchés dessus. DocuSign et Tiime demandent un compte et une
 * application déclarée avant de montrer leur documentation : leur URL est donc
 * SURCHARGEABLE à la connexion, et la réponse est lue par la forme
 * (`admin-docs-normalize.ts`). Même règle que Kaspr et FullEnrich : on ne devine
 * pas, on accepte de ne rien trouver.
 *
 * Tout échec rend une liste vide et le DIT dans les logs. Une routine
 * hebdomadaire ne doit pas tomber parce qu'un outil de facturation est en
 * maintenance ; mais elle ne doit pas non plus annoncer « aucune facture en
 * retard » quand la vérité est « je n'ai pas pu regarder » — c'est pourquoi le
 * service distingue les deux, pas le client.
 */

const TIMEOUT_MS = 8000

const DEFAULT_BASE: Record<AdminDocsProvider, string> = {
  yousign: 'https://api.yousign.app/v3',
  docusign: 'https://demo.docusign.net/restapi/v2.1',
  qonto: 'https://thirdparty.qonto.com/v2',
  tiime: 'https://chart.tiime-apps.com/v1',
}

/** Le chemin de LISTE, par fournisseur et par nature. */
const PATHS: Record<AdminDocsProvider, { signatures?: string; signaturesDone?: string; invoices?: string }> = {
  // #4295.27 — `done` : la MÊME forme de filtre que `ongoing` (déjà lue), pour lire « signé » sur la liste de l'outil.
  yousign: { signatures: '/signature_requests?status=ongoing', signaturesDone: '/signature_requests?status=done' },
  docusign: { signatures: '/envelopes?status=sent' },
  qonto: { invoices: '/client_invoices?status=unpaid' },
  tiime: { invoices: '/invoices?status=unpaid' },
}

const logger = new Logger('AdminDocsClient')

export type AdminDocsAccess = {
  provider: AdminDocsProvider
  apiKey: string
  apiSecret?: string | null
  baseUrl?: string | null
}

/** L'en-tête d'authentification attendu par chaque fournisseur. */
function authHeaders(access: AdminDocsAccess): Record<string, string> {
  if (access.provider === 'qonto') {
    // Qonto attend `login:secret` dans `Authorization`, sans schéma.
    return { Authorization: access.apiSecret ? `${access.apiKey}:${access.apiSecret}` : access.apiKey }
  }
  return { Authorization: `Bearer ${access.apiKey}` }
}

/**
 * Un GET borné. Rend `null` sur TOUTE anomalie — l'appelant distingue « rien à
 * signaler » (liste vide) de « je n'ai pas pu regarder » (`null`).
 */
export async function fetchList(
  access: AdminDocsAccess,
  kind: 'signatures' | 'signaturesDone' | 'invoices',
): Promise<unknown | null> {
  const path = PATHS[access.provider][kind]
  if (!path) return null
  const base = (access.baseUrl || DEFAULT_BASE[access.provider]).replace(/\/+$/, '')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json', ...authHeaders(access) },
      signal: controller.signal,
    })
    if (!res.ok) {
      logger.warn(`Lecture ${kind} refusée par ${access.provider} : HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as unknown
  } catch (error) {
    logger.warn(`Lecture ${kind} impossible chez ${access.provider} : ${(error as Error).message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Envoie un document à signer.
 *
 * Yousign uniquement : c'est le seul des quatre dont le contrat d'envoi est
 * public. Le document N'EST PAS stocké chez nous — l'appelant fournit un
 * identifiant de document déjà déposé chez le fournisseur. Bellum déclenche une
 * signature ; il ne fabrique pas le document à signer, et il ne le conserve pas.
 */
export async function activateSignatureRequest(
  access: AdminDocsAccess,
  signatureRequestId: string,
): Promise<{ ok: boolean; detail: string }> {
  if (access.provider !== 'yousign') {
    return { ok: false, detail: 'L’envoi à signature n’est branché que sur un fournisseur pour l’instant.' }
  }
  const base = (access.baseUrl || DEFAULT_BASE.yousign).replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/signature_requests/${encodeURIComponent(signatureRequestId)}/activate`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...authHeaders(access) },
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, detail: text.slice(0, 400) || `HTTP ${res.status}` }
    return { ok: true, detail: 'Demande de signature envoyée.' }
  } catch (error) {
    return { ok: false, detail: (error as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
