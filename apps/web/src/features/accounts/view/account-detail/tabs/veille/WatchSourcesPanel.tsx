import {
  Button,
  Card,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
  cn,
} from '@bellum/ui'
import { ArrowRight, FileSearch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatSignalDate } from '@/lib/signal-date'
import { signalSourceLabel } from '@/lib/data-source-label'
import type { WatchSignal } from '@/features/accounts/model/watch'

export function WatchSourcesPanel({ signals }: { signals: WatchSignal[] }) {
  const { t } = useTranslation('accountWatch')
  // #1912.11 — `signal.source` est du texte LIBRE écrit par le modèle : un titre
  // de presse est une preuve et reste tel quel, mais rien ne l'empêche d'écrire
  // le nom d'un de NOS fournisseurs, qui ne se nomme jamais (jumeau de
  // « Sources : pappers » vu sur /discover le 14/09/2026). Le dédoublonnage se
  // fait sur le LIBELLÉ : deux fournisseurs d'une même capacité n'en font qu'une.
  const sources = uniqueSources(signals, source => signalSourceLabel(t, source))
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Card className="gap-0 p-5">
        <Text element="h2" size="sm" weight="semibold">
          {t('sources.title')}
        </Text>
        {sources.length > 0 ? (
          <>
            <div className="mt-4 divide-y divide-[var(--bellum-border)]">
              {sources.slice(0, 5).map(source => (
                <SourceRow key={source.label} label={source.label} date={source.date} />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              className="mt-4"
              onClick={() => setSheetOpen(true)}
            >
              {t('sources.viewAll')}
            </Button>
          </>
        ) : (
          <Text size="xs" className="mt-4 text-[var(--bellum-text-secondary)]">
            {t('sources.empty')}
          </Text>
        )}
      </Card>
      <SourcesSheet open={sheetOpen} sources={sources} onOpenChange={setSheetOpen} />
    </>
  )
}

/** #1912.11 — `label`, et non `name` : ce qui voyage ici est DÉJÀ le texte lu par
 *  le client (la capacité pour un de nos fournisseurs, la preuve sinon), plus
 *  jamais l'identifiant brut du signal. Le nom du champ le dit. */
type Source = { label: string; date: string }

function SourcesSheet({
  open,
  sources,
  onOpenChange,
}: {
  open: boolean
  sources: Source[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountWatch')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(440px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{t('sources.title')}</SheetTitle>
          <SheetDescription>{t('sources.sheetDescription', { count: sources.length })}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-[var(--bellum-border)] px-4 md:px-6 py-3">
            {sources.map(source => (
              <SourceRow key={source.label} label={source.label} date={source.date} className="px-1 py-5" />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function SourceRow({ className, date, label }: Source & { className?: string }) {
  return (
    <div className={cn('flex w-full min-w-0 items-center gap-3 overflow-hidden py-3', className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bellum-surface-2)]">
        <FileSearch className="size-4 text-[var(--bellum-text-secondary)]" />
      </div>
      <div className="min-w-0 flex-1">
        <Text size="xs" weight="medium" className="block w-full">
          {label}
        </Text>
        <Text size="xs" className="block w-full text-[var(--bellum-text-secondary)]">
          {formatSignalDate(date)}
        </Text>
      </div>
    </div>
  )
}

function uniqueSources(signals: WatchSignal[], toLabel: (source: string) => string | null): Source[] {
  const sources = new Map<string, string>()
  signals.forEach(signal => {
    const label = toLabel(signal.source)
    if (label !== null && !sources.has(label)) sources.set(label, signal.date)
  })
  return Array.from(sources, ([label, date]) => ({ label, date }))
}
