import { useTranslation } from 'react-i18next'
import { Rocket } from 'lucide-react'
import { Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { CardLink, InlineLabel, ItemName, ReplyCard, TopThenRest, type BlockOf } from './ReplyCard'

/**
 * #3392 / #3428 — LE SPRINT EXÉCUTABLE, QUAND LE VOLUME DEMANDÉ DÉPASSE LA
 * CAPACITÉ RÉELLE.
 *
 * Recette prod du 30/09 : la prose du prompt (`_BLOCK_ACCOUNT_VOLUME_SPRINT`)
 * demandait déjà les trois champs du focus, rien ne forçait leur présence à
 * l'écran. Cette carte les rend TOUS — `why_now`/`entry_point`/`first_move`
 * sont obligatoires au contrat, donc jamais absents ici.
 */
export function AccountVolumeSprintCard({ block }: { block: BlockOf<'account_volume_sprint'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.account_volume_sprint')} icon={Rocket}>
      <InlineLabel label={t('blocks.fullListCount')}>{block.full_list_count}</InlineLabel>
      {/* #3428 — la liste complète est une sortie : un lien qui l'ouvre, jamais seulement un chiffre. */}
      {block.full_list_href ? (
        <Text size="xs">
          <CardLink href={block.full_list_href}>{t('blocks.fullListOpen')}</CardLink>
        </Text>
      ) : null}
      <div>
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('blocks.sprint')}
        </Text>
        <div className="mt-0.5">
          <TopThenRest items={block.sprint} renderItem={item => <ItemName name={item.name} href={item.href} />} />
        </div>
      </div>
      <div className="space-y-2">
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('blocks.focus')}
        </Text>
        {block.focus.length === 0 && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('blocks.focusNone')}
          </Text>
        )}
        {block.focus.map((item, index) => (
          <div key={`focus-${index}`} className="space-y-1 rounded-md border border-[var(--bellum-border)] p-2">
            <ItemName name={item.name} href={item.href} />
            <InlineLabel label={t('blocks.whyNow')}>{renderInlineMarkdown(item.why_now)}</InlineLabel>
            <InlineLabel label={t('blocks.entryPoint')}>{renderInlineMarkdown(item.entry_point)}</InlineLabel>
            <InlineLabel label={t('blocks.firstMove')}>{renderInlineMarkdown(item.first_move)}</InlineLabel>
          </div>
        ))}
      </div>
    </ReplyCard>
  )
}
