import { LiveRefresh } from '../LiveRefresh'
import { confidenceAxisBadge } from './confidence-axis.logic'
import {
  type AnalysisDetail,
  type Dict,
  Section,
  asArray,
  pick,
  planOf,
  readSubsidiaries,
  str,
} from './analysis-shared'

/**
 * L'ENTÊTE du dossier — ce qu'on lit avant de décider de lire le reste : le
 * verdict, la confiance, l'identité légale, l'échec s'il y en a eu, et les
 * quatre chiffres de tête.
 *
 * ⚠️ POURQUOI LE GROUNDING EST DANS CE FICHIER ET PAS DANS `AnalysisSources`
 * Le paragraphe de tête du grounding REND LA MÊME LECTURE DE CONFIANCE que
 * l'entête (`confiance {confidenceScore}/100`), plafonnée par le verdict
 * qualité. Les deux lisent `readConfidence` ci-dessous, et les garder dans le
 * même fichier garde cette dérivation à portée de vue.
 *
 * Il y a une seconde raison, et elle est mécanique : la garde GA-18
 * (`apps/web/src/architecture/display-primitives.test.ts`) compte les FICHIERS
 * qui affichent une note sans ses axes, et elle est au gel à 7. Six fichiers
 * y répondent aujourd'hui, dont `analysis/[id]/page.tsx`. Un découpage pur
 * n'ajoute aucune note à l'écran, mais il MULTIPLIE les fichiers : disperser
 * ces rendus dans trois fichiers ferait monter le compte à 8 et rendrait la CI
 * rouge pour un déplacement qui ne change rien. Ils tiennent donc en DEUX
 * fichiers — celui-ci et `AnalysisContacts.tsx` — et le compte reste à 7.
 */

// Company Resolver banner headline by identity status (retour Thales).
const IDENTITY_BANNER: Record<string, string> = {
  homonyme: '⚠ Homonyme détecté — identité légale incertaine',
  no_registry: '⚠ Aucune donnée registre — dossier mode groupe web',
  uncertain: '⚠ Identité légale incertaine',
}

// « 100/100 impossible si qualité a_corriger » (retour Thales) : le nombre de
// confiance affiché est plafonné par le verdict qualité (a_corriger → 75,
// hallucination / trop_faible → 40). Le web doit appliquer la même règle.
const QUALITY_CONF_CAP: Record<string, number> = { a_corriger: 75, hallucination: 40, trop_faible: 40 }

function readConfidence(raw: Dict): {
  confidence: Dict | undefined
  confidenceScore: number | null
  confidenceCapped: boolean
} {
  const quality = (pick(planOf(raw) ?? {}, 'quality') ?? {}) as Dict
  const qualityVerdict = str(quality.verdict)
  const confidence = pick(raw, 'confidence') as Dict | undefined
  // #4595.3 — un score absent n'est pas une confiance de 0 : pas de score, pas de confiance.
  const rawScore = confidence ? pick(confidence, 'score') : null
  const rawConfidence = rawScore == null ? null : Number(rawScore)
  const confidenceScore =
    rawConfidence != null ? Math.min(rawConfidence, QUALITY_CONF_CAP[qualityVerdict] ?? 100) : null
  const confidenceCapped = rawConfidence != null && confidenceScore != null && confidenceScore < rawConfidence
  return { confidence, confidenceScore, confidenceCapped }
}

// Company Resolver verdict (retour Thales) : homonyme / incertain / no_registry
// → dossier en « mode groupe web », identité légale à ne pas afficher comme sûre.
function readIdentity(raw: Dict): { identity: Dict | undefined; identityStatus: string; identityUncertain: boolean } {
  const identity = pick(raw, 'identity') as Dict | undefined
  const identityStatus = identity ? str(identity.status) : ''
  return {
    identity,
    identityStatus,
    identityUncertain: ['homonyme', 'uncertain', 'no_registry'].includes(identityStatus),
  }
}

