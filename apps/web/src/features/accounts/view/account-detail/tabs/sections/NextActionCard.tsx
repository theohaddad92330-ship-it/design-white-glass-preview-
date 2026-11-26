import { Button, Text } from '@bellum/ui'
import { ArrowRight, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type NextActionCardProps = {
  action: string | null
  onViewPlan: () => void
}

export function NextActionCard({ action, onViewPlan }: NextActionCardProps) {
  const { t } = useTranslation('accountDetail')
  return (
    <section className="flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex w-fit flex-col gap-1.5">
          <span className="relative w-fit inline-block before:absolute before:-inset-1 before:block before:-skew-y-2 before:bg-[var(--bellum-primary-100)]">
            <Text element="p" size="sm" weight="semibold" className="relative text-black">
              {t('nextAction.title')}
            </Text>
          </span>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
            {t('nextAction.subtitle')}
          </Text>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-surface-1)] text-[var(--bellum-text-secondary)] ring-1 ring-[var(--bellum-border)]">
          <Route className="size-4" />
        </span>
      </div>

      {action ? (
        // #2117.59 — `action` vient de l'analyse, sans longueur maximale :
        // `line-clamp-4` le coupe sans aucun moyen de lire le reste. `title`
        // est le correctif déjà en usage pour le même problème ailleurs dans
        // ce dossier (`AccountTimelineCard.tsx`, `title={event.label}`) —
        // une info-bulle native, pas un Sheet pour quatre lignes de texte.
        <Text
          element="p"
          size="base"
          weight="semibold"
          title={action}
          className="line-clamp-4 leading-snug text-[var(--bellum-text-primary)]"
        >
          {action}
        </Text>
      ) : (
        <div className="max-w-sm space-y-2">
          <Text element="p" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('nextAction.emptyTitle')}
          </Text>
          <Text element="p" size="sm" className="line-clamp-3 text-[var(--bellum-text-secondary)]">
            {t('nextAction.emptyDescription')}
          </Text>
        </div>
      )}

      <Button
        type="button"
        onClick={onViewPlan}
        icon={ArrowRight}
        iconPosition="right"
        variant="ghost"
        size="sm"
        className="mt-auto w-fit px-0"
      >
        {t('nextAction.cta')}
      </Button>
    </section>
  )
}
