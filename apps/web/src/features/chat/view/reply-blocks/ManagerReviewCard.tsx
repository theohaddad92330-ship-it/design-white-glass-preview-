import { useTranslation } from 'react-i18next'
import { ClipboardList } from 'lucide-react'
import { Text } from '@bellum/ui'
import { CardLink, InlineLabel, ItemName, LabeledLines, NotEvaluated, ReplyCard, type BlockOf } from './ReplyCard'

type ManagerReviewVerdict = BlockOf<'manager_review'>['verdict']

const STATUS_LABEL_KEY: Record<ManagerReviewVerdict['status'], string> = {
  attention: 'blocks.managerReviewStatusAttention',
  stable: 'blocks.managerReviewStatusStable',
  not_evaluable: 'blocks.managerReviewStatusNotEvaluable',
}

const REASON_LABEL_KEY: Record<ManagerReviewVerdict['reasons'][number]['kind'], string> = {
  stalled_actions: 'blocks.managerReviewReasonStalledActions',
  risks: 'blocks.managerReviewReasonRisks',
  coverage_gaps: 'blocks.managerReviewReasonCoverageGaps',
  decisions_pending: 'blocks.managerReviewReasonDecisionsPending',
  arbitrations_pending: 'blocks.managerReviewReasonArbitrationsPending',
}

/**
 * #2985 (lot E07 08/10) — LA REVUE DE COMPTE MANAGER, EN CARTE.
 *
 * Bâtie du SEUL résultat de `get_account_manager_review` (`known_shape_gate.
 * manager_review_block_from_tool`), jamais du texte du modèle — recette 07/10
 * (lot R22) : « … sur Société Générale » ressortait encore en paragraphe.
 * Le verdict reste un STATUT fermé avec ses raisons COMPTÉES (jamais une
 * probabilité) ; les axes non lus restent NOMMÉS (`not_evaluated`, GA-18/19) ;
 * une section vide (aucun risque écrit, aucune couverture lue) ne s'affiche pas.
 */
export function ManagerReviewCard({ block }: { block: BlockOf<'manager_review'> }) {
  const { t } = useTranslation('chat')
  const { verdict } = block
  const reasons = verdict.reasons.map(reason => `${reason.count} ${t(REASON_LABEL_KEY[reason.kind])}`)
  return (
    <ReplyCard type={block.type} title={t('blocks.kind.manager_review')} icon={ClipboardList}>
      <ItemName name={block.account_name} href={block.href} />
      <InlineLabel label={t('blocks.managerReviewVerdict')}>
        {[t(STATUS_LABEL_KEY[verdict.status]), ...reasons].join(' · ')}
      </InlineLabel>
      {block.change_digest ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          <span className="font-medium text-[var(--bellum-text-primary)]">{t('blocks.managerReviewChangeDigest')}</span>{' '}
          {block.change_digest.changed_count} · {block.change_digest.appeared_count} ·{' '}
          {block.change_digest.disappeared_count}
        </Text>
      ) : null}
      <LabeledLines
        label={t('blocks.managerReviewActionsCompleted')}
        lines={block.actions_completed.map(a => [a.label, a.target, a.owner].filter(Boolean).join(' · '))}
      />
      <LabeledLines
        label={t('blocks.managerReviewActionsStalled')}
        lines={block.actions_stalled.map(a => [a.label, a.target, a.owner, a.due_date].filter(Boolean).join(' · '))}
      />
      <LabeledLines label={t('blocks.risks')} lines={block.risks.map(r => `${r.project} — ${r.risks}`)} />
      {block.coverage ? (
        <LabeledLines label={t('blocks.coverage')} lines={block.coverage.gaps.map(g => `${g.label} — ${g.reason}`)} />
      ) : null}
      <LabeledLines
        label={t('blocks.managerReviewImportantFacts')}
        lines={block.important_facts.map(f => [f.label, f.date].filter(Boolean).join(' · '))}
      />
      <LabeledLines
        label={t('blocks.managerReviewDecisionsRequested')}
        lines={block.decisions_requested.map(a => [a.label, a.target, a.owner].filter(Boolean).join(' · '))}
      />
      <LabeledLines
        label={t('blocks.managerReviewArbitrations')}
        lines={block.arbitrations_requested.map(a => `${a.consultant} — ${a.account_owner} / ${a.resource_owner}`)}
      />
      <NotEvaluated items={verdict.not_evaluated} />
      <div>
        <CardLink href={block.href}>{t('blocks.openFiche')}</CardLink>
      </div>
    </ReplyCard>
  )
}
