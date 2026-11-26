import { Button, Card, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ItImplicationsCard({ value }: { value: string | null }) {
  const { t } = useTranslation('accountDetail')
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Card className="flex gap-0 overflow-hidden p-5 [--card-spacing:0px] space-y-4">
        <div className="flex flex-row gap-4 ">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-yellow-100">
            <CircleAlert className="size-4 text-[var(--bellum-text-primary)]" />
          </div>
          <div>
            <Text element="h3" size="sm" weight="semibold">
              {t('implications.title')}
            </Text>
            <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('implications.subtitle')}
            </Text>
          </div>
        </div>
        {value ? (
          <div className="flex min-w-0 flex-col items-start justify-center">
            <Text size="sm" className="line-clamp-3 leading-relaxed text-[var(--bellum-text-primary)]">
              {value}
            </Text>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              className="mt-2"
              onClick={() => setSheetOpen(true)}
            >
              {t('cta.viewDetail')}
            </Button>
          </div>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('implications.empty')}
          </Text>
        )}
      </Card>
      {value ? <ImplicationsSheet open={sheetOpen} value={value} onOpenChange={setSheetOpen} /> : null}
    </>
  )
}

function ImplicationsSheet({
  open,
  value,
  onOpenChange,
}: {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(480px,calc(100vw-1.5rem))] gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{t('implications.title')}</SheetTitle>
          <SheetDescription>{t('implications.sheetDescription')}</SheetDescription>
        </SheetHeader>
        <Text size="sm" className="p-5 leading-relaxed text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      </SheetContent>
    </Sheet>
  )
}
