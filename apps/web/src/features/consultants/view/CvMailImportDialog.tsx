import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { CvBatchFileOutcome, MailMessage, MailThread } from '@bellum/contracts'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMailSearch, useMailboxStatus } from '@/features/mailbox/api'
import { useCvMailImport, useMailAttachments } from '../hooks'

/**
 * #2568.1 — une pièce jointe d'un fil de messagerie AUTORISÉ devient une
 * fiche du vivier, depuis le vivier lui-même.
 *
 * Le back-end (`POST /talents/intake/mail`, `GET /mailbox/attachments`) est
 * livré et testé sans aucun appelant web — même défaut que #2569.1. Ce
 * composant branche l'APPELANT, rien côté serveur ne bouge.
 *
 * ⚠️ Le bouton N'EXISTE PAS tant qu'aucune messagerie n'est réellement
 * branchée (`useMailboxStatus`) : un bouton qui rendrait « messagerie
 * déconnectée » à chaque clic serait un bouton mort.
 *
 * Ne lit JAMAIS le corps d'un message (D65) : la recherche (`useMailSearch`,
 * intention `cv`) et la liste des messages d'un fil restent les mêmes
 * métadonnées que `ThreadDrawer` — objet, expéditeur, date, extrait — jamais
 * un corps. Seule la pièce jointe choisie traverse `POST /talents/intake/mail`.
 */
export function CvMailImportDialog() {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(false)
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CvBatchFileOutcome | 'error'>>({})
  const status = useMailboxStatus()
  const search = useMailSearch({ intent: 'cv', windowDays: 90, limit: 25 }, open)
  const attachments = useMailAttachments(expandedMessageId)
  const mailImport = useCvMailImport()

  // Pas de boîte réellement branchée : pas de bouton, jamais un bouton mort.
  if (status.isLoading || !status.data?.connected) return null

  const threads = (search.data?.threads ?? []).filter((thread: MailThread) => thread.hasAttachments)

  const importAttachment = async (message: MailMessage, attachmentId: string, filename: string) => {
    try {
      const outcome = await mailImport.mutateAsync({ messageId: message.id, attachmentId })
      setResults(previous => ({ ...previous, [attachmentId]: outcome }))
    } catch {
      setResults(previous => ({ ...previous, [attachmentId]: 'error' }))
    }
    void filename
  }

  return (
    <>
      <Button variant="outline" size="sm" icon={Mail} onClick={() => setOpen(true)}>
        {t('batchImport.mail.cta')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('batchImport.mail.title')}</DialogTitle>
            <DialogDescription>{t('batchImport.mail.description')}</DialogDescription>
          </DialogHeader>

          {search.isLoading ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('batchImport.mail.loading')}
            </Text>
          ) : threads.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('batchImport.mail.empty')}
            </Text>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {threads.map((thread: MailThread) => (
                <li key={thread.threadId} className="rounded-md border border-[var(--bellum-border)] p-2">
                  <Text size="sm" weight="medium">
                    {thread.subject ?? thread.counterpart ?? thread.threadId}
                  </Text>
                  {(thread.messages ?? []).filter(message => message.hasAttachments).length === 0 ? (
                    // Fil pré-datant le détail par message (ThreadDrawer vit
                    // avec la même limite) — le dire, jamais un vide muet.
                    <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                      {t('batchImport.mail.noMessages')}
                    </Text>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {(thread.messages ?? [])
                        .filter(message => message.hasAttachments)
                        .map(message => (
                          <li key={message.id}>
                            <Button variant="outline" size="xs" onClick={() => setExpandedMessageId(message.id)}>
                              {t('batchImport.mail.showAttachments')}
                            </Button>
                            {expandedMessageId === message.id ? (
                              <AttachmentPicker
                                message={message}
                                loading={attachments.isLoading}
                                items={attachments.data}
                                results={results}
                                onImport={importAttachment}
                              />
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('batchImport.mail.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Les pièces jointes d'UN message, lues à la demande, jamais devinées. */
function AttachmentPicker({
  message,
  loading,
  items,
  results,
  onImport,
}: {
  message: MailMessage
  loading: boolean
  items: { attachmentId: string; filename: string }[] | undefined
  results: Record<string, CvBatchFileOutcome | 'error'>
  onImport: (message: MailMessage, attachmentId: string, filename: string) => void
}) {
  const { t } = useTranslation('consultants')

  if (loading) {
    return (
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('batchImport.mail.attachmentsLoading')}
      </Text>
    )
  }
  if (!items || items.length === 0) {
    return (
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('batchImport.mail.attachmentsEmpty')}
      </Text>
    )
  }

  return (
    <ul className="mt-1 flex flex-col gap-1 pl-2">
      {items.map(attachment => {
        const result = results[attachment.attachmentId]
        return (
          <li key={attachment.attachmentId} className="flex flex-wrap items-center gap-2">
            <Text size="xs">{attachment.filename}</Text>
            {result ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {result === 'error'
                  ? t('batchImport.zip.failed')
                  : result.status === 'created'
                    ? t('batchImport.mail.outcome.created', { file: result.file })
                    : result.status === 'auto_updated'
                      ? result.matchedOn
                        ? t('batchImport.mail.outcome.auto_updated', {
                            file: result.file,
                            reason: t(`intake.duplicate.reasons.${result.matchedOn}`),
                          })
                        : t('batchImport.mail.outcome.auto_updated_generic', { file: result.file })
                      : result.status === 'exception'
                        ? result.conflicts && result.conflicts.length > 0
                          ? t('batchImport.mail.outcome.exception_conflicts', {
                              file: result.file,
                              state: t(`identity.states.${result.state}`),
                              conflicts: result.conflicts
                                .map(field => t(`identity.conflictFields.${field}`))
                                .join(', '),
                            })
                          : t('batchImport.mail.outcome.exception', {
                              file: result.file,
                              state: t(`identity.states.${result.state}`),
                            })
                        : result.status === 'too_big'
                          ? t('batchImport.mail.outcome.too_big', { file: result.file })
                          : result.status === 'ignored'
                            ? t('batchImport.mail.outcome.ignored', { file: result.file })
                            : t('batchImport.mail.outcome.failed', { file: result.file, reason: result.reason })}
              </Text>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => onImport(message, attachment.attachmentId, attachment.filename)}
              >
                {t('batchImport.mail.import', { file: attachment.filename })}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
