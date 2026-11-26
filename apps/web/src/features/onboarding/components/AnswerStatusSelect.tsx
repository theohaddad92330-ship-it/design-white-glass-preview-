import { useTranslation } from 'react-i18next'
import { Button, SelectField } from '@bellum/ui'
import { ANSWER_STATUSES, type AnswerStatus } from '@/features/onboarding/lib/answer-status'

type Props = {
  questionLabel: string
  status: AnswerStatus | 'empty'
  onSelect: (status: AnswerStatus) => void
  onClear: () => void
  /** #4818 — la question ferme la porte de complétion : son absence se lit autrement. */
}

/**
 * Théo O onboarding-theme.N1 — le statut d'UNE réponse : renseignée, je ne sais
 * pas, à compléter plus tard, à vérifier avec mon équipe, non applicable. Le
 * même menu sous CHAQUE question, plus un « Effacer » qui revient à « pas
 * encore répondu ». Le libellé accessible nomme la question : dix menus
 * identiques sur la page ne se distinguent que par lui.
 */
export function AnswerStatusSelect({ questionLabel, status, onSelect, onClear }: Props) {
  const { t } = useTranslation('onboarding')
  const label = t('answerStatus.label', { question: questionLabel })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* #4818 — l'indication « exigée » vit dans la pastille de la carte (GA-26 : jamais deux fois). */}
      <SelectField
        size="sm"
        className="w-56"
        value={status === 'empty' ? undefined : status}
        onChange={next => onSelect(next as AnswerStatus)}
        options={ANSWER_STATUSES.map(s => ({ value: s, label: t(`answerStatus.${s}`) }))}
        placeholder={t('answerStatus.empty')}
        ariaLabel={label}
      />
      {status !== 'empty' && (
        <Button type="button" variant="plain" size="sm" onClick={onClear}>
          {t('answerStatus.clear')}
        </Button>
      )}
    </div>
  )
}
