'use client'

import { useState } from 'react'

// "Lancer une analyse" sub-view of the "Analyses" umbrella (was the standalone
// /run page). Body moved verbatim — the two-mode launch form (real → worker →
// visible in monitoring · direct → inline IA phases), the targeting-context
// presets and the ESN-profile picker. Same /api/launch + /api/analyze calls.

type Dict = Record<string, unknown>
type PhaseResult = { name: string; status: number; ms: number; ok: boolean; data?: unknown }
type RunResult = { ok: boolean; phases: PhaseResult[]; ms?: number; error?: string }
type LaunchResult = { ok: boolean; accountId?: string; jobId?: string; fresh?: boolean; error?: string }

type Mode = 'real' | 'direct'

const SCOPES = [
  { upTo: 1, label: 'Phase 1 — recherche' },
  { upTo: 2, label: 'Jusqu’à Phase 2 — contacts' },
  { upTo: 3, label: 'Jusqu’à Phase 3 — classement' },
  { upTo: 4, label: 'Pipeline complet 1→4' },
]

// ── Input contract — the analysisContextSchema presets, mirrored for the UI ────
//
// Choosing a preset + filling its fields builds an AnalysisContext object sent
// as `userContext`; the API renders it for storage and forwards the typed shape
// to the IA so the prompts target the dossier (e.g. "déjà parlé à ce compte →
// adapte l'approche"). `free` is the write-your-own escape hatch.
type Field = {
  key: string
  label: string
  kind?: 'text' | 'area' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
}
type Preset = { value: string; label: string; hint: string; fields: Field[] }

const PRESETS: Preset[] = [
  { value: 'none', label: 'Aucun contexte', hint: 'Analyse à froid, sans ciblage particulier.', fields: [] },
  {
    value: 'free',
    label: 'Texte libre',
    hint: 'Décris le contexte dans tes mots — l’IA l’intègre tel quel.',
    fields: [
      {
        key: 'notes',
        label: 'Contexte',
        kind: 'area',
        placeholder: 'Ex : déjà parlé à la DSI en mars, ils cherchent un partenaire data…',
      },
    ],
  },
  {
    value: 'push-offer',
    label: 'Pousser une offre',
    hint: 'Tu as une offre précise à placer chez ce compte.',
    fields: [
      { key: 'offer', label: 'Offre' },
      { key: 'pricing', label: 'Tarif / TJM' },
      { key: 'differentiation', label: 'Différenciation' },
      { key: 'idealMission', label: 'Mission idéale' },
    ],
  },
  {
    value: 'known-account',
    label: 'Compte déjà connu',
    hint: 'Relation existante — l’IA adapte le ton et l’angle d’approche.',
    fields: [
      {
        key: 'commercialStatus',
        label: 'Statut commercial',
        kind: 'select',
        options: [
          { value: 'active', label: 'Client actif' },
          { value: 'former', label: 'Ancien client' },
          { value: 'engaged-prospect', label: 'Prospect engagé' },
        ],
      },
      { key: 'lastInteraction', label: 'Dernière interaction' },
      { key: 'openOpportunity', label: 'Opportunité ouverte' },
      { key: 'revenueOrPipeline', label: 'CA / pipeline' },
    ],
  },
  {
    value: 'incumbent',
    label: 'Concurrent en place',
    hint: 'Un prestataire occupe déjà le terrain — angle de délogement.',
    fields: [
      { key: 'incumbentName', label: 'Concurrent' },
      { key: 'incumbentScope', label: 'Périmètre occupé' },
      { key: 'contractEndDate', label: 'Fin de contrat' },
      { key: 'weakness', label: 'Faiblesse à exploiter' },
    ],
  },
  {
    value: 'signal',
    label: 'Signal détecté',
    hint: 'Un événement déclencheur (recrutement, levée, nomination…).',
    fields: [
      {
        key: 'signalType',
        label: 'Type de signal',
        kind: 'select',
        options: [
          { value: 'recruitment', label: 'Recrutement' },
          { value: 'tender', label: 'Appel d’offres' },
          { value: 'fundraise', label: 'Levée de fonds' },
          { value: 'appointment', label: 'Nomination' },
          { value: 'merger-acquisition', label: 'Fusion / acquisition' },
          { value: 'other', label: 'Autre' },
        ],
      },
      { key: 'source', label: 'Source' },
      { key: 'signalDate', label: 'Date du signal' },
      { key: 'implication', label: 'Implication commerciale' },
    ],
  },
  {
    value: 'strategic',
    label: 'Compte stratégique',
    hint: 'Priorisé pour une raison stratégique précise.',
    fields: [
      { key: 'prioritizationReason', label: 'Raison de priorisation' },
      { key: 'targetDecisionMaker', label: 'Décideur visé' },
      { key: 'potentialVolume', label: 'Volume potentiel' },
      { key: 'closingHorizon', label: 'Horizon de closing' },
      { key: 'similarReference', label: 'Référence similaire' },
    ],
  },
  {
    value: 'retry',
    label: 'Nouvelle tentative',
    hint: 'Relance après une analyse précédente jugée incomplète.',
    fields: [
      { key: 'missingFromPrevious', label: 'Manquait la fois précédente' },
      { key: 'newAngle', label: 'Nouvel angle' },
      { key: 'hypothesis', label: 'Hypothèse à tester' },
    ],
  },
]

