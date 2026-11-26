import type { BlockOf } from './ReplyCard'

type RankedAccount = BlockOf<'account_ranking'>['items'][number]

type Translate = (key: string) => string

/**
 * #4073.5 — LES FAITS du classement, pas seulement son texte : rang, niveau, ce qui n'a pas pu être évalué,
 * source avec sa date et sa nature. Une valeur absente est une cellule VIDE — jamais « 0 », jamais un mot
 * deviné. Un seul tableau, deux sorties (CSV et feuille Google) : elles ne peuvent pas diverger.
 */
export function rankingExportTable(
  items: readonly RankedAccount[],
  axes: readonly string[],
  t: Translate,
): { columns: string[]; rows: string[][] } {
  const columns = [
    t('blocks.exportHeaders.rank'),
    t('blocks.exportHeaders.name'),
    t('blocks.exportHeaders.level'),
    t('blocks.exportHeaders.verdict'),
    t('blocks.exportHeaders.why'),
    t('blocks.exportHeaders.whyNow'),
    t('blocks.exportHeaders.limits'),
    t('blocks.exportHeaders.notEvaluated'),
    t('blocks.exportHeaders.source'),
    t('blocks.exportHeaders.sourceDate'),
    t('blocks.exportHeaders.sourceBasis'),
    t('blocks.exportHeaders.rankedBy'),
  ]
  const rankedBy = axes.join(' · ')
  const rows = items.map((item, index) => [
    String(index + 1),
    item.name,
    item.level ? t(`replyBadges.status.${item.level}`) : '',
    item.verdict ?? '',
    item.why.join(' · '),
    item.why_now ?? '',
    item.limits?.join(' · ') ?? '',
    item.not_evaluated?.join(' · ') ?? '',
    item.source?.label ?? '',
    item.source?.as_of ?? '',
    item.source?.basis ? t(`blocks.exportHeaders.basis.${item.source.basis}`) : '',
    rankedBy,
  ])
  return { columns, rows }
}
