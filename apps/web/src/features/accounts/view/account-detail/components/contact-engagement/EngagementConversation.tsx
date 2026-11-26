import type { Contact } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MessageToneOption } from '@/lib/message-insight'
import type { ApproachChoice } from './approach-quiz'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { EngagementEmptyState } from './EngagementEmptyState'
import { EngagementGenerationProgress } from './EngagementGenerationProgress'
import { EngagementMessage } from './EngagementMessage'
import type { AssistantEntry, ConversationEntry } from './conversation'
import type { EngagementChannel } from './types'

type RetryableErrorEntry = Extract<ConversationEntry, { role: 'error' }>

type EngagementConversationProps = {
  channel: EngagementChannel
  contact: Contact
  entries: ConversationEntry[]
  generationStep: string | null
  onContextPreset: (context: string) => void
  /** #3633 — le QCM d'approche de l'e-mail suggéré, puis la génération. */
  onApproachChosen?: (choice: ApproachChoice) => void
  onLinkedinDeclaredSent: () => void
  onLinkedinOpen: () => void
  onMessageCopy: () => void
  /** #2396.12 — écarter ce brouillon sans envoyer ni déclarer un envoi. */
  onDismiss: () => void
  onRetry: (entry: RetryableErrorEntry) => void
  /** #1926.28 — présent seulement quand le composer offre une régénération par angle. */
  onUseAlternativeAngle?: (angle: string) => void
  /** #1926.31 — idem pour le changement de ton ; prend l'entrée pour retrouver l'angle qui l'a produite. */
  onChangeTone?: (entry: AssistantEntry, tone: MessageToneOption) => void
  /** #3695 — « Relancer » / « Faire connaître une expertise » depuis la carte e-mail. */
  onChooseObjective?: (objective: string) => void
  /** #3696.3 — retient la correction manuelle d'un brouillon dans le fil. */
  onEditEntry?: (entryId: string, draft: { subject: string; body: string }) => void
}