// ── Profil ESN (contrat profileData) ─────────────────────────────────────────
// Le profil de l'ESN elle-même (offres/secteurs/taille/no-go) conditionne TOUT le
// run : détection insider (l'ESN est-elle DANS le groupe cible ?), gate no-go
// (secteurs jamais adressés), fit-angle. Le MÊME compte donne un dossier différent
// selon le profil. `none` = run profile-neutre.
type EsnProfile = { value: string; label: string; profile?: Record<string, unknown> }
const ESN_PROFILES: EsnProfile[] = [
  { value: 'none', label: 'Aucun profil (neutre)' },
  {
    value: 'generaliste',
    label: 'ESN généraliste 80-200 (démo)',
    profile: {
      companyName: 'ESN Démo',
      size: '80-200',
      offers: ['DevOps', 'Transformation digitale', 'Data & IA', 'Cloud', 'Conduite du changement'],
      sectors: ['Banque', 'Assurance', 'Industrie', 'Énergie'],
      geoZone: 'France',
      avgTJM: '550',
      noGoSectors: ['Défense', 'Armement'],
    },
  },
]

/** Build the AnalysisContext payload from the picked preset + filled fields. */
function buildContext(preset: string, ctx: Record<string, string>): Record<string, unknown> | undefined {
  if (preset === 'none') return undefined
  const filled = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v.trim() !== ''))
  if (Object.keys(filled).length === 0) return undefined
  return { preset, ...filled }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

function phaseSummary(p: PhaseResult): string {
  const d = (p.data ?? {}) as Dict
  if (p.name === 'research') {
    const meaningful = Array.isArray(d.meaningfulSubsidiaries) ? d.meaningfulSubsidiaries.length : 0
    const conf = (d.confidence as Dict | undefined)?.score
    const tiers = (d.entityTierCounts ?? {}) as Dict
    return `SIREN ${String(d.siren ?? '—')} · ${meaningful} filiales · confiance ${conf ?? '—'} · zones ${num(tiers.P1)}/${num(tiers.P2)}/${num(tiers.P3)}`
  }
  if (p.name === 'contacts') return `${num((d as { count?: number }).count)} contacts`
  if (p.name === 'classify') {
    const c = Array.isArray((d as { contacts?: unknown[] }).contacts)
      ? (d as { contacts: unknown[] }).contacts.length
      : 0
    return `${c} contacts classés`
  }
  if (p.name === 'plan') return `plan généré (${Object.keys(d).length} sections)`
  return ''
}

