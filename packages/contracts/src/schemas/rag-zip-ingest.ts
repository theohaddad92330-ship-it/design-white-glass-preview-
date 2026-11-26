import { z } from 'zod'
import { ragAccountIdSchema, ragDocumentScopeSchema, refineRagScopeTarget } from './rag.js'

/**
 * #2667.1 — retour Louis (20/09/2026) : « en pièces jointes on doit aussi
 * pouvoir donner des archives zip et tout ». Décision (QCM du 21/09) : le
 * .zip est déplié CÔTÉ SERVEUR, ses entrées lisibles deviennent des pièces
 * jointes — chaque entrée traverse le MÊME pipeline qu'un dépôt unitaire
 * (`RagController.ingest` → `IaClient.ragIngest`), rien n'est recodé.
 *
 * ── Les plafonds, et pourquoi ils sont ICI (purs, sans zip ni réseau) ─────
 *
 * `validateRagZipEntries` refuse l'archive ENTIÈRE, avant toute ingestion,
 * sur l'un de quatre motifs — jamais un échec muet, jamais une ingestion
 * partielle sur un cas hostile ou démesuré :
 *  - trop d'entrées (`too_many_entries`) ;
 *  - trop lourde une fois décompressée, mesurée sur l'EN-TÊTE ZIP
 *    (`entry.header.size`), donc SANS décompresser d'abord — défense contre
 *    une bombe zip (`too_large`) ;
 *  - un chemin qui sort de l'archive, `..` ou absolu (`path_escapes_archive`,
 *    « zip slip ») ;
 *  - une archive imbriquée (`nested_archive`).
 *
 * Un fichier illisible DEDANS une archive par ailleurs saine, lui, n'arrête
 * pas les autres — c'est `RagZipIngestService` (apps/api) qui le décide,
 * après ce contrôle : chaque entrée peut individuellement échouer sans faire
 * échouer le lot (même principe que `CvBatchImportService.importZip`,
 * #2569.1, dont ce module reprend la forme).
 */

/** Échelle volontairement PETITE (l'import de CV n'a plus de plafond en nombre,
 *  Louis 06/10/2026) : une question posée à Laura porte quelques pièces jointes, jamais
 *  un lot d'import. */
export const RAG_ZIP_MAX_ENTRIES = 20

/** Cumul des tailles DÉCOMPRESSÉES des entrées retenues. 5× `ATTACH_MAX_BYTES`
 *  (8 Mo, un seul fichier — apps/web/src/features/chat/view/Chat.tsx) : une
 *  archive reste un LOT de pièces jointes, jamais un dépôt massif détourné. */
export const RAG_ZIP_MAX_DECOMPRESSED_BYTES = 40_000_000

/** `encrypted` — #2431.8 : bit 0 des drapeaux de l'en-tête ZIP (entrée
 *  protégée par mot de passe). Absent = non chiffrée. */
export type RagZipEntryRef = { name: string; decompressedSize: number; encrypted?: boolean }

export type RagZipCapRefusal =
  | { code: 'too_many_entries'; count: number; max: number }
  | { code: 'too_large'; totalBytes: number; maxBytes: number }
  | { code: 'path_escapes_archive'; file: string }
  | { code: 'nested_archive'; file: string }
  | { code: 'executable_or_macro'; file: string }
  | { code: 'encrypted_entry'; file: string }

/**
 * #2431.8 — les extensions qui s'EXÉCUTENT (binaires, scripts, paquets) et les
 * formats Office qui portent des MACROS (`*m`, compléments `*am`). Aucune n'est
 * lisible par `document_text.py` ; leur présence dans une archive déposée au
 * chat est un signal hostile, pas un oubli : l'archive entière est refusée,
 * comme une archive imbriquée, AVANT toute extraction — rien n'est jamais
 * exécuté, rien n'est indexé.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'com',
  'scr',
  'msi',
  'msp',
  'bat',
  'cmd',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'cpl',
  'lnk',
  'reg',
  'sh',
  'bash',
  'zsh',
  'command',
  'app',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'apk',
  'jar',
  'bin',
  'elf',
  'so',
  'dylib',
  'py',
  'pl',
  'rb',
  'php',
])
const MACRO_OFFICE_EXTENSIONS = new Set([
  'docm',
  'dotm',
  'xlsm',
  'xltm',
  'xlsb',
  'xlam',
  'pptm',
  'potm',
  'ppam',
  'ppsm',
  'sldm',
])

export function isExecutableOrMacro(name: string): boolean {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return false
  const ext = match[1].toLowerCase()
  return EXECUTABLE_EXTENSIONS.has(ext) || MACRO_OFFICE_EXTENSIONS.has(ext)
}

/** Un chemin qui SORT de l'archive une fois « déplié » (`..`), ou un chemin
 *  absolu (Unix `/…`, Windows `C:\…`) — jamais suivi, quelle que soit la
 *  plateforme qui a produit l'archive. */
export function isPathEscapingArchive(name: string): boolean {
  if (name.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(name)) return true
  return name.split(/[\\/]/).some(segment => segment === '..')
}

/** Une entrée qui est elle-même une archive — refusée plutôt que dépliée à
 *  son tour (pas de dépliage récursif, pas de bombe zip imbriquée). */
export function isNestedArchive(name: string): boolean {
  return /\.zip$/i.test(name.trim())
}

/**
 * La décision PURE : refuse l'archive entière au premier motif rencontré, ou
 * `null` — tout est sous les plafonds, aucune entrée hostile.
 */
