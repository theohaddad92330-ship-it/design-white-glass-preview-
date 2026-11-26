import { fetchAdminMethodCorpusGovernance } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * Gouvernance du corpus méthode — read-only backoffice view (#3274.5, épopée #3274).
 *
 * `packages/contracts/src/schemas/method-corpus.ts` porte la fondation
 * (BEL-SC-221) depuis le 28/09/2026 — chaque règle a un `owner`, un état
 * `enabled`, une raison si désactivée, et un verdict d'audit
 * (KEEP/MERGE/SUPERSEDED/REMOVE_AFTER_MIGRATION). Personne ne pouvait la
 * lire ailleurs qu'en git avant ce lot : « aucune API ni écran
 * d'administration », le constat même de l'épopée.
 *
 * Lecture seule, comme `/flags` : désactiver une règle en production reste un
 * commit sur `method-corpus.ts`, pas un geste d'écran. `wiredAtRuntime` dit
 * si CET identifiant est parmi ceux que `apps/ia` consulte réellement au
 * retrieval (#3274.3, 17 sur 182) — `non mesuré` quand l'IA n'a pas répondu,
 * jamais un booléen deviné.
 */
export default async function MethodCorpusPage() {
  let report: Awaited<ReturnType<typeof fetchAdminMethodCorpusGovernance>> | null = null
  let error: string | null = null
  try {
    report = await fetchAdminMethodCorpusGovernance()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="wrap">
      <h1>Corpus méthode</h1>
      <p className="muted">
        Lecture seule — la gouvernance se modifie par commit sur <code>method-corpus.ts</code>, pas depuis cet écran. «
        Branché au retrieval » dit si Laura consulte réellement cette règle aujourd'hui. / Read-only — governance
        changes by committing to <code>method-corpus.ts</code>, not from this screen. &quot;Wired at retrieval&quot;
        says whether Laura actually consults this rule today.
      </p>

      {error ? (
        <p style={{ color: 'var(--red)' }}>{error}</p>
      ) : !report ? (
        <p className="muted">Aucune donnée. / No data.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12 }}>
            Corpus version <code>{report.corpusVersion}</code> ({report.releasedAt}) — {report.rules.length} règles.
            {report.runtimeCrossCheckAvailable ? null : (
              <>
                {' '}
                <span style={{ color: 'var(--red)' }}>
                  IA injoignable : « branché au retrieval » non mesuré sur cette lecture.
                </span>
              </>
            )}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Règle</th>
                  <th>Catégorie</th>
                  <th>Owner</th>
                  <th>État</th>
                  <th>Feature flag</th>
                  <th>Verdict d'audit</th>
                  <th>Version</th>
                  <th>Branchée au retrieval</th>
                </tr>
              </thead>
              <tbody>
                {report.rules.map(rule => (
                  <tr key={rule.ruleId}>
                    <td>
                      <code>{rule.ruleId}</code>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {rule.title}
                      </div>
                    </td>
                    <td>{rule.category}</td>
                    <td>{rule.owner}</td>
                    <td>
                      <span className="badge" style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                        {rule.enabled ? 'active' : 'désactivée'}
                      </span>
                      {rule.enabled ? null : (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {rule.disabledReason}
                        </div>
                      )}
                    </td>
                    <td>{rule.featureFlagKey ?? <em>aucun</em>}</td>
                    <td>{rule.comparisonToProductRules}</td>
                    <td>{rule.introducedOrRevisedInVersion}</td>
                    <td>
                      {rule.wiredAtRuntime === null ? (
                        <span className="muted">non mesuré</span>
                      ) : rule.wiredAtRuntime ? (
                        'oui'
                      ) : (
                        'non'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 24 }}>Historique de version</h2>
          {report.changeLog.length === 0 ? (
            <p className="muted">Aucun jalon. / No milestone.</p>
          ) : (
            <ul>
              {report.changeLog.map(entry => (
                <li key={entry.version} style={{ marginBottom: 8 }}>
                  <strong>{entry.version}</strong> ({entry.releasedAt}) — {entry.summary}
                  {entry.comparisonNote ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {entry.comparisonNote}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
