import { type Dict, Section, asArray, pick, str } from './analysis-shared'

/**
 * CE QU'ON A OBSERVÉ — programmes, angles d'attaque, stack et opportunités,
 * hypothèses qualifiées, signaux récents et budgétaires, pains et défis IT.
 * La matière brute du raisonnement commercial, avant le plan.
 */
export function AnalysisSignals({ raw }: { raw: Dict }) {
  const programs = asArray(pick(raw, 'program_names', 'programNames'))
  const angles = asArray(pick(raw, 'angles'))
  const techStack = asArray(pick(raw, 'technology_stack', 'technologyStack'))
  const hypotheses = asArray(pick(raw, 'qualified_hypotheses', 'qualifiedHypotheses'))
  const recentSignals = asArray(pick(raw, 'recent_signals', 'recentSignals'))
  const budgetSignals = asArray(pick(raw, 'budget_signals', 'budgetSignals'))
  const pains = asArray(pick(raw, 'pains'))
  const itChallenges = asArray(pick(raw, 'it_challenges', 'itChallenges'))

  return (
    <>
      {programs.length > 0 ? (
        <Section title={`Programmes (${programs.length})`}>
          <ul>
            {programs.map((p, i) => (
              <li key={i}>{str(p)}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {angles.length > 0 ? (
        <Section title={`Angles d'attaque (${angles.length})`}>
          <div style={{ display: 'grid', gap: 12 }}>
            {angles.map((a, i) => {
              const o = (a ?? {}) as Dict
              return (
                <div key={i} className="card" style={{ padding: 14 }}>
                  <strong>
                    {o.isRecommended || o.is_recommended ? '★ ' : ''}
                    {str(o.title)}
                  </strong>
                  {str(o.strategy) ? (
                    <p style={{ margin: '6px 0', fontSize: 13, color: 'var(--muted)' }}>{str(o.strategy)}</p>
                  ) : null}
                  <div className="kv" style={{ marginTop: 6, fontSize: 13 }}>
                    {str(pick(o, 'specific_offer', 'specificOffer')) ? (
                      <>
                        <span className="k">Offre</span>
                        <span>{str(pick(o, 'specific_offer', 'specificOffer'))}</span>
                      </>
                    ) : null}
                    {str(pick(o, 'estimated_deal_size', 'estimatedDealSize')) ? (
                      <>
                        <span className="k">Deal estimé</span>
                        <span>{str(pick(o, 'estimated_deal_size', 'estimatedDealSize'))}</span>
                      </>
                    ) : null}
                    {str(pick(o, 'entry_contact_persona', 'entryContactPersona')) ? (
                      <>
                        <span className="k">Contact d'entrée</span>
                        <span>{str(pick(o, 'entry_contact_persona', 'entryContactPersona'))}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {techStack.length > 0 ? (
        <Section title={`Stack & opportunités ESN (${techStack.length})`}>
          <table>
            <tbody>
              {techStack.map((t, i) => {
                const o = (t ?? {}) as Dict
                return (
                  <tr key={i}>
                    <td style={{ width: '30%' }}>
                      {str(o.name)}
                      {str(o.maturity) ? <span style={{ color: 'var(--muted)' }}> · {str(o.maturity)}</span> : null}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {str(pick(o, 'opportunity_for_esn', 'opportunityForEsn')) || str(o.usage)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      ) : null}

      {hypotheses.length > 0 ? (
        <Section title={`Hypothèses qualifiées (${hypotheses.length}) — signaux → hypothèses`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {hypotheses.map((h, i) => {
              const o = (h ?? {}) as Dict
              const conf = str(o.confidence)
              const signals = asArray(pick(o, 'based_on_signals', 'basedOnSignals'))
                .map(str)
                .filter(Boolean)
              return (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div>
                    <strong>{str(o.hypothesis)}</strong>
                    {conf ? (
                      <span
                        className={`badge ${conf === 'confirmee' ? 'PUBLIC' : conf === 'probable' ? 'P2' : 'HYPOTHESE'}`}
                        style={{ marginLeft: 8 }}
                      >
                        {conf}
                      </span>
                    ) : null}
                  </div>
                  {str(pick(o, 'esn_angle', 'esnAngle')) ? (
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>angle ESN : </span>
                      {str(pick(o, 'esn_angle', 'esnAngle'))}
                    </p>
                  ) : null}
                  {signals.length > 0 ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      fondé sur : {signals.join(' · ')}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {recentSignals.length > 0 || budgetSignals.length > 0 ? (
        <Section title="Signaux & budget">
          <ul>
            {recentSignals.map((s, i) => {
              const o = (s ?? {}) as Dict
              return (
                <li key={`r${i}`}>
                  {str(o.signal)} {str(o.date) ? <span style={{ color: 'var(--muted)' }}>· {str(o.date)}</span> : null}
                </li>
              )
            })}
            {budgetSignals.map((s, i) => {
              const o = (s ?? {}) as Dict
              return (
                <li key={`b${i}`}>
                  💶 {str(o.signal)}{' '}
                  {str(o.amount) ? <span style={{ color: 'var(--muted)' }}>· {str(o.amount)}</span> : null}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {pains.length > 0 || itChallenges.length > 0 ? (
        <Section title="Pains & défis IT">
          <ul>
            {pains.map((p, i) => {
              const o = (p ?? {}) as Dict
              return (
                <li key={`p${i}`}>
                  {str(o.pain)}{' '}
                  {str(o.urgency) ? <span style={{ color: 'var(--muted)' }}>· {str(o.urgency)}</span> : null}
                </li>
              )
            })}
            {itChallenges.map((c, i) => {
              const o = (c ?? {}) as Dict
              return (
                <li key={`c${i}`}>
                  {str(o.title)}{' '}
                  {str(o.severity) ? <span style={{ color: 'var(--muted)' }}>· {str(o.severity)}</span> : null}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}
    </>
  )
}
