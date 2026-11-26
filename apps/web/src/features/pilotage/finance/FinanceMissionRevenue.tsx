import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import type { MissionRevenueRow } from './finance-mission-revenue'
import { formatFinancePeriod } from './finance-period'

/**
 * #2564.1 — LE CA PAR MISSION, sur `/pilotage/finance`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE BLOC NE REFAIT PAS `/missions/suivi`
 * ─────────────────────────────────────────────────────────────────────────
 * D-22-2 (29/08/2026) a refusé « la grande table » qui fusionnerait CRA,
 * facturation, encaissements et marge par mission — refus levé le 31/08 pour
 * UN écran, `/missions/suivi`, qui la porte depuis. La reproduire ici serait
 * exactement la duplication que loi 4 du tome 7 interdit : « rien n'apparaît
 * deux fois sous la même forme avec le même contenu ».
 *
 * Ce bloc n'a qu'UNE colonne de fond — le CA (livré/facturable, puis
 * facturé) — pas les colonnes CRA/routines/margin de l'écran opérationnel. Il
 * suit exactement le patron déjà posé par `FinanceTimesheetBands` et
 * `FinanceAdvBlock` juste à côté : une lecture COMPACTE, avec un lien vers
 * l'écran qui porte le détail. `/missions/suivi` reste l'unique table
 * complète, jamais dupliquée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DONNÉE : UNE LECTURE DÉJÀ FAITE
 * ─────────────────────────────────────────────────────────────────────────
 * `readiness.data.items` (`GET /delivery/invoice-readiness`) était déjà
 * chargé par `FinanceScreen` pour sa bande de bloqueurs — jamais montré
 * ligne par ligne. `financeMissionRevenue` (`./finance-mission-revenue.ts`)
 * ne fait que les ordonner ; aucun montant n'est recalculé ici.
 */
export function FinanceMissionRevenue({
  items,
  loading,
  failed,
}: {
  items: MissionRevenueRow[] | null
  loading: boolean
  failed: boolean
}) {
  const { t, i18n } = useTranslation('pilotage')

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }
  if (failed || items === null) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.unavailable')}
      </Text>
    )
  }
  if (items.length === 0) {
    return (
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('finance.missionRevenue.empty')}
      </Text>
    )
  }

  const anyUnpriced = items.some(row => row.preparedAmountCents === null)

  return (
    <>
      <ResponsiveTable
        rows={items}
        rowKey={row => `${row.missionId}-${row.periodMonth}`}
        scrollLabel={t('finance.missionRevenue.title')}
        columns={[
          {
            key: 'mission',
            header: t('finance.missionRevenue.columns.mission'),
            mobile: 'title',
            className: 'max-w-[14rem] break-words',
            render: row => (
              <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} attribute={row.accountName} />
            ),
          },
          {
            key: 'period',
            header: t('finance.missionRevenue.columns.period'),
            mobile: 'meta',
            render: row => (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {formatFinancePeriod(row.periodMonth.slice(0, 7), i18n.language)}
              </Text>
            ),
          },
          {
            key: 'prepared',
            header: t('finance.missionRevenue.columns.prepared'),
            mobile: 'field',
            // Jamais `preparedAmountCents ?? 0` : une mission sans TJM ou sans
            // relevé n'a pas produit 0 € de CA, elle n'a simplement pas pu être
            // chiffrée. `UnknownValue` est déjà un `<Text>` — l'y remettre en
            // ferait un `<p>` dans un `<p>`, invalide en HTML.
            render: row =>
              row.preparedAmountCents === null ? (
                <UnknownValue bare />
              ) : (
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {formatCents(row.preparedAmountCents)}
                </Text>
              ),
          },
          {
            key: 'invoiced',
            header: t('finance.missionRevenue.columns.invoiced'),
            mobile: 'field',
            render: row =>
              row.invoicedAmountCents === null ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('finance.missionRevenue.notInvoiced')}
                </Text>
              ) : (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {formatCents(row.invoicedAmountCents)}
                </Text>
              ),
          },
        ]}
      />
      {/* #3483 — l'absence se dit UNE fois pour le tableau, pas dans chaque cellule. */}
      {anyUnpriced ? (
        <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]" data-testid="mission-revenue-absent">
          — {t('common:unknownValue')} — {t('finance.missionRevenue.preparedUnknown')}
        </Text>
      ) : null}
    </>
  )
}
