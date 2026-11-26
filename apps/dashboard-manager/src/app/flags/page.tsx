import { fetchAdminFlags } from '@/lib/admin'
import { dateActivationDuFlag, espacesActifsDuFlag } from './_components/flag-coverage'
import { flagGovernance } from './_components/flag-governance'

export const dynamic = 'force-dynamic'

/**
 * Feature flags (Reflag) — read-only backoffice view.
 *
 * Flags are CREATED and targeted in the Reflag dashboard; that is the source of
 * truth and this screen deliberately does not duplicate it. What it answers is
 * the question an operator actually has while looking at a customer: "is feature
 * X on for THEM?" — a flag's value only means something for someone, so the
 * screen evaluates rather than lists definitions.
 *
 * Pass `?userId=…` and/or `?workspaceId=…` to evaluate for a specific customer;
 * with neither, the values shown are the default rollout.
 */
export default async function FlagsPage(props: { searchParams: Promise<{ userId?: string; workspaceId?: string }> }) {
  const searchParams = await props.searchParams
  const userId = searchParams.userId?.trim() || undefined
  const workspaceId = searchParams.workspaceId?.trim() || undefined

  let configured = false
  let flags: Awaited<ReturnType<typeof fetchAdminFlags>>['flags'] = []
  let error: string | null = null
  try {
    const data = await fetchAdminFlags({ userId, workspaceId })
    configured = data.configured
    flags = data.flags
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const scope = userId || workspaceId ? `${userId ?? '—'} / ${workspaceId ?? '—'}` : 'défaut (aucun contexte)'

  // #1667.1 — les deux colonnes demandées, non mesurées AVEC leur raison : voir
  // `_components/flag-coverage.ts`. Ni un tiret muet ni un « tous inactifs »
  // inventé.
  const espaces = espacesActifsDuFlag()
  const activation = dateActivationDuFlag()

  return (
    <main className="wrap">
      <h1>Feature flags</h1>
      <p className="muted">
        Lecture seule — les flags se créent et se ciblent dans le dashboard Reflag. Cet écran répond à « la
        fonctionnalité X est-elle active pour CE client ? ». / Read-only — flags are created and targeted in the Reflag
        dashboard; this screen answers whether a given customer has a feature on.
      </p>

      <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '16px 0' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          User ID
          <input name="userId" defaultValue={userId ?? ''} placeholder="uuid" style={{ width: 300 }} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Workspace ID
          <input name="workspaceId" defaultValue={workspaceId ?? ''} placeholder="uuid" style={{ width: 300 }} />
        </label>
        <button className="btn-sm" type="submit">
          Évaluer / Evaluate
        </button>
      </form>

      {error ? (
        <p style={{ color: 'var(--red)' }}>{error}</p>
      ) : !configured ? (
        <p className="muted">
          Reflag n’est pas connecté : <code>REFLAG_SECRET_KEY</code> n’est pas défini côté API, donc tous les flags sont
          évalués à « off ». / Reflag is not connected — every flag evaluates to off.
        </p>
      ) : flags.length === 0 ? (
        <p className="muted">Aucun flag défini dans Reflag. / No flag defined in Reflag.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12 }}>
            Contexte évalué / evaluated context : <code>{scope}</code>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Clé / Key</th>
                  <th>État / State</th>
                  <th>Espaces actifs / Active in</th>
                  <th>Activation / Activated</th>
                  <th>Owner</th>
                  <th>Rollback</th>
                </tr>
              </thead>
              <tbody>
                {flags.map(flag => {
                  // #2446.8 — chaque flag a un owner et un rollback : le registre
                  // statique (`flag-governance.ts`) les tient, Reflag ne les porte
                  // pas. Absence nommée si Reflag connaît un flag que le registre
                  // ignore — jamais un owner deviné.
                  const gouvernance = flagGovernance(flag.key)
                  return (
                    <tr key={flag.key}>
                      <td>
                        <code>{flag.key}</code>
                      </td>
                      <td>
                        <span className="badge" style={{ opacity: flag.enabled ? 1 : 0.5 }}>
                          {flag.enabled ? 'actif / on' : 'inactif / off'}
                        </span>
                      </td>
                      {/* #1667.1 — la RAISON ne vit plus dans un `title` : jamais lue au
                          clavier, annoncée de façon inégale, invisible au toucher — et
                          elle était identique sur chaque ligne. Elle est dite UNE fois,
                          en clair, sous le tableau. */}
                      <td style={{ color: 'var(--muted)' }}>Non mesuré / Not measured</td>
                      <td style={{ color: 'var(--muted)' }}>Non mesuré / Not measured</td>
                      <td>{gouvernance.registered ? gouvernance.owner : <em>Non renseigné</em>}</td>
                      <td style={{ maxWidth: 320 }}>
                        {gouvernance.registered ? gouvernance.rollback : <em>{gouvernance.raison}</em>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            <strong>Pourquoi « non mesuré » sur ces deux colonnes.</strong> {espaces.raison} {activation.raison}
          </p>
        </>
      )}
    </main>
  )
}
