import { Button, Card, Text } from '@bellum/ui'
import { HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAnalysisEntityQuestion, useAnswerEntityQuestion } from '@/features/accounts/hooks/useAnalysisEntityQuestion'

/**
 * #2164.17 — CORRIGER UNE AMBIGUÏTÉ PENDANT LE JOB.
 *
 * L'analyse lancée sur un nom a trouvé plusieurs sociétés homonymes : elle
 * s'est mise en pause après la recherche, avant de payer contacts et plan sur
 * une hypothèse. La carte nomme chaque société (nom, SIREN, ville) ; un clic
 * reprend l'analyse sur celle-là. Sans réponse, l'analyse reprend seule sur
 * l'hypothèse, nommée ici — jamais un run bloqué. Pas de question ⇒ rien.
 */
export function AnalysisEntityQuestionCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountDetail')
  const { data } = useAnalysisEntityQuestion(accountId, true)
  const answer = useAnswerEntityQuestion(accountId)
  const question = data?.question ?? null
  if (!question) return null

  const hypothesis = question.candidates.find(candidate => candidate.siren === question.hypothesisSiren) ?? null
  return (
    <Card className="p-4" data-testid="entity-question-card">
      <div className="flex items-center gap-2">
        <HelpCircle className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('entityQuestion.title')}
        </Text>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('entityQuestion.body')}
      </Text>
      <ul className="mt-3 flex flex-col gap-2">
        {question.candidates.map(candidate => (
          <li key={candidate.siren}>
            <Button
              variant="outline"
              className="min-h-11 w-full justify-start text-left"
              disabled={answer.isPending}
              onClick={() => answer.mutate(candidate.siren)}
            >
              {[candidate.name, t('entityQuestion.siren', { siren: candidate.siren }), candidate.city]
                .filter((part): part is string => Boolean(part))
                .join(' · ')}
            </Button>
          </li>
        ))}
      </ul>
      {hypothesis ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]" data-testid="entity-question-fallback">
          {t('entityQuestion.fallback', { name: hypothesis.name })}
        </Text>
      ) : null}
    </Card>
  )
}
