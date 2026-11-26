import type { RagDocumentScope, RagZipIngestReport } from '@bellum/contracts'
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/lib/api-error'
import { ragApi, type IngestInput } from '@/features/rag/api'
import {
  ANALYSIS_ATTACHMENT_CATEGORY,
  planAttachments,
  readZipEntryNames,
  validateZipAttachment,
  type AttachmentKind,
  type AttachmentRefusal,
} from '../lib/analysis-attachments'

/**
 * #3623 — les documents joints à UNE analyse, de la sélection au rattachement.
 *
 * Le parcours (chaque étape est un appel réel, aucune n'est simulée) :
 *  1. `addFiles` — le contrôle AVANT envoi (format, taille, doublon, nombre) ; un refus a sa raison ;
 *  2. `sendAll` — AVANT le lancement : chaque fichier est ingéré dans la base documentaire (le texte est
 *     lu en UTF-8, le reste part en base64 pour extraction serveur, un .zip est déplié serveur) ;
 *  3. `bindToAccount` — dès que le compte existe, les documents NOUVEAUX passent de `personal` à `account`.
 *
 * Pourquoi `personal` d'abord : le compte d'une entreprise jamais analysée n'existe qu'au lancement, et
 * l'analyse lit la base dès sa première phase. Un document `personal` est lisible par son auteur — donc par
 * son analyse — dès l'envoi ; le rattachement au compte ne fait que le RESTREINDRE à ce compte (il ne
 * nourrit plus les autres analyses). Un document déjà en base (doublon) n'est JAMAIS déplacé : il garde sa
 * portée, et c'est dit.
 */

type AttachmentPhase = 'ready' | 'sending' | 'done' | 'error'

/** #4294.1 — le sort d'UNE pièce d'une archive : attendue, lue (ou déjà en base), ou non lue AVEC sa raison. */
export type AttachmentPiece = {
  name: string
  fate: 'pending' | 'read' | 'duplicate' | 'failed'
  reason?: string
}

export type AnalysisAttachment = {
  key: string
  file: File
  kind: AttachmentKind
  phase: AttachmentPhase
  /** Pourquoi une pièce est en erreur — ou partielle (une entrée d'archive refusée). */
  reason?: string
  /** Les documents NOUVEAUX créés par ce fichier (à rattacher au compte). */
  newDocumentIds: string[]
  /** Documents lus : 1 pour un fichier, le nombre d'entrées lues pour une archive. */
  readCount: number
  bound: boolean
  /** #4294.1 — les pièces d'une ARCHIVE, une ligne chacune ; absent pour un fichier simple. */
  pieces?: AttachmentPiece[]
}

export type AttachmentRefusalNotice = { name: string; reason: AttachmentRefusal }

type SendTarget = { accountId?: string | undefined }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // On retire le préfixe « data:<mime>;base64, » : l'API veut le base64 brut.
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function reasonOf(err: unknown, fallback: string): string {
  // La raison de l'API (garde « carnet d'adresses », format illisible…) quand c'est un refus 4xx.
  if (err instanceof ApiError && err.status < 500 && err.message) return err.message
  return fallback
}

type SendResult = Pick<AnalysisAttachment, 'newDocumentIds' | 'readCount' | 'reason' | 'pieces'> & { failed: boolean }

function summarizeZip(report: RagZipIngestReport, fallbackReason: string): SendResult {
  const newDocumentIds: string[] = []
  let read = 0
  const problems: string[] = []
  const pieces: AttachmentPiece[] = []
  for (const outcome of report.outcomes) {
    if (outcome.status === 'ingested') {
      newDocumentIds.push(outcome.id)
      read += 1
      pieces.push({ name: outcome.file, fate: 'read' })
    } else if (outcome.status === 'failed') {
      problems.push(`${outcome.file} — ${outcome.reason}`)
      pieces.push({ name: outcome.file, fate: 'failed', reason: outcome.reason || fallbackReason })
    } else {
      read += 1 // un doublon est LU : son contenu est déjà dans la base
      pieces.push({ name: outcome.file, fate: 'duplicate' })
    }
  }
  const reason = problems.length > 0 ? problems.join(' ; ') : undefined
  if (read === 0) return { newDocumentIds, readCount: 0, reason: reason ?? fallbackReason, pieces, failed: true }
  return { newDocumentIds, readCount: read, ...(reason ? { reason } : {}), pieces, failed: false }
}

