import { type Dict, RenderValue, Section, asArray, pick, planOf, str } from './analysis-shared'

/**
 * CE QU'ON FAIT ENSUITE — la feuille de route 30 jours par zone, le plan
 * d'action, le graphe de décision de la phase 3, et les livrables
 * d'aide à la vente (script de RDV, questions, objections).
 */

// Deck's 3 entry angles for the 30-day roadmap.
const ANGLE_LABEL: Record<string, string> = {
  top_down: '↓ top-down',
  bottom_up: '↑ bottom-up',
  middle_out: '↔ middle-out',
}

// Human labels for the Phase-4 plan sections. Keys are camelCase — the plan
// blob is stored AS-IS from the IA service (see accounts.service.ts applyPlan /
// the plan contract), so snake_case keys silently render nothing.
const PLAN_SECTIONS: Array<[string, string]> = [
  ['actionPlan', "Plan d'action (semaines)"],
  ['offersToPropose', 'Offres à proposer'],
  ['quickWins', 'Quick wins'],
  ['ifNoResponse', 'Si pas de réponse'],
  ['evaluation', 'Évaluation'],
  ['competitiveStrategy', 'Stratégie concurrentielle'],
]

export function AnalysisPlan({ raw }: { raw: Dict }) {
  const plan = planOf(raw)
  const planSections = plan ? PLAN_SECTIONS.filter(([k]) => plan[k] != null) : []
  const roadmap30j = asArray(pick(plan ?? {}, 'priority_sub_accounts', 'prioritySubAccounts'))

  return (
    <>
      {roadmap30j.length > 0 ? (
        <Section title={`Feuille de route 30j par zone (${roadmap30j.length})`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {roadmap30j.map((z, i) => {
              const o = (z ?? {}) as Dict
              const angle = str(o.approachAngle || o.approach_angle)
              const nextAction = str(pick(o, 'next_action', 'nextAction'))
              const deadline = str(o.deadline)
              return (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div>
                    <strong>{str(o.name)}</strong>
                    {angle ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        {ANGLE_LABEL[angle] ?? angle}
                      </span>
                    ) : null}
                    {deadline ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {deadline}</span> : null}
                  </div>
                  {nextAction ? (
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>prochaine action : </span>
                      {nextAction}
                    </p>
                  ) : null}
                  {str(pick(o, 'entry_contact', 'entryContact')) ||
                  str(pick(o, 'suggested_offer', 'suggestedOffer')) ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      {str(pick(o, 'entry_contact', 'entryContact'))
                        ? `contact : ${str(pick(o, 'entry_contact', 'entryContact'))}`
                        : ''}
                      {str(pick(o, 'suggested_offer', 'suggestedOffer'))
                        ? ` · offre : ${str(pick(o, 'suggested_offer', 'suggestedOffer'))}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {planSections.length > 0 ? (
        <Section title="Plan d'action">
          {planSections.map(([key, label]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 13, margin: '0 0 4px', color: 'var(--fg)' }}>{label}</h4>
              <div style={{ fontSize: 13 }}>
                <RenderValue value={(plan as Dict)[key]} />
              </div>
            </div>
          ))}
        </Section>
      ) : (
        <Section title="Plan d'action">
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Plan non encore généré pour cette analyse.</p>
        </Section>
      )}
    </>
  )
}

/** Le graphe de décision produit par la phase 3 : chaîne, ordre d'approche, parties prenantes, zones blanches. */
export function AnalysisDecisionGraph({ raw }: { raw: Dict }) {
  // Phase-3 org graph (persisted into raw_analysis.org).
  const org = (pick(raw, 'org') ?? {}) as Dict
  const decisionChain = (pick(org, 'decisionChain', 'decision_chain') ?? {}) as Dict
  const uncoveredZones = asArray(pick(org, 'uncoveredZones', 'uncovered_zones'))
  const stakeholderMap = asArray(pick(org, 'stakeholderMap', 'stakeholder_map'))
  const approachOrder = asArray(pick(org, 'approach_order', 'approachOrder'))

  if (
    Object.keys(decisionChain).length === 0 &&
    uncoveredZones.length === 0 &&
    stakeholderMap.length === 0 &&
    approachOrder.length === 0
  ) {
    return null
  }

  return (
    <Section title="Graphe de décision (phase 3)">
      {Object.keys(decisionChain).length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Chaîne de décision</div>
          {str(decisionChain.description) ? (
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>{str(decisionChain.description)}</p>
          ) : null}
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {str(pick(decisionChain, 'estimatedCycleLength', 'estimated_cycle_length'))
              ? `cycle estimé : ${str(pick(decisionChain, 'estimatedCycleLength', 'estimated_cycle_length'))}`
              : ''}
            {str(pick(decisionChain, 'budgetAuthority', 'budget_authority'))
              ? ` · autorité budget : ${str(pick(decisionChain, 'budgetAuthority', 'budget_authority'))}`
              : ''}
          </p>
          {asArray(decisionChain.steps).length > 0 ? (
            <ol style={{ margin: '6px 0 0', fontSize: 13 }}>
              {asArray(decisionChain.steps).map((s, i) => {
                const o = (s ?? {}) as Dict
                return (
                  <li key={i}>
                    {str(o.step)}
                    {asArray(o.actors).length ? (
                      <span style={{ color: 'var(--muted)' }}> — {asArray(o.actors).map(str).join(', ')}</span>
                    ) : null}
                    {str(o.duration) ? <span style={{ color: 'var(--muted)' }}> · {str(o.duration)}</span> : null}
                  </li>
                )
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
      {approachOrder.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Ordre d&apos;approche (séquence sandwich)
          </div>
          <ol style={{ margin: 0, fontSize: 13 }}>
            {approachOrder.map((s, i) => {
              const o = (s ?? {}) as Dict
              return (
                <li key={i}>
                  <strong>{str(o.contact) || str(pick(o, 'why_first', 'whyFirst'))}</strong>
                  {str(o.role) ? <span style={{ color: 'var(--muted)' }}> · {str(o.role)}</span> : null}
                  {str(pick(o, 'why_first', 'whyFirst')) ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {str(pick(o, 'why_first', 'whyFirst'))}
                      {str(o.unlocks) ? ` → débloque : ${str(o.unlocks)}` : ''}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}
      {stakeholderMap.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Carte des parties prenantes</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {stakeholderMap.map((s, i) => {
              const o = (s ?? {}) as Dict
              const stance = str(o.stance)
              return (
                <div key={i} style={{ fontSize: 13 }}>
                  <span
                    className={`badge ${stance === 'advocate' ? 'PUBLIC' : stance === 'opponent' ? 'error' : 'HYPOTHESE'}`}
                  >
                    {stance || 'unknown'}
                  </span>{' '}
                  {str(pick(o, 'fullName', 'full_name'))}
                  {str(o.reasoning) ? <span style={{ color: 'var(--muted)' }}> — {str(o.reasoning)}</span> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {uncoveredZones.length > 0 ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Zones blanches ({uncoveredZones.length}) — où vous n&apos;avez personne
          </div>
          <ul style={{ margin: 0, fontSize: 13 }}>
            {uncoveredZones.map((z, i) => {
              const o = (z ?? {}) as Dict
              return (
                <li key={i}>
                  {str(o.zone)}
                  {str(o.importance) ? <span style={{ color: 'var(--muted)' }}> · {str(o.importance)}</span> : null}
                  {str(pick(o, 'suggestedTitle', 'suggested_title')) ? (
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      → chercher : {str(pick(o, 'suggestedTitle', 'suggested_title'))}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </Section>
  )
}

/** Les livrables d'aide à la vente produits par BELLUM-STRATEGY. */
export function AnalysisSalesEnablement({ raw }: { raw: Dict }) {
  // Sales-enablement deliverables — produced by BELLUM-STRATEGY, never surfaced.
  const rdvScript = (pick(raw, 'rdv_script', 'rdvScript') ?? {}) as Dict
  const powerQuestions = asArray(pick(raw, 'power_questions', 'powerQuestions'))
  const objections = asArray(pick(raw, 'objections'))
  const commentOuvrirCompte = str(pick(raw, 'comment_ouvrir_compte', 'commentOuvrirCompte'))

  if (
    !commentOuvrirCompte &&
    powerQuestions.length === 0 &&
    objections.length === 0 &&
    !Object.values(rdvScript).some(Boolean)
  ) {
    return null
  }

  return (
    <Section title="Sales enablement — deliverables BELLUM-STRATEGY">
      {commentOuvrirCompte ? (
        <p style={{ fontSize: 13, margin: '0 0 10px' }}>
          <strong>Comment ouvrir le compte : </strong>
          {commentOuvrirCompte}
        </p>
      ) : null}
      {Object.values(rdvScript).some(Boolean) ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Script RDV</div>
          {(
            [
              ['opening', 'Ouverture'],
              ['positioning', 'Positionnement'],
              ['exploration', 'Exploration'],
              ['proposal', 'Proposition'],
              ['closing', 'Closing'],
            ] as const
          )
            .filter(([k]) => str(rdvScript[k]))
            .map(([k, label]) => (
              <p key={k} style={{ fontSize: 13, margin: '2px 0' }}>
                <span style={{ color: 'var(--muted)' }}>{label} : </span>
                {str(rdvScript[k])}
              </p>
            ))}
          {asArray(pick(rdvScript, 'story_frames', 'storyFrames')).length > 0 ? (
            <p style={{ fontSize: 13, margin: '2px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Story-frames (rapport) : </span>
              {asArray(pick(rdvScript, 'story_frames', 'storyFrames'))
                .map(str)
                .join(' · ')}
            </p>
          ) : null}
          {asArray(rdvScript.bridges).length > 0 ? (
            <p style={{ fontSize: 13, margin: '2px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Transitions : </span>
              {asArray(rdvScript.bridges).map(str).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
      {powerQuestions.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Power questions ({powerQuestions.length})
          </div>
          <ul style={{ margin: 0, fontSize: 13 }}>
            {powerQuestions.map((q, i) => (
              <li key={i}>{str(q)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {objections.length > 0 ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Objections ({objections.length})</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {objections.map((o, i) => {
              const ob = (o ?? {}) as Dict
              return (
                <div key={i} className="card" style={{ padding: 10, fontSize: 13 }}>
                  <strong>{str(ob.objection)}</strong>
                  {str(pick(ob, 'real_concern', 'realConcern')) ? (
                    <div style={{ color: 'var(--muted)' }}>
                      vrai enjeu : {str(pick(ob, 'real_concern', 'realConcern'))}
                    </div>
                  ) : null}
                  {str(ob.response) ? <div>→ {str(ob.response)}</div> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </Section>
  )
}
