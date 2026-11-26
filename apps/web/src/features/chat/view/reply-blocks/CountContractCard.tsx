import { useTranslation } from 'react-i18next'
import { Hash } from 'lucide-react'
import { Text } from '@bellum/ui'
import { InlineLabel, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

type CountContract = BlockOf<'count_contract'>

/**
 * #213.2 (#3207, épopée #3228) — le contrat de comptage, en carte.
 *
 * Avant cette carte, `count_contract` voyageait jusqu'au modèle (qui pouvait
 * le citer en texte libre, « 41 contacts »), jamais jusqu'à un composant qui
 * NOMME ce que le chiffre porte : une déduplication déjà appliquée ou non, une
 * résolution d'identité inter-comptes absente, un volume trop faible pour un
 * chiffre précis (#213.6).
 *
 * CE QUE LA CARTE NE MONTRE PAS À DESSEIN : `unique_key` (une clé interne de
 * dédup, jamais un texte pour un utilisateur) et `entity_scope` — sa forme
 * varie selon l'appelant (un nom d'entreprise lisible pour `search_market_memory`,
 * mais un UUID de compte pour `get_account_contacts`, une chaîne de critères
 * pour `search_workspace_contacts`) : l'afficher tel quel montrerait parfois un
 * identifiant technique. `scope` seul (déjà un mot du domaine : compte,
 * entreprise, espace) porte le contexte sans ce risque.
 */
export function CountContractCard({ block }: { block: CountContract }) {
  const { t } = useTranslation('chat')
  const belowThreshold = block.suppression_threshold != null && block.raw_count < block.suppression_threshold
  const unit = (count: number) =>
    t(`blocks.countContract.unit.${block.object_type}`, { count, defaultValue: block.object_type })
  const scopeLabel = t(`blocks.countContract.scope.${block.scope}`, { defaultValue: block.scope })

  return (
    <ReplyCard type={block.type} title={t('blocks.kind.count_contract')} icon={Hash}>
      <div className="flex items-baseline gap-1.5">
        {belowThreshold ? (
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('blocks.countContract.belowThreshold', { threshold: block.suppression_threshold, unit: unit(2) })}
          </Text>
        ) : (
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {block.raw_count} {unit(block.raw_count)}
          </Text>
        )}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {scopeLabel}
        </Text>
      </div>
      {block.deduplicated_count != null ? (
        <InlineLabel label={t('blocks.deduplicated')}>{block.deduplicated_count}</InlineLabel>
      ) : null}
      {block.resolved_count != null ? (
        <InlineLabel label={t('blocks.resolvedIdentity')}>{block.resolved_count}</InlineLabel>
      ) : null}
      {block.confidence != null ? (
        <InlineLabel label={t('blocks.countContract.confidence')}>{`${block.confidence}/100`}</InlineLabel>
      ) : null}
      {block.coverage ? <InlineLabel label={t('blocks.coverage')}>{block.coverage}</InlineLabel> : null}
      {block.source_layers.length ? (
        <InlineLabel label={t('blocks.countContract.sources')}>
          {block.source_layers
            .map(layer => t(`blocks.countContract.sourceLayer.${layer}`, { defaultValue: layer }))
            .join(' · ')}
        </InlineLabel>
      ) : null}
      <LabeledLines label={t('blocks.limits')} lines={block.caveats} />
    </ReplyCard>
  )
}
