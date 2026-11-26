import { type Dict, Section, asArray, pick, planOf, str } from './analysis-shared'

/**
 * CE QUE LE DOSSIER PROMET — le cockpit de décision (§5 du 00_MASTER : verdict,
 * périmètres, plays, prochaine action), le positionnement de groupe, les axes
 * qu'on a ÉCARTÉS et pourquoi, et le vocabulaire maison qui sert de grille de
 * lecture. C'est la partie qu'un commercial lit sans faire défiler.
 */
export function AnalysisContract({ raw }: { raw: Dict }) {
  const plan = planOf(raw)
  // Headline "vendable" deliverables (00_MASTER §5 — the 5-min answer): the
  // decision cockpit rendered up top so a commercial reads verdict → périmètre →
  // plays → prochaine action without scrolling the whole dossier.
  const executiveSummary = asArray(pick(plan ?? {}, 'executiveSummary', 'executive_summary'))
    .map(str)
    .filter(Boolean)
  const nextBestAction = (pick(plan ?? {}, 'nextBestAction', 'next_best_action') ?? {}) as Dict
  const plays = asArray(pick(plan ?? {}, 'plays'))
  const priorityPerimeters = asArray(pick(raw, 'priority_perimeters', 'priorityPerimeters'))
  const missingData = (pick(plan ?? {}, 'missingData', 'missing_data') ?? {}) as Dict
  const hypothesesToVerify = asArray(pick(missingData, 'hypothesesToVerify', 'hypotheses_to_verify'))
    .map(str)
    .filter(Boolean)
  const groupRelationship = (pick(plan ?? {}, 'groupRelationship', 'group_relationship') ?? {}) as Dict
  // New surfaces (V1-vendable / knowledge, this session): logique de sélection,
  // logique Axians, logo, vocabulaire du groupe.
  const axesEcartes = asArray(pick(raw, 'axesEcartes', 'axes_ecartes'))
  const vocabularyTerms = asArray(pick((pick(raw, 'accountVocabulary', 'account_vocabulary') ?? {}) as Dict, 'terms'))

  return (
    <>
      {executiveSummary.length > 0 || plays.length > 0 || priorityPerimeters.length > 0 ? (
        <Section title="Cockpit décision — l'essentiel en 30 secondes">
          {executiveSummary.length > 0 ? (
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                {executiveSummary.map((line, i) => (
                  <li key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {str(nextBestAction.action) ? (
            <p style={{ margin: '0 0 14px', fontSize: 14 }}>
              <span className="badge PUBLIC">▶ Action immédiate</span> {str(nextBestAction.action)}
              {str(nextBestAction.contact) ? (
                <span style={{ color: 'var(--muted)' }}> · {str(nextBestAction.contact)}</span>
              ) : null}
            </p>
          ) : null}
          {priorityPerimeters.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Périmètres prioritaires — le plan attaque ces zones, pas “le groupe” (/20)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {priorityPerimeters.map((p, i) => {
                  const o = (p ?? {}) as Dict
                  const entry = str(pick(o, 'entry_role', 'entryRole'))
                  return (
                    <span key={i} className={`badge ${str(o.tier)}`} title={str(o.why)}>
                      {str(o.name)} · {str(o.tier)}
                      {entry ? ` · ${entry}` : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : null}
          {plays.length > 0 ? (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Top {plays.length} offres — périmètre · signal · offre · contact · angle · action · preuve · risque (§5)
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {plays.map((p, i) => {
                  const o = (p ?? {}) as Dict
                  const rows: Array<[string, string]> = [
                    ['Signal', str(o.painSignal)],
                    ['Offre', str(o.esnOffer)],
                    [
                      'Contact',
                      str(o.targetContact) + (str(o.targetContactRole) ? ` · ${str(o.targetContactRole)}` : ''),
                    ],
                    ['Angle', str(o.angle)],
                    ['1re action', str(o.firstAction)],
                    ['Preuve', str(o.evidenceLevel)],
                    ['Risque', str(o.risk)],
                    ...(str(o.readyMessage)
                      ? [
                          [`Message prêt (${str(o.readyMessageChannel) || 'M1'})`, str(o.readyMessage)] as [
                            string,
                            string,
                          ],
                        ]
                      : []),
                  ]
                  return (
                    <div key={i} className="card" style={{ padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <strong>{str(o.perimeter)}</strong>
                        <span style={{ display: 'flex', gap: 6 }}>
                          {(() => {
                            const coh = (o.coherence ?? {}) as Dict
                            const st = str(coh.status)
                            if (!st || st === 'coherent') return null
                            const [tone, label] =
                              st === 'incoherent' ? ['STOP', 'chaîne incomplète'] : ['PRUDENT', 'action recadrée']
                            return (
                              <span
                                className={`badge ${tone}`}
                                title={asArray(coh.issues)
                                  .map(x => str(x))
                                  .join(' · ')}
                              >
                                {label}
                              </span>
                            )
                          })()}
                          {str(o.tier) ? <span className={`badge ${str(o.tier)}`}>{str(o.tier)}</span> : null}
                        </span>
                      </div>
                      <div className="kv" style={{ fontSize: 13 }}>
                        {rows.map(([k, v]) => (
                          <div key={k} style={{ display: 'contents' }}>
                            <span className="k">{k}</span>
                            <span>{v || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          {hypothesesToVerify.length > 0 ? (
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              <span className="badge HYPOTHESE">à vérifier (règle 70%)</span>{' '}
              {hypothesesToVerify.slice(0, 3).join(' · ')}
            </p>
          ) : null}
        </Section>
      ) : null}

      {groupRelationship.isInsider ? (
        <Section title="Logique Axians — positionnement complément">
          <p style={{ fontSize: 13, margin: 0 }}>
            <span className="badge PUBLIC">complément</span> {str(groupRelationship.esn)} appartient au groupe{' '}
            {str(groupRelationship.group)}
            {str(groupRelationship.matchedEntity)
              ? ` (rattachement : ${str(groupRelationship.matchedEntity)})`
              : ''}. {str(groupRelationship.note)}
          </p>
        </Section>
      ) : null}

      {axesEcartes.length > 0 ? (
        <Section title="Logique de sélection — axes écartés (pourquoi, et comment les réactiver)">
          <div style={{ display: 'grid', gap: 10 }}>
            {axesEcartes.map((a, i) => {
              const o = (a ?? {}) as Dict
              return (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <strong>{str(o.angle)}</strong>
                  {str(o.raison) ? <div style={{ fontSize: 13, marginTop: 4 }}>{str(o.raison)}</div> : null}
                  {str(pick(o, 'comment_reactiver', 'commentReactiver')) ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      → réactiver : {str(pick(o, 'comment_reactiver', 'commentReactiver'))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {vocabularyTerms.length > 0 ? (
        <Section title={`Vocabulaire du groupe — grille de lecture (${vocabularyTerms.length})`}>
          <table>
            <thead>
              <tr>
                <th>Terme</th>
                <th>Type</th>
                <th>Sens</th>
                <th>Pourquoi (commercial)</th>
              </tr>
            </thead>
            <tbody>
              {vocabularyTerms.map((t, i) => {
                const o = (t ?? {}) as Dict
                return (
                  <tr key={i}>
                    <td>
                      <strong>{str(o.term)}</strong>
                    </td>
                    <td>
                      <span className="badge">{str(o.kind)}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{str(o.meaning) || '—'}</td>
                    <td style={{ fontSize: 12 }}>{str(pick(o, 'commercial_why', 'commercialWhy')) || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      ) : null}
    </>
  )
}
