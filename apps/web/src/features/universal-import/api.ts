import type {
  ContextPackHistoryItem,
  ContextPackOriginalUrl,
  ContextPackRecordRequest,
  UniversalImportJobState,
  UniversalImportMapping,
  UniversalImportPreview,
  UniversalImportReasonCount,
  UniversalImportScope,
  UniversalImportSheetPlan,
  UniversalImportVerification,
  PersonalContact,
  PersonalContactShare,
  UniversalImportType,
} from '@bellum/contracts'
import { UNIVERSAL_IMPORT_PART_BYTES } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { partCountOf } from './lib/file-parts'

const BASE = '/import/universal/jobs'

/**
 * Ouvre le job, puis envoie les parts UNE par UNE, dans l'ordre (le serveur
 * refuse une part sautée). `onPart` dit l'avancée de l'envoi — distincte de
 * celle de l'écriture, qui arrive ensuite par Socket.IO.
 */
export async function uploadUniversalImport(
  file: File,
  type: UniversalImportType,
  accountId: string | null,
  onPart: (sent: number, total: number) => void,
  options: { scope?: UniversalImportScope; sourceSystem?: string } = {},
): Promise<UniversalImportJobState> {
  const parts = partCountOf(file.size)
  const { scope, sourceSystem } = options
  let job = await apiFetch<UniversalImportJobState>({
    path: BASE,
    method: 'POST',
    // #4052.2 — le CRM d'origine borne les références source ; absent = « fichier ».
    body: {
      type,
      filename: file.name,
      parts,
      accountId,
      ...(scope ? { scope } : {}),
      ...(sourceSystem ? { sourceSystem } : {}),
    },
  })
  for (let index = 0; index < parts; index += 1) {
    // #3666.9 (Louis 15/10/2026, incident du 05/10) — la part part DIRECTEMENT vers le stockage
    // (URL signée) : l'octet ne transite jamais par l'API, qui ne fait que signer puis confirmer.
    const ticket = await apiFetch<{ uploadUrl: string; path: string; token: string }>({
      path: `${BASE}/${job.id}/parts/${index}/upload-url`,
      method: 'POST',
    })
    const slice = file.slice(index * UNIVERSAL_IMPORT_PART_BYTES, (index + 1) * UNIVERSAL_IMPORT_PART_BYTES)
    const sent = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: slice,
      headers: { 'content-type': 'application/octet-stream' },
    })
    // 409 : la part est DÉJÀ déposée (un renvoi) — la confirmation relit sa taille dans le stockage.
    if (!sent.ok && sent.status !== 409) throw new Error(`Envoi de la part ${index + 1} refusé (${sent.status}).`)
    job = await apiFetch<UniversalImportJobState>({
      path: `${BASE}/${job.id}/parts/${index}/uploaded`,
      method: 'POST',
      idempotent: true,
    })
    onPart(index + 1, parts)
  }
  return job
}

// #4426.4 — `sheet` : l'onglet que l'humain vient de choisir dans un classeur ; absent = le choix automatique.
export const previewUniversalImport = (jobId: string, sheet?: string) =>
  apiFetch<UniversalImportPreview>({
    path: `${BASE}/${jobId}/preview`,
    method: 'POST',
    ...(sheet ? { body: { sheet } } : {}),
  })

/**
 * Théo B c4 — ce que l'écran « Organiser l'arrivée » ajoute au lancement : `skipLines` (lignes que l'humain a décidé de
 * ne PAS importer à la vérification), qui voit les contacts, le CRM d'origine. Tout est facultatif.
 */
type UniversalArrival = {
  skipLines?: readonly number[]
  scope?: UniversalImportScope
  sourceSystem?: string | null
  /** #5223 — plusieurs feuilles d'un classeur, chacune avec SA correspondance de colonnes. */
  sheets?: readonly UniversalImportSheetPlan[]
}

const arrivalBody = (arrival: UniversalArrival) => ({
  ...(arrival.skipLines && arrival.skipLines.length > 0 ? { skipLines: [...arrival.skipLines] } : {}),
  ...(arrival.scope ? { scope: arrival.scope } : {}),
  ...(arrival.sourceSystem ? { sourceSystem: arrival.sourceSystem } : {}),
  ...(arrival.sheets && arrival.sheets.length > 0 ? { sheets: [...arrival.sheets] } : {}),
})

