import { Button, ScrollArea, Sheet, SheetContent, SheetDescription, SheetTitle, cn } from '@bellum/ui'
import { X } from 'lucide-react'
import { overlayHeadClassName, overlaySideClassName, overlayTitleClassName } from '@/components/layout/overlay'
import { useTranslation } from 'react-i18next'
import { Section } from './Section'
import { TaskCard } from './TaskCard'
import type { DismissFn, DisplayTask } from './types'

type BackgroundTasksSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: DisplayTask[]
  dismiss: DismissFn
}

/**
 * Right-side panel listing every task the indicator is tracking, grouped by
 * category (errors first, then analyses, then save-style tasks). Each card
 * supports dismissal once the task is no longer running.
 */
export function BackgroundTasksSheet({ open, onOpenChange, entries, dismiss }: BackgroundTasksSheetProps) {
  const { t } = useTranslation('analysis')
  const errorsEntries = entries.filter(e => e.status === 'error')
  const analysesEntries = entries.filter(e => e.status !== 'error' && e.source === 'analysis')
  const tasksEntries = entries.filter(e => e.status !== 'error' && e.source === 'task')

  const close = () => onOpenChange(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Théo `dialog.t-side` + MAQ-SHELL `#lay-tasks` « Ce qui tourne » : le tiroir commun des surcouches. */}
      <SheetContent side="right" hideClose className={overlaySideClassName}>
        <div className={cn(overlayHeadClassName, 'pr-3 md:pr-4')}>
          <div className="min-w-0 flex-1">
            <SheetTitle className={overlayTitleClassName}>{t('tasks.sheetTitle')}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">
              {t('tasks.sheetSubtitle')}
            </SheetDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('common:actions.close')}
            onClick={close}
            className="size-8 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 px-[1.125rem] py-4 md:px-6">
            {errorsEntries.length > 0 && (
              <Section title={t('tasks.sectionErrors')} count={errorsEntries.length}>
                {errorsEntries.map(entry => (
                  <TaskCard key={entry.key} entry={entry} onDismiss={() => dismiss(entry)} onNavigate={close} />
                ))}
              </Section>
            )}
            {analysesEntries.length > 0 && (
              <Section title={t('tasks.sectionAnalyses')} count={analysesEntries.length}>
                {analysesEntries.map(entry => (
                  <TaskCard key={entry.key} entry={entry} onDismiss={() => dismiss(entry)} onNavigate={close} />
                ))}
              </Section>
            )}
            {tasksEntries.length > 0 && (
              <Section title={t('tasks.sectionSaves')} count={tasksEntries.length}>
                {tasksEntries.map(entry => (
                  <TaskCard key={entry.key} entry={entry} onDismiss={() => dismiss(entry)} onNavigate={close} />
                ))}
              </Section>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
