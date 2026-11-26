import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { FocusWeekPlan } from '@bellum/contracts'
import { Button, Text, cn, useCopiedFlash } from '@bellum/ui'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { CHAT_SURFACE } from './chat-surface'
import {
  FocusPlanCard,
  PlanInputs,
  durationLabel,
  formatDay,
  hasCallSession,
  planAsText,
  planInputsLines,
} from './FocusPlanCard'

/**
 * #2770.55-.62 — LA CARTE DU PLAN DE SEMAINE.
 *
 * Elle LIT `plan` (compilé par `chat_tools.py::propose_weekly_plan`) et ne
 * recompose rien. Chaque jour est rendu par `FocusPlanCard variant="embedded"` :
 * mêmes blocs, mêmes gestes (« Ajouter à mon agenda », Réalisé / Interrompu /
 * Reporté, Résultat / durée) — le cadre, la garantie, la copie et la marge ne
 * sont dits qu'UNE fois, ici. Un jour sans bloc placé ne fait aucune ligne.
 */
export function WeeklyPlanCard({ plan }: { plan: FocusWeekPlan }) {
  const { t, i18n } = useTranslation('chat')
  const language = i18n.language
  const [copied, flashCopied] = useCopiedFlash(2000)

  async function onCopyPlan() {
    const lines = [t('weeklyPlan.title', { date: formatDay(plan.week_start, language) })]
    for (const day of plan.days) lines.push('', planAsText(day, t, language, false))
    if (plan.deferred_blocks.length > 0) {
      lines.push('', t('focusPlan.deferredTitle'))
      for (const deferred of plan.deferred_blocks) {
        lines.push(`${deferred.title} — ${t(`focusPlan.deferredReason.${deferred.reason}`)}`)
      }
    }
    if (plan.days.length > 0)
      lines.push('', t('weeklyPlan.margin', { duration: durationLabel(plan.margin_minutes, t) }))
    lines.push(...planInputsLines(plan, t, { callSessionPlaced: plan.days.some(hasCallSession) }))
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      flashCopied()
      toast.success(t('focusPlan.planCopied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('focusPlan.planCopyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  return (
    <div data-chat-kind="action" data-testid="weekly-plan-card" className={cn('space-y-3 p-3', CHAT_SURFACE.action)}>
      <div className="flex items-start gap-2">
        <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
        <div className="min-w-0 flex-1 space-y-1">
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('weeklyPlan.title', { date: formatDay(plan.week_start, language) })}
          </Text>
          {/* #2770 — sans bloc placé, rien n'est à écrire : « Rien n'est créé » redirait ce que le constat
              ci-dessous et la réponse de Laura disent déjà (trois phrases équivalentes en recette). */}
          {plan.days.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('focusPlan.guarantee')}
              </Text>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('focusPlan.copyPlan')}
          onClick={() => void onCopyPlan()}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </Button>
      </div>

      {plan.energy ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t(`focusPlan.energy.${plan.energy}`)}
        </Text>
      ) : null}

      {plan.days.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('weeklyPlan.noDayPlaced')}
        </Text>
      ) : (
        <div className="divide-y divide-[var(--bellum-border)]">
          {plan.days.map(day => (
            <section key={day.date} data-testid="weekly-plan-day" className="py-3 first:pt-0 last:pb-0">
              <FocusPlanCard plan={day} variant="embedded" />
            </section>
          ))}
        </div>
      )}

      {plan.deferred_blocks.length > 0 ? (
        <div className="space-y-1">
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('focusPlan.deferredTitle')}
          </Text>
          <ul className="space-y-0.5">
            {plan.deferred_blocks.map((deferred, index) => (
              <li key={`${deferred.type}-${index}`}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {deferred.title} — {t(`focusPlan.deferredReason.${deferred.reason}`)}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.days.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('weeklyPlan.margin', { duration: durationLabel(plan.margin_minutes, t) })}
        </Text>
      ) : null}

      {/* #2770.35/.36/.37 — dit une fois pour la semaine, jamais jour par jour. */}
      <PlanInputs lines={planInputsLines(plan, t, { callSessionPlaced: plan.days.some(hasCallSession) })} />
    </div>
  )
}
