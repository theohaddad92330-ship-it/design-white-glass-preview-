import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import type { financeBilling } from './finance-billing'

type Billing = ReturnType<typeof financeBilling>
type Group = { count: number; amountCents: number | null; withoutAmount: number }

/**
 * La rangée FACTURATION — préparé / facturé / à préparer.
 *
 * Doctrine : « préparée » n'est ni « créée » ni « envoyée », et « facturé » ne
 * s'écrit que sur PREUVE du connecteur — sa SOURCE se nomme. Ici : les lignes
 * prouvées (`invoiced`) sont attribuées à l'outil branché par l'espace, nommé
 * par injection (jamais en dur) ; les lignes seulement déclarées le sont par
 * l'équipe, et le disent.
 */
export function FinanceBilling({
  billing,
  managementTool,
  loading,
  failed,
}: {
  billing: Billing
  /** Le nom de l'outil branché, ou `null` — jamais un nom écrit en dur. */
  managementTool: string | null
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation('pilotage')
  if (loading || failed) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {loading ? t('loading') : t('finance.unavailable')}
      </Text>
    )
  }
  const { invoiced } = billing
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <Tile title={t('finance.billing.prepared')} group={billing.prepared} note={t('finance.billing.preparedNote')} />
        <Tile
          title={t('finance.billing.invoiced')}
          group={invoiced}
          note={
            invoiced.count === 0
              ? null
              : [
                  invoiced.proven > 0
                    ? managementTool
                      ? t('finance.billing.provenBy', { count: invoiced.proven, tool: managementTool })
                      : t('finance.billing.provenNoTool', { count: invoiced.proven })
                    : null,
                  invoiced.declared > 0 ? t('finance.billing.declared', { count: invoiced.declared }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
        />
        <Tile
          title={t('finance.billing.toPrepare')}
          group={billing.toPrepare}
          note={t('finance.billing.toPrepareNote')}
        />
      </div>
      <Link
        to="/missions/facturation"
        aria-label={t('finance.detailAria', { title: t('finance.rows.billing.title') })}
        className="inline-flex w-fit items-center rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
      >
        {t('finance.detail')}
      </Link>
    </div>
  )
}

function Tile({ title, group, note }: { title: string; group: Group; note: string | null }) {
  const { t } = useTranslation('pilotage')
  return (
    <div className="min-w-0 rounded-md border border-[var(--bellum-border)] p-2">
      <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      {/* Un groupe vide est un fait vrai (« aucune ligne »), pas un montant : on
          n'écrit pas « 0 € » sous un compte de zéro, on écrit le compte. */}
      {group.count > 0 ? (
        group.amountCents === null ? (
          <Text size="sm" className="block text-[var(--bellum-text-muted)]">
            {t('finance.billing.amountUnknown')}
          </Text>
        ) : (
          <Text size="lg" weight="semibold" className="block text-[var(--bellum-text-primary)]">
            {formatCents(group.amountCents)}
          </Text>
        )
      ) : null}
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('finance.billing.lines', { count: group.count })}
        {group.withoutAmount > 0 && group.amountCents !== null
          ? ` · ${t('finance.floor', { count: group.withoutAmount })}`
          : ''}
      </Text>
      {note ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {note}
        </Text>
      ) : null}
    </div>
  )
}
