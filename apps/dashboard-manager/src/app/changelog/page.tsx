import { fetchAdminChangelog } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * Changelog — ce qu'on a livré, et qui l'a su (#1704).
 *
 * Deux questions, une page. « Qu'est-ce qui est parti ? » se lit dans le
 * catalogue ; « les clients l'ont-ils su ? » se lit dans l'état de diffusion de
 * la Newsletter Changelog. Les séparer aurait fait deux écrans dont aucun ne
 * répond seul.
 *
 * Le catalogue n'est pas recopié ici : il arrive de l'API, qui le résout depuis
 * `@bellum/contracts` — la même source que l'e-mail bimensuel et que le panneau
 * « Nouveautés » de la SPA. Un miroir aurait divergé au premier ajout d'entrée.
 */

/** Une valeur absente ne s'affiche jamais « 0 » — on écrit ce qu'on ne sait pas. */
function share(value: number | null): string {
  return value === null ? 'non mesuré' : `${value} %`
}

export default async function ChangelogPage() {
  let report: Awaited<ReturnType<typeof fetchAdminChangelog>> | null = null
  let error: string | null = null
  try {
    report = await fetchAdminChangelog()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const delivery = report?.delivery ?? null
  const entries = report?.entries ?? []

  return (
    <main className="wrap">
      <h1>Changelog</h1>
      <p className="subtitle">
        Ce qu’on a livré, et qui l’a su. Le catalogue vient du contrat partagé — le même que le panneau « Nouveautés »
        de l’application et que la newsletter bimensuelle. / What shipped, and who was told: one shared catalogue for
        the app panel, the newsletter and this screen.
      </p>

      {error ? (
        <p style={{ color: 'var(--red)' }}>{error}</p>
      ) : (
        <>
          {delivery ? (
            <>
              <section className="kpi-grid">
                <div className="card">
                  <div className="label">Entrées publiées / Published</div>
                  <div className="value">{entries.length}</div>
                </div>
                <div className="card">
                  <div className="label">Lecteurs / Readers</div>
                  <div className="value">{delivery.readers}</div>
                </div>
                <div className="card">
                  <div className="label">À jour / Up to date</div>
                  <div className="value">{share(delivery.upToDateShare)}</div>
                </div>
                <div className="card">
                  <div className="label">En retard / Behind</div>
                  <div className="value">{delivery.behind}</div>
                </div>
              </section>

              <h2>Où en sont les lecteurs</h2>
              <p className="muted" style={{ fontSize: 12 }}>
                Les six familles s’additionnent aux {delivery.readers} lecteurs : chacun est dans une et une seule. La
                liste des lecteurs est la MÊME requête que l’envoi — pas une seconde définition qui divergerait. / The
                six buckets add up to the reader count; the reader query is the one the send itself uses.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Famille / Bucket</th>
                      <th>Lecteurs</th>
                      <th>Ce que le prochain envoi fera</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>À jour / up to date</td>
                      <td>{delivery.upToDate}</td>
                      <td className="muted">Rien — pas d’e-mail creux.</td>
                    </tr>
                    <tr>
                      <td>En retard / behind</td>
                      <td>{delivery.behind}</td>
                      <td className="muted">Le delta au-dessus de leur repère.</td>
                    </tr>
                    <tr>
                      <td>Jamais servi / never served</td>
                      <td>{delivery.neverServed}</td>
                      <td className="muted">Pose le repère, n’envoie pas l’historique.</td>
                    </tr>
                    <tr>
                      <td>Repère retiré du catalogue</td>
                      <td>{delivery.markerRetired}</td>
                      <td className="muted">Re-pose le repère, n’envoie rien.</td>
                    </tr>
                    <tr>
                      <td>Désinscrits / opted out</td>
                      <td>{delivery.optedOut}</td>
                      <td className="muted">Rien — interrupteur explicitement sur OFF.</td>
                    </tr>
                    <tr>
                      <td>Sans adresse / no address</td>
                      <td>{delivery.noEmail}</td>
                      <td className="muted">Rien — on ne peut pas leur écrire.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                ⚠️ La liste de suppression n’est pas évaluée ici : elle se décide par espace au moment de l’envoi. « En
                retard » est donc un nombre de LECTEURS en retard, pas un nombre d’e-mails qui partiront. / The
                suppression list is decided per workspace at send time, so “behind” counts readers, not future emails.
              </p>

              {delivery.markers.length > 0 ? (
                <>
                  <h2>Les repères, du plus en retard au plus à jour</h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Calés sur / Marker</th>
                          <th>Date</th>
                          <th>Lecteurs</th>
                          <th>Entrées non reçues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delivery.markers.map(marker => (
                          <tr key={marker.entryId ?? 'inconnu'}>
                            <td>{marker.title ?? <span className="muted">entrée retirée du catalogue</span>}</td>
                            <td className="muted">{marker.date ?? '—'}</td>
                            <td>{marker.readers}</td>
                            <td>
                              {marker.pendingEntries === 0 ? <span className="muted">—</span> : marker.pendingEntries}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          <h2>Ce qu’on a livré</h2>
          {entries.length === 0 ? (
            <p className="muted">Aucune entrée au catalogue. / No catalogue entry.</p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {entries.map(entry => (
                <li key={entry.id} className="card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>{entry.title}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {entry.date}
                    </span>
                    {entry.id === delivery?.latestEntryId ? <span className="badge">la plus récente</span> : null}
                  </div>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {entry.items.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  )
}
