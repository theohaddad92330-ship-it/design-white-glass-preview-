import type { Account } from '@bellum/contracts'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AccountQualificationCard } from '@/features/qualification-grid/view/AccountQualificationCard'
import { stagger } from '../motion'
import { accountAnalysisAbsence } from '../helpers/analysisAbsence'
import { EmptyEvaluationCard } from './evaluation/EmptyEvaluationCard'
import { buildEvaluationViewData } from './evaluation/evaluationViewData'
import { OpenAccountCard } from './evaluation/OpenAccountCard'
import { RecommendationCard } from './evaluation/RecommendationCard'
import { ScoreSummaryCard } from './evaluation/ScoreSummaryCard'
import { SignalListCard } from './evaluation/SignalListCard'
import { toSignalListItem } from './evaluation/evidenceNote'

export function TabEvaluation({ account }: { account: Account }) {
  const { t } = useTranslation('accountDetail')
  const data = buildEvaluationViewData(account)
  // p28 : chaque quick win / risque montre SA preuve et SA date de recalcul.
  const quickWins = data.quickWins.map(item => toSignalListItem(item, t))
  const risks = data.risks.map(item => toSignalListItem(item, t))

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="flex min-h-0 flex-col gap-6 py-4 xl:flex-row xl:items-start"
    >
      <div className="min-w-0 flex-1 space-y-6">
        <ScoreSummaryCard data={data} />
        {/* #3755 — la grille de qualification de l'espace, axe par axe. Ne
            s'affiche pas sans grille active : la fiche reste celle d'avant. */}
        <AccountQualificationCard accountId={account.id} />
        {data.recommendation ? <RecommendationCard recommendation={data.recommendation} /> : null}
        {/* #2502.2 — POURQUOI, jamais une seule phrase pour les quatre causes
            possibles (voir le docblock de `EmptyEvaluationCard`). */}
        {!data.recommendation && !data.hasEvaluation ? (
          <EmptyEvaluationCard absence={accountAnalysisAbsence(account)} />
        ) : null}
        <OpenAccountCard accountId={account.id} />
        {/* Garde-fous (data_reliability_notes) : retirés de l'affichage partout
            (Louis 13/10/2026) — la donnée reste stockée, rien ne la rend. */}
      </div>

      <aside className="flex w-full flex-col gap-4 xl:w-80 xl:shrink-0">
        <SignalListCard
          title={t('evaluation.quickWinsTitle')}
          description={t('evaluation.quickWinsDescription')}
          items={quickWins}
          emptyText={t('evaluation.quickWinsEmpty')}
          icon={<CheckCircle2 className="size-4 text-[var(--success-soft-text)]" />}
        />
        <SignalListCard
          title={t('evaluation.risksTitle')}
          description={t('evaluation.risksDescription')}
          items={risks}
          emptyText={t('evaluation.risksEmpty')}
          icon={<AlertTriangle className="size-4 text-[var(--warning-soft-text)]" />}
        />
      </aside>
    </motion.div>
  )
}
