import type { AdminMigrationsReport } from '@/lib/admin'
import { dateEtHeure } from '@/lib/dates'
import { statutMigrations } from './migrations-panel.logic'

/**
 * #2445.11 — MIGRATIONS de la console d'opérations : ce qui a réellement
 * tourné sur cette base contre ce que le build de l'API connaît.
 *
 * Lecture seule, volontairement : aucune preview de lignes affectées, aucun
 * bouton rollback ni backfill. Ces gestes touchent la production et restent
 * au script `migrate-with-lock.mjs` + `pnpm migration:run`/`migration:revert`
 * en CLI — droit serveur + audit, jamais un clic navigateur. Le reste de
 * #2445.11 (preview, erreurs, backfill, rollback pilotés depuis l'écran) est
 * documenté comme non livré sur l'épopée #2766.
 */
export function MigrationsPanel({ report }: { report: AdminMigrationsReport }) {
  const statut = statutMigrations(report)

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>
        Migrations{'  '}
        <span className={`badge ${statut.aJour ? 'completed' : 'error'}`}>{statut.libelle}</span>
      </h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {statut.appliedCount} exécutée(s) sur cette base, {statut.pendingCount} connue(s) du build sans ligne dans{' '}
        <code>_migrations</code> — le déploiement est passé, <code>migration:run</code> pas encore.
      </p>

      {report.pending.length > 0 && (
        <div className="error" style={{ marginBottom: 12 }}>
          En attente : {report.pending.join(', ')}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Migration</th>
              <th>Exécutée le</th>
            </tr>
          </thead>
          <tbody>
            {report.applied.map(migration => (
              <tr key={migration.name}>
                <td className="mono">{migration.name}</td>
                <td style={{ color: 'var(--muted)' }}>
                  {migration.appliedAt === null ? 'date inconnue' : dateEtHeure(migration.appliedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
