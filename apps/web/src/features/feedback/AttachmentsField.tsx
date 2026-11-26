// #1792 — collage (Ctrl/Cmd+V) et sélection de fichier pour le widget de
// signalement, avec le reflet client des bornes serveur (voir attachments.ts).
import { useId } from 'react'
import { Button, Text, cn } from '@bellum/ui'
import { FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  isImageAttachment,
  type AttachmentRejection,
  type FeedbackAttachment,
} from './attachments'

const ACCEPT = ALLOWED_ATTACHMENT_MIME_TYPES.join(',')

/** Une pièce ajoutée à l'écran — `size` (octets) ne voyage jamais vers l'API, il ne sert qu'à juger le plafond total localement. */
export type AttachmentEntry = { attachment: FeedbackAttachment; size: number }

/**
 * Un message d'erreur PAR MOTIF, en clés littérales — jamais une clé
 * construite dynamiquement (`t(\`...${x}\`)`) : la garde `keys-resolve.test.ts`
 * ne voit que des appels `t('…')` écrits en dur, et cette fonction lui en
 * offre un par branche plutôt qu'un chemin qu'elle ne peut pas vérifier.
 */
function useAttachmentErrorMessage(): (error: AttachmentRejection) => string {
  const { t } = useTranslation('feedback')
  return error => {
    switch (error.reason) {
      case 'type':
        return t('attachments.errors.type', { name: error.name })
      case 'size':
        return t('attachments.errors.size', { name: error.name })
      case 'count':
        return t('attachments.errors.count')
      case 'total':
        return t('attachments.errors.total')
    }
  }
}

export function AttachmentsField({
  entries,
  error,
  onSelectFiles,
  onRemove,
}: {
  entries: AttachmentEntry[]
  error: AttachmentRejection | null
  onSelectFiles: (files: File[]) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation('feedback')
  const inputId = useId()
  const errorMessage = useAttachmentErrorMessage()

  return (
    <div className="space-y-2">
      <Text element="label" htmlFor={inputId} size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('attachments.label')}
      </Text>
      {/* #1792 — un <input type="file"> RÉEL, jamais masqué derrière un bouton
          décoratif : atteignable au clavier et visible au focus (GA-35). */}
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={event => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) onSelectFiles(files)
          // Permet de resélectionner le MÊME fichier après un refus ou un retrait.
          event.target.value = ''
        }}
        className={cn(
          'block w-full cursor-pointer text-xs text-[var(--bellum-text-secondary)]',
          'file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-[var(--bellum-border)]',
          'file:bg-[var(--bellum-surface-2)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--bellum-text-primary)]',
          'hover:file:bg-[var(--bellum-surface-1)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
        )}
      />
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
        {t('attachments.hint')}
      </Text>

      {error && (
        <Text element="p" role="alert" size="xs" color="text-[var(--danger-soft-text)]">
          {errorMessage(error)}
        </Text>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.attachment.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] py-1 pr-1 pl-2 text-xs"
            >
              {isImageAttachment(entry.attachment) ? (
                <img
                  src={`data:${entry.attachment.mimeType};base64,${entry.attachment.dataBase64}`}
                  alt={t('attachments.imageAlt', { name: entry.attachment.name })}
                  className="size-8 shrink-0 rounded object-cover"
                />
              ) : (
                <FileText className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
              )}
              <span className="max-w-[10rem] truncate text-[var(--bellum-text-primary)]">{entry.attachment.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('attachments.remove', { name: entry.attachment.name })}
                onClick={() => onRemove(index)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
