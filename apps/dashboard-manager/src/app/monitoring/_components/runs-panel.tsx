import { fetchAnalyses, type AdminAnalysisRow } from '@/lib/monitoring'
import { getLang, makeT } from '@/lib/i18n'
import { Filters } from './filters'
import { LangToggle } from './lang-toggle'
import { StopButton } from './stop-button'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { jourEtHeureCourte } from '@/lib/dates'

// Runs sub-view of the "Analyses" umbrella (was the standalone /monitoring list).
// Body moved verbatim — cross-user analysis monitoring: every analysis, every
// user, filters, the problems triage table and the inline admin STOP / force-error
// controls. The parent /monitoring page forces dynamic so this stays fresh.

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function usd(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(n !== 0 && n < 1 ? 4 : 2)}`
}

const shortDate = (iso: string): string => jourEtHeureCourte(iso)

function statusStyle(row: AdminAnalysisRow): { cls: string; extra?: React.CSSProperties } {
  if (row.isZombie)
    return {
      cls: 'badge',
      extra: { color: 'var(--amber)', borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)' },
    }
  return { cls: `badge ${row.status}` }
}

export async function RunsPanel({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const lang = await getLang()
  const t = makeT(lang)

  const filters = {
    search: first(searchParams.search),
    status: first(searchParams.status),
    from: first(searchParams.from),
    to: first(searchParams.to),
  }

  let list
  try {
    list = await fetchAnalyses({
      search: filters.search || undefined,
      status: filters.status || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      limit: 150,
    })
  } catch (err) {
    return (
      <>
        <h1>{t('monitoringTitle')}</h1>
        <div className="error">
          Impossible de joindre l&apos;endpoint admin de l&apos;API.
          <br />
          {err instanceof Error ? err.message : String(err)}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
        </div>
      </>
    )
  }

  const rows = list.rows
  const running = rows.filter(r => r.status === 'analyzing' && !r.isZombie).length
  const failed = rows.filter(r => r.status === 'error').length
  const zombies = rows.filter(r => r.isZombie).length
  const problems = rows.filter(r => r.status === 'error' || r.status === 'canceled' || r.isZombie)

  const statusLabel = (r: AdminAnalysisRow): string =>
    r.isZombie ? t('zombie') : t((r.status as 'analyzing' | 'completed' | 'error' | 'canceled') ?? 'analyzing')

  const filterLabels = {
    search: t('search'),
    searchPlaceholder: t('searchPlaceholder'),
    status: t('status'),
    allStatuses: t('allStatuses'),
    from: t('from'),
    to: t('to'),
    apply: t('apply'),
    reset: t('reset'),
    statusOptions: [
      { value: 'analyzing', label: t('analyzing') },
      { value: 'completed', label: t('completed') },
      { value: 'error', label: t('error') },
      { value: 'canceled', label: t('canceled') },
      { value: 'zombie', label: t('zombie') },
    ],
  }

  function actions(r: AdminAnalysisRow) {
    if (r.status !== 'analyzing') return null
    return (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <StopButton
          accountId={r.accountId}
          mode="stop"
          label={t('stop')}
          confirmText={t('stopConfirm')}
          workingText={t('working')}
        />
        {r.isZombie ? (
          <StopButton
            accountId={r.accountId}
            mode="force_error"
            tone="muted"
            label={t('forceError')}
            confirmText={t('forceErrorConfirm')}
            workingText={t('working')}
          />
        ) : null}
      </span>
    )
  }

  function row(r: AdminAnalysisRow) {
    const s = statusStyle(r)
    return (
      <tr
        key={r.accountId}
        style={r.isZombie ? { background: 'color-mix(in srgb, var(--amber) 8%, transparent)' } : undefined}
      >
        <td>
          <a className="link" href={`/monitoring/${r.accountId}`}>
            {r.companyName || r.accountId}
          </a>
          {r.siren ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {r.siren}</span> : null}
        </td>
        <td style={{ fontSize: 12 }}>
          <EmailEnClair email={r.email} />
          {r.workspaceName ? <div style={{ color: 'var(--muted)' }}>{r.workspaceName}</div> : null}
        </td>
        <td>
          <span className={s.cls} style={s.extra}>
            {statusLabel(r)}
          </span>
        </td>
        <td style={{ fontSize: 12, color: 'var(--muted)' }}>
          {r.lastPhase ?? '—'} · {r.phasesCompleted}/4
        </td>
        <td className="num">{usd(r.costUsd)}</td>
        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{shortDate(r.createdAt)}</td>
        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{shortDate(r.updatedAt)}</td>
        <td style={{ fontSize: 12, color: 'var(--red)', maxWidth: 240 }}>
          {r.errorMessage ? <span title={r.errorMessage}>{r.errorMessage.slice(0, 80)}</span> : ''}
        </td>
        <td>{actions(r)}</td>
      </tr>
    )
  }

  const header = (
    <>
      <th>{t('account')}</th>
      <th>{t('user')}</th>
      <th>{t('status')}</th>
      <th>{t('phase')}</th>
      <th className="num">{t('cost')}</th>
      <th>{t('started')}</th>
      <th>{t('updated')}</th>
      <th>{t('errorCol')}</th>
      <th>{t('actions')}</th>
    </>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1>{t('monitoringTitle')}</h1>
          <p className="subtitle">{t('monitoringSubtitle')}</p>
        </div>
        <LangToggle lang={lang} />
      </div>

      <Filters initial={filters} labels={filterLabels} />

      <section className="kpi-grid">
        <div className="card">
          <div className="label">{t('total')}</div>
          <div className="value">{list.total}</div>
        </div>
        <div className="card">
          <div className="label">{t('running')}</div>
          <div className="value" style={{ color: 'var(--amber)' }}>
            {running}
          </div>
        </div>
        <div className="card">
          <div className="label">{t('failed')}</div>
          <div className="value" style={{ color: failed ? 'var(--red)' : undefined }}>
            {failed}
          </div>
        </div>
        <div className="card">
          <div className="label">{t('zombies')}</div>
          <div className="value" style={{ color: zombies ? 'var(--amber)' : undefined }}>
            {zombies}
          </div>
        </div>
      </section>

      {problems.length > 0 ? (
        <section
          className="card"
          style={{ marginTop: 16, borderColor: 'color-mix(in srgb, var(--red) 30%, transparent)' }}
        >
          <div className="label" style={{ marginBottom: 10 }}>
            {t('problemsTitle')} ({problems.length})
          </div>
          <table>
            <thead>
              <tr>{header}</tr>
            </thead>
            <tbody>{problems.map(row)}</tbody>
          </table>
        </section>
      ) : (
        <p style={{ margin: '16px 0', fontSize: 13, color: 'var(--muted)' }}>{t('noProblems')}</p>
      )}

      <section style={{ marginTop: 24 }}>
        {rows.length === 0 ? (
          <div className="empty">{t('none')}</div>
        ) : (
          <table>
            <thead>
              <tr>{header}</tr>
            </thead>
            <tbody>{rows.map(row)}</tbody>
          </table>
        )}
      </section>
    </>
  )
}
