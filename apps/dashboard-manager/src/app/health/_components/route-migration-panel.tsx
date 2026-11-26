import type { AdminRouteMigrationReport } from '@/lib/admin'
import {
  statutCoexistence,
  statutMetriques,
  statutNonRegression,
  statutRollback,
  statutRouteMigration,
  statutRouteMigration2208,
} from './route-migration-panel.logic'

const TARGET_STATUS_LABEL: Record<string, string> = {
  redirected: 'redirigée',
  removed: 'retirée (introuvable)',
  never_renamed: 'jamais renommée',
  unverifiable_shallow_clone: 'non vérifiable',
}

const TARGET_STATUS_CLASS: Record<string, string> = {
  redirected: 'completed',
  removed: 'completed',
  never_renamed: 'analyzing',
  unverifiable_shallow_clone: 'analyzing',
}

const NO_GO_STATUS_CLASS: Record<string, string> = {
  clear: 'completed',
  blocked: 'error',
  not_yet_evaluable: 'analyzing',
}

const GO_STATUS_CLASS: Record<string, string> = {
  met: 'completed',
  not_met: 'error',
  unknown: 'analyzing',
}

/**
 * #2958 — LE PREMIER ÉCRAN du registre de migration de routes (#2154.3) et
 * des conditions NO-GO/GO (#2154.31/.32) : les deux fichiers de
 * `@bellum/contracts` existaient, testés, depuis le lot du 26/09 05:01, sans
 * qu'aucun écran ni endpoint ne les lise (`git grep` vide sur leurs exports
 * hors de leur propre fichier).
 *
 * Lecture seule, comme le reste de cette page : aucune redirection ne se
 * crée depuis cet écran, aucune coupure ne se déclenche — ce registre DIT
 * l'état, il ne l'agit pas.
 */
const COEXISTENCE_MODE_LABEL: Record<string, string> = {
  vue_partagee: 'vue partagée',
  redirection_pure: 'redirection pure',
  non_verifiable: 'non vérifiable',
}

const NONREGRESSION_STATUS_CLASS: Record<string, string> = {
  verified: 'completed',
  gap: 'error',
}

const METRIC_STATUS_CLASS: Record<string, string> = {
  instrumented: 'completed',
  gap: 'error',
}

