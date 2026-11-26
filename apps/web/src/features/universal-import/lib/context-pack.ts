import {
  CONTEXT_PACK_CLASSIFY_MAX_BYTES,
  CONTEXT_PACK_HEAD_BYTES,
  CONTEXT_PACK_ORIGINAL_MAX_BYTES,
  contextPackExtension,
  type ContextPackClassification,
  type ContextPackDestination,
  type ContextPackImportOutcome,
  type EsnTargetPersonasImportReport,
  type ImportSequenceLibraryResult,
} from '@bellum/contracts'
import { fileToBase64 } from '@/features/consultants/lib/fileToBase64'
import { esnProfileApi } from '@/features/profile/api'
import { qualificationGridApi } from '@/features/qualification-grid/lib/qualification-grid-api'
import { ragApi } from '@/features/rag/api'
import { apiFetch } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import { previewUniversalImport, recordContextPackImport, startUniversalImport, uploadUniversalImport } from '../api'

/**
 * import-contexte Je.3 — le pack de contexte côté client : CLASSER (une requête par fichier, le serveur décide),
 * puis, sur clic « Ajouter ces documents », APPELER l'importeur existant de la destination choisie. Aucun parsing ici : chaque
 * importeur reçoit exactement le corps que son propre écran lui envoie.
 */

/** Où voir ce qu'un import a pris — l'écran de chaque importeur. */
export const CONTEXT_PACK_LINKS: Record<ContextPackDestination, string> = {
  accounts: '/accounts',
  target_personas: '/settings/profile',
  qualification_grid: '/settings/workspace-rules?onglet=qualite',
  sequences: '/actions/sequences',
  knowledge: '/settings/knowledge',
}

/**
 * La tête du fichier pour classer : la première ligne d'un texte délimité (64 Ko), le classeur entier (archive,
 * répertoire central à la fin) s'il tient sous le plafond, rien pour un document — classé par son extension.
 */
async function headOf(file: File): Promise<string | undefined> {
  const ext = contextPackExtension(file.name)
  if (ext === 'csv' || ext === 'tsv') {
    return fileToBase64(new File([file.slice(0, CONTEXT_PACK_HEAD_BYTES)], file.name))
  }
  if (ext === 'xlsx' && file.size <= CONTEXT_PACK_CLASSIFY_MAX_BYTES) return fileToBase64(file)
  return undefined
}

export async function classifyContextFile(file: File): Promise<ContextPackClassification> {
  const headB64 = await headOf(file)
  return apiFetch<ContextPackClassification, { fileName: string; headB64?: string }>({
    path: '/import/context-pack/classify',
    method: 'POST',
    body: { fileName: file.name, ...(headB64 ? { headB64 } : {}) },
  })
}

const tabular = (file: File): 'csv' | 'xlsx' => (contextPackExtension(file.name) === 'xlsx' ? 'xlsx' : 'csv')
const tabularContent = async (file: File): Promise<string> =>
  tabular(file) === 'xlsx' ? fileToBase64(file) : file.text()

/** Les fichiers lus en clair par Connaissances ; le reste part en base64 pour extraction côté serveur. */
const KNOWLEDGE_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'tsv', 'json'])

type Taken = {
  count: number | null
  skipped: number
  skippedDetails?: { line: number; reason: string; label: string | null }[]
  scripts?: number
}

// #4426.4 — `sheet` : l'onglet que le classement a retenu dans un classeur multi-onglets (absent = le premier).
type Importer = (file: File, sheet: string | null) => Promise<Taken>

