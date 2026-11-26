import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@bellum/ui'
import { CHAT_SURFACE } from '@/features/chat/view/chat-surface'
import type { SendQueue } from './useSendQueue'

/**
 * #4066.1 — « En attente · N » : le bloc visible sous le fil (/chat) ou sous les messages
 * (bulle Laura). Chaque message est modifiable / retirable avant son tour (#4066.3) ; quand la
 * file est suspendue, un bandeau NOMME pourquoi et offre « Reprendre » (#4066.4, #4066.5).
 * Annoncé en `aria-live="polite"` ; chaque bouton est nommé, tabulable, ≥ 44 px.
 */
export function SendQueueBlock({ queue }: { queue: SendQueue }) {
  const { t } = useTranslation('chat')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const { items, suspension } = queue
  if (items.length === 0) return null

  const suspensionText = suspension
    ? t(`queue.suspended.${suspension.kind}`, { reason: 'reason' in suspension ? suspension.reason : '' })
    : null

  return (
    <section
      data-testid="send-queue"
      aria-label={t('queue.listLabel')}
      aria-live="polite"
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
    >
      <h3 className="text-xs font-semibold text-[var(--bellum-text-muted)]">
        {t('queue.title', { count: items.length })}
      </h3>
      {suspensionText ? (
        <div
          role="status"
          data-testid="send-queue-suspension"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-sm text-[var(--bellum-text-primary)]"
        >
          <span className="min-w-0 flex-1">{suspensionText}</span>
          <Button type="button" variant="black" size="sm" className="min-h-11" onClick={queue.resume}>
            {t('queue.resume')}
          </Button>
        </div>
      ) : null}
      <ol className="flex flex-col gap-2">
        {items.map((item, index) => {
          const position = index + 1
          const isEditing = editing?.id === item.id
          return (
            <li
              key={item.id}
              aria-label={t('queue.item', { position, total: items.length })}
              className="flex flex-wrap items-center gap-2 text-sm text-[var(--bellum-text-primary)]"
            >
              {isEditing ? (
                <>
                  <textarea
                    value={editing.text}
                    rows={2}
                    aria-label={t('queue.editField', { position })}
                    onChange={event => setEditing({ id: item.id, text: event.target.value })}
                    className={`min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] ${CHAT_SURFACE.focusRing}`}
                  />
                  <Button
                    type="button"
                    variant="black"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      queue.edit(item.id, editing.text)
                      setEditing(null)
                    }}
                  >
                    {t('queue.save')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setEditing(null)}>
                    {t('queue.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.text}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-11"
                    aria-label={t('queue.editAria', { position })}
                    onClick={() => setEditing({ id: item.id, text: item.text })}
                  >
                    {t('queue.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-11"
                    aria-label={t('queue.removeAria', { position })}
                    onClick={() => queue.remove(item.id)}
                  >
                    {t('queue.remove')}
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
