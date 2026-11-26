import type { WorkspaceCostLedgerEntry } from '@/lib/workspace-cost-ledger'
import { dateEtHeure } from '@/lib/dates'
import { libelleCoutUsd, libelleStatutLedger } from './cost-ledger-panel.logic'

/**
 * LE LEDGER de coût IA, en lecture — épopée #2975 (« ledger minimal : table +
 * écriture à chaque appel modèle déjà compté + lecture admin »).
 *
 * La table (`provider_costs`) et l'écriture existaient déjà, testées, depuis
 * l'origine de la porte de budget (`checkGate`) — SANS AUCUN écran qui les
 * lise ligne par ligne : `checkGate` ne rend qu'une SOMME (le mois en cours,
 * sur trois plafonds), jamais le détail derrière. Ce panneau EST cette
 * lecture — sur la fiche ESN qui connaît déjà l'espace, même endroit que
 * `WorkspaceHealthPanel`.
 *
 * ⚠️ Jamais un total entre espaces (GA-43, doctrine) : cette page ne connaît
 * qu'UN espace, la requête l'est aussi.
 */
export function CostLedgerPanel({
  entries,
  panne,
}: {
  entries: WorkspaceCostLedgerEntry[] | null
  panne: string | null
}) {
  if (!entries) {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Ledger de coût IA (mois en cours)</div>
        <div className="error" style={{ padding: 12 }}>
          Indisponible — l&apos;API n&apos;a pas répondu. {panne}
        </div>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
      <div className="label">Ledger de coût IA (mois en cours)</div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Une ligne par appel modèle déjà compté, scopée à CET espace — jamais un total agrégé entre espaces.
      </p>
      {/* Doctrine : « on n'affiche pas ce qu'on n'a pas » — une liste vide ne
          fait AUCUNE ligne. */}
      {entries.length === 0 ? (
        <div className="empty" style={{ padding: 12 }}>
          Aucun appel facturable ce mois-ci.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Quand</th>
              <th>Fonctionnalité</th>
              <th>Fournisseur</th>
              <th>Opération</th>
              <th>Appels</th>
              <th>Unités</th>
              <th>Coût</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td>{dateEtHeure(entry.createdAt)}</td>
                <td>{entry.feature}</td>
                <td>{entry.provider}</td>
                <td>
                  {entry.operation}
                  {libelleStatutLedger(entry) && (
                    <span className="pill" style={{ marginLeft: 8 }}>
                      {libelleStatutLedger(entry)}
                    </span>
                  )}
                </td>
                <td>{entry.calls}</td>
                <td>{entry.units}</td>
                <td>{libelleCoutUsd(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
