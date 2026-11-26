import type { Contact } from '@bellum/contracts'
import { Button, FilterChips, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  APPROACH_QUESTIONS,
  approachChoice,
  recommendedAnswers,
  type ApproachAnswers,
  type ApproachChoice,
} from './approach-quiz'

/**
 * #3633 / #3694.5 — la question posée AVANT de rédiger l'e-mail suggéré quand le rang est inconnu :
 * objectif (exigé), angle et ton (facultatifs). « Rédiger » reste
 * grisé tant que l'objectif n'a pas de réponse. Le brouillon produit se relit
 * dans le fil ; rien ne part sans le geste du commercial.
 */
export function EngagementApproachQuiz({
  contact,
  onSubmit,
  onCancel,
}: {
  contact: Contact
  onSubmit: (choice: ApproachChoice) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('engagement')
  const [answers, setAnswers] = useState<ApproachAnswers>(() => recommendedAnswers(contact.decision_role))
  const choice = approachChoice(answers)

  return (
    <div className="w-full space-y-4 text-left">
      <Text size="sm" weight="semibold">
        {t('approachQuiz.title', { name: contact.full_name })}
      </Text>
      {APPROACH_QUESTIONS.map(question => {
        // i18n keys: approachQuiz.question.objective|angle|tone
        const label = t(`approachQuiz.question.${question.key}`)
        return (
          <div key={question.key} className="space-y-2">
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {label}
            </Text>
            {/* GA-249 — une rangée de choix exclusifs passe par le composant partagé. */}
            <FilterChips
              ariaLabel={label}
              options={question.options.map(option => ({ value: option, label: optionLabel(t, question.key, option) }))}
              value={answers[question.key] ?? null}
              onChange={next => setAnswers(current => ({ ...current, [question.key]: next ?? undefined }))}
            />
          </div>
        )
      })}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('approachQuiz.cancel')}
        </Button>
        <Button type="button" size="sm" disabled={!choice} onClick={() => choice && onSubmit(choice)}>
          {t('approachQuiz.submit')}
        </Button>
      </div>
    </div>
  )
}

function optionLabel(t: (key: string) => string, key: string, option: string): string {
  // L'objectif réutilise les libellés du sélecteur « Paramètres du message » (un libellé, un endroit).
  // i18n keys: composer.parameters.objectives.* | approachQuiz.angle.* | approachQuiz.tone.*
  return key === 'objective' ? t(`composer.parameters.objectives.${option}`) : t(`approachQuiz.${key}.${option}`)
}