export function EngagementConversation({
  channel,
  contact,
  entries,
  generationStep,
  onLinkedinDeclaredSent,
  onLinkedinOpen,
  onMessageCopy,
  onDismiss,
  onContextPreset,
  onApproachChosen,
  onRetry,
  onUseAlternativeAngle,
  onChangeTone,
  onChooseObjective,
  onEditEntry,
}: EngagementConversationProps) {
  const hasEntries = entries.length > 0 || generationStep !== null
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const lastEntryId = entries.at(-1)?.id ?? null
  const scrollKey = useMemo(
    () => `${lastEntryId ?? 'empty'}:${generationStep ?? 'idle'}`,
    [generationStep, lastEntryId],
  )

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [scrollKey])

  return (
    // #4280 — un plancher de hauteur (12 rem, #4333) : sous le composer, le fil tombait à quelques pixels et ne montrait
    // plus qu'un fragment (libellé isolé, message hors bulle).
    <div className="relative min-h-[12rem] flex-1 overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="h-full min-h-0 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--bellum-border)]"
      >
        {/* GA-246 — ce fil est rédigé par l'IA : la mention se LIT au-dessus des tours. */}
        {hasEntries ? <AiDisclosure className="mb-3" /> : null}
        {hasEntries ? (
          <ConversationEntries
            contact={contact}
            entries={entries}
            generationStep={generationStep}
            onLinkedinDeclaredSent={onLinkedinDeclaredSent}
            onLinkedinOpen={onLinkedinOpen}
            onMessageCopy={onMessageCopy}
            onDismiss={onDismiss}
            onRetry={onRetry}
            onUseAlternativeAngle={onUseAlternativeAngle}
            onChangeTone={onChangeTone}
            onChooseObjective={onChooseObjective}
            onEditEntry={onEditEntry}
          />
        ) : (
          <EngagementEmptyState
            channel={channel}
            contact={contact}
            onContextPreset={onContextPreset}
            onApproachChosen={onApproachChosen}
          />
        )}
      </div>

      {/* #4280 — fondus SANS flou d'arrière-plan : le flou sur une zone de quelques pixels dessinait deux
          barres grises horizontales en travers du texte. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-[var(--bellum-surface-1)] via-[var(--bellum-surface-1)]/90 to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2 bg-gradient-to-t from-[var(--bellum-surface-1)] via-[var(--bellum-surface-1)]/80 to-transparent" />
    </div>
  )
}

function ConversationEntries({
  contact,
  entries,
  generationStep,
  onLinkedinDeclaredSent,
  onLinkedinOpen,
  onMessageCopy,
  onDismiss,
  onRetry,
  onUseAlternativeAngle,
  onChangeTone,
  onChooseObjective,
  onEditEntry,
}: {
  contact: Contact
  entries: ConversationEntry[]
  generationStep: string | null
  onLinkedinDeclaredSent: () => void
  onLinkedinOpen: () => void
  onMessageCopy: () => void
  onDismiss: () => void
  onRetry: (entry: RetryableErrorEntry) => void
  onUseAlternativeAngle?: (angle: string) => void
  onChangeTone?: (entry: AssistantEntry, tone: MessageToneOption) => void
  /** #3695 — « Relancer » / « Faire connaître une expertise » depuis la carte e-mail. */
  onChooseObjective?: (objective: string) => void
  onEditEntry?: (entryId: string, draft: { subject: string; body: string }) => void
}) {
  // Le brouillon courant = le DERNIER message assistant du fil. Lui seul porte
  // l'édition et l'envoi : un email est irréversible, on ne veut pas qu'une
  // version périmée plus haut dans le fil reste expédiable d'un clic.
  const currentDraftId = entries.filter(entry => entry.role === 'assistant').at(-1)?.id ?? null

  return (
    <div className="space-y-6">
      {entries.map(entry => {
        if (entry.role === 'user') return <UserPromptBubble key={entry.id} text={entry.text} />
        if (entry.role === 'error')
          return <FailedDraftBubble key={entry.id} reason={entry.reason} onRetry={() => onRetry(entry)} />
        return (
          <EngagementMessage
            key={entry.id}
            channel={entry.channel}
            contact={contact}
            isCurrentDraft={entry.id === currentDraftId}
            subject={entry.subject}
            text={entry.text}
            edited={entry.edited}
            onDraftChange={onEditEntry && (draft => onEditEntry(entry.id, draft))}
            insight={entry}
            trace={{
              usedStyle: Boolean(entry.usedStyleId),
              usedTemplate: entry.usedTemplate,
              unchanged: entry.unchanged,
            }}
            onUseAlternativeAngle={onUseAlternativeAngle}
            onChangeTone={onChangeTone && (tone => onChangeTone(entry, tone))}
            onChooseObjective={onChooseObjective}
            onLinkedinDeclaredSent={onLinkedinDeclaredSent}
            onLinkedinOpen={onLinkedinOpen}
            onMessageCopy={onMessageCopy}
            onDismiss={onDismiss}
          />
        )
      })}
      {generationStep ? <EngagementGenerationProgress label={generationStep} /> : null}
    </div>
  )
}

function UserPromptBubble({ text }: { text: string }) {
  return (
    // #4280 — la bulle se VOIT dans les deux thèmes : `--bellum-bg-lighter` vaut #fff en clair, soit le fond
    // du panneau — le message flottait « hors de toute bulle ».
    <div
      data-user-bubble
      className="ml-auto w-fit max-w-[min(82%,22rem)] rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-sm text-[var(--bellum-text-primary)]"
    >
      {text}
    </div>
  )
}

/** Inline failed-generation bubble with an actionable retry (P0-05) — the credit
 *  is never charged for generation, so retrying is free and safe. */
function FailedDraftBubble({ reason, onRetry }: { reason?: string; onRetry: () => void }) {
  const { t } = useTranslation('engagement')
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-danger)]/40 bg-[var(--bellum-danger)]/5 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2 text-[var(--bellum-text-secondary)]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger-soft-text)]" />
        <span>{reason ?? t('generation.failed')}</span>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} icon={RotateCcw} className="w-fit gap-1.5">
        {t('generation.retry')}
      </Button>
    </div>
  )
}