export function useAnalysisAttachments(labels: { sendFailed: string }) {
  const [entries, setEntries] = useState<AnalysisAttachment[]>([])
  const [refusals, setRefusals] = useState<AttachmentRefusalNotice[]>([])
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const counter = useRef(0)
  /** Les documents NOUVEAUX envoyés en `personal`, que le lancement fera rattacher au compte côté serveur. */
  const sentPersonalIds = useRef<Set<string>>(new Set())

  const patch = useCallback((key: string, changes: Partial<AnalysisAttachment>) => {
    setEntries(current => current.map(e => (e.key === key ? { ...e, ...changes } : e)))
  }, [])

  /**
   * #3623.1a — un .zip se juge sur son CONTENU, pas sur son extension : lisible, non vide, au moins
   * une entrée d'un format que l'analyse lit. Le refus se nomme ICI, à l'ajout — jamais après le
   * lancement, où la pièce aurait déjà coûté un crédit pour ne rien livrer.
   */
  const addFiles = useCallback(async (files: readonly File[]) => {
    const plan = planAttachments(
      files,
      entriesRef.current.map(e => ({ name: e.file.name, size: e.file.size })),
    )
    const refused = [...plan.refused]
    const accepted: ((typeof plan.accepted)[number] & { pieces?: AttachmentPiece[] })[] = []
    for (const item of plan.accepted) {
      if (item.kind === 'zip') {
        const reason = await validateZipAttachment(item.file)
        if (reason) {
          refused.push({ name: item.file.name, reason })
          continue
        }
        // #4294.1 — chaque pièce de l'archive est nommée dès l'ajout, avant que son sort soit connu.
        const names = (await readZipEntryNames(item.file)) ?? []
        accepted.push({ ...item, pieces: names.map(name => ({ name, fate: 'pending' as const })) })
        continue
      }
      accepted.push(item)
    }
    setRefusals(refused)
    if (accepted.length === 0) return
    setEntries(current => [
      ...current,
      ...accepted.map(({ file, kind, pieces }) => {
        counter.current += 1
        return {
          key: `${counter.current}:${file.name}`,
          file,
          kind,
          phase: 'ready' as const,
          newDocumentIds: [],
          readCount: 0,
          bound: false,
          ...(pieces && pieces.length > 0 ? { pieces } : {}),
        }
      }),
    ])
  }, [])

  const remove = useCallback((key: string) => {
    const gone = entriesRef.current.find(e => e.key === key)
    for (const id of gone?.newDocumentIds ?? []) sentPersonalIds.current.delete(id)
    setEntries(current => current.filter(e => e.key !== key))
    setRefusals([])
  }, [])

  const reset = useCallback(() => {
    sentPersonalIds.current = new Set()
    setEntries([])
    setRefusals([])
  }, [])

  /** Ingère ce qui n'est pas encore envoyé. `true` quand plus aucune pièce n'est en échec. */
  const sendAll = useCallback(
    async ({ accountId }: SendTarget = {}): Promise<boolean> => {
      const scope: RagDocumentScope = accountId ? 'account' : 'personal'
      const placement = accountId ? { scope, accountId } : { scope }
      let allSent = true
      for (const entry of entriesRef.current.filter(e => e.phase === 'ready' || e.phase === 'error')) {
        patch(entry.key, { phase: 'sending' })
        try {
          let result: SendResult
          if (entry.kind === 'zip') {
            const report = await ragApi.ingestZip({
              fileB64: await fileToBase64(entry.file),
              filename: entry.file.name,
              category: ANALYSIS_ATTACHMENT_CATEGORY,
              ...placement,
            })
            result = summarizeZip(report, labels.sendFailed)
          } else {
            const base: IngestInput = { title: entry.file.name, category: ANALYSIS_ATTACHMENT_CATEGORY, ...placement }
            const input: IngestInput =
              entry.kind === 'text'
                ? { ...base, content: await entry.file.text(), filename: entry.file.name } // #3803.2 — le nom voyage
                : { ...base, fileB64: await fileToBase64(entry.file), filename: entry.file.name }
            const res = await ragApi.ingest(input)
            result = {
              newDocumentIds: res.id && !res.duplicate ? [res.id] : [],
              readCount: 1,
              ...(res.partial ? { reason: labels.sendFailed } : {}),
              failed: false,
            }
          }
          if (result.failed) {
            allSent = false
            patch(entry.key, {
              phase: 'error',
              reason: result.reason ?? labels.sendFailed,
              ...(result.pieces ? { pieces: result.pieces } : {}),
            })
          } else {
            if (!accountId) for (const id of result.newDocumentIds) sentPersonalIds.current.add(id)
            patch(entry.key, {
              phase: 'done',
              newDocumentIds: result.newDocumentIds,
              readCount: result.readCount,
              ...(result.reason ? { reason: result.reason } : {}),
              ...(result.pieces ? { pieces: result.pieces } : {}),
              // Posé directement au compte : rien à rattacher ensuite.
              bound: Boolean(accountId),
            })
          }
        } catch (err) {
          allSent = false
          patch(entry.key, { phase: 'error', reason: reasonOf(err, labels.sendFailed) })
        }
      }
      return allSent
    },
    [patch, labels.sendFailed],
  )

  /** Rattache au compte les documents envoyés avant qu'il existe. `true` quand tout est rattaché. */
  const bindToAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      let allBound = true
      for (const entry of entriesRef.current.filter(e => e.phase === 'done' && !e.bound)) {
        try {
          for (const id of entry.newDocumentIds) await ragApi.updateScope(id, 'account', { accountId })
          patch(entry.key, { bound: true })
        } catch (err) {
          allBound = false
          patch(entry.key, { reason: reasonOf(err, labels.sendFailed) })
        }
      }
      return allBound
    },
    [patch, labels.sendFailed],
  )

  /** #3623 — ce que `/analysis/start` rattache au compte avant la mise en file (aucune fenêtre `personal`). */
  const personalDocumentIds = useCallback((): string[] => [...sentPersonalIds.current], [])

  return { entries, refusals, addFiles, remove, reset, sendAll, bindToAccount, personalDocumentIds }
}
