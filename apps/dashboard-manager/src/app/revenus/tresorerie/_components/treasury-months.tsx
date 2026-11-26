'use client'

import { DataTable, EmptyState, type DataTableColumn } from '@/ui'
import type { TreasuryMonthView } from '@/lib/business-metrics'
import { formaterEuros, libelleMois } from '../../revenus.logic'

/**
 * L'historique de trésorerie, mois par mois (#1649).
 *
 * ⚠️ Chaque case absente affiche « — ». Un mois où l'on n'a rien relevé et un
 * mois où l'on n'a rien dépensé ne se ressemblent pas ici, et c'est tout
 * l'intérêt de la colonne : c'est elle qui dit ce qu'il reste à saisir.
 *
 * ⚠️ Le tableau défile dans SON conteneur (`maxHeight`), jamais le corps de la
 * page — la loi D81 du produit, tenue ici par la primitive.
 */
export function TreasuryMonths({ mois }: { mois: TreasuryMonthView[] }) {
  if (mois.length === 0) {
    return (
      <section className="card" style={{ margin: '0 0 20px', padding: 20 }}>
        <EmptyState
          icon="€"
          message="Aucun mois saisi. Le burn et le runway resteront « non mesurés » tant qu’il n’y en a pas deux."
        />
      </section>
    )
  }

  const colonnes: DataTableColumn<TreasuryMonthView>[] = [
    {
      key: 'month',
      header: 'Mois',
      sortValue: row => row.month,
      render: row => libelleMois(row.month),
    },
    {
      key: 'balance',
      header: 'Solde au 1er',
      align: 'right',
      sortValue: row => row.bankBalanceCents,
      render: row => formaterEuros(row.bankBalanceCents),
    },
    {
      key: 'fixed',
      header: 'Fixes',
      align: 'right',
      sortValue: row => row.fixedExpensesCents,
      render: row => formaterEuros(row.fixedExpensesCents),
    },
    {
      key: 'variable',
      header: 'Variables',
      align: 'right',
      sortValue: row => row.variableExpensesCents,
      render: row => formaterEuros(row.variableExpensesCents),
    },
    {
      key: 'collected',
      header: 'Encaissements',
      align: 'right',
      sortValue: row => row.collectedCents,
      render: row => formaterEuros(row.collectedCents),
    },
    {
      key: 'burn',
      header: 'Burn',
      align: 'right',
      sortValue: row => row.burnCents,
      render: row => formaterEuros(row.burnCents),
    },
  ]

  // Du plus récent au plus ancien : le mois qu'on vient de saisir en tête.
  const lignes = [...mois].reverse()

  return (
    <section style={{ margin: '0 0 20px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Historique</h2>
      <DataTable rows={lignes} columns={colonnes} rowKey={row => row.month} maxHeight={420} />
    </section>
  )
}
