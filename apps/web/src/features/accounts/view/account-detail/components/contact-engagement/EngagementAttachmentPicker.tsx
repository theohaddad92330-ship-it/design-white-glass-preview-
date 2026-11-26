import {
  EMAIL_ATTACHMENT_MAX_COUNT,
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  refuseEmailAttachments,
  type ContactAttachableDocument,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '@/features/expenses/presentation'

type EngagementAttachmentPickerProps = {
  documents: readonly ContactAttachableDocument[]
  selected: readonly string[]
  onToggle: (assetId: string) => void
  disabled?: boolean
}

/**
 * #3699.6 — choisir les pièces jointes d'un e-mail individuel, dans la
 * bibliothèque de documents de l'espace. La PERSONNE coche ; rien ne l'est
 * d'office et le copilote ne joint jamais seul.
 *
 * Un document retenu par son droit d'usage (« après intérêt confirmé ») reste
 * NOMMÉ, case inactive, avec sa raison. Le total et la borne viennent du
 * réglage UNIQUE des contrats (`refuseEmailAttachments`, GA-26) — le serveur
 * re-vérifie de toute façon sur ce qu'il relit.
 */
export function EngagementAttachmentPicker({
  documents,
  selected,
  onToggle,
  disabled = false,
}: EngagementAttachmentPickerProps) {
  const { t } = useTranslation('engagement')
  const groupId = useId()
  if (documents.length === 0) return null
  const chosen = documents.filter(document => selected.includes(document.asset_id))
  const total = chosen.reduce((sum, document) => sum + document.byte_size, 0)
  const refusal = refuseEmailAttachments(
    chosen.map(document => ({ contentType: document.content_type, byteSize: document.byte_size })),
  )

  return (
    <fieldset className="space-y-1" aria-describedby={`${groupId}-limit`}>
      <legend className="text-sm text-[var(--bellum-text-muted)]">{t('message.confirm.attachmentsPick.label')}</legend>
      <ul className="space-y-1">
        {documents.map(document => {
          const blocked = document.blocked_reason !== null
          const checked = selected.includes(document.asset_id)
          return (
            <li key={document.asset_id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-[var(--bellum-text-primary)]">
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={checked}
                  disabled={disabled || blocked}
                  onChange={() => onToggle(document.asset_id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{document.title}</span>
                  <span className="block truncate text-xs text-[var(--bellum-text-muted)]">
                    {document.file_name} · {formatBytes(document.byte_size)}
                    {blocked && ` · ${t(`message.confirm.attachmentsPick.blocked.${document.blocked_reason}`)}`}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <Text id={`${groupId}-limit`} size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
        {t('message.confirm.attachmentsPick.limit', {
          total: formatBytes(total),
          max: formatBytes(EMAIL_ATTACHMENT_MAX_TOTAL_BYTES),
          count: EMAIL_ATTACHMENT_MAX_COUNT,
        })}
      </Text>
      {refusal && (
        <Text size="xs" color="text-[var(--bellum-text-primary)]" className="block" role="alert">
          {t(`message.confirm.attachmentsPick.refusal.${refusal}`, { count: EMAIL_ATTACHMENT_MAX_COUNT })}
        </Text>
      )}
    </fieldset>
  )
}