/** Le contenu de la phrase d'écran : statut, coût, priorité, confiance, verdict, qualité, groupe, SIREN. */
export function AnalysisStatusBadges({ detail }: { detail: AnalysisDetail }) {
  const raw = (detail.rawAnalysis ?? {}) as Dict
  const { confidence, confidenceScore, confidenceCapped } = readConfidence(raw)
  const { identityUncertain } = readIdentity(raw)
  const plan = planOf(raw)
  // GO / PRUDENT / STOP verdict + /25 score from the Phase-4 plan evaluation
  // (V1-vendable §3.1). Falls back to the legacy goNoGo/globalScore for old runs.
  const planEval = (pick(plan ?? {}, 'evaluation') ?? {}) as Dict
  const verdict = str(pick(planEval, 'verdict')) || str(pick(planEval, 'goNoGo', 'go_no_go'))
  const score25 = pick(planEval, 'score')
  const globalScore = pick(planEval, 'globalScore', 'global_score')
  // Quality Judge (V1-vendable §9.8) — deterministic last gate over the dossier.
  const quality = (pick(plan ?? {}, 'quality') ?? {}) as Dict
  const qualityVerdict = str(quality.verdict)
  const qualityIssues = asArray(quality.issues)
  const groupRelationship = (pick(plan ?? {}, 'groupRelationship', 'group_relationship') ?? {}) as Dict
  const qualityClass =
    qualityVerdict === 'ok'
      ? 'PUBLIC'
      : qualityVerdict === 'hallucination' || qualityVerdict === 'trop_faible'
        ? 'error'
        : 'P2'
  const verdictClass = verdict.toUpperCase().startsWith('GO')
    ? 'PUBLIC'
    : verdict.toUpperCase().includes('STOP') || verdict.toUpperCase().includes('NO')
      ? 'error'
      : 'P2'

  return (
    <>
      <span className={`badge ${detail.status}`}>{detail.status}</span>
      {detail.costUsd != null ? <> · coût ${detail.costUsd.toFixed(4)}</> : null}
      {detail.priorityScore != null ? <> · priorité {detail.priorityScore}/10</> : null}
      {confidence ? (
        <>
          {' '}
          · confiance {confidenceScore}/100 ({str(confidence.tier)})
          {confidenceCapped ? <span className="badge P2"> plafonné qualité</span> : null}
          {identityUncertain ? <span className="badge STOP"> identité incertaine</span> : null}
        </>
      ) : null}
      {verdict ? (
        <>
          {' · '}
          <span className={`badge ${verdictClass}`}>
            {verdict}
            {score25 != null ? ` ${str(score25)}/25` : globalScore != null ? ` ${str(globalScore)}/10` : ''}
          </span>
        </>
      ) : null}
      {qualityVerdict ? (
        <>
          {' · '}
          <span className={`badge ${qualityClass}`} title={qualityIssues.map(i => str((i as Dict).detail)).join(' · ')}>
            qualité: {qualityVerdict}
            {qualityIssues.length > 0 ? ` (${qualityIssues.length})` : ''}
          </span>
        </>
      ) : null}
      {groupRelationship.isInsider ? (
        <>
          {' · '}
          <span className="badge PUBLIC" title={str(groupRelationship.note)}>
            complément (groupe {str(groupRelationship.group)})
          </span>
        </>
      ) : null}
      {str(pick(raw, 'siren')) ? <> · SIREN {str(pick(raw, 'siren'))}</> : null}
    </>
  )
}

