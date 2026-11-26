import { Text } from '@bellum/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const ASSISTANT_STEPS = ['source', 'columns', 'verification', 'result'] as const
export type AssistantStep = (typeof ASSISTANT_STEPS)[number]

/**
 * Théo B c4-assistant-import.R1 — les QUATRE étapes (les sept du contrat se fondent : normaliser, dédoublonner et
 * simuler sont exécutés ensemble par la vérification). L'étape en cours est annoncée (`aria-current="step"`), une
 * étape faite porte une coche ET un texte — jamais la couleur seule.
 */
export function ImportStepper({ current }: { current: AssistantStep }) {
  const { t } = useTranslation('importWizard')
  const index = ASSISTANT_STEPS.indexOf(current)
  return (
    <ol aria-label={t('contactsImport.assistant.steps.label')} className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
      {ASSISTANT_STEPS.map((step, position) => {
        const done = position < index
        const active = position === index
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className="flex min-h-11 items-center gap-2 text-sm md:min-h-0"
          >
            <span
              aria-hidden
              className={`flex size-6 items-center justify-center rounded-full border text-xs ${
                active
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-[var(--text-on-primary)]'
                  : done
                    ? 'border-[var(--success-soft-text)] text-[var(--success-soft-text)]'
                    : 'border-[var(--border-default)] text-[var(--text-muted)]'
              }`}
            >
              {done ? <Check className="size-3.5" /> : position + 1}
            </span>
            <Text
              size="sm"
              weight={active ? 'semibold' : 'normal'}
              className={active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}
            >
              {t(`contactsImport.assistant.steps.${step}`)}
            </Text>
            {done ? <span className="sr-only">{t('contactsImport.assistant.steps.done')}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
