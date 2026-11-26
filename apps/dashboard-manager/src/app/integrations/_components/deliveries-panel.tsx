import {
  DELIVERY_BADGE,
  DELIVERY_LABEL,
  fetchDeliveries,
  formatDateTime,
  type AdminDeliveryRow,
} from '@/lib/tool-registry'

/**
 * Le journal de livraison des webhooks — la trace technique complète.
 *
 * Il était sur l'écran utilisateur, en version traduite (« Refusé par le
 * canal », « Injoignable ») parce qu'un code HTTP n'apprend rien à un
 * commercial. Mais la version traduite n'apprend rien non plus à qui doit
 * réparer : c'est le 403 qui dit que le jeton du webhook a été révoqué, et le
 * numéro de tentative qui dit si la file a déjà réessayé.
 *
 * Aucun secret ne transite : l'URL du webhook porte un jeton et ne sort jamais
 * de l'API ; `error` a été nettoyé (URL retirées, message tronqué) à l'écriture.
 */
function DeliveryRow({ row }: { row: AdminDeliveryRow }) {
  return (
    <tr>
      <td style={{ fontSize: 13 }}>{formatDateTime(row.createdAt)}</td>
      <td>
        <strong>{row.provider}</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{row.userId}</div>
      </td>
      <td style={{ fontSize: 13 }}>{row.event}</td>
      <td>
        <span className={`badge ${DELIVERY_BADGE[row.status]}`}>{DELIVERY_LABEL[row.status]}</span>
      </td>
      {/* Un code absent n'est PAS un 0 : la requête n'a jamais eu de réponse
          (DNS mort, connexion refusée), et c'est un diagnostic différent. */}
      <td style={{ fontSize: 13 }}>{row.httpStatus ?? '—'}</td>
      <td style={{ fontSize: 13 }}>{row.attempt > 0 ? row.attempt : '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{row.error ?? '—'}</td>
    </tr>
  )
}

export async function DeliveriesPanel({ workspaceId }: { workspaceId?: string }) {
  let journal
  try {
    journal = await fetchDeliveries(workspaceId)
  } catch (err) {
    // « Je n'ai pas pu regarder » n'est pas « rien n'est parti ». Confondre les
    // deux ferait conclure qu'un canal muet fonctionne.
    return <div className="error">Journal indisponible : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  const rows = journal.rows ?? []
  if (rows.length === 0) {
    return (
      <div className="empty">
        Aucune livraison enregistrée{workspaceId ? ' pour cet espace' : ''}. Les canaux d&apos;équipe n&apos;ont encore
        rien eu à transmettre.
      </div>
    )
  }

  const failed = rows.filter(r => r.status === 'failed').length

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Livraisons affichées</div>
          <div className="value">{rows.length}</div>
        </div>
        <div className="card">
          <div className="label">En échec</div>
          <div className="value">{failed}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Quand</th>
            <th>Canal · destinataire</th>
            <th>Événement</th>
            <th>État</th>
            <th>HTTP</th>
            <th>Tentative</th>
            <th>Erreur</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <DeliveryRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>

      {journal.truncated ? (
        <p className="subtitle" style={{ marginTop: 16 }}>
          Seules les livraisons les plus récentes sont affichées — il y en a d&apos;autres.
        </p>
      ) : null}
    </>
  )
}
