import { Card, EmptyState } from '@bellum/ui'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { AccountAnalysisAbsence } from '../../helpers/analysisAbsence'

/**
 * #2502.2 — POURQUOI la Synthèse n'a pas de score, quatre réponses jamais
 * une seule (même défaut, même correctif que `plan/planAbsence.ts` : « cassé »
 * et « non mesurable » se lisaient comme la même phrase, « Score à compléter »,
 * qu'une analyse tourne encore, ait échoué, n'ait jamais eu lieu, ou ait
 * réellement abouti sans rien à recommander).
 *
 * `analysis-complete` GARDE la copie d'origine (`emptyEvaluation.title` /
 * `.description`) — c'est le SEUL cas où elle était juste : l'analyse a
 * abouti et il n'y a réellement rien à dire.
 */
const ABSENCE_COPY: Readonly<Record<AccountAnalysisAbsence, { title: string; description: string }>> = {
  'analysis-running': { title: 'emptyEvaluation.runningTitle', description: 'emptyEvaluation.runningDescription' },
  'analysis-incomplete': {
    title: 'emptyEvaluation.incompleteTitle',
    description: 'emptyEvaluation.incompleteDescription',
  },
  'not-analyzed': {
    title: 'emptyEvaluation.notAnalyzedTitle',
    description: 'emptyEvaluation.notAnalyzedDescription',
  },
  'analysis-complete': { title: 'emptyEvaluation.title', description: 'emptyEvaluation.description' },
}

export function EmptyEvaluationCard({ absence = 'analysis-complete' }: { absence?: AccountAnalysisAbsence }) {
  const { t } = useTranslation('accountDetail')
  const copy = ABSENCE_COPY[absence]
  return (
    <motion.div variants={cardFade}>
      <Card className="bg-[var(--bellum-bg)] p-0 [--card-spacing:0px]">
        <EmptyState
          size="md"
          align="start"
          icon={<TrendingUp className="size-8" />}
          title={t(copy.title)}
          description={t(copy.description)}
          className="px-5"
        />
      </Card>
    </motion.div>
  )
}
