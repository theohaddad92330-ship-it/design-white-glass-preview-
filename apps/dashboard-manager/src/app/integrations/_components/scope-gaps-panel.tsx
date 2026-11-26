import { fetchScopeGaps } from '@/lib/tool-registry'

/**
 * Les connexions incomplètes — SCOPES-I.4 (18/10/2026).
 *
 * Le 18/10, l'app HubSpot publiée n'accordait que les portées contacts. HubSpot n'affiche aucun écran
 * de portées : la connexion « réussit » et rien ne le dit. Cette liste est l'endroit où quelqu'un de
 * chez nous VOIT l'écart — par connecteur, avec les portées nommées.
 *
 * Deux colonnes qui n'appellent pas le même geste : « côté app » (consentement neuf qui n'a pas
 * accordé la portée — le manifeste de l'app est à corriger, reconnecter ne sert à rien) et « accord
 * ancien » (l'utilisateur est prévenu, une reconnexion répare). Lecture seule, aucun jeton.
 */
export async function ScopeGapsPanel() {
  let report
  try {
    report = await fetchScopeGaps()
  } catch (err) {
    // « Je n'ai pas pu regarder » n'est pas « rien ne manque ».
    return <div className="error">Liste indisponible : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  const rows = report.connectors ?? []
  if (rows.length === 0) {
    return (
      <div className="empty">
        Aucune connexion incomplète : chaque jeton connu porte toutes les portées que l&apos;app demande. Les
        connecteurs dont le fournisseur ne rend pas ses portées ne sont pas mesurés ici.
      </div>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Connecteur</th>
          <th>Espaces</th>
          <th>Dont côté app</th>
          <th>Dont accord ancien</th>
          <th>Portées manquantes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.provider}>
            <td>
              <strong>{row.label}</strong>
            </td>
            <td>{row.workspaces}</td>
            <td>{row.appSide}</td>
            <td>{row.users - row.appSide}</td>
            <td style={{ fontSize: 13 }}>
              {row.missingScopes.map(entry => (
                <div key={entry.scope}>
                  <code>{entry.scope}</code> · {entry.workspaces} espace{entry.workspaces > 1 ? 's' : ''}
                </div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
