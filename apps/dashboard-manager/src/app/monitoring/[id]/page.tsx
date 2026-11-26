import { fetchAnalysisAudit, type AdminAnalysisAudit } from '@/lib/monitoring'
import { getLang, makeT } from '@/lib/i18n'
import { LangToggle } from '../_components/lang-toggle'
import { StopButton } from '../_components/stop-button'
import { dateEtHeure } from '@/lib/dates'
import { secondsOrDash, tokensOrDash } from '@/lib/mesure'

// Per-run "full audit" panel for the operator: owner, per-phase telemetry
// (providers ok · down · skipped, tokens + cost), the failure payload, the real
// correlation id (+ Sentry link) and the run history — plus the admin STOP /
// force-error controls. The rich sales dossier lives at /analysis/[id]; this is
// the ops/debug view. Always fresh.
export const dynamic = 'force-dynamic'

function usd(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(n !== 0 && n < 1 ? 4 : 2)}`
}

const dt = (iso: string): string => dateEtHeure(iso)

// Supervision 30/09 : durée / tokens non mesurés => « — », jamais 0s / 0.
const sec = secondsOrDash

function sourceColor(status: string): string {
  if (status === 'ok') return 'var(--green)'
  if (status === 'down') return 'var(--red)'
  return 'var(--muted)' // skipped / other
}

export default async function AuditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const lang = await getLang()
  const t = makeT(lang)

  let audit: AdminAnalysisAudit
  try {
    audit = await fetchAnalysisAudit(params.id)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/monitoring?view=runs">
          {t('back')}
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  const isRunning = audit.status === 'analyzing'
  const PHASES = ['research', 'contacts', 'classify', 'plan']

  return (
    <main className="wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <a className="link" href="/monitoring?view=runs">
          {t('back')}
        </a>
        <LangToggle lang={lang} />
      </div>

      <h1 style={{ marginTop: 12 }}>{audit.companyName || audit.accountId}</h1>
      <p className="subtitle">
        <span
          className={audit.isZombie ? 'badge' : `badge ${audit.status}`}
          style={
            audit.isZombie
              ? { color: 'var(--amber)', borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)' }
              : undefined
          }
        >
          {audit.isZombie ? t('zombie') : audit.status}
        </span>
        {audit.costUsd != null ? <> · {usd(audit.costUsd)}</> : null}
        {audit.priorityScore != null ? <> · P{audit.priorityScore}/10</> : null}
        {audit.siren ? <> · SIREN {audit.siren}</> : null}
        {' · '}
        <a className="link" href={`/analysis/${audit.accountId}`}>
          {t('fullDossier')}
        </a>
      </p>

      {audit.isZombie ? (
        <div
          className="card"
          style={{ marginTop: 12, padding: 12, borderColor: 'color-mix(in srgb, var(--amber) 40%, transparent)' }}
        >
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>⚠ {t('zombie')}</span>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('zombieHint')}</div>
        </div>
      ) : null}

      {/* ── Admin controls ── */}
      {isRunning ? (
        <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
          <StopButton
            accountId={audit.accountId}
            mode="stop"
            label={t('stop')}
            confirmText={t('stopConfirm')}
            workingText={t('working')}
          />
          <StopButton
            accountId={audit.accountId}
            mode="force_error"
            tone="muted"
            label={t('forceError')}
            confirmText={t('forceErrorConfirm')}
            workingText={t('working')}
          />
        </div>
      ) : null}

      {/* ── Owner ── */}
      <section style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{t('ownerSection')}</h3>
        <div className="kv">
          <span className="k">{t('email')}</span>
          <span>{audit.email || '—'}</span>
          <span className="k">{t('user')}</span>
          <span>
            {audit.fullName || '—'}{' '}
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>
              {audit.userId}
            </span>
          </span>
          <span className="k">{t('workspace')}</span>
          <span>{audit.workspaceName || '—'}</span>
          <span className="k">{t('createdAt')}</span>
          <span>{dt(audit.createdAt)}</span>
          <span className="k">{t('updatedAt')}</span>
          <span>{dt(audit.updatedAt)}</span>
        </div>
      </section>

      {/* ── Failure ── */}
      {audit.status === 'error' || audit.status === 'canceled' ? (
        <section className="error" style={{ marginTop: 20 }}>
          <strong>{t('failureSection')}</strong>
          {audit.errorPhase ? (
            <>
              {' '}
              — {t('stoppedAt')} <code>{audit.errorPhase}</code>
            </>
          ) : null}
          <div style={{ marginTop: 6 }}>{audit.errorMessage || t('reasonNotRecorded')}</div>
          {audit.creditSignal ? (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <span
                className="badge"
                style={{ color: 'var(--red)', borderColor: 'color-mix(in srgb, var(--red) 40%, transparent)' }}
              >
                {t('creditAlert')}
              </span>{' '}
              <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{audit.creditSignal.provider}</span> ·{' '}
              {audit.creditSignal.kind}
            </div>
          ) : null}
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--muted)' }}>
            {audit.phasesCompleted.length > 0 ? (
              <>
                {t('phasesDone')} : {audit.phasesCompleted.join(' · ')}
              </>
            ) : (
              t('noPhase')
            )}
          </div>
        </section>
      ) : null}

      {/* ── Per-phase audit ── */}
      {audit.phaseTelemetry.length > 0 ? (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{t('perPhaseSection')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('phase')}</th>
                <th className="num">{t('cost')}</th>
                <th className="num">{t('duration')}</th>
                <th className="num">{t('tokens')}</th>
                <th>{t('sources')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.phaseTelemetry.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td className="num">{usd(p.costUsd)}</td>
                  <td className="num">{sec(p.durationMs)}</td>
                  <td className="num">
                    {tokensOrDash(p.inputTokens)} / {tokensOrDash(p.outputTokens)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {p.sources.length > 0
                      ? `${p.sources.filter(s => s.status === 'ok').length}/${p.sources.length} OK`
                      : p.sourceHealth
                        ? Object.entries(p.sourceHealth)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(' · ')
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Providers per phase (ok · down · skipped) ── */}
      {audit.phaseTelemetry.some(p => p.sources.length > 0) ? (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{t('providersSection')}</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {audit.phaseTelemetry
              .filter(p => p.sources.length > 0)
              .map((p, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                  <table>
                    <tbody>
                      {p.sources.map((s, j) => (
                        <tr key={j}>
                          <td className="mono" style={{ width: 220 }}>
                            {s.provider}
                          </td>
                          <td style={{ width: 90 }}>
                            <span className="badge" style={{ color: sourceColor(s.status) }}>
                              {s.status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{s.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {/* ── Observability: correlation id + Sentry ── */}
      <section style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{t('observabilitySection')}</h3>
        {audit.correlationId ? (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('correlationId')}</div>
            <div className="mono" style={{ fontSize: 14, margin: '4px 0 10px', userSelect: 'all' }}>
              {audit.correlationId}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>{t('correlationNote')}</p>
            {audit.sentrySearchUrl ? (
              <a className="link" href={audit.sentrySearchUrl} target="_blank" rel="noreferrer">
                {t('openSentry')}
              </a>
            ) : null}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('noCorrelation')}</p>
        )}
      </section>

      {/* ── Run history ── */}
      {audit.runs.length > 0 ? (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>
            {t('runHistory')} ({audit.runs.length})
          </h3>
          <table>
            <thead>
              <tr>
                <th>{t('runStatus')}</th>
                <th>{t('runScope')}</th>
                <th className="num">{t('runCost')}</th>
                <th>{t('runCreated')}</th>
                <th>{t('runCompleted')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.runs.map(r => (
                <tr key={r.id}>
                  <td>
                    <span className={`badge ${r.status}`}>{r.status}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {r.scopeMode || '—'}
                    {r.siren ? ` · ${r.siren}` : ''}
                  </td>
                  <td className="num">{usd(r.costUsd)}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{dt(r.createdAt)}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.completedAt ? dt(r.completedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Reference: the canonical 4 phases, so an operator reads which are missing. */}
      <p style={{ marginTop: 20, fontSize: 11, color: 'var(--muted)' }}>
        {t('phase')}: {PHASES.join(' → ')}
      </p>
    </main>
  )
}