/** Identité incertaine, fiabilité, justification du score, suivi live, échec, et les quatre chiffres de tête. */
export function AnalysisHeader({ detail }: { detail: AnalysisDetail }) {
  const raw = (detail.rawAnalysis ?? {}) as Dict
  const { confidence, confidenceScore, confidenceCapped } = readConfidence(raw)
  const { identity, identityStatus, identityUncertain } = readIdentity(raw)
  const confidenceAxes = (confidence ? pick(confidence, 'axes') : undefined) as Dict | undefined
  // Priority explainer — why the score is what it is (was only in raw JSON).
  const priorityJustification = str(pick(raw, 'priority_justification', 'priorityJustification'))
  const scoreFactors = (pick(raw, 'adjusted_score_factors', 'adjustedScoreFactors') ?? {}) as Dict
  const planEval = (pick(planOf(raw) ?? {}, 'evaluation') ?? {}) as Dict
  const scoreBreakdown = asArray(pick(planEval, 'scoreBreakdown', 'score_breakdown'))
  const phaseTelemetry = Array.isArray(detail.phaseTelemetry) ? detail.phaseTelemetry : []
  // Where did it break? The phases present in the audit completed; the first
  // expected phase missing is where the run stopped.
  const PHASES = ['research', 'contacts', 'classify', 'plan']
  const completedPhases = phaseTelemetry.map(p => str((p as Dict).name)).filter(Boolean)
  const failedPhase = PHASES.find(p => !completedPhases.includes(p))
  const { subsidiaries } = readSubsidiaries(raw)

  return (
    <>
      {identityUncertain ? (
        <div className="card" style={{ borderColor: 'var(--stop)', padding: 12, margin: '10px 0' }}>
          <strong style={{ color: 'var(--stop)' }}>
            {IDENTITY_BANNER[identityStatus] ?? '⚠ Identité légale incertaine'}
          </strong>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Mode <span className="badge STOP">groupe web</span> — les données registre (SIREN, effectif, secteur
            officiel) ne sont PAS utilisées dans l'en-tête ni le scoring.
            {str(pick(identity ?? {}, 'identityRejectedSiren'))
              ? ` SIREN écarté : ${str(pick(identity ?? {}, 'identityRejectedSiren'))}.`
              : ''}
          </div>
          {asArray(identity?.reasons).length > 0 ? (
            <ul style={{ fontSize: 12, margin: '6px 0 0', paddingLeft: 18 }}>
              {asArray(identity?.reasons).map((r, i) => (
                <li key={i}>{str(r)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Grille « Fiabilité du dossier » (apps/ia/app/services/confidence.py) — elle
          note la COLLECTE de cette analyse. À ne pas confondre avec la « Confiance
          donnée » p29 (coverage.service.ts), qui note les contacts du compte. */}
      {confidenceAxes ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 0' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Fiabilité du dossier —</span>
          {(
            [
              ['technique', 'Technique'],
              ['identite', 'Identité'],
              ['sources', 'Sources'],
              ['commerciale', 'Commerciale'],
            ] as const
          ).map(([k, label]) => {
            // #4595.3 — axe absent = « non évalué », jamais 0/100.
            const { text, tone } = confidenceAxisBadge(pick(confidenceAxes, k))
            return (
              <span key={k} className={tone ? `badge ${tone}` : 'badge'} style={{ fontSize: 12 }}>
                {label} {text}
              </span>
            )
          })}
        </div>
      ) : null}
      {priorityJustification || Object.keys(scoreFactors).length > 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
          {priorityJustification ? <span>{priorityJustification} </span> : null}
          {Object.keys(scoreFactors).length > 0 ? (
            <span>
              ·{' '}
              {(
                [
                  ['offer_fit_raw', 'fit offre'],
                  ['accessibility_raw', 'accès'],
                  ['urgency_raw', 'urgence'],
                  ['cycle_fit_raw', 'cycle'],
                ] as const
              )
                .filter(([k]) => scoreFactors[k] != null)
                .map(([k, label]) => `${label} ${str(scoreFactors[k])}`)
                .join(' · ')}
            </span>
          ) : null}
        </p>
      ) : null}

      {scoreBreakdown.length > 0 ? (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <span style={{ color: 'var(--muted)' }}>Score /25 — pourquoi : </span>
          {scoreBreakdown.map((a, i) => {
            const o = (a ?? {}) as Dict
            const label = str(o.label) || str(o.axis)
            const pts = str(o.points)
            const max = str(o.max)
            return (
              <span key={i} style={{ marginRight: 10 }} title={str(o.note)}>
                {label} <b>{pts}</b>
                {max ? `/${max}` : ''}
              </span>
            )
          })}
        </div>
      ) : null}

      <LiveRefresh status={detail.status} />

      {detail.status === 'error' ? (
        <div className="error" style={{ marginTop: 14 }}>
          <strong>Échec de l&apos;analyse</strong>
          {failedPhase ? (
            <>
              {' '}
              — arrêt en phase <code>{failedPhase}</code>
            </>
          ) : null}
          <div style={{ marginTop: 6 }}>{detail.errorMessage || 'Raison non enregistrée par le worker.'}</div>
          {completedPhases.length > 0 ? (
            <div style={{ fontSize: 12, marginTop: 8, color: 'var(--muted)' }}>
              Phases terminées : {completedPhases.join(' · ')}
              {failedPhase ? ` · échec à : ${failedPhase}` : ''}
            </div>
          ) : (
            <div style={{ fontSize: 12, marginTop: 8, color: 'var(--muted)' }}>
              Aucune phase terminée — échec dès le départ (Phase 1 research).
            </div>
          )}
        </div>
      ) : null}

      <section className="kpi-grid">
        <div className="card">
          <div className="label">Secteur</div>
          <div className="value" style={{ fontSize: 15 }}>
            {str(pick(raw, 'sector')) || '—'}
          </div>
        </div>
        <div className="card">
          <div className="label">Effectif</div>
          <div className="value" style={{ fontSize: 15 }}>
            {str(pick(raw, 'employees')) || '—'}
          </div>
        </div>
        <div className="card">
          <div className="label">Confiance globale</div>
          <div className="value" style={{ fontSize: 15 }}>
            {confidence ? `${confidenceScore}/100 (${str(confidence.tier)})` : '—'}
            {confidenceCapped ? (
              <span className="badge P2" style={{ marginLeft: 6 }}>
                plafonné qualité
              </span>
            ) : null}
          </div>
          {confidenceAxes ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              tech {str(pick(confidenceAxes, 'technique'))} · id {str(pick(confidenceAxes, 'identite'))} · src{' '}
              {str(pick(confidenceAxes, 'sources'))} · com {str(pick(confidenceAxes, 'commerciale'))}
            </div>
          ) : null}
        </div>
        <div className="card">
          <div className="label">Filiales</div>
          <div className="value" style={{ fontSize: 15 }}>
            {subsidiaries.length}
          </div>
        </div>
      </section>
    </>
  )
}

/** Provenance & fiabilité : couverture, preuves sourcées, citations natives, sources consultées. */
export function AnalysisGrounding({ detail }: { detail: AnalysisDetail }) {
  const raw = (detail.rawAnalysis ?? {}) as Dict
  const { confidence, confidenceScore } = readConfidence(raw)
  const sources = pick(raw, 'sources') as Dict | undefined
  const evidence = (sources?.evidence ?? {}) as Dict
  const evidenceEntries = Object.entries(evidence)
  const factTags = (sources?.tags ?? {}) as Dict
  const registry = asArray(sources?.registry)
  const coverage = (sources?.coverage ?? {}) as Dict
  // Native Anthropic Citations — verbatim cited_text proving the key facts.
  const factCitations = asArray(sources?.citations)

  if (evidenceEntries.length === 0 && registry.length === 0 && factCitations.length === 0) return null

  return (
    <Section title="Grounding — provenance & fiabilité (fait / hypothèse)">
      {Object.keys(coverage).length > 0 ? (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
          {Object.entries(coverage)
            .map(([k, v]) => `${k.replace(/_/g, ' ')} : ${str(v)}`)
            .join(' · ')}
          {confidence ? ` · confiance ${confidenceScore}/100 (${str(confidence.tier)})` : ''}
        </p>
      ) : null}
      {evidenceEntries.length > 0 ? (
        <table>
          <tbody>
            {evidenceEntries.map(([field, ev], i) => {
              const e = (ev ?? {}) as Dict
              const tag = str(factTags[field])
              return (
                <tr key={i}>
                  <td className="mono" style={{ width: 170, verticalAlign: 'top' }}>
                    {field}
                  </td>
                  <td style={{ width: 110, verticalAlign: 'top' }}>
                    {tag ? <span className={`badge ${tag === 'PUBLIC' ? 'PUBLIC' : 'HYPOTHESE'}`}>{tag}</span> : null}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {str(e.extract)}
                    {str(e.date) ? <span> · {str(e.date)}</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}
      {factCitations.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            <span className="badge PUBLIC">📌 Citations natives</span>{' '}
            <span style={{ color: 'var(--muted)' }}>
              extraits sources vérifiés par Claude (inhallucinables) — {factCitations.length}
            </span>
          </p>
          <ul style={{ marginTop: 4 }}>
            {factCitations.map((c, i) => {
              const o = (c ?? {}) as Dict
              return (
                <li key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--fg)' }}>« {str(o.cited_text)} »</span>{' '}
                  {str(o.document_title) ? (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>— {str(o.document_title)}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {registry.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Sources consultées ({registry.length})</summary>
          <ul style={{ marginTop: 6 }}>
            {registry.map((r, i) => {
              const o = (r ?? {}) as Dict
              return (
                <li key={i}>
                  <span style={{ color: 'var(--muted)' }}>{str(o.provider)}</span> —{' '}
                  {o.url ? (
                    <a href={str(o.url)} target="_blank" rel="noreferrer">
                      {str(o.title) || str(o.ref)}
                    </a>
                  ) : (
                    str(o.title) || str(o.ref)
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
    </Section>
  )
}
