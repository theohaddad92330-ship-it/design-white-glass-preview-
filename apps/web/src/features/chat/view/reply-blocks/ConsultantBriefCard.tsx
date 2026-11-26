import { useTranslation } from 'react-i18next'
import { UserSearch } from 'lucide-react'
import { renderInlineMarkdown } from '../markdown'
import { InlineLabel, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #3340 (LAU-FINAL-250) — le brief provisoire d'un consultant décrit PAR
 * MORCEAUX, sans CV ni fiche complète : chaque champ connu a sa place, chaque
 * champ encore inconnu reste ABSENT (jamais deviné) — `unknowns` seul est
 * garanti par le contrat (min 1) et NOMME ce qui manque encore, comme
 * `not_evaluated` sur un classement : un score n'est jamais nu.
 *
 * Recette prod du 30/09 (#3340, retour de recette) : avant cette carte, le
 * prompt listait les douze champs pour l'EXTRACTION du modèle mais rien ne
 * forçait leur présence dans la réponse — seuls quatre champs sur douze
 * ressortaient à l'écran. Un contrat de champs fixe ferme ce trou.
 */
export function ConsultantBriefCard({ block }: { block: BlockOf<'consultant_brief'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.consultant_brief')} icon={UserSearch}>
      {block.role ? <InlineLabel label={t('blocks.role')}>{renderInlineMarkdown(block.role)}</InlineLabel> : null}
      <LabeledLines label={t('blocks.previousRoles')} lines={block.previous_roles} />
      {block.seniority ? (
        <InlineLabel label={t('blocks.seniority')}>{renderInlineMarkdown(block.seniority)}</InlineLabel>
      ) : null}
      {block.tech_focus ? (
        <InlineLabel label={t('blocks.techFocus')}>{renderInlineMarkdown(block.tech_focus)}</InlineLabel>
      ) : null}
      {block.functional_focus ? (
        <InlineLabel label={t('blocks.functionalFocus')}>{renderInlineMarkdown(block.functional_focus)}</InlineLabel>
      ) : null}
      <LabeledLines label={t('blocks.technologies')} lines={block.technologies} />
      <LabeledLines label={t('blocks.sectors')} lines={block.sectors} />
      {block.contract_type ? (
        <InlineLabel label={t('blocks.contractType')}>{renderInlineMarkdown(block.contract_type)}</InlineLabel>
      ) : null}
      {block.availability ? (
        <InlineLabel label={t('blocks.availability')}>{renderInlineMarkdown(block.availability)}</InlineLabel>
      ) : null}
      {block.mobility ? (
        <InlineLabel label={t('blocks.mobility')}>{renderInlineMarkdown(block.mobility)}</InlineLabel>
      ) : null}
      {block.work_mode ? (
        <InlineLabel label={t('blocks.workMode')}>{renderInlineMarkdown(block.work_mode)}</InlineLabel>
      ) : null}
      {block.rate_target ? (
        <InlineLabel label={t('blocks.rateTarget')}>{renderInlineMarkdown(block.rate_target)}</InlineLabel>
      ) : null}
      <LabeledLines label={t('blocks.unknowns')} lines={block.unknowns} />
    </ReplyCard>
  )
}
