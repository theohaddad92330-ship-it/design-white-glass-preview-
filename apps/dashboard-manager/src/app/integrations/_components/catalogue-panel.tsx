import { fetchToolCatalog, joinOrDash, SOURCE_LABEL, type AdminCatalogTool } from '@/lib/tool-registry'

// Le catalogue complet des outils que Bellum sait brancher : ce que chacun lit
// et écrit, ce qu'il coûte à l'utilisateur, ses limites de débit, ce que Bellum
// en retient. Rien de tout cela n'a sa place dans l'écran client — un commercial
// devant un prospect n'a que faire de « 100 requêtes / 10 s », et l'afficher
// expose notre chaîne d'outillage.

function ConfiguredPill({ configured }: { configured: boolean }) {
  return <span className={`badge ${configured ? 'completed' : 'error'}`}>{configured ? 'Actif' : 'Non configuré'}</span>
}

function ToolRow({ tool }: { tool: AdminCatalogTool }) {
  return (
    <tr>
      <td>
        <strong>{tool.displayName}</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {tool.provider} · {tool.family} · {tool.owner === 'workspace' ? 'espace' : 'utilisateur'}
        </div>
      </td>
      <td>
        <ConfiguredPill configured={tool.configured} />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {SOURCE_LABEL[tool.sourceKind] ?? tool.sourceKind}
          {tool.sourceRef ? ` · ${tool.sourceRef}` : ''}
        </div>
      </td>
      <td style={{ fontSize: 13 }}>{joinOrDash(tool.allowedActions)}</td>
      <td style={{ fontSize: 13 }}>
        <div>
          <span style={{ color: 'var(--muted)' }}>Lit :</span> {joinOrDash(tool.reads)}
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Écrit :</span> {joinOrDash(tool.writes)}
        </div>
      </td>
      <td style={{ fontSize: 13 }}>{tool.costModel?.fr ?? '—'}</td>
      <td style={{ fontSize: 13 }}>{tool.rateLimits?.fr ?? '—'}</td>
      <td style={{ fontSize: 13, color: 'var(--muted)' }}>{tool.memoryPolicy?.fr ?? '—'}</td>
    </tr>
  )
}

export async function CataloguePanel() {
  let report
  try {
    report = await fetchToolCatalog()
  } catch (err) {
    return <div className="error">Catalogue indisponible : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  const tools = report.tools ?? []
  if (tools.length === 0) {
    return <div className="empty">Aucun outil au catalogue.</div>
  }

  // Les outils que ce serveur ne peut pas offrir remontent en tête : c'est
  // exactement ce qu'un opérateur vient vérifier ici, puisqu'ils n'apparaissent
  // dans aucun écran client.
  const sorted = [...tools].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? 1 : -1
    return a.displayName.localeCompare(b.displayName, 'fr')
  })

  // Ce qui n'est PAS activable, isolé. Une entrée purement modélisée (`catalog`)
  // n'y figure pas : il n'y a aucune clé à poser, c'est du code qui n'existe pas
  // encore — la ranger avec les configurations manquantes ferait chercher une
  // variable d'environnement qui n'a jamais existé.
  const missing = sorted.filter(tool => !tool.configured && tool.sourceKind !== 'catalog')

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Outils au catalogue</div>
          <div className="value">{report.total}</div>
        </div>
        <div className="card">
          <div className="label">Activables sur ce serveur</div>
          <div className="value">{report.configured}</div>
        </div>
        <div className="card">
          <div className="label">Configuration manquante</div>
          <div className="value">{report.total - report.configured}</div>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className="error" style={{ marginBottom: 16 }}>
          <strong>Ce qu&apos;il manque sur ce serveur</strong>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            {/* La liste des clés, pas seulement le compte : « 6 non configurés »
                oblige à parcourir le tableau pour savoir quoi poser. */}
            {missing.map(tool => (
              <div key={tool.provider}>
                {tool.displayName} — {SOURCE_LABEL[tool.sourceKind] ?? tool.sourceKind}
                {tool.sourceRef ? ` · ${tool.sourceRef}` : ''}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Outil</th>
            <th>État serveur</th>
            <th>Actions</th>
            <th>Données</th>
            <th>Coût</th>
            <th>Limites de débit</th>
            <th>Rétention</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(tool => (
            <ToolRow key={tool.provider} tool={tool} />
          ))}
        </tbody>
      </table>

      <p className="subtitle" style={{ marginTop: 16 }}>
        Un outil « non configuré » n&apos;apparaît dans aucun écran client : il manque son app OAuth ou sa clé
        d&apos;environnement sur ce serveur.
      </p>
    </>
  )
}