const IMPORTERS: Record<ContextPackDestination, Importer> = {
  // L'import universel : le job s'écrit en tâche de fond — le décompte arrive dans l'historique, jamais un 0 inventé.
  accounts: async (file, sheet) => {
    const job = await uploadUniversalImport(file, 'account', null, () => undefined)
    // #4426.4 — l'onglet retenu est transmis à l'import : le service universel lit CET onglet, pas le meilleur deviné.
    const preview = await previewUniversalImport(job.id, sheet ?? undefined)
    await startUniversalImport(job.id, preview.mapping, sheet)
    return { count: null, skipped: 0 }
  },
  target_personas: async (file, sheet) => {
    const report: EsnTargetPersonasImportReport = await esnProfileApi.importTargetPersonas({
      format: tabular(file),
      content: await tabularContent(file),
      ...(sheet ? { sheet } : {}),
    })
    // Colonnes obligatoires absentes : l'importeur a REFUSÉ le fichier, rien n'a été remplacé.
    if (report.missing_columns.length > 0) {
      throw new Error(`missing_columns:${report.missing_columns.join(',')}`)
    }
    return {
      count: report.imported,
      skipped: report.rejected.length,
      skippedDetails: report.rejected.map(row => ({ line: row.line, reason: row.reason, label: row.value ?? null })),
    }
  },
  qualification_grid: async (file, sheet) => {
    const grid = await qualificationGridApi.import({
      format: tabular(file),
      content: await tabularContent(file),
      ...(sheet ? { sheet } : {}),
    })
    return { count: grid.criteria.length, skipped: 0 }
  },
  sequences: async file => {
    // L'importeur de séquences choisit lui-même l'onglet qui porte une colonne corps (#4426.7).
    const result = await apiFetch<ImportSequenceLibraryResult, { filename: string; content_base64: string }>({
      path: '/outreach/sequence-templates/import',
      method: 'POST',
      body: { filename: file.name, content_base64: await fileToBase64(file) },
    })
    // #4426.7 — les scripts d'appel sont gardés (comptés), et chaque ligne écartée garde son motif.
    return {
      count: result.templates,
      skipped: result.skipped.length,
      skippedDetails: result.skipped.map(row => ({ line: row.line, reason: row.reason, label: row.campaign })),
      scripts: result.scripts,
      // #4426.7 — les mails sont dits : chacun est une étape de séquence de sa campagne.
      mails: result.steps,
    }
  },
  knowledge: async file => {
    const base = { title: file.name, category: 'Autre' }
    if (KNOWLEDGE_TEXT_EXTENSIONS.has(contextPackExtension(file.name))) {
      await ragApi.ingest({ ...base, content: await file.text(), filename: file.name }) // #3803.2 — le nom voyage
    } else {
      await ragApi.ingest({ ...base, fileB64: await fileToBase64(file), filename: file.name })
    }
    return { count: 1, skipped: 0 }
  },
}

/**
 * #4422.1 — chaque import de l'assistant écrit sa ligne d'historique avec son bilan. Les comptes passent par un job
 * universel : l'historique de /settings/import les liste déjà. Une ligne d'historique qui ne s'écrit pas ne fait
 * JAMAIS échouer l'import qui vient de réussir.
 */
async function recordOutcome(outcome: ContextPackImportOutcome, file: File): Promise<void> {
  if (outcome.destination === 'accounts') return
  try {
    await recordContextPackImport({
      // #4573 — l'ORIGINAL déposé part avec le bilan, au moment du dépôt (seau privé côté API). Un import échoué n'a
      // rien créé : il n'envoie rien. Au-delà du plafond, il ne voyage pas et la ligne le dira.
      ...(outcome.status === 'imported'
        ? file.size > CONTEXT_PACK_ORIGINAL_MAX_BYTES
          ? { originalTooBig: true }
          : { fileB64: await fileToBase64(file) }
        : {}),
      fileName: outcome.fileName,
      destination: outcome.destination,
      status: outcome.status === 'imported' ? 'done' : 'failed',
      imported: outcome.status === 'imported' ? outcome.count : null,
      skipped: outcome.status === 'imported' ? outcome.skipped : 0,
      scripts: outcome.status === 'imported' ? (outcome.scripts ?? null) : null,
      message: outcome.status === 'failed' ? outcome.message.slice(0, 500) : null,
    })
    await queryClient.invalidateQueries({ queryKey: ['universal-import', 'history'] })
  } catch {
    // L'historique est un confort : l'import, lui, a eu lieu.
  }
}

/** Un fichier, une destination : l'échec reste PAR FICHIER — l'appelant passe au suivant. */
export async function importContextFile(
  file: File,
  destination: ContextPackDestination,
  sheet: string | null = null,
): Promise<ContextPackImportOutcome> {
  let outcome: ContextPackImportOutcome
  try {
    const taken = await IMPORTERS[destination](file, sheet)
    outcome = { status: 'imported', fileName: file.name, destination, ...taken }
  } catch (caught) {
    const message = caught instanceof Error && caught.message ? caught.message : 'unknown'
    outcome = { status: 'failed', fileName: file.name, destination, message }
  }
  await recordOutcome(outcome, file)
  return outcome
}
