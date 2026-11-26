import { fetchAdminWorkspaces, type AdminWorkspace } from '@/lib/admin'
import { CreateWorkspace } from '@/app/esn/_components/create-workspace'
import { jourCompact } from '@/lib/dates'
import { countOrUnmeasured } from '@/lib/mesure'
import { EmailEnClair } from '@/app/_components/email-en-clair'

// ESN sub-view of the consolidated "Clients" screen (was the standalone /esn
// list). Searchable server-side; each row links to the workspace detail. A
// create form sits above the table.

// Le fuseau vient de `@/lib/dates` : sans lui, `toLocaleDateString` sur un
// horodatage complet fait basculer le JOUR près de minuit (serveur en UTC,
// lecteur à Paris).
const shortDate = (iso: string): string => jourCompact(iso)

export async function EsnDirectory({ search }: { search: string }) {
  let workspaces: AdminWorkspace[] = []
  let total = 0
  try {
    const list = await fetchAdminWorkspaces({ search, limit: 100 })
    workspaces = list.workspaces ?? []
    total = list.total ?? workspaces.length
  } catch (err) {
    return (
      <div className="error">
        Impossible de joindre l&apos;endpoint admin de l&apos;API.
        <br />
        {err instanceof Error ? err.message : String(err)}
        <br />
        Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
      </div>
    )
  }

  return (
    <>
      <form method="get" action="/clients" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="hidden" name="view" value="esn" />
        <input
          name="search"
          defaultValue={search}
          placeholder="Rechercher une ESN par nom…"
          style={{ flex: 1, maxWidth: 360 }}
        />
        <button className="btn" type="submit">
          Rechercher
        </button>
        {search ? (
          <a
            className="btn ghost"
            href="/clients?view=esn"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Réinitialiser
          </a>
        ) : null}
      </form>

      <CreateWorkspace />

      <p style={{ margin: '16px 0 12px', fontSize: 13, color: 'var(--muted)' }}>
        {total} ESN
        {search ? (
          <>
            {' '}
            correspondant à <strong>{search}</strong>
          </>
        ) : null}
      </p>

      {workspaces.length === 0 ? (
        <div className="empty">Aucune ESN.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Propriétaire</th>
              <th className="num">Membres</th>
              <th>Créée le</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map(w => (
              <tr key={w.id}>
                <td>
                  <a className="link" href={`/esn/${w.id}`}>
                    {w.name || '—'}
                  </a>
                </td>
                {/* Pas de <a> autour : l’adresse porte son propre `mailto:`. La colonne « Nom » porte déjà le lien vers la fiche. */}
                <td>
                  <EmailEnClair email={w.ownerEmail} />
                </td>
                <td className="num">{countOrUnmeasured(w.memberCount)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 13 }}>{shortDate(w.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
