import {
  CHANNEL_LABEL,
  fetchEnrichmentCoverage,
  formatRate,
  PROVIDER_LABEL,
  type EnrichmentCoverage,
} from '@/lib/enrichment-coverage'

/**
 * La couverture de l'enrichissement — l'écran qui tranche « faut-il payer un
 * fournisseur de repli ? ».
 *
 * Apollo est le fournisseur par défaut. SalesQL, Dropcontact, Hunter, Lusha,
 * Kaspr et FullEnrich attendent derrière lui, coûtent chacun un abonnement, et
 * ne sont appelés que quand Apollo n'a rien trouvé. Leur valeur se résume donc
 * au taux d'échec d'Apollo — qui ne vivait jusqu'ici que dans une ligne de log
 * du service IA, c'est-à-dire nulle part où l'on puisse compter.
 *
 * L'écran répond dans cet ordre, parce que c'est l'ordre de la décision :
 * combien de tentatives, combien aboutissent, QUI les résout, et ce qui manque
 * encore — ce dernier chiffre étant le seul qui dise quel TYPE de fournisseur
 * aiderait.
 */

function verdict(coverage: EnrichmentCoverage): string {
  if (coverage.attempts === 0) {
    return "Aucune tentative sur la fenêtre : rien à conclure. Ce n'est pas « 0 % de réussite »."
  }
  if (coverage.resolvedByFallback === 0) {
    return "Aucune résolution n'est venue d'un fournisseur de repli : sur cette fenêtre, aucun abonnement supplémentaire ne se serait payé."
  }
  const share = Math.round((coverage.resolvedByFallback / Math.max(coverage.resolved, 1)) * 100)
  return `${coverage.resolvedByFallback} résolution(s) sur ${coverage.resolved} viennent d'un repli, soit ${share} % de ce qui aboutit.`
}

export async function EnrichmentPanel({ days }: { days: number }) {
  let coverage: EnrichmentCoverage
  try {
    coverage = await fetchEnrichmentCoverage(days)
  } catch (err) {
    // « Je n'ai pas pu regarder » n'est pas « il ne s'est rien passé ».
    return <div className="error">Couverture indisponible : {err instanceof Error ? err.message : 'erreur'}</div>
  }

  return (
    <>
      <p className="subtitle">
        Ce que l&apos;enrichissement trouve réellement, sur {coverage.days} jours. Un contact jamais enrichi
        n&apos;entre pas dans le calcul — il n&apos;est pas un échec.
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Tentatives</div>
          <div className="value">{coverage.attempts}</div>
        </div>
        <div className="card">
          <div className="label">Taux de résolution</div>
          <div className="value">{formatRate(coverage.resolutionRate)}</div>
        </div>
        <div className="card">
          <div className="label">Sans résultat</div>
          <div className="value">{coverage.unresolved}</div>
        </div>
        <div className="card">
          <div className="label">Résolues par un repli</div>
          <div className="value">{coverage.resolvedByFallback}</div>
        </div>
      </div>

      <p className="subtitle" style={{ marginTop: 4 }}>
        <strong>{verdict(coverage)}</strong>
      </p>

      <h2 style={{ marginTop: 24 }}>Qui résout</h2>
      {coverage.byProvider.length === 0 ? (
        <div className="empty">Aucune résolution sur la fenêtre.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th className="num">Résolutions</th>
              <th className="num">Part des résolutions</th>
              <th className="num">Dont téléphone</th>
            </tr>
          </thead>
          <tbody>
            {coverage.byProvider.map(row => (
              <tr key={row.provider}>
                <td>
                  <strong>{PROVIDER_LABEL[row.provider] ?? row.provider}</strong>
                  {row.provider === 'apollo' ? (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}> · par défaut</span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}> · repli</span>
                  )}
                </td>
                <td className="num">{row.resolved}</td>
                <td className="num">{formatRate(coverage.resolved === 0 ? null : row.resolved / coverage.resolved)}</td>
                {/* #3022 — parmi SES résolutions, la part qui laisse aussi le
                    téléphone renseigné. Un vrai 0 % mesuré se distingue d'un
                    "—" (aucune résolution) : `formatRate` ne rend "—" que sur
                    `null`, jamais sur un 0 calculé. */}
                <td className="num">{formatRate(row.phoneFoundRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 24 }}>Ce qui manque encore</h2>
      <p className="subtitle">
        Le seul chiffre qui dise quel TYPE de fournisseur aiderait : beaucoup d&apos;e-mails manquants ⇒ un chercheur
        d&apos;adresses se paierait ; surtout des téléphones ⇒ aucun des candidats ne changerait rien.
      </p>
      {coverage.missingChannels.length === 0 ? (
        <div className="empty">Rien ne manque sur les tentatives de la fenêtre.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Canal</th>
              <th className="num">Tentatives où il manque encore</th>
            </tr>
          </thead>
          <tbody>
            {coverage.missingChannels.map(row => (
              <tr key={row.channel}>
                <td>{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                <td className="num">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
