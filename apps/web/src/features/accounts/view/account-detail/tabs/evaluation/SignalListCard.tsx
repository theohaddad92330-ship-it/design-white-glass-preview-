import { Box, Card, ScrollArea, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import type { TFunction } from 'i18next'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import { SectionHeader } from './SectionHeader'

const MAX_VISIBLE_ITEMS = 3

/**
 * Une ligne de la carte : le libellé, plus une note facultative rendue en second
 * plan — c'est là que passent la preuve et la date d'un quick win / risque
 * (Théo p28). `note` absente ⇒ rien de plus n'est affiché : un dossier antérieur
 * ne doit pas se voir attribuer une provenance qu'il n'a pas.
 */
export type SignalListItem = { text: string; note?: string | null }

export function SignalListCard({
  title,
  description,
  items,
  emptyText,
  icon,
}: {
  title: string
  description: string
  items: SignalListItem[]
  emptyText: string
  icon: ReactNode
}) {
  const { t } = useTranslation('accountDetail')
  const [sheetOpen, setSheetOpen] = useState(false)
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS)
  const hiddenItemsCount = Math.max(0, items.length - visibleItems.length)

  return (
    <>
      <motion.div variants={cardFade}>
        <Card className="overflow-hidden p-0 [--card-spacing:0px]">
          <SectionHeader icon={icon} title={title} description={description} />
          {items.length > 0 ? (
            <>
              <SignalList items={visibleItems} />
              {hiddenItemsCount > 0 ? <RemainingSignalsItem count={hiddenItemsCount} /> : null}
              <SignalFooterLink
                label={t('signalList.viewDetail', { title: title.toLowerCase() })}
                onClick={() => setSheetOpen(true)}
              />
            </>
          ) : (
            <SignalEmpty text={emptyText} />
          )}
        </Card>
      </motion.div>
      <SignalFeedSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={title}
        description={buildSheetDescription(t, title, items.length)}
        items={items}
        emptyText={emptyText}
      />
    </>
  )
}

function SignalList({ items }: { items: SignalListItem[] }) {
  return (
    <div className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
      {items.map((item, index) => (
        <div key={`${item.text}-${index}`} className="px-5 py-3">
          <Text size="sm" weight="medium" className="line-clamp-2 text-[var(--bellum-text-primary)]">
            {item.text}
          </Text>
          {item.note ? (
            <Text size="xs" className="mt-1 line-clamp-2 text-[var(--bellum-text-muted)]">
              {item.note}
            </Text>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function SignalEmpty({ text }: { text: string }) {
  return (
    <Text size="sm" className="border-t border-[var(--bellum-border)] px-5 py-4 text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}

function RemainingSignalsItem({ count }: { count: number }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="border-t border-[var(--bellum-border)] px-5 py-3">
      <div className="rounded-xl border border-dashed border-[var(--bellum-border)] px-3 py-2 text-center">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('signalList.remaining', { count })}
        </Text>
      </div>
    </div>
  )
}

function SignalFooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-5 mb-4 mt-1 inline-flex items-center gap-2 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
    >
      {label}
      <ArrowRight className="size-4" />
    </button>
  )
}

function SignalFeedSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
  emptyText,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  items: SignalListItem[]
  emptyText: string
}) {
  const { t } = useTranslation('common')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(440px,calc(100vw-1.5rem))] gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <Box className="space-y-2 p-3">
            {items.length > 0
              ? items.map((item, index) => <SignalFeedRow key={`${item.text}-${index}`} item={item} />)
              : null}
            {items.length === 0 ? <SignalFeedEmpty text={emptyText} /> : null}
          </Box>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function SignalFeedRow({ item }: { item: SignalListItem }) {
  return (
    <div className="rounded-xl p-3 transition-colors duration-150 ease-out hover:bg-[var(--bellum-surface-2)]">
      <Text size="sm" weight="medium" className="leading-relaxed text-[var(--bellum-text-primary)]">
        {item.text}
      </Text>
      {item.note ? (
        <Text size="xs" className="mt-1 leading-relaxed text-[var(--bellum-text-muted)]">
          {item.note}
        </Text>
      ) : null}
    </div>
  )
}

function SignalFeedEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {text}
      </Text>
    </div>
  )
}

function buildSheetDescription(t: TFunction<'accountDetail'>, title: string, count: number) {
  if (count === 0) return t('signalList.sheetEmpty', { title: title.toLowerCase() })
  return t('signalList.sheetCount', { count })
}