export const startUniversalImport = (
  jobId: string,
  mapping: UniversalImportMapping,
  sheet?: string | null,
  arrival: UniversalArrival = {},
) =>
  apiFetch<UniversalImportJobState>({
    path: `${BASE}/${jobId}/start`,
    method: 'POST',
    body: { mapping, ...(sheet ? { sheet } : {}), ...arrivalBody(arrival) },
  })

/** Théo B c4.R3 — la vérification AVANT d'importer : le plan du fichier ligne à ligne, rien n'est écrit. */
export const verifyUniversalImport = (
  jobId: string,
  mapping: UniversalImportMapping,
  sheet?: string | null,
  arrival: Pick<UniversalArrival, 'scope' | 'sourceSystem' | 'sheets'> = {},
) =>
  apiFetch<UniversalImportVerification>({
    path: `${BASE}/${jobId}/verify`,
    method: 'POST',
    body: { mapping, ...(sheet ? { sheet } : {}), ...arrivalBody(arrival) },
  })

export const resumeUniversalImport = (jobId: string) =>
  apiFetch<UniversalImportJobState>({ path: `${BASE}/${jobId}/resume`, method: 'POST' })

/** #4051.10 — une ligne d'historique : l'état du job + QUAND il a été déposé. */
export type UniversalImportHistoryItem = UniversalImportJobState & {
  createdAt: string
  /** MEYER-IMPORT M.2 — les écartés et à rapprocher, comptés par raison. */
  reasons: UniversalImportReasonCount[]
  /** #4422.1 — l'envoi est resté « en cours » au-delà du délai : interrompu (la ligne reste). */
  interrupted?: boolean
  /** #4597.3 — les fiches nées de CET import (contacts / comptes), pour « voir les N ». Absent = pas de lien. */
  linked?: { contacts?: number; accounts?: number }
}

export const fetchUniversalImportHistory = () => apiFetch<UniversalImportHistoryItem[]>({ path: BASE })

export const fetchUniversalImport = (jobId: string) => apiFetch<UniversalImportJobState>({ path: `${BASE}/${jobId}` })

export const fetchUniversalImportReport = (jobId: string) =>
  apiFetch<string>({ path: `${BASE}/${jobId}/report.csv`, responseType: 'text' })

/** #2927 — « Partager avec l'équipe » : le contact personnel entre dans les contacts d'équipe (archive côté API). */
export const sharePersonalContact = (personalContactId: string) =>
  apiFetch<PersonalContactShare>({
    path: `/import/universal/personal-contacts/${personalContactId}/share`,
    method: 'POST',
  })

/** #2927 — « Mes contacts personnels » d'un compte : ceux que l'utilisateur a importés en portée Personnel. */
export const fetchPersonalContacts = (accountId?: string) =>
  apiFetch<PersonalContact[]>({
    path: accountId ? `/import/universal/personal-contacts/${accountId}` : '/import/universal/personal-contacts',
  })

/** #4422.1 — l'historique des imports de l'assistant « Dépose tes documents » (hors comptes, déjà des jobs). */
export const fetchContextPackHistory = () =>
  apiFetch<ContextPackHistoryItem[]>({ path: '/import/context-pack/history' })

export const recordContextPackImport = (body: ContextPackRecordRequest) =>
  apiFetch<void, ContextPackRecordRequest>({ path: '/import/context-pack/history', method: 'POST', body })

/** #4573 — l'URL signée (durée courte, celle des CV) de l'ORIGINAL d'un import de pack ; 404 sans original conservé. */
export const fetchContextPackOriginalUrl = (importId: string) =>
  apiFetch<ContextPackOriginalUrl>({ path: `/import/context-pack/history/${importId}/original-url` })

/** #AM.9 — valider d'un clic les sociétés « à valider » d'un lot, sans refaire l'import. */
export const validateImportCompanies = (jobId: string) =>
  apiFetch<{ created: number; alreadyThere: number }>({ path: `${BASE}/${jobId}/validate-companies`, method: 'POST' })
