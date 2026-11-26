import { fetchAdminWorkspaces } from '@/lib/admin'
import {
  fetchWorkspaceRegistry,
  formatDate,
  joinOrDash,
  STATUS_BADGE,
  STATUS_LABEL,
  type ToolStatus,
  type WorkspaceTool,
} from '@/lib/tool-registry'

// L'état réel du registre chez un client : qui a branché quoi, avec quels
// périmètres, et depuis quand ça n'a pas servi. Les branchements personnels
// (webhooks de discussion, MCP) sont unis sur tous les membres de l'espace —
// la question posée ici est « ce canal est-il branché chez ce client ? ».

function StatusPill({ status }: { status: ToolStatus }) {
  const variant = STATUS_BADGE[status] ?? ''
  return <span className={`badge ${variant}`}>{STATUS_LABEL[status] ?? status}</span>
}

function ToolRow({ tool }: { tool: WorkspaceTool }) {
  const scopes = tool.scopes ?? []
  return (
    <tr>
      <td>
        <strong>{tool.display_name}</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {tool.family} · {tool.owner === 'workspace' ? 'espace' : 'utilisateur'}
        </div>
      </td>
      <td>
        <StatusPill status={tool.status} />
      </td>
      <td style={{ fontSize: 13 }}>{formatDate(tool.last_sync)}</td>
      <td className="num">{scopes.length > 0 ? scopes.length : '—'}</td>
      <td style={{ fontSize: 13 }}>
        <div>
          <span style={{ color: 'var(--muted)' }}>Lit :</span> {joinOrDash(tool.data_types?.reads)}
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Écrit :</span> {joinOrDash(tool.data_types?.writes)}
        </div>
      </td>
    </tr>
  )
}

export async function ClientsPanel({ workspaceId }: { workspaceId: string }) {
  let workspaces
  try {
    workspaces = (await fetchAdminWorkspaces({ limit: 100 })).workspaces ?? []
  } catch (err) {
    return <div className="error">Espaces indisponibles : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  if (workspaces.length === 0) {
    return <div className="empty">Aucun espace de travail.</div>
  }

  const selected = workspaces.find(w => w.id === workspaceId) ?? workspaces[0]

  return (
    <>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {workspaces.map(w => (
          <a
            key={w.id}
            href={`/integrations?view=clients&workspace=${encodeURIComponent(w.id)}`}
            className="link-muted"
            style={{
              padding: '4px 10px',
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
              fontWeight: w.id === selected?.id ? 700 : 400,
              color: w.id === selected?.id ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {w.name}
          </a>
        ))}
      </nav>

      {selected ? <WorkspaceRegistry workspaceId={selected.id} name={selected.name} /> : null}
    </>
  )
}

async function WorkspaceRegistry({ workspaceId, name }: { workspaceId: string; name: string }) {
  let registry
  try {
    registry = await fetchWorkspaceRegistry(workspaceId)
  } catch (err) {
    return <div className="error">Registre indisponible : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  const tools = registry.tools ?? []
  // Ce qui appelle une décision d'abord : action requise, puis connecté, puis
  // le reste. Un opérateur ouvre cet écran pour repérer une panne, pas pour
  // lire un inventaire alphabétique.
  const rank: Record<ToolStatus, number> = { action_required: 0, connected: 1, available: 2, coming_soon: 3 }
  const sorted = [...tools].sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.display_name.localeCompare(b.display_name, 'fr'),
  )

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Espace</div>
          <div className="value" style={{ fontSize: 18 }}>
            {name}
          </div>
        </div>
        <div className="card">
          <div className="label">Membres</div>
          <div className="value">{registry.memberCount}</div>
        </div>
        <div className="card">
          <div className="label">Outils connectés</div>
          <div className="value">{registry.connected}</div>
        </div>
        <div className="card">
          <div className="label">Action requise</div>
          <div className="value">{registry.actionRequired}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Outil</th>
            <th>État</th>
            <th>Dernier usage</th>
            <th className="num">Périmètres</th>
            <th>Données</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(tool => (
            <ToolRow key={tool.provider} tool={tool} />
          ))}
        </tbody>
      </table>

      <p className="subtitle" style={{ marginTop: 16 }}>
        « Action requise » = un jeton OAuth expiré : le client doit reconnecter. Les webhooks et les accès MCP sont
        personnels — un outil ressort connecté dès qu&apos;un membre de l&apos;espace l&apos;a branché.
      </p>
    </>
  )
}
