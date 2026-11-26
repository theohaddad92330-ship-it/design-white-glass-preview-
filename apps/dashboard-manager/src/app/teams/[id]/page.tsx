import type { JSX } from 'react'
import { fetchDeepKpis, fetchTeamKpisDetail, type TeamKpisDetail } from '@/lib/team-kpis'
import { DeepKpis } from '../_deep-kpis'
import { BarChart, Donut } from '../../_components/charts'
import { STR, WINDOWS, fmtDate, fmtMessageBreakdown, fmtRate, parseWindow } from '../strings'
import { EmailEnClair } from '@/app/_components/email-en-clair'

// Backoffice — drill-down d'une équipe (ESN) : KPIs par commercial (activité,
// conversion des actions déclarées, crédits, activation) + pipeline des comptes
// par statut commercial. Lecture seule, derrière InternalSecretGuard.
export const dynamic = 'force-dynamic'

export default async function TeamDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ days?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const windowDays = parseWindow(searchParams?.days)

  let detail: TeamKpisDetail
  try {
    detail = await fetchTeamKpisDetail(params.id, windowDays)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/clients?view=esn">
          {STR.detailBack}
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          {STR.errorTitle}
          <br />
          {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  const members = detail.members ?? []
  const pipeline = detail.pipeline ?? []
  const totals = detail.totals
  // Optionnels : servis par une API récente. Absents ⇒ blocs masqués (un
  // backoffice déployé avant l'API ne doit pas rendre « on ne sait pas » en 0).
  const workload = detail.workload
  const portfolio = detail.portfolio

  // Les trois familles d'indicateurs profonds, chacune tolérante à SON échec.
  // Elles arrivent APRÈS le détail, et leur absence ne fait pas tomber la page :
  // un opérateur qui perd tout son écran parce qu'un KPI n'a pas pu être lu ne
  // peut plus rien diagnostiquer du tout.
  const deep = await fetchDeepKpis(params.id, windowDays)

  return (
    <main className="wrap">
      <a className="link" href={`/clients?view=esn&days=${detail.windowDays}`}>
        {STR.detailBack}
      </a>

      <h1 style={{ marginTop: 12 }}>{detail.workspace?.name || detail.workspace?.id || params.id}</h1>
      <p className="subtitle">
        {detail.workspace?.memberCount ?? members.length} {STR.table.members.toLowerCase()} · {STR.window}{' '}
        {detail.windowDays} {STR.windowDaysSuffix} (
        {WINDOWS.map((w, i) => (
          <span key={w}>
            {i > 0 ? ' · ' : ''}
            {w === detail.windowDays ? (
              <strong style={{ color: 'var(--text)' }}>
                {w} {STR.windowDaysSuffix}
              </strong>
            ) : (
              <a className="link" href={`/teams/${params.id}?days=${w}`}>
                {w} {STR.windowDaysSuffix}
              </a>
            )}
          </span>
        ))}
        )
      </p>

      <section className="kpi-grid">
        <div className="card">
          <div className="label">{STR.cards.analyses}</div>
          <div className="value">{totals.analysesStarted}</div>
        </div>
        <div className="card">
          <div className="label">{STR.cards.messages}</div>
          <div className="value">{totals.messagesSent}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }} title={STR.messagesBreakdown.caption}>
            {fmtMessageBreakdown(totals.messages)}
          </div>
        </div>
        <div className="card">
          <div className="label">{STR.table.responseRate}</div>
          <div className="value">{fmtRate(totals.responseRate)}</div>
        </div>
        <div className="card">
          <div className="label">{STR.cards.credits}</div>
          <div className="value">{totals.creditsConsumed}</div>
        </div>
      </section>

      {workload ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            {STR.workload.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>{STR.workload.caption}</div>
          {workload.open === 0 ? (
            <div className="empty" style={{ padding: 12 }}>
              {STR.workload.empty}
            </div>
          ) : (
            <div className="kpi-grid" style={{ gap: 12, marginBottom: 0 }}>
              <MiniStat label={STR.workload.open} value={workload.open} />
              <MiniStat label={STR.workload.overdue} value={workload.overdue} tone="red" />
              <MiniStat label={STR.workload.dueSoon} value={workload.dueSoon} tone="amber" />
              <MiniStat label={STR.workload.undated} value={workload.undated} />
            </div>
          )}
          {detail.offTeamOpenActions && detail.offTeamOpenActions > 0 ? (
            <p style={{ fontSize: 13, color: 'var(--amber)', margin: '12px 0 0' }}>
              ⚠ {detail.offTeamOpenActions} {STR.workload.offTeam}
            </p>
          ) : null}
        </section>
      ) : null}

      {portfolio ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            {STR.portfolio.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>{STR.portfolio.caption}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MiniStat label={STR.portfolio.assigned} value={portfolio.assigned} />
            <MiniStat
              label={STR.portfolio.unassigned}
              value={portfolio.unassigned}
              tone={portfolio.unassigned > 0 ? 'amber' : undefined}
              hint={portfolio.unassigned > 0 ? STR.portfolio.unassignedHint : undefined}
            />
          </div>
        </section>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <section className="card">
          <div className="label" style={{ marginBottom: 12 }}>
            {STR.charts.pipeline}
          </div>
          {pipeline.length === 0 ? (
            <div className="empty" style={{ padding: 12 }}>
              {STR.empty.pipeline}
            </div>
          ) : (
            <Donut segments={pipeline.map(p => ({ label: p.status, value: p.count }))} />
          )}
        </section>
        <section className="card">
          <div className="label" style={{ marginBottom: 4 }}>
            {STR.charts.messagesPerMember}
          </div>
          {/* Le graphe ne classe QUE les envois prouvés : un histogramme qui
              range les commerciaux sur un total incluant du déclaratif serait
              directement auto-gonflable. Les envois déclarés restent visibles,
              par commercial, dans le tableau juste en dessous. */}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            {STR.charts.messagesPerMemberCaption}
          </div>
          {members.length === 0 ? (
            <div className="empty" style={{ padding: 12 }}>
              {STR.empty.members}
            </div>
          ) : (
            <BarChart data={members.map(m => ({ label: m.name, value: m.messages.verified }))} />
          )}
        </section>
      </div>

      <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>{STR.sections.members}</h2>
      {members.length === 0 ? (
        <div className="empty">{STR.empty.members}</div>
      ) : (
        <table style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>{STR.table.commercial}</th>
              <th>{STR.table.role}</th>
              <th className="num">
                {STR.table.analyses} ({STR.table.analysesCompleted})
              </th>
              <th className="num">{STR.table.activeAccounts}</th>
              <th className="num">{STR.table.portfolio}</th>
              <th className="num">{STR.table.openActions}</th>
              <th className="num">{STR.table.hotAccounts}</th>
              <th className="num">{STR.table.enriched}</th>
              <th className="num" title={STR.messagesBreakdown.caption}>
                {STR.table.messages} ({STR.table.messagesVerifiedShort}/{STR.table.messagesDeclaredShort})
              </th>
              <th className="num">{STR.table.responses}</th>
              <th className="num">{STR.table.responseRate}</th>
              <th className="num">{STR.table.rdv}</th>
              <th className="num">{STR.table.deals}</th>
              <th className="num">{STR.table.credits}</th>
              <th>{STR.table.onboardedAt}</th>
              <th>{STR.table.activatedAt}</th>
              <th>{STR.table.lastActivity}</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.userId}>
                <td>
                  {m.name}
                  {m.email ? (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                      <EmailEnClair email={m.email} />
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className="pill">{m.role}</span>
                </td>
                <td className="num">
                  {m.analysesStarted} <span style={{ color: 'var(--muted)' }}>({m.analysesCompleted})</span>
                </td>
                <td className="num">{m.activeAccounts}</td>
                <td className="num">{m.portfolioAccounts ?? STR.notAvailable}</td>
                <td className="num">
                  {m.workload ? (
                    <>
                      {m.workload.open}
                      {m.workload.overdue > 0 ? (
                        <span style={{ color: 'var(--red)' }}>
                          {' '}
                          ({m.workload.overdue} {STR.table.overdueShort})
                        </span>
                      ) : null}
                    </>
                  ) : (
                    STR.notAvailable
                  )}
                </td>
                <td className="num">{m.hotAccounts}</td>
                <td className="num">{m.contactsEnriched}</td>
                <td className="num" title={fmtMessageBreakdown(m.messages)}>
                  {m.messagesSent}{' '}
                  <span style={{ color: 'var(--muted)' }}>
                    ({m.messages.verified}/{m.messages.declared})
                  </span>
                </td>
                <td className="num">{m.responsesReceived}</td>
                <td className="num">{fmtRate(m.responseRate)}</td>
                <td className="num">{m.rdvObtained}</td>
                <td className="num">{m.dealsSigned}</td>
                <td className="num">{m.creditsConsumed}</td>
                <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(m.onboardedAt)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(m.activatedAt)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(m.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail.unattributedCredits > 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }}>
          + {detail.unattributedCredits} {STR.unattributedCredits}
        </p>
      ) : null}

      <section className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          {STR.sections.notes}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {(detail.notes ?? []).map((n, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>
              {n}
            </li>
          ))}
        </ul>
      </section>

      <DeepKpis crm={deep.crm} matching={deep.matching} quality={deep.quality} />
    </main>
  )
}

/** Petite tuile chiffrée (charge d'actions / couverture). `tone` colore le
 *  chiffre quand il porte un signal (retard = rouge, échéance proche = ambre). */
function MiniStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone?: 'red' | 'amber'
  hint?: string
}): JSX.Element {
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--text)'
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, marginTop: 4 }}>
        {value}
      </div>
      {hint ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hint}</div> : null}
    </div>
  )
}
