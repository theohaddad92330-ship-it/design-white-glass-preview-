import { INTERVENTION_THRESHOLDS } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCollectionsWindow } from '../api'
import { collectionMonths, collectionStatus, isCollectible, overdueDaysAt } from '../collections'

/**
 * #3192.2 — LA CARTE « FACTURE À PLUS DE 30 JOURS », SUR SON ÉCRAN.
 *
 * Recette G3 du 11/10 (prod 3e15515f7a) : 0 occurrence sur `/missions/facturation`,
 * en prod comme en démo. Cause : la carte n'existait que comme bulle proactive de
 * Laura (`payment_overdue_30_days`), budgétée — une intervention par écran et par
 * visite, choisie dans l'ordre du rôle — donc absente dès qu'une autre clé gagne.
 * L'écran de catalogue ne peut pas dépendre d'un tirage : il porte sa carte.
 *
 * Elle lit les MÊMES factures que l'écran Encaissements, avec les MÊMES fonctions
 * (`collectionStatus`, `overdueDaysAt` → `overdueDaysFromDueOn`, GA-26) et le
 * MÊME seuil que la sonde de Laura (`INTERVENTION_THRESHOLDS.paymentOverdueDays`).
 * Le prédicat de la sonde en sort donc tel quel : émise, non soldée, échéance
 * CONNUE dépassée de plus de trente jours, litige en cours exclu.
 *
 * Aucun montant : BellumAI SUIT le financier, il ne comptabilise pas. Aucune ligne
 * quand il n'y a rien (une absence ne fait aucune ligne) ni pendant le chargement.
 */
export function OverdueThirtyDaysCard({ now }: { now?: Date }) {
  const { t } = useTranslation('missions')
  const reference = useMemo(() => now ?? new Date(), [now])
  const months = useMemo(() => collectionMonths(reference), [reference])
  const { items, isLoading } = useCollectionsWindow(months)
  const threshold = INTERVENTION_THRESHOLDS.paymentOverdueDays

  if (isLoading) return null
  const late = items
    .filter(isCollectible)
    .filter(item => collectionStatus(item, reference) === 'overdue')
    .map(item => overdueDaysAt(item.dueOn, reference))
    .filter((days): days is number => days !== null && days > threshold)
  if (late.length === 0) return null

  // Refonte Théo PR12 — `.t-banner.warn` de la maquette : le fait en gras, le geste à droite.
  return (
    <Box
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-card border px-4 py-3"
      style={{ background: 'var(--warning-soft-bg)', borderColor: 'var(--warning-soft-border)' }}
      data-testid="overdue-30-days-card"
    >
      <Text size="sm" weight="semibold" color="var(--warning-soft-text)" className="min-w-0 flex-[1_1_16rem]">
        {t('invoicing.overdue30.text', { count: late.length, days: threshold, oldest: Math.max(...late) })}
      </Text>
      <Link
        to="/missions/encaissements"
        className="inline-flex min-h-11 items-center rounded-control border border-[var(--bellum-border)] bg-card px-3 text-sm font-medium text-[var(--bellum-text-primary)] hover:border-[var(--bellum-text-accent)] md:min-h-8"
      >
        {t('invoicing.overdue30.action')}
      </Link>
    </Box>
  )
}
