import { fetchTelemetry, type CreditAlert, type TelemetryReport, type TelemetryRow } from '@/lib/telemetry'
import { AreaChart, BarChart, Donut, Gauge } from '@/app/_components/charts'
import { MonitoringTable, type AnalysisGroup } from '@/app/_components/monitoring-table'
import { jourEtHeureCourte } from '@/lib/dates'
import { NON_MESURE } from '@/lib/mesure'

// Cockpit sub-view of the "Analyses" umbrella (was the standalone / landing).
// Body moved verbatim — live telemetry cockpit: cost/duration/status/quality
// charts + grounding + the grouped monitoring table. The parent /monitoring page
// forces dynamic so this stays fresh.

// Supervision 30/09 : un coût absent (null) est « non mesuré », jamais $0.00.
function usd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return NON_MESURE
  return `$${n.toFixed(n !== 0 && n < 1 ? 4 : 2)}`
}

function duration(ms: number | null): string {
  // `null` = durée inconnue (aucun run terminé mesurable). « — » plutôt qu'un
  // nombre : le plafond d'1h de l'ancienne estimation était rendu COMME une mesure.
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

const shortDate = (iso: string): string => jourEtHeureCourte(iso, '')

const LATENCY_BUCKETS: Array<{ label: string; lo: number; hi: number }> = [
  { label: '<1m', lo: 0, hi: 60_000 },
  { label: '1–2m', lo: 60_000, hi: 120_000 },
  { label: '2–4m', lo: 120_000, hi: 240_000 },
  { label: '4–6m', lo: 240_000, hi: 360_000 },
  { label: '6–8m', lo: 360_000, hi: 480_000 },
  { label: '≥8m', lo: 480_000, hi: Infinity },
]

const STATUS_COLORS: Record<string, string> = {
  completed: '#34d399',
  analyzing: '#fbbf24',
  error: '#f87171',
  canceled: '#f87171',
}

// French labels for the detected provider-limit kinds.
const KIND_LABELS: Record<CreditAlert['kind'], string> = {
  credit: 'plus de crédit',
  quota: 'quota dépassé',
  rate: 'rate limit (429)',
}

// Human provider names for the spend / alert panels.
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  anthropic: 'Claude (Anthropic)',
  apollo: 'Apollo',
  firecrawl: 'Firecrawl',
  pappers: 'Pappers',
  brave: 'Brave',
  insee: 'INSEE',
  inconnu: 'Fournisseur inconnu',
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

function pct(n: number): string {
  return `${Math.round(n)}%`
}

// Per-analysis grounding, non-null (the table only shows runs that carry it).
type Grounding = NonNullable<TelemetryRow['grounding']>

// Confidence tier → shared badge colour classes (globals.css): high=green (P1),
// medium=amber (P2), low=muted (P3). Merged from the former standalone /ia page.
const TIER_BADGE: Record<string, string> = { high: 'P1', medium: 'P2', low: 'P3' }

export async function CockpitPanel() {
  // #1646 — la file de décisions (#1647) et la grille des lancements (#1650)
  // ont QUITTÉ cet écran pour le cockpit business de `/`. Les deux commentaires
  // qui vivaient ici annonçaient eux-mêmes ce déménagement (« #1646 la reprendra
  // telle quelle »). Les laisser aux deux endroits aurait donné le même bloc,
  // sous la même forme, avec le même contenu, sur deux écrans — et c'est le
  // second qui aurait cessé d'être maintenu sans qu'on le voie.
  //
  // Ce que #1647 demandait — « ce qui exige une décision se lit avant ce qui
  // décrit la semaine » — est mieux tenu ainsi qu'avant : la file est désormais
  // en tête de l'écran d'ARRIVÉE, pas en tête d'un sous-onglet de la télémétrie.
  let report: TelemetryReport
  try {
    report = await fetchTelemetry(50)
  } catch (err) {
    return (
      <>
        <h1>Dashboard Manager</h1>
        <p className="subtitle">Monitoring IA — coût, durée et statut par analyse.</p>
        <div className="error">
          Impossible de joindre l&apos;endpoint télémétrie de l&apos;API.
          <br />
          {err instanceof Error ? err.message : String(err)}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
        </div>
      </>
    )
  }

  const { analyses, summary } = report
  // Defensive: an older telemetry payload may omit these.
  const phaseAggregate = report.phaseAggregate ?? []
  const sourceHealth = report.sourceHealth ?? []
  const creditAlerts = report.creditAlerts ?? []
  const providerSpend = report.providerSpend ?? []
  const completed = analyses.filter(a => a.status === 'completed').length
  const successRate = analyses.length ? Math.round((completed / analyses.length) * 100) : null
  // Les durées INCONNUES sont exclues des moyennes — elles y injectaient
  // auparavant un plafond de 60 min pris pour une mesure, ce qui tirait la
  // « durée moyenne » vers le haut sur des runs de quelques minutes.
  const durations = analyses.map(a => a.durationMs).filter((d): d is number => d != null && d > 0)
  const avgDuration = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0

  const statusCounts = analyses.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1
    return acc
  }, {})
  const statusSegments = Object.entries(statusCounts).map(([label, value]) => ({
    label,
    value,
    color: STATUS_COLORS[label],
  }))

  const costBars = [...analyses]
    .filter(a => a.costUsd != null)
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))
    .slice(0, 10)
    // #4595.3 — un coût non mesuré est déjà filtré plus haut : on ne le replie pas sur 0, on l'écarte.
    .flatMap(a => (a.costUsd == null ? [] : [{ label: a.companyName || a.accountId, value: a.costUsd }]))

  // Group by company: one row = its latest run, older runs collapse into history.
  const ts = (iso: string): number => new Date(iso).getTime() || 0
  const byCompany = new Map<string, TelemetryRow[]>()
  for (const a of analyses) {
    const k = (a.companyName || a.accountId).trim().toLowerCase()
    byCompany.set(k, [...(byCompany.get(k) ?? []), a])
  }
  const grouped: AnalysisGroup[] = [...byCompany.values()]
    .map(rows => {
      const sorted = [...rows].sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt))
      return { head: sorted[0], history: sorted.slice(1) }
    })
    .sort((a, b) => ts(b.head.updatedAt) - ts(a.head.updatedAt))

  // Timeline: each analysis (oldest → newest) by total duration.
  const timeline = [...analyses]
    .filter((a): a is TelemetryRow & { durationMs: number } => a.durationMs != null && a.durationMs > 0)
    .sort((a, b) => ts(a.createdAt) - ts(b.createdAt))
    .map(a => ({ label: shortDate(a.createdAt), value: a.durationMs }))

  // Latency distribution — histogram of analysis total durations (`durations`
  // is computed above for the avg-duration KPI).
  const latencyHist = LATENCY_BUCKETS.map(b => ({
    label: b.label,
    value: durations.filter(d => d >= b.lo && d < b.hi).length,
  }))

  // Token split across phases (input vs output vs cache) — the demand side of
  // the cost. ``cache lu`` = input served from the C3 ephemeral prompt cache.
  const totalIn = phaseAggregate.reduce((s, p) => s + p.avgInputTokens * p.runs, 0)
  const totalOut = phaseAggregate.reduce((s, p) => s + p.avgOutputTokens * p.runs, 0)
  const totalCacheRead = phaseAggregate.reduce((s, p) => s + p.avgCacheReadTokens * p.runs, 0)
  const totalCacheCreation = phaseAggregate.reduce((s, p) => s + p.avgCacheCreationTokens * p.runs, 0)
  const cacheHitPct =
    totalIn + totalCacheRead > 0 ? Math.round((100 * totalCacheRead) / (totalIn + totalCacheRead)) : null
  const tokenSegments = [
    { label: 'input', value: Math.round(totalIn), color: '#60a5fa' },
    { label: 'output', value: Math.round(totalOut), color: '#34d399' },
    { label: 'cache lu', value: Math.round(totalCacheRead), color: '#fbbf24' },
  ]

  // ── Grounding « citer ses sources » (merged from the former /ia page) ────────
  const grounded: Array<{ row: TelemetryRow; g: Grounding }> = analyses
    .filter((a): a is TelemetryRow & { grounding: Grounding } => a.grounding != null)
    .map(a => ({ row: a, g: a.grounding }))
    .sort((a, b) => (b.g.sourcedRatio ?? -1) - (a.g.sourcedRatio ?? -1))
  const groundRatios = grounded.map(x => x.g.sourcedRatio).filter((v): v is number => v != null)
  const groundConfs = grounded.map(x => x.g.confidenceScore).filter((v): v is number => v != null)
  const gs = report.groundingSummary
  const avgSourcedRatio =
    gs?.avgSourcedRatio ?? (groundRatios.length ? groundRatios.reduce((s, v) => s + v, 0) / groundRatios.length : null)
  const avgConfidence =
    gs?.avgConfidenceScore ?? (groundConfs.length ? groundConfs.reduce((s, v) => s + v, 0) / groundConfs.length : null)
  const withRatio = gs?.withSourcedRatio ?? groundRatios.length
  const meetingTarget = gs?.meetingTarget ?? groundRatios.filter(r => r >= 0.95).length
  const totalRegistry = gs?.totalRegistrySize ?? grounded.reduce((s, x) => s + x.g.registrySize, 0)
  const totalLegal = gs?.totalLegalCitations ?? grounded.reduce((s, x) => s + x.g.legalCitations, 0)

  return (
    <>
      <h1>Dashboard Manager</h1>
      <p className="subtitle">Monitoring IA — coût, durée, statut et qualité par analyse.</p>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 16 }}>
        <div className="card">
          <div className="label">Analyses</div>
          <div className="value">{summary.count}</div>
        </div>
        <div className="card">
          <div className="label">Taux succès</div>
          <div className="value">{successRate === null ? NON_MESURE : `${successRate}%`}</div>
        </div>
        <div className="card">
          <div className="label">Coût total</div>
          <div className="value">{usd(summary.totalCostUsd)}</div>
          {(summary.unpricedCount ?? 0) > 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              dont {summary.unpricedCount} non chiffrée{summary.unpricedCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <div className="card">
          <div className="label">Coût moyen</div>
          <div className="value">{usd(summary.avgCostUsd)}</div>
        </div>
        <div className="card">
          <div className="label">Durée moy.</div>
          <div className="value">{duration(avgDuration)}</div>
        </div>
      </section>

      {creditAlerts.length > 0 ? (
        <section className="error" style={{ marginTop: 16 }}>
          <strong>⚠ Crédit fournisseur épuisé — {creditAlerts.length} analyse(s) bloquée(s)</strong>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {creditAlerts.slice(0, 5).map(a => (
              <div
                key={a.accountId}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}
              >
                <span>
                  <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{providerLabel(a.provider)}</span>{' '}
                  <span style={{ opacity: 0.85 }}>· {KIND_LABELS[a.kind]}</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>
                    — {a.companyName || a.accountId} · {shortDate(a.occurredAt)}
                  </span>
                </span>
                <a className="link" href={`/analysis/${a.accountId}`} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  voir l&apos;analyse ↗
                </a>
              </div>
            ))}
          </div>
          {creditAlerts.length > 5 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
              + {creditAlerts.length - 5} autre(s)…
            </div>
          ) : null}
        </section>
      ) : null}

      {analyses.length > 0 ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Coût par analyse (top 10)
            </div>
            <BarChart data={costBars} format={usd} />
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Statuts
            </div>
            <Donut segments={statusSegments} />
          </div>
        </section>
      ) : null}

      {timeline.length > 1 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            Timeline — durée des analyses dans le temps
          </div>
          <AreaChart points={timeline} format={duration} />
        </section>
      ) : null}

      {durations.length > 0 || tokenSegments.some(s => s.value > 0) ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Distribution des latences (durée totale par analyse)
            </div>
            <BarChart data={latencyHist} format={v => String(v)} />
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Tokens &amp; cache (C3)
            </div>
            {tokenSegments.some(s => s.value > 0) ? (
              <>
                <Donut segments={tokenSegments} />
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  cache hit{' '}
                  <span style={{ color: 'var(--amber)' }}>{cacheHitPct === null ? NON_MESURE : `${cacheHitPct}%`}</span>
                  {cacheHitPct === null ? '' : " de l'input"} · {Math.round(totalCacheRead).toLocaleString('fr-FR')}{' '}
                  tokens lus · {Math.round(totalCacheCreation).toLocaleString('fr-FR')} écrits
                </p>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Pas encore de tokens télémétrés.</div>
            )}
          </div>
        </section>
      ) : null}

      {phaseAggregate.length > 0 ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Latence moyenne par phase
            </div>
            <BarChart data={phaseAggregate.map(p => ({ label: p.name, value: p.avgDurationMs }))} format={duration} />
          </div>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>
              Coût moyen par phase
            </div>
            <BarChart data={phaseAggregate.map(p => ({ label: p.name, value: p.avgCostUsd }))} format={usd} />
          </div>
        </section>
      ) : null}

      {phaseAggregate.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            Détail par phase — latence (moy / p50 / p95), coût, tokens
          </div>
          <table>
            <thead>
              <tr>
                <th>Phase</th>
                <th className="num">Runs</th>
                <th className="num">Lat. moy</th>
                <th className="num">p50</th>
                <th className="num">p95</th>
                <th className="num">Coût moy</th>
                <th className="num">Coût total</th>
                <th className="num">Tokens (in / out)</th>
              </tr>
            </thead>
            <tbody>
              {phaseAggregate.map(p => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="num">{p.runs}</td>
                  <td className="num">{duration(p.avgDurationMs)}</td>
                  <td className="num">{duration(p.p50DurationMs)}</td>
                  <td className="num">{duration(p.p95DurationMs)}</td>
                  <td className="num">{usd(p.avgCostUsd)}</td>
                  <td className="num">{usd(p.totalCostUsd)}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {Math.round(p.avgInputTokens).toLocaleString('fr-FR')} /{' '}
                    {Math.round(p.avgOutputTokens).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {providerSpend.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Crédits / coût par fournisseur
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
            Le $ Claude vient du coût tokens (réel). Les fournisseurs à crédits (Apollo, Firecrawl, Pappers…) ne
            renvoient pas de $ : on affiche le nombre d&apos;appels — attribution{' '}
            <span style={{ color: 'var(--amber)' }}>approximative</span> (carte phase→fournisseurs).
          </p>
          <table>
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th className="num">Coût (USD)</th>
                <th className="num">Appels (≈)</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {providerSpend.map(p => (
                <tr key={p.provider}>
                  <td>{providerLabel(p.provider)}</td>
                  <td className="num">
                    {p.metered && p.costUsd != null ? (
                      usd(p.costUsd)
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>crédits — non chiffré</span>
                    )}
                  </td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {p.calls}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {p.metered ? 'facturé tokens' : 'crédits (approx.)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {sourceHealth.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            Santé des sources externes (appels OK / dégradés)
          </div>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">OK</th>
                <th className="num">Dégradés</th>
                <th className="num">Fiabilité</th>
              </tr>
            </thead>
            <tbody>
              {sourceHealth.map(s => {
                const total = s.ok + s.degraded
                const rate = total ? Math.round((100 * s.ok) / total) : 0
                return (
                  <tr key={s.source}>
                    <td>{s.source}</td>
                    <td className="num">{s.ok}</td>
                    <td className="num" style={{ color: s.degraded ? 'var(--red)' : 'var(--muted)' }}>
                      {s.degraded}
                    </td>
                    <td className="num">{rate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {grounded.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Grounding — « citer ses sources »
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)' }}>
            Ratio de faits sourcés (tag <span className="badge PUBLIC">PUBLIC</span> officiel/citable) vs faits{' '}
            <span className="badge HYPOTHESE">HYPOTHÈSE</span> (interprétation IA à confirmer), par analyse. Cible :{' '}
            <strong>&lt; 5 % de faits non sourcés</strong> (ratio sourcé ≥ 95 %).
          </p>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Ratio sourcé moyen</div>
              <Gauge value={avgSourcedRatio == null ? 0 : avgSourcedRatio * 100} label="sourcé" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cible atteinte</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {meetingTarget}
                <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> / {withRatio}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>runs avec &lt; 5 % non sourcés</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sources consultées</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {Math.round(totalRegistry).toLocaleString('fr-FR')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>registre vérifiable (cumul)</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Confiance moy.</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {avgConfidence == null ? '—' : `${Math.round(avgConfidence)}/100`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(totalLegal)} citations légales</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th className="num">Sourcés</th>
                <th className="num">Hypothèses</th>
                <th className="num">Ratio sourcé</th>
                <th className="num">Sources</th>
                <th>Confiance</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {grounded.map(({ row, g }) => {
                const ratio = g.sourcedRatio
                const meets = ratio != null && ratio >= 0.95
                return (
                  <tr key={row.accountId}>
                    <td>
                      <a className="link" href={`/analysis/${row.accountId}`}>
                        {row.companyName || '—'}
                      </a>
                    </td>
                    <td className="num" style={{ color: 'var(--green)' }}>
                      {g.sourcedFacts}
                    </td>
                    <td className="num" style={{ color: g.hypothesisFacts ? 'var(--amber)' : 'var(--muted)' }}>
                      {g.hypothesisFacts}
                    </td>
                    <td
                      className="num"
                      style={{ color: ratio == null ? 'var(--muted)' : meets ? 'var(--green)' : 'var(--amber)' }}
                    >
                      {ratio == null ? '—' : pct(ratio * 100)}
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {g.registrySize}
                    </td>
                    <td>
                      {g.confidenceScore == null ? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      ) : (
                        <span className={`badge ${g.confidenceTier ? (TIER_BADGE[g.confidenceTier] ?? '') : ''}`}>
                          {g.confidenceScore}/100
                          {g.confidenceTier ? ` · ${g.confidenceTier}` : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{shortDate(row.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {analyses.length === 0 ? (
        <div className="empty">Aucune analyse pour le moment.</div>
      ) : (
        <MonitoringTable groups={grouped} />
      )}
    </>
  )
}
