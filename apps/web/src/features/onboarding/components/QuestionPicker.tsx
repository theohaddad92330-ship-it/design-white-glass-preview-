import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import type { ChoiceQuestion } from '@/features/onboarding/lib/choice-question'
import type { Choice } from '@/features/onboarding/lib/questions'

function staticChoices(question: ChoiceQuestion): Choice[] {
  return question.kind === 'multi-grouped' ? question.groups.flatMap(g => g.choices) : question.choices
}

/** Les puces affichées dans le sélecteur : quatre au plus, puis « + N ». */
const VISIBLE_PICKS = 4

/**
 * Théo O onboarding-guide — `.ob23-selector` : une question à choix se lit
 * fermée, comme un champ qui montre ce qui est choisi (puces), et s'ouvre en
 * fenêtre sur la liste COMPLÈTE — recherche, groupes, « Autre », plafond,
 * recommandations : c'est le `QuestionField` existant, au geste près, dans la
 * fenêtre. Sous le champ, la forme de la réponse (« Un choix · 7 propositions »).
 */
export function QuestionPicker({
  question,
  label,
  value,
  onChange,
  answers,
}: {
  question: ChoiceQuestion
  label: string
  value: string | string[]
  onChange: (next: string | string[]) => void
  answers: Readonly<Record<string, unknown>>
}) {
  const { t } = useTranslation('onboarding')
  const [open, setOpen] = useState(false)
  const choices = staticChoices(question)
  const labelOf = (raw: string): string => {
    const choice = choices.find(c => c.value === raw)
    return choice?.labelKey ? t(choice.labelKey) : raw
  }
  const picked = (Array.isArray(value) ? value : value ? [value] : []).filter(v => v !== '')
  const single = question.kind === 'single'
  const allowOther = !single && question.allowOther === true
  const hint = single
    ? t('picker.hintSingle', { count: choices.length })
    : choices.length > 0
      ? t(allowOther ? 'picker.hintMultiOther' : 'picker.hintMulti', { count: choices.length })
      : t('picker.hintMultiFree')

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('picker.open', { question: label })}
        onClick={() => setOpen(true)}
        data-testid="question-picker"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control border border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] px-4 py-2.5 text-left duration-immediate ease-bellum-out hover:border-[var(--bellum-primary)]"
      >
        {picked.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1.5">
            {picked.slice(0, VISIBLE_PICKS).map(v => (
              <span
                key={v}
                className="rounded-badge bg-[var(--bellum-surface-2)] px-2 py-1 text-xs text-[var(--bellum-text-primary)] [overflow-wrap:anywhere]"
              >
                {labelOf(v)}
              </span>
            ))}
            {picked.length > VISIBLE_PICKS && (
              <span className="px-1 py-1 text-xs text-[var(--bellum-text-muted)]">
                {t('picker.more', { count: picked.length - VISIBLE_PICKS })}
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-[var(--bellum-text-muted)]">
            {single ? t('picker.placeholderSingle') : t('picker.placeholderMulti')}
          </span>
        )}
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
      </button>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {hint}
      </Text>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('picker.close')} className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{single ? t('picker.leadSingle') : t('picker.leadMulti')}</DialogDescription>
          </DialogHeader>
          <Text element="p" size="xs" role="status" className="text-[var(--bellum-text-muted)]">
            {picked.length > 0 ? t('picker.count', { count: picked.length }) : t('picker.none')}
          </Text>
          <QuestionField question={question} value={value} onChange={onChange} answers={answers} />
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              {t('picker.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
