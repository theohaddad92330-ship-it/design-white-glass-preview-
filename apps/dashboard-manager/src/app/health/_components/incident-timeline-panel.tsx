import { dateEtHeure } from '@/lib/dates'
import type { IncidentTimelineReport } from '@/lib/operator-health'
import { CAUSE, VERBE } from './client-facing-errors'
import { depuisCombienDeTemps, libelleTransition } from './incident-timeline-panel.logic'
import { IncidentOpsRow } from './incident-ops-row'

/**
 * #2445.12 (épopée #2766) — la CHRONOLOGIE des transitions de connecteur, la
 * plus petite tranche prouvable d'un « incident » : QUAND une capacité a
 * cessé, ou repris, de répondre.
 *
 * ⚠️ CE QUE CE TABLEAU N'EST PAS — ET IL FAUT LE DIRE
 * `connector_capability_probes` écrasait sa dernière observation à chaque
 * appel (« la dernière observation fait foi, point ») : rien n'y gardait de
 * MOMENT. `ConnectorProbeService` journalise désormais chaque transition
 * réelle (`connector_capability_incidents`), ceci l'affiche.
 *
 * #2445.12 (lot SRC5 28/09 soir) — l'IMPACT (combien d'espaces), les ACTIONS
 * prises et la COMMUNICATION, jusqu'ici hors de cette tranche, se déplient
 * désormais sous chaque ligne « a cessé de répondre » (`IncidentOpsRow`) : un
 * clic sur « Détails », jamais chargé avant.
 *
 * Même vocabulaire que « Ce qui casse, vu du client » (`VERBE`/`CAUSE`,
 * GA-26) : les deux tableaux lisent la même distinction capacité/incident.
 */
export function IncidentTimelinePanel({ report }: { report: IncidentTimelineReport }) {
  return (
    <section style={{ marginTop: 28 }}>
      {/* #2445.12 — vue de TRIAGE : ce qui est cassé MAINTENANT (dernière transition
          connue de la capacité = « a cessé de répondre »). Aucune ligne = rien
          d'ouvert connu ; jamais un « 0 incident » affirmé. */}
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Incidents ouverts</h2>
      {report.open.length === 0 ? (
        <p className="muted" style={{ marginBottom: 20 }}>
          Aucun incident ouvert connu dans le journal des transitions.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Ce que le client essaie de faire</th>
                <th>Depuis</th>
                <th>Cause</th>
                <th>Impact / actions</th>
              </tr>
            </thead>
            <tbody>
              {report.open.map(entry => (
                <tr key={`open-${entry.id}`}>
                  <td>{VERBE[entry.capability] ?? entry.capability}</td>
                  <td>{depuisCombienDeTemps(entry.occurredAt) ?? dateEtHeure(entry.occurredAt)}</td>
                  <td style={{ color: 'var(--muted)' }}>{entry.code ? (CAUSE[entry.code] ?? entry.code) : '—'}</td>
                  <td>
                    <IncidentOpsRow incidentId={entry.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Chronologie des transitions</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Les 50 dernières fois qu'une capacité a cessé de répondre, ou s'est rétablie. Jamais un incident complet
        (impact, actions, communication) — seulement le fait daté.
      </p>

      {report.entries.length === 0 ? (
        <p className="muted">
          Aucune transition journalisée. ⚠️ Ce n&apos;est pas la preuve que rien n&apos;a jamais cassé : ce journal est
          neuf — une panne survenue avant sa mise en place n&apos;y figure pas.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Ce que le client essayait de faire</th>
                <th>Évènement</th>
                <th>Quand</th>
                <th>Cause</th>
                <th>Impact / actions</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry, index) => (
                <tr key={`${entry.capability}-${entry.occurredAt}-${index}`}>
                  <td>{VERBE[entry.capability] ?? entry.capability}</td>
                  <td>{libelleTransition(entry.transition)}</td>
                  <td>{dateEtHeure(entry.occurredAt)}</td>
                  <td style={{ color: 'var(--muted)' }}>{entry.code ? (CAUSE[entry.code] ?? entry.code) : '—'}</td>
                  <td>
                    {/* #2445.12 — l'IMPACT ne se calcule que depuis le DÉBUT
                        d'un incident : une ligne « s'est rétablie » n'en ouvre
                        aucun, elle referme celui d'avant. */}
                    {entry.transition === 'degraded' ? <IncidentOpsRow incidentId={entry.id} /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
