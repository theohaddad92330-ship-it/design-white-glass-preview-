import { fetchTeamKpis, type MessageSendBreakdown, type TeamKpisSummary } from '@/lib/team-kpis'
import { BarChart } from '@/app/_components/charts'
import { STR, WINDOWS, fmtActivationRate, fmtMessageBreakdown, fmtRate, parseWindow } from '@/app/teams/strings'

/** Somme terme à terme des décompositions d'envois de plusieurs ESN. */
function sumBreakdowns(rows: readonly { messages: MessageSendBreakdown }[]): MessageSendBreakdown {
  return rows.reduce<MessageSendBreakdown>(
    (acc, r) => ({
      verified: acc.verified + r.messages.verified,
      declared: acc.declared + r.messages.declared,
      unattributed: acc.unattributed + r.messages.unattributed,
      total: acc.total + r.messages.total,
    }),
    { verified: 0, declared: 0, unattributed: 0, total: 0 },
  )
}

// Manager KPIs section of the consolidated "Clients" → ESN view. ESN and Équipes
// are two lenses on the same entity (both aggregate per ESN/workspace), so the
// former standalone /teams screen is FUSED under the ESN sub-tab, below the ESN
// annuaire: identity/plan/members (EsnDirectory) + activity KPIs (here) on one
// screen. KPI numbers/logic are moved verbatim — same cross-tenant endpoint
// (behind InternalSecretGuard), same charts, no invented data. Only the title is
// demoted to an <h2> section and the window links carry ?view=esn so switching the
// window stays on this sub-tab. The per-ESN DETAIL page /teams/[id] is unchanged.

function WindowPicker({ current }: { current: number }) {
  return (
    <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--muted)' }}>
      {STR.window} :{' '}
      {WINDOWS.map((w, i) => (
        <span key={w}>
          {i > 0 ? ' · ' : ''}
          {w === current ? (
            <strong style={{ color: 'var(--text)' }}>
              {w} {STR.windowDaysSuffix}
            </strong>
          ) : (
            <a className="link" href={`/clients?view=esn&days=${w}`}>
              {w} {STR.windowDaysSuffix}
            </a>
          )}
        </span>
      ))}
    </p>
  )
}

// Visual separator between the ESN annuaire above and the KPIs below — matches
// the SubTabs bottom border so the two blocks read as one ESN screen.
const SECTION_STYLE: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 28,
  borderTop: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
}

export async function TeamsPanel({ days }: { days?: string }) {
  const windowDays = parseWindow(days)

  let report: TeamKpisSummary
  try {
    report = await fetchTeamKpis(windowDays)
  } catch (err) {
    return (
      <section style={SECTION_STYLE}>
        <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>{STR.listTitle}</h2>
        <p className="subtitle">{STR.listSubtitle}</p>
        <div className="error">
          {STR.errorTitle}
          <br />
          {err instanceof Error ? err.message : String(err)}
          <br />
          {STR.errorHint}
        </div>
      </section>
    )
  }

  const teams = report.teams ?? []
  const sum = (pick: (t: (typeof teams)[number]) => number): number => teams.reduce((s, t) => s + pick(t), 0)

  return (
    <section style={SECTION_STYLE}>
      <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>{STR.listTitle}</h2>
      <p className="subtitle">{STR.listSubtitle}</p>
      <WindowPicker current={report.windowDays} />

      <section className="kpi-grid">
        <div className="card">
          <div className="label">{STR.cards.analyses}</div>
          <div className="value">{sum(t => t.analysesStarted)}</div>
        </div>
        <div className="card">
          <div className="label">{STR.cards.messages}</div>
          <div className="value">{sum(t => t.messagesSent)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {fmtMessageBreakdown(sumBreakdowns(teams))}
          </div>
        </div>
        <div className="card">
          <div className="label">{STR.cards.credits}</div>
          <div className="value">{sum(t => t.creditsConsumed)}</div>
        </div>
        <div className="card">
          <div className="label">{STR.cards.hotAccounts}</div>
          <div className="value">{sum(t => t.hotAccounts)}</div>
        </div>
      </section>

      {teams.length > 0 ? (
        <section className="card" style={{ marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            {STR.charts.analysesPerTeam}
          </div>
          <BarChart
            data={teams
              .slice()
              .sort((a, b) => b.analysesStarted - a.analysesStarted)
              .slice(0, 10)
              .map(t => ({ label: t.workspaceName || t.workspaceId, value: t.analysesStarted }))}
          />
        </section>
      ) : null}

      <h3 style={{ fontSize: 16, margin: '4px 0 12px' }}>{STR.sections.teams}</h3>
      {teams.length === 0 ? (
        <div className="empty">{STR.empty.teams}</div>
      ) : (
        <table style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>{STR.table.esn}</th>
              <th className="num">{STR.table.members}</th>
              <th className="num" title={STR.table.analysesCaption}>
                {STR.table.analyses} ({STR.table.analysesCompleted})
              </th>
              <th className="num" title={STR.table.accountsCaption}>
                {STR.table.accounts} ({STR.table.accountsCompleted})
              </th>
              <th className="num" title={STR.table.accountsCaption}>
                {STR.table.activeAccounts}
              </th>
              <th className="num">{STR.table.hotAccounts}</th>
              <th className="num">{STR.table.enriched}</th>
              <th className="num" title={STR.messagesBreakdown.caption}>
                {STR.table.messages} ({STR.table.messagesVerifiedShort}/{STR.table.messagesDeclaredShort})
              </th>
              <th className="num">{STR.table.responses}</th>
              <th className="num">{STR.table.responseRate}</th>
              <th className="num">{STR.table.rdv}</th>
              <th className="num">{STR.table.credits}</th>
              <th className="num">{STR.table.activation}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.workspaceId}>
                <td>
                  <a className="link" href={`/teams/${t.workspaceId}?days=${report.windowDays}`}>
                    {t.workspaceName || t.workspaceId}
                  </a>
                </td>
                <td className="num">{t.memberCount}</td>
                <td className="num">
                  {t.analysesStarted} <span style={{ color: 'var(--muted)' }}>({t.analysesCompleted})</span>
                </td>
                <td className="num">
                  {t.accountsLaunched} <span style={{ color: 'var(--muted)' }}>({t.accountsCompleted})</span>
                </td>
                <td className="num">{t.activeAccounts}</td>
                <td className="num">{t.hotAccounts}</td>
                <td className="num">{t.contactsEnriched}</td>
                <td className="num" title={fmtMessageBreakdown(t.messages)}>
                  {t.messagesSent}{' '}
                  <span style={{ color: 'var(--muted)' }}>
                    ({t.messages.verified}/{t.messages.declared})
                  </span>
                </td>
                <td className="num">{t.responsesReceived}</td>
                <td className="num">{fmtRate(t.responseRate)}</td>
                <td className="num">{t.rdvObtained}</td>
                <td className="num">{t.creditsConsumed}</td>
                {/* #1681.1 — le RETRAIT se dit. `fmtRate(null)` rendait ici le
                    même tiret qu'une absence de mesure, alors que la mesure
                    existe : on refuse de la publier parce que sous le seuil une
                    moyenne désigne quelqu'un. */}
                <td className="num">
                  {t.activatedMembers}/{t.onboardedMembers}{' '}
                  <span style={{ color: 'var(--muted)' }}>
                    ({fmtActivationRate(t.activationRate, t.activationWithheld)})
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="card">
        <div className="label" style={{ marginBottom: 8 }}>
          {STR.sections.notes}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {(report.notes ?? []).map((n, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>
              {n}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
