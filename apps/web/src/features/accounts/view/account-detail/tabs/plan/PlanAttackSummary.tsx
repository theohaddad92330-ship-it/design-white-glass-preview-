import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Text,
} from '@bellum/ui'
import { motion } from 'framer-motion'
import { ArrowRight, Route, Target, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import { PlanColdSummary } from './PlanColdSummary'
import { measurePlanListOverlap } from './planListOverlap'
import type { PlanViewData } from './planViewData'

type ColdAccount = Parameters<typeof PlanColdSummary>[0]['account']

export function PlanAttackSummary({ data, account }: { data: PlanViewData; account?: ColdAccount }) {
  const { t } = useTranslation('accountDetail')
  // recette 10/09 — ce résumé lisait SEULEMENT trois champs anciens
  // (`strategy`/`immediateAction`/`justification`), pas les autres que
  // `PlanViewData` porte pourtant et que le reste de l'onglet affiche déjà
  // (`AttackAnglesSection`, `MeetingPrepCard`, `PlanNextMoves`, juste à côté
  // sur `TabPlan`) : « Plan à préciser » se lisait sur une page qui rendait
  // trois angles complets, cinq questions de découverte et une trame de
  // rendez-vous en quatre temps. Le calcul (`buildPlanViewData`) était juste
  // — c'est cette question de complétude qui était plus étroite que la
  // donnée réelle.
  const hasContent = Boolean(
    data.strategy ||
    data.immediateAction ||
    data.justification ||
    data.angles.length > 0 ||
    data.meetingPrep ||
    data.recommendedMovement ||
    data.recommendedRoute ||
    data.nextActions.length > 0,
  )
  const [open, setOpen] = useState(false)
  // #3717.7 — MESURÉ, pas supposé : quand « Première action » répète mot pour
  // mot le premier élément de « Prochaines actions » (juste en dessous sur
  // CETTE page), elle ne se réaffiche plus en entier — un aperçu + un lien
  // vers la ligne réelle, comme le reste de l'épopée #3777 le demande.
  const overlap = measurePlanListOverlap({
    immediateAction: data.immediateAction,
    nextActions: data.nextActions,
    planWeeks: data.planWeeks,
  })

  return (
    <motion.div variants={cardFade} className="p-1">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('planSummary.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('planSummary.subtitle')}
          </Text>
          {hasContent ? (
            <Button type="button" variant="ghost" size="xs" className="mt-3 gap-1" onClick={() => setOpen(true)}>
              {t('planSummary.readDetail')}
              <ArrowRight className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {hasContent ? (
          <div className="divide-y divide-[var(--bellum-border)]">
            <PlanReadItem icon={<Zap className="size-4" />} label={t('planSummary.strategy')} value={data.strategy} />
            {overlap.immediateActionEchoesFirstNextAction ? (
              <PlanEchoItem icon={<Target className="size-4" />} label={t('planSummary.firstAction')} />
            ) : (
              <PlanReadItem
                icon={<Target className="size-4" />}
                label={t('planSummary.firstAction')}
                value={data.immediateAction}
              />
            )}
            {data.justification ? (
              <PlanTextBlock label={t('planSummary.why')} onReadMore={() => setOpen(true)} />
            ) : null}
          </div>
        ) : account ? (
          // #3670 — un compte sans plan nomme l'établi, le manque et UNE prochaine action.
          <PlanColdSummary account={account} />
        ) : (
          <PlanEmptyState />
        )}
      </Card>
      <PlanAttackDialog data={data} open={open} onOpenChange={setOpen} />
    </motion.div>
  )
}

/**
 * #3717.7 — l'APERÇU, à la place de la phrase répétée : le libellé reste
 * (« Première action »), la valeur devient un lien vers la ligne réelle
 * (« Prochaines actions », juste en dessous sur cette même page).
 */
function PlanEchoItem({ icon, label }: { icon: ReactNode; label: string }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="flex gap-3 px-5 py-4">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('planSummary.firstActionInNextMoves')}
        </Text>
        <a href="#plan-next-moves" className="mt-1 inline-block text-sm font-medium text-[var(--bellum-text-accent)]">
          {t('planSummary.seeInNextMoves')}
        </a>
      </div>
    </div>
  )
}

function PlanReadItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="flex gap-3 px-5 py-4">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
        <Text
          size="sm"
          weight="semibold"
          className="mt-1 line-clamp-6 break-words leading-snug text-[var(--bellum-text-primary)]"
        >
          {value || t('planSummary.fallbackValue')}
        </Text>
      </div>
    </div>
  )
}

function PlanAttackDialog({
  data,
  open,
  onOpenChange,
}: {
  data: PlanViewData
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-3xl p-0">
        <DialogHeader className="border-b border-[var(--bellum-border)] px-5 py-4">
          <DialogTitle>{t('planSummary.title')}</DialogTitle>
          <DialogDescription>{t('planSummary.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[62dvh] overflow-y-auto">
          <div className="space-y-5 p-5">
            <PlanDialogSection label={t('planSummary.strategy')} value={data.strategy} />
            <PlanDialogSection label={t('planSummary.firstAction')} value={data.immediateAction} />
            <PlanDialogSection label={t('planSummary.why')} value={data.justification} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function PlanDialogSection({ label, value }: { label: string; value: string }) {
  if (!value) return null

  return (
    <section className="space-y-2 rounded-lg bg-[var(--bellum-surface-2)] p-4">
      <Text size="base" weight="medium" className="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <Text size="sm" className="mt-2 whitespace-pre-line break-words leading-6 text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </section>
  )
}

// #4980.1 (recette 01/11) — la justification n'est plus un paragraphe visible : « Pourquoi ? » est un
// bouton qui ouvre la lecture complète (même geste que « Pourquoi ce mail » sur le brouillon).
function PlanTextBlock({ label, onReadMore }: { label: string; onReadMore: () => void }) {
  return (
    <div className="px-5 py-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 gap-1"
        aria-haspopup="dialog"
        onClick={onReadMore}
      >
        {label}
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

function PlanEmptyState() {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="px-5 py-6">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('planSummary.emptyTitle')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('planSummary.emptyDescription')}
      </Text>
    </div>
  )
}
