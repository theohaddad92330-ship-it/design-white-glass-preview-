import { RAG_UPLOAD_ANALYSIS_EXTENSIONS, RAG_UPLOAD_DOCUMENT_EXTENSIONS, RAG_UPLOAD_MAX_BYTES } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { FileText, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AnalysisAttachment, AttachmentPiece, AttachmentRefusalNotice } from '../hooks/useAnalysisAttachments'
import { ANALYSIS_ATTACHMENTS_MAX } from '../lib/analysis-attachments'

/**
 * #3623 — la liste des documents joints à l'analyse, sous le composeur. C'est le seul endroit où le
 * trombone se lit : avant, un lien menait à Connaissances et rien ne disait ce qui était joint.
 * Même ligne (`Text xs` + bouton fantôme) que la rangée de réglages voisine — pas de carte de plus.
 */

type Props = {
  entries: AnalysisAttachment[]
  refusals: AttachmentRefusalNotice[]
  /** Salle de démonstration : rien ne part (le dépôt y est refusé côté serveur). */
  demo: boolean
  /** #3623.1c — le compte que « Rattachée à … » nomme une fois la pièce posée. */
  accountName: string
  onRemove: (key: string) => void
}

const FORMATS = RAG_UPLOAD_ANALYSIS_EXTENSIONS.join(', ')
// #3623.1a — une archive sans entrée lisible nomme les formats qu'elle PEUT contenir : jamais `zip`
// lui-même (une archive imbriquée n'est pas dépliée, ni côté client ni côté serveur).
const ARCHIVE_ENTRY_FORMATS = RAG_UPLOAD_DOCUMENT_EXTENSIONS.join(', ')
const MAX_MB = Math.round(RAG_UPLOAD_MAX_BYTES / 1_000_000)

export function AnalysisAttachmentsStrip({ entries, refusals, demo, accountName, onRemove }: Props) {
  const { t } = useTranslation('search')
  const statusOf = (entry: AnalysisAttachment): string => {
    if (demo) return t('attachments.phase.demo')
    switch (entry.phase) {
      case 'ready':
        return t('attachments.phase.ready')
      case 'sending':
        return t('attachments.phase.sending')
      case 'error':
        return t('attachments.phase.error', { reason: entry.reason ?? t('attachments.failedFallback') })
      case 'done':
        return [
          t('attachments.phase.done', { count: entry.readCount }),
          entry.bound ? t('attachments.phase.doneBound', { account: accountName }) : t('attachments.phase.doneUnbound'),
          ...(entry.reason ? [t('attachments.phase.partial', { reason: entry.reason })] : []),
        ].join(' · ')
    }
  }

  // #4294.1 — le sort d'UNE pièce d'archive ; la pièce non lue DIT pourquoi (jamais un « échec » muet).
  const fateOf = (piece: AttachmentPiece): string => {
    switch (piece.fate) {
      case 'pending':
        return t('attachments.piece.pending')
      case 'read':
        return t('attachments.piece.read')
      case 'duplicate':
        return t('attachments.piece.duplicate')
      case 'failed':
        return t('attachments.piece.failed', { reason: piece.reason ?? t('attachments.failedFallback') })
    }
  }

  return (
    <div className="mt-2 min-w-0 space-y-1 px-1">
      {entries.length > 0 ? (
        <ul aria-label={t('attachments.listLabel')} className="space-y-1">
          {entries.map(entry => (
            <li key={entry.key} className="flex min-w-0 items-center gap-2">
              {entry.phase === 'sending' ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <Text size="sm" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
                  {entry.file.name}
                </Text>
                <Text
                  size="xs"
                  className={
                    entry.phase === 'error' && !demo
                      ? 'text-[var(--danger-soft-text)]'
                      : 'text-[var(--bellum-text-secondary)]'
                  }
                >
                  {statusOf(entry)}
                </Text>
                {entry.pieces && entry.pieces.length > 0 ? (
                  <ul aria-label={t('attachments.piecesLabel', { name: entry.file.name })} className="mt-1 space-y-0.5">
                    {entry.pieces.map(piece => (
                      <li key={piece.name} className="flex min-w-0 flex-wrap gap-x-2">
                        <Text size="xs" className="truncate text-[var(--bellum-text-primary)]">
                          {piece.name}
                        </Text>
                        <Text
                          size="xs"
                          className={
                            piece.fate === 'failed'
                              ? 'text-[var(--danger-soft-text)]'
                              : 'text-[var(--bellum-text-secondary)]'
                          }
                        >
                          {fateOf(piece)}
                        </Text>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon={X}
                disabled={entry.phase === 'sending'}
                aria-label={t('attachments.remove', { name: entry.file.name })}
                title={t('attachments.remove', { name: entry.file.name })}
                className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                onClick={() => onRemove(entry.key)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {refusals.length > 0 ? (
        <ul role="alert" className="space-y-0.5">
          {refusals.map(refusal => (
            <li key={`${refusal.name}:${refusal.reason}`}>
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {t(`attachments.refusal.${refusal.reason}`, {
                  name: refusal.name,
                  formats: refusal.reason === 'no_readable_entry' ? ARCHIVE_ENTRY_FORMATS : FORMATS,
                  max: MAX_MB,
                  count: ANALYSIS_ATTACHMENTS_MAX,
                })}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