export function validateRagZipEntries(entries: readonly RagZipEntryRef[]): RagZipCapRefusal | null {
  if (entries.length > RAG_ZIP_MAX_ENTRIES) {
    return { code: 'too_many_entries', count: entries.length, max: RAG_ZIP_MAX_ENTRIES }
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.decompressedSize, 0)
  if (totalBytes > RAG_ZIP_MAX_DECOMPRESSED_BYTES) {
    return { code: 'too_large', totalBytes, maxBytes: RAG_ZIP_MAX_DECOMPRESSED_BYTES }
  }
  for (const entry of entries) {
    if (isPathEscapingArchive(entry.name)) return { code: 'path_escapes_archive', file: entry.name }
    if (isNestedArchive(entry.name)) return { code: 'nested_archive', file: entry.name }
    if (isExecutableOrMacro(entry.name)) return { code: 'executable_or_macro', file: entry.name }
    if (entry.encrypted) return { code: 'encrypted_entry', file: entry.name }
  }
  return null
}

/** Ce qu'un dépôt d'archive demande au serveur — même forme que
 *  `ragIngestSchema` (ia-proxy.dto.ts), `fileB64`/`filename` obligatoires. */
export const ragZipIngestInputSchema = z
  .object({
    fileB64: z.string().min(1).max(12_000_000),
    filename: z.string().min(1).max(255),
    category: z.string().optional(),
    scope: ragDocumentScopeSchema.optional(),
    conversationId: z.string().min(1).max(200).optional(),
    // #2779 — le compte visé quand `scope = 'account'`.
    accountId: ragAccountIdSchema.optional(),
  })
  .strict()
  .superRefine(refineRagScopeTarget)
export type RagZipIngestInput = z.infer<typeof ragZipIngestInputSchema>

/** Le message qui DIT pourquoi — jamais un « refusé » générique. Chaque
 *  branche nomme le chiffre mesuré et le plafond, ou le fichier en cause. */
export function ragZipCapRefusalMessage(refusal: RagZipCapRefusal): string {
  switch (refusal.code) {
    case 'too_many_entries':
      return `Archive trop grande : ${refusal.count} fichiers, ${refusal.max} au plus par archive.`
    case 'too_large': {
      const totalMb = (refusal.totalBytes / 1_000_000).toFixed(1)
      const maxMb = Math.round(refusal.maxBytes / 1_000_000)
      return `Archive trop lourde une fois décompressée : ${totalMb} Mo, ${maxMb} Mo au plus.`
    }
    case 'path_escapes_archive':
      return `Entrée refusée — son chemin sort de l'archive : « ${refusal.file} ».`
    case 'nested_archive':
      return `Entrée refusée — une archive dans l'archive n'est pas dépliée : « ${refusal.file} ».`
    case 'executable_or_macro':
      return `Archive refusée — elle contient un exécutable ou un document à macros, jamais ouvert : « ${refusal.file} ».`
    case 'encrypted_entry':
      return `Archive refusée — « ${refusal.file} » est protégé par mot de passe et ne peut pas être lu. Dépose-le sans protection.`
    default: {
      const exhaustive: never = refusal
      throw new Error(`Unknown RagZipCapRefusal code: ${String((exhaustive as RagZipCapRefusal).code)}`)
    }
  }
}

/** Le sort d'UNE entrée : ingérée (même `id`/`partial` qu'un dépôt unitaire),
 *  ou en échec AVEC sa raison — jamais un échec muet. */
export type RagZipEntryOutcome =
  | { status: 'ingested'; file: string; id: string; partial: boolean }
  | { status: 'failed'; file: string; reason: string }
  // #2431.7 / #2431.13 — même contenu (sha256) qu'une entrée précédente de la
  // MÊME archive : pas ingérée deux fois, et NOMMÉE avec l'entrée qu'elle double.
  | { status: 'duplicate'; file: string; duplicateOf: string }
  // #2431.7 (reste) — même contenu qu'un document DÉJÀ EN BASE (pas dans cette
  // archive) : détecté côté service IA (`content_hash`, `rag_service.ingest`),
  // pas ingéré une seconde fois. Système différent du `duplicate` ci-dessus —
  // `existingId` est l'identifiant du document déjà en base, jamais un nom de
  // fichier de CETTE archive.
  | { status: 'duplicate_existing'; file: string; existingId: string }

export type RagZipIngestReport = {
  total: number
  outcomes: RagZipEntryOutcome[]
}

/**
 * #3623.11 / #3666.10 — `POST ingest/zip` ne dépaquette plus dans la requête
 * (incident API du 05/10/2026) : il met l'archive en file et rend un
 * identifiant. L'état se LIT ensuite, avec le vocabulaire unique des
 * opérations longues (#3666.3 : en attente / en cours / terminée / partielle /
 * interrompue). `unknown` : l'identifiant n'existe pas dans cet espace — jamais
 * un statut deviné.
 */
export type RagZipIngestJobState = 'pending' | 'running' | 'completed' | 'partial' | 'interrupted' | 'unknown'

export type RagZipIngestJobStart = { jobId: string; status: 'pending' | 'running' }

export type RagZipIngestJobStatus = {
  jobId: string
  status: RagZipIngestJobState
  /** Entrées déjà traitées / total connu — jamais un pourcentage inventé. */
  progress?: { processed: number; total: number | null }
  /** Présent seulement à `completed` / `partial`. */
  report?: RagZipIngestReport
  /** Présent seulement à `interrupted` : la raison NOMMÉE du refus ou de l'échec. */
  reason?: string
}

/** Une archive dont au moins une entrée est en échec est `partial`, jamais `completed`. */
export function ragZipReportStatus(report: RagZipIngestReport): 'completed' | 'partial' {
  return report.outcomes.some(outcome => outcome.status === 'failed') ? 'partial' : 'completed'
}
