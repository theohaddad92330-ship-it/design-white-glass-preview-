import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useTargetLists } from '@/features/target-lists/api'
import { SellerTargeting } from '@/features/target-lists/view/TargetListCard'

/**
 * #3753.2/.3 — « Votre ciblage » sur le dossier d'un compte : ce que l'ESN a
 * elle-même dit de ce compte dans sa liste cible (Tier A/B/C, raison,
 * problématiques adressables, projets IT à venir), nommé comme venant d'ELLE —
 * des hypothèses du vendeur, pas des faits collectés par l'analyse.
 *
 * Lu sur les listes cibles de l'espace (même source que Mes cibles, jamais une
 * copie). Aucun ciblage sur ce compte = aucune carte : on n'affiche pas ce
 * qu'on n'a pas.
 */
export function AccountSellerTargeting({ accountId }: { accountId: string }) {
  const { t } = useTranslation('targets')
  const { data: lists } = useTargetLists()
  const item = (lists ?? [])
    .flatMap(list => list.items)
    .find(
      candidate =>
        candidate.kind === 'account' &&
        candidate.ref_id === accountId &&
        candidate.removed_at == null &&
        (candidate.tier_label ||
          candidate.selection_reason ||
          candidate.seller_hypotheses?.addressable_issues ||
          candidate.seller_hypotheses?.upcoming_it_projects),
    )
  if (!item) return null
  return (
    <section
      aria-label={t('sellerTargeting.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
        {t('sellerTargeting.title')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('sellerTargeting.provenance')}
      </Text>
      <SellerTargeting item={item} />
    </section>
  )
}