export function RouteMigrationPanel({ report }: { report: AdminRouteMigrationReport }) {
  const statut = statutRouteMigration(report)
  const rollback = statutRollback(report)
  const coexistence = statutCoexistence(report)
  const nonRegression = statutNonRegression(report)
  const statut2208 = statutRouteMigration2208(report)
  const metrics = statutMetriques(report)

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>
        Migration de routes (n° 2154){'  '}
        <span className={`badge ${statut.pret ? 'completed' : 'error'}`}>{statut.libelle}</span>
      </h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {statut.redirectedCount} redirigée(s) vérifiée(s) par test sur {statut.total} routes nommées (n° 2154.4/.5),{' '}
        {statut.gapCount} reste(nt) sans preuve de redirection.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Statut</th>
              <th>Destination</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            {report.registry.entries.map(entry => (
              <tr key={entry.key}>
                <td className="mono">{entry.currentRoute}</td>
                <td>
                  <span className={`badge ${TARGET_STATUS_CLASS[entry.targetStatus] ?? 'analyzing'}`}>
                    {TARGET_STATUS_LABEL[entry.targetStatus] ?? entry.targetStatus}
                  </span>
                </td>
                <td className="mono">{entry.newDestination ?? '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{entry.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Conditions NO-GO (n° 2154.31)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Condition</th>
              <th>Statut</th>
              <th>Preuve</th>
            </tr>
          </thead>
          <tbody>
            {report.goNoGo.noGo.map(condition => (
              <tr key={condition.key}>
                <td>{condition.label}</td>
                <td>
                  <span className={`badge ${NO_GO_STATUS_CLASS[condition.status] ?? 'analyzing'}`}>
                    {condition.status}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{condition.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Conditions GO (n° 2154.32)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Condition</th>
              <th>Statut</th>
              <th>Preuve</th>
            </tr>
          </thead>
          <tbody>
            {report.goNoGo.go.map(condition => (
              <tr key={condition.key}>
                <td>
                  {condition.label}
                  {condition.humanOnly && (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}> · recette humaine</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${GO_STATUS_CLASS[condition.status] ?? 'analyzing'}`}>
                    {condition.status}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{condition.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Rollback de déploiement (n° 2154.7)</h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {rollback.rollbackableCount} route(s) sur {rollback.total} peuvent être défaites (fichier de redirection à usage
        unique) ; {rollback.notRollbackableCount} n&apos;ont aucune migration prouvée à annuler.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Étape atteinte</th>
              <th>Rollback</th>
            </tr>
          </thead>
          <tbody>
            {report.rollback.entries.map(entry => (
              <tr key={entry.key}>
                <td className="mono">{entry.key}</td>
                <td>{entry.stageReached ?? '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {entry.canRollback ? entry.rollbackAction : 'Aucun rollback possible'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Coexistence des projections (n° 2154.8)</h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {coexistence.sharedViewCount} route(s) partagent réellement une page (vue) ; {coexistence.pureRedirectCount}{' '}
        n&apos;ont plus qu&apos;une projection vivante — rien à faire coexister.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Mode</th>
              <th>Donnée canonique</th>
            </tr>
          </thead>
          <tbody>
            {report.coexistence.entries.map(entry => (
              <tr key={entry.key}>
                <td className="mono">{entry.key}</td>
                <td>
                  <span className="badge">{COEXISTENCE_MODE_LABEL[entry.mode] ?? entry.mode}</span>
                </td>
                <td className="mono">{entry.canonicalDataSource ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>
        Non-régression — treize dimensions (n° 2154.9, #2958.72-.93)
      </h3>
      {nonRegression.capacityLabel ? (
        <>
          <p className="subtitle" style={{ marginBottom: 12 }}>
            {nonRegression.capacityLabel} — {nonRegression.verifiedCount} dimension(s) vérifiée(s) sur{' '}
            {nonRegression.total}. Au total, {nonRegression.capacitiesCount} capacité(s) :{' '}
            {nonRegression.allVerifiedCount} dimension(s) vérifiée(s) sur {nonRegression.allTotal}.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Statut</th>
                  <th>Preuve</th>
                </tr>
              </thead>
              <tbody>
                {report.nonRegression.capacities[0]?.checks.map(check => (
                  <tr key={check.dimension}>
                    <td className="mono">{check.dimension}</td>
                    <td>
                      <span className={`badge ${NONREGRESSION_STATUS_CLASS[check.status] ?? 'analyzing'}`}>
                        {check.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{check.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>
        Conditions NO-GO/GO propres à la demande n° 2208 (n° 2958.94-.112){'  '}
        <span className={`badge ${statut2208.pret ? 'completed' : 'error'}`}>{statut2208.libelle}</span>
      </h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Vocabulaire distinct des n° 2154.31/.32 ci-dessus, jamais fusionné : {statut2208.noGoBloqueCount} condition(s)
        NO-GO bloquée(s), {statut2208.goMetCount} condition(s) GO remplie(s) sur {statut2208.goTotal}.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Condition NO-GO</th>
              <th>Statut</th>
              <th>Preuve</th>
            </tr>
          </thead>
          <tbody>
            {report.goNoGo2208.noGo.map(condition => (
              <tr key={condition.key}>
                <td>{condition.label}</td>
                <td>
                  <span className={`badge ${NO_GO_STATUS_CLASS[condition.status] ?? 'analyzing'}`}>
                    {condition.status}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{condition.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Condition GO</th>
              <th>Statut</th>
              <th>Preuve</th>
            </tr>
          </thead>
          <tbody>
            {report.goNoGo2208.go.map(condition => (
              <tr key={condition.key}>
                <td>
                  {condition.label}
                  {condition.humanOnly && (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}> · recette humaine</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${GO_STATUS_CLASS[condition.status] ?? 'analyzing'}`}>
                    {condition.status}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{condition.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Métriques — neuf émetteurs (#2958.72-.93)</h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {metrics.instrumentedCount} émetteur(s) instrumenté(s) sur au moins une des six destinations, sur{' '}
        {metrics.total}.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Événement</th>
              <th>Statut</th>
              <th>Destinations prouvées</th>
              <th>Preuve</th>
            </tr>
          </thead>
          <tbody>
            {report.metrics.entries.map(metric => (
              <tr key={metric.key}>
                <td className="mono">{metric.eventName}</td>
                <td>
                  <span className={`badge ${METRIC_STATUS_CLASS[metric.status] ?? 'analyzing'}`}>{metric.status}</span>
                </td>
                <td className="mono">
                  {metric.provenOnDestinations.length > 0 ? metric.provenOnDestinations.join(', ') : '—'}
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{metric.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