export function LancerPanel() {
  const [company, setCompany] = useState('OVHcloud')
  const [mode, setMode] = useState<Mode>('real')
  const [upTo, setUpTo] = useState(4)
  const [preset, setPreset] = useState('none')
  const [esnProfile, setEsnProfile] = useState('none')
  const [ctx, setCtx] = useState<Record<string, string>>({})
  const [result, setResult] = useState<RunResult | null>(null)
  const [launch, setLaunch] = useState<LaunchResult | null>(null)
  const [loading, setLoading] = useState(false)

  const activePreset = PRESETS.find(p => p.value === preset) ?? PRESETS[0]
  const setField = (key: string, value: string) => setCtx(prev => ({ ...prev, [key]: value }))

  async function run() {
    setLoading(true)
    setResult(null)
    setLaunch(null)
    const userContext = buildContext(preset, ctx)
    const profileData = ESN_PROFILES.find(p => p.value === esnProfile)?.profile
    try {
      if (mode === 'real') {
        const res = await fetch('/api/launch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            company,
            fresh: true,
            ...(userContext ? { userContext } : {}),
            ...(profileData ? { profileData } : {}),
          }),
        })
        setLaunch((await res.json()) as LaunchResult)
      } else {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ company, upTo, ...(userContext ? { userContext } : {}) }),
        })
        setResult((await res.json()) as RunResult)
      }
    } catch (err) {
      if (mode === 'real') setLaunch({ ok: false, error: String(err) })
      else setResult({ ok: false, phases: [], error: String(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Lancer une analyse</h1>
      <p className="subtitle">
        Déclenche les vraies phases IA (Brave + Firecrawl + Pappers + Claude). Choisis le mode selon ce que tu veux
        voir.
      </p>

      <section style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${mode === 'real' ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
            background: 'var(--surface)',
            cursor: 'pointer',
          }}
        >
          <input type="radio" checked={mode === 'real'} onChange={() => setMode('real')} style={{ marginTop: 3 }} />
          <span>
            <strong>Réel → visible dans le Monitoring</strong>
            <br />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Passe par le worker (BullMQ → Postgres). L’analyse apparaît tout de suite dans le Monitoring en{' '}
              <span className="badge analyzing">analyzing</span>, puis{' '}
              <span className="badge completed">completed</span> avec la télémétrie par phase. Pipeline complet 1→4,
              cache ignoré (run frais).
            </span>
          </span>
        </label>
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${mode === 'direct' ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
            background: 'var(--surface)',
            cursor: 'pointer',
          }}
        >
          <input type="radio" checked={mode === 'direct'} onChange={() => setMode('direct')} style={{ marginTop: 3 }} />
          <span>
            <strong>Test direct — phases IA inline</strong>
            <br />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Appelle la FastAPI directement et affiche le résultat <em>ici</em>. Ne persiste pas, n’apparaît pas dans
              le Monitoring. Pratique pour inspecter une phase isolée.
            </span>
          </span>
        </label>
      </section>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 18,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Entreprise</span>
          <input value={company} onChange={e => setCompany(e.target.value)} />
        </label>
        {mode === 'real' ? (
          <label style={{ display: 'grid', gap: 4, minWidth: 220 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Profil ESN (insider · no-go · fit)</span>
            <select value={esnProfile} onChange={e => setEsnProfile(e.target.value)}>
              {ESN_PROFILES.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === 'direct' ? (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Portée</span>
            <select value={upTo} onChange={e => setUpTo(Number(e.target.value))}>
              {SCOPES.map(s => (
                <option key={s.upTo} value={s.upTo}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="btn" onClick={run} disabled={loading}>
          {loading ? 'En cours…' : mode === 'real' ? 'Lancer (réel)' : 'Lancer (test direct)'}
        </button>
      </section>

      {/* ── Contexte utilisateur (contrat d'input) ── */}
      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 18,
          marginTop: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        <div>
          <strong>Contexte de ciblage (optionnel)</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Choisis un profil preset ou écris un contexte libre. L’IA s’en sert pour cibler la recherche, les contacts
            et le plan d’action (ex : compte déjà connu → adapte l’approche).
          </p>
        </div>
        <label style={{ display: 'grid', gap: 4, maxWidth: 360 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Profil</span>
          <select
            value={preset}
            onChange={e => {
              setPreset(e.target.value)
              setCtx({})
            }}
          >
            {PRESETS.map(p => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {activePreset.value !== 'none' ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{activePreset.hint}</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
              }}
            >
              {activePreset.fields.map(f => (
                <label
                  key={f.key}
                  style={{ display: 'grid', gap: 4, gridColumn: f.kind === 'area' ? '1 / -1' : 'auto' }}
                >
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.label}</span>
                  {f.kind === 'area' ? (
                    <textarea
                      rows={3}
                      value={ctx[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setField(f.key, e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  ) : f.kind === 'select' ? (
                    <select value={ctx[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}>
                      <option value="">— choisir —</option>
                      {(f.options ?? []).map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={ctx[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setField(f.key, e.target.value)}
                    />
                  )}
                </label>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {loading ? (
        <p style={{ color: 'var(--muted)', marginTop: 14, fontSize: 13 }}>
          {mode === 'real'
            ? 'Création de l’analyse + mise en file du worker…'
            : 'Le pipeline tourne (web search, scraping, SIREN, prompts Claude)… ~3-4 min par phase.'}
        </p>
      ) : null}

      {/* ---- REAL launch result ---- */}
      {launch ? (
        launch.ok ? (
          <section className="card" style={{ marginTop: 18, padding: 16, display: 'grid', gap: 8 }}>
            <p style={{ margin: 0 }}>
              <span className="badge completed">Analyse lancée ✓</span> — elle tourne dans le worker et apparaît
              maintenant dans le Monitoring en <span className="badge analyzing">analyzing</span>.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              accountId <code>{launch.accountId}</code>
              {launch.jobId ? (
                <>
                  {' · '}job <code>{launch.jobId}</code>
                </>
              ) : null}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <a className="link" href={`/analysis/${launch.accountId}`}>
                → Ouvrir le détail
              </a>
              <a className="link" href="/">
                → Voir dans le Monitoring
              </a>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Le pipeline complet prend quelques minutes — rafraîchis le Monitoring pour suivre le passage en{' '}
              <span className="badge completed">completed</span>.
            </p>
          </section>
        ) : (
          <div className="error" style={{ marginTop: 16 }}>
            {launch.error}
            <br />
            <span style={{ fontSize: 12 }}>
              L’API NestJS doit tourner (<code>:3012</code>) avec <code>INTERNAL_API_SECRET</code> partagé.
            </span>
          </div>
        )
      ) : null}

      {/* ---- DIRECT (inline IA) result ---- */}
      {result ? (
        result.error && result.phases.length === 0 ? (
          <div className="error" style={{ marginTop: 16 }}>
            {result.error}
            <br />
            <span style={{ fontSize: 12 }}>
              Le service IA doit tourner (<code>:8000</code>) avec ses clés. <code>IA_BASE_URL</code> pour le cibler.
            </span>
          </div>
        ) : (
          <section style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            <p style={{ fontSize: 14 }}>
              <span className={`badge ${result.ok ? 'completed' : 'error'}`}>{result.ok ? 'OK' : 'ÉCHEC'}</span> ·{' '}
              {typeof result.ms === 'number' ? `${(result.ms / 1000).toFixed(1)}s total` : 'durée non mesurée'}
            </p>
            {result.phases.map((p, i) => (
              <div key={i} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>
                    <span className={`badge ${p.ok ? 'completed' : 'error'}`} style={{ marginRight: 8 }}>
                      {p.status}
                    </span>
                    Phase {i + 1} · {p.name}
                  </strong>
                  <span style={{ color: 'var(--muted)' }}>{(p.ms / 1000).toFixed(1)}s</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>{phaseSummary(p)}</p>
              </div>
            ))}
            <details>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Réponse brute</summary>
              <pre className="code" style={{ marginTop: 10 }}>
                {JSON.stringify(result.phases, null, 2)}
              </pre>
            </details>
          </section>
        )
      ) : null}
    </>
  )
}
