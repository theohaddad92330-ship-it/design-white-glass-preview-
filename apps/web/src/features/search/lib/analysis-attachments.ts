import { unzipSync } from 'fflate'
import {
  validateRagUpload,
  RAG_UPLOAD_ANALYSIS_EXTENSIONS,
  RAG_UPLOAD_DOCUMENT_EXTENSIONS,
  ragUploadExtension,
} from '@bellum/contracts'

/**
 * #3623 — LES DOCUMENTS JOINTS À UNE ANALYSE, règles pures (aucun réseau).
 *
 * Louis (05/10) : « dans une analyse je veux pouvoir insérer des CSV, des ZIP et
 * tout type de fichiers, en mode importer une base documentaire ». Le trombone de
 * /search n'envoyait que le NOM du fichier ; il ingère maintenant son CONTENU dans la
 * base documentaire, par le même chemin que Connaissances (`POST /rag-documents/ingest`,
 * `/ingest/zip`), puis le rattache au compte analysé.
 *
 * Les formats et le plafond d'un fichier vivent dans `@bellum/contracts`
 * (`rag-upload-formats.ts`, GA-26) : un format que le serveur ne sait pas lire est
 * REFUSÉ ici avec sa raison, jamais envoyé pour échouer, jamais avalé en silence.
 */

/** Un lot raisonnable de pièces d'une analyse — le pack d'un client en compte sept. */
export const ANALYSIS_ATTACHMENTS_MAX = 10

/** La catégorie de la base documentaire sous laquelle une pièce d'analyse est rangée. */
export const ANALYSIS_ATTACHMENT_CATEGORY = 'Autre'

/** Le sélecteur de fichiers : les extensions du contrat, jamais une liste recopiée. */
export const ANALYSIS_ATTACHMENT_ACCEPT = RAG_UPLOAD_ANALYSIS_EXTENSIONS.map(ext => `.${ext}`).join(',')

export type AttachmentKind = 'zip' | 'text' | 'binary'

export type AttachmentRefusal =
  | 'unsupported'
  | 'too_large'
  | 'empty'
  | 'too_many'
  | 'duplicate'
  // #3623.1a — un .zip accepté sur sa seule extension, puis illisible au lancement : refusé NOMMÉ
  // dès l'ajout, jamais après coup. `unreadable_archive` = l'archive ne s'ouvre pas, ou n'a aucune
  // entrée réelle ; `no_readable_entry` = elle s'ouvre mais ne contient aucun format que l'analyse lit.
  | 'unreadable_archive'
  | 'no_readable_entry'

type AttachmentPlan = {
  accepted: { file: File; kind: AttachmentKind }[]
  refused: { name: string; reason: AttachmentRefusal }[]
}

/** Quels fichiers partent, lesquels sont refusés et POURQUOI. `existing` : déjà dans la liste. */
export function planAttachments(
  files: readonly File[],
  existing: readonly { name: string; size: number }[],
): AttachmentPlan {
  const accepted: AttachmentPlan['accepted'] = []
  const refused: AttachmentPlan['refused'] = []
  const seen = new Set(existing.map(e => `${e.name}:${e.size}`))
  let count = existing.length
  for (const file of files) {
    const verdict = validateRagUpload(file, RAG_UPLOAD_ANALYSIS_EXTENSIONS)
    if (!verdict.ok) {
      refused.push({ name: file.name, reason: verdict.reason })
      continue
    }
    const key = `${file.name}:${file.size}`
    if (seen.has(key)) {
      refused.push({ name: file.name, reason: 'duplicate' })
      continue
    }
    if (count >= ANALYSIS_ATTACHMENTS_MAX) {
      refused.push({ name: file.name, reason: 'too_many' })
      continue
    }
    seen.add(key)
    count += 1
    accepted.push({ file, kind: ragUploadExtension(file.name) === 'zip' ? 'zip' : verdict.isText ? 'text' : 'binary' })
  }
  return { accepted, refused }
}

const ZIP_NOISE_PATTERN = /\/$|^__MACOSX\/|\.ds_store$/i

/** Une entrée réelle d'archive — ni dossier, ni bruit système (même filtre que le serveur, `rag-zip-ingest.service.ts`). */
function isRealZipEntry(name: string): boolean {
  return !ZIP_NOISE_PATTERN.test(name)
}

/**
 * #3623.1a — le verdict d'un .zip AVANT envoi : son extension seule ne dit rien de son contenu.
 * Lit uniquement la table des entrées (le `filter` de `unzipSync` n'y décompresse rien) : pas de
 * coût proportionnel à la taille de l'archive, juste sa structure.
 */
export async function validateZipAttachment(file: File): Promise<AttachmentRefusal | null> {
  const names = await readZipEntryNames(file)
  if (names === null) return 'unreadable_archive'
  if (names.length === 0) return 'unreadable_archive'
  const readable = names.some(name =>
    (RAG_UPLOAD_DOCUMENT_EXTENSIONS as readonly string[]).includes(ragUploadExtension(name)),
  )
  return readable ? null : 'no_readable_entry'
}

/**
 * #4294.1 — les entrées RÉELLES d'une archive (ni dossier, ni bruit système), pour NOMMER chaque pièce avant son
 * envoi. `null` = archive illisible. Même lecture de la table des entrées que `validateZipAttachment`.
 */
export async function readZipEntryNames(file: File): Promise<string[] | null> {
  const names: string[] = []
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    unzipSync(bytes, {
      filter(entry) {
        names.push(entry.name)
        return false
      },
    })
  } catch {
    return null
  }
  return names.filter(isRealZipEntry)
}
