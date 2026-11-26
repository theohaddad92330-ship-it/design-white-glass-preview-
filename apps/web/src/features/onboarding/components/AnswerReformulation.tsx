import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { useReformulateAnswer } from '@/features/onboarding/hooks/useReformulateAnswer'

type Props = {
  /** The question's label, ALREADY translated — the only context sent to
   *  Laura beyond the answer itself. */
  questionLabel: string
  /** The answer as currently typed. */
  value: string
  /** Called ONLY when the user picks « Utiliser cette version ». Never
   *  called on the model's response alone — that would silently overwrite
   *  what the user typed. */
  onApply: (text: string) => void
}

/**
 * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
 *
 * DÉCISION Louis (18/09/2026, QCM) : un VRAI appel au modèle, sur un geste
 * EXPLICITE — jamais à la frappe ni à la sortie du champ. Quatre règles
 * tenues ici :
 *
 * 1. Le bouton est la SEULE porte d'entrée (`handleReformulate`, appelé
 *    uniquement par son `onClick`).
 * 2. Onboarding gratuit de bout en bout (#2084.40-.45,
 *    `onboarding-is-free.spec.ts`) : aucun coût n'est annoncé, il n'y en a
 *    pas à annoncer.
 * 3. `onApply` n'est appelé QUE sur « Utiliser cette version » — « Garder ma
 *    version » referme le panneau sans jamais toucher la réponse d'origine.
 * 4. Un échec affiche une erreur et n'appelle jamais `onApply` — la
 *    proposition et l'erreur sont rattachées au texte EXACT sur lequel elles
 *    portent (`forValue` / `mutation.variables`) : éditer la réponse après
 *    coup les fait disparaître plutôt que de les laisser mentir sur un texte
 *    qui n'existe plus.
 */
export function AnswerReformulation({ questionLabel, value, onApply }: Props) {
  const { t, i18n } = useTranslation('onboarding')
  const mutation = useReformulateAnswer()
  const [proposal, setProposal] = useState<{ forValue: string; reformulated: string } | null>(null)

  const trimmed = value.trim()
  // Rien à reformuler : le bouton n'a pas de sens sur un champ vide, et
  // aucune règle ne demande de le montrer désactivé.
  if (trimmed.length === 0) return null

  const activeProposal = proposal && proposal.forValue === trimmed ? proposal : null
  const activeError = mutation.isError && mutation.variables?.answerText === trimmed

  const handleReformulate = (): void => {
    const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
    mutation.mutate(
      { questionLabel, answerText: trimmed, locale },
      { onSuccess: response => setProposal({ forValue: trimmed, reformulated: response.reformulated }) },
    )
  }

  if (activeProposal) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
        <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {t('questionField.reformulateProposalLabel')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
          {activeProposal.reformulated}
        </Text>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              onApply(activeProposal.reformulated)
              setProposal(null)
            }}
          >
            {t('questionField.reformulateUseSuggestion')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setProposal(null)}>
            {t('questionField.reformulateKeepMine')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={Sparkles}
        iconPosition="left"
        isLoading={mutation.isPending}
        onClick={handleReformulate}
      >
        {t('questionField.reformulateButton')}
      </Button>
      {activeError && (
        <Text element="p" size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {t('questionField.reformulateError')}
        </Text>
      )}
    </div>
  )
}
