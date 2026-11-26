import type { ReactNode } from 'react'
import { type AnalysisDetail, type Dict, Section, asArray, pick, str } from './analysis-shared'

/**
 * QUI, ET DANS QUEL ORDRE — l'organigramme du groupe, celui des personnes, les
 * fiches de contact, et les personnes seulement mentionnées.
 *
 * ⚠️ Ce fichier porte l'exception NOMMÉE de la garde des e-mails
 * (`src/architecture/emails-masques-dans-les-listes.test.ts`) : les adresses des
 * contacts prospects y sont rendues en clair, avec leur `mailto:`. L'exception
 * a suivi le rendu quand il a déménagé de `analysis/[id]/page.tsx` — sa raison
 * est inchangée, et l'arbitrage reste posé dans #1670.
 */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

// Contact avatar — real photo (Apollo) if present, else an initials circle.
function Avatar({ photoUrl, name, size = 38 }: { photoUrl?: string | null; name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    border: '1px solid var(--border)',
  } as const
  if (photoUrl) {
    return <img src={photoUrl} alt={name} style={{ ...common, objectFit: 'cover' }} referrerPolicy="no-referrer" />
  }
  return (
    <span
      style={{
        ...common,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface)',
        color: 'var(--muted)',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {initials(name) || '—'}
    </span>
  )
}

// ── Group org chart ───────────────────────────────────────────────────────────
// Builds a parent→child tree from entitiesExhaustive (each item carries a
// `parent` name) so the manager can read the group structure at a glance and
// see where the IT entities (the ESN's prime targets) sit in the hierarchy.
type EntityNode = { name: string; type?: string; tier?: string; isIt: boolean; children: EntityNode[] }

function buildEntityTree(items: unknown[]): EntityNode[] {
  const nodes = new Map<string, EntityNode>()
  const parents = new Map<string, string>()
  const order: string[] = []
  for (const it of items) {
    const o = (it ?? {}) as Dict
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name || nodes.has(name)) continue
    nodes.set(name, {
      name,
      type: typeof o.type === 'string' ? o.type : undefined,
      // raw_analysis is deep snake_cased on persist — read snake first, camel fallback.
      tier: str(pick(o, 'priority_tier', 'priorityTier')) || undefined,
      isIt: pick(o, 'is_it_entity', 'isItEntity') === true,
      children: [],
    })
    parents.set(name, typeof o.parent === 'string' ? o.parent.trim() : '')
    order.push(name)
  }
  const roots: EntityNode[] = []
  for (const name of order) {
    const parent = parents.get(name) ?? ''
    if (parent && parent !== name && nodes.has(parent)) {
      nodes.get(parent)!.children.push(nodes.get(name)!)
    } else {
      roots.push(nodes.get(name)!)
    }
  }
  return roots
}

function OrgTree({ nodes }: { nodes: EntityNode[] }): ReactNode {
  if (nodes.length === 0) return null
  return (
    <ul style={{ margin: 0, listStyle: 'none', paddingLeft: 14, borderLeft: '1px solid var(--border)' }}>
      {nodes.map((n, i) => (
        <li key={i} style={{ margin: '4px 0' }}>
          <span style={{ fontWeight: n.isIt ? 600 : 400 }}>
            {n.isIt ? '🎯 ' : ''}
            {n.name}
          </span>
          {n.type ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {n.type}</span> : null}
          {n.tier ? (
            <span className={`badge ${n.tier}`} style={{ marginLeft: 6 }}>
              {n.tier}
            </span>
          ) : null}
          {n.children.length > 0 ? <OrgTree nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  )
}

// ── People org chart ──────────────────────────────────────────────────────────
// Apollo's basic search exposes no manager/reports edges, so we infer the deck's
// 5 org tiers from each contact's job title (mirrors the IA hierarchy_level
// classifier — telemetry doesn't carry the computed field, so we recompute here).
// Rendered per entity as nested levels so the manager reads who sits on top.
const HIERARCHY_TIERS: Array<{ label: string; re: RegExp }> = [
  {
    label: 'C-Level / COMEX',
    re: /\b(c[eftiomd]o|ciso|chief|p-?dg|dga?|directeur général|directrice générale|président|présidente|managing director|vp|vice[- ]?président|vice[- ]?president|comex|comité (exécutif|de direction)|directeur associé|directrice associée)\b/i,
  },
  { label: 'Direction', re: /\b(directeur|directrice|director|head of|dsi|rssi|daf|drh)\b/i },
  { label: 'Management', re: /\b(manager|responsable|chef de|team lead|lead|principal|superviseur)\b/i },
  { label: 'Expert / Senior', re: /\b(senior|expert|architecte|architect|staff|référent|sr\.?)\b/i },
]
const HIERARCHY_LABELS = [...HIERARCHY_TIERS.map(t => t.label), 'Opérationnel']
function seniorityTier(title: string | null | undefined): number {
  const t = title ?? ''
  for (let i = 0; i < HIERARCHY_TIERS.length; i++) if (HIERARCHY_TIERS[i]!.re.test(t)) return i
  return HIERARCHY_TIERS.length // Opérationnel (default)
}

type OrgPerson = { fullName: string; title: string | null; decisionRole: string | null; photoUrl: string | null }

function PeopleOrg({ members }: { members: OrgPerson[] }): ReactNode {
  const labels = HIERARCHY_LABELS
  const tiers = labels.map((_, rank) => members.filter(m => seniorityTier(m.title) === rank))
  const chip = (p: OrgPerson, i: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', flexWrap: 'wrap' }}>
      <Avatar photoUrl={p.photoUrl} name={p.fullName || ''} size={24} />
      <span>{p.fullName || '—'}</span>
      {p.title ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {p.title}</span> : null}
      {p.decisionRole ? <span className={`badge ${p.decisionRole}`}>{p.decisionRole}</span> : null}
    </div>
  )
  // Build nested levels bottom-up so each tier sits under the one above it.
  let inner: ReactNode = null
  for (let rank = labels.length - 1; rank >= 0; rank--) {
    const people = tiers[rank]!
    if (people.length === 0 && inner === null) continue
    inner = (
      <ul style={{ margin: 0, listStyle: 'none', paddingLeft: 14, borderLeft: '1px solid var(--border)' }}>
        <li style={{ margin: '4px 0' }}>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
            {labels[rank]} ({people.length})
          </div>
          {people.map(chip)}
          {inner}
        </li>
      </ul>
    )
  }
  return inner
}

// S5 contact qualification status → French label + badge tone (retour Thales :
// 8 statuts lisibles). Mirrors CONTACT_QUALIF_LABELS in @bellum/contracts.
const QUALIF_LABELS: Record<string, string> = {
  priorite_immediate: 'À contacter maintenant',
  a_enrichir: 'À enrichir',
  a_verifier: 'À vérifier',
  autre_angle: 'Autre angle',
  achats: 'Achats',
  sponsor: 'Sponsor',
  bruit: 'Bruit',
  entite_inconnue: 'Entité inconnue',
  hors_scope: 'Hors périmètre',
  faux_positif: 'Faux positif',
}
const QUALIF_TONE: Record<string, string> = {
  priorite_immediate: 'GO',
  a_enrichir: 'PRUDENT',
  a_verifier: 'PRUDENT',
  autre_angle: 'PRUDENT',
  achats: 'INTERNE',
  sponsor: 'INTERNE',
  bruit: 'STOP',
  entite_inconnue: 'HYPOTHESE',
  hors_scope: 'STOP',
  faux_positif: 'STOP',
}

export function AnalysisOrgAndContacts({ detail }: { detail: AnalysisDetail }) {
  const raw = (detail.rawAnalysis ?? {}) as Dict
  const entities = asArray(pick(raw, 'entities_exhaustive', 'entitiesExhaustive'))
  const entityTree = buildEntityTree(entities)
  const organigrammeLogic = str(pick(raw, 'organigramme_logic', 'organigrammeLogic'))
  const topContacts = Array.isArray(detail.topContacts) ? detail.topContacts : []
  const hasItDecisionMaker = topContacts.some(c => (c.decisionRole ?? '').toUpperCase() === 'TECHNICAL')

  // Org-chart grouping: contacts bucketed by entity, best (lowest) priority first.
  const contactGroups = (() => {
    const groups = new Map<string, typeof topContacts>()
    for (const c of topContacts) {
      const key = c.entity?.trim() || 'Entité non précisée'
      const arr = groups.get(key) ?? []
      arr.push(c)
      groups.set(key, arr)
    }
    const minPrio = (arr: typeof topContacts) => Math.min(...arr.map(c => (c.priority == null ? 99 : c.priority)))
    return [...groups.entries()].sort((a, b) => minPrio(a[1]) - minPrio(b[1]))
  })()

  return (
    <>
      {entityTree.length > 0 ? (
        <Section title={`Organigramme du groupe (${entities.length} entités)`}>
          {organigrammeLogic ? (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>{organigrammeLogic}</p>
          ) : null}
          <OrgTree nodes={entityTree} />
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            🎯 = entité IT/digitale (cible n°1 ESN) · P1 attaque immédiate · P2 second temps · P3 longue traîne
          </p>
        </Section>
      ) : null}

      {topContacts.length > 0 ? (
        <Section title={`Organigramme des contacts (${topContacts.length})`}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
            Hiérarchie inférée des intitulés de poste (Apollo ne fournit pas les liens managériaux) — Direction →
            Management → Opérationnel, par entité.
          </p>
          <div style={{ display: 'grid', gap: 16 }}>
            {contactGroups.map(([entity, members], gi) => (
              <div key={gi}>
                <h4 style={{ margin: '0 0 6px', fontSize: 13, borderLeft: '3px solid var(--border)', paddingLeft: 8 }}>
                  {entity} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {members.length}</span>
                </h4>
                <PeopleOrg members={members} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={`Contacts${topContacts.length ? ` (${topContacts.length})` : ''} — par entité`}>
        {topContacts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun contact extrait pour cette analyse.</p>
        ) : (
          <>
            <p style={{ fontSize: 12, margin: '0 0 12px' }}>
              <span
                style={{
                  color: hasItDecisionMaker ? 'var(--accent)' : 'var(--danger)',
                  fontWeight: 600,
                }}
              >
                {hasItDecisionMaker ? '✓ décideur IT présent' : '✗ aucun décideur IT (TECHNICAL)'}
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {' '}
                · {contactGroups.length} entité(s) · regroupés pour l’organigramme, triés par priorité
              </span>
            </p>
            <div style={{ display: 'grid', gap: 18 }}>
              {contactGroups.map(([entity, members], gi) => (
                <div key={gi}>
                  <h4
                    style={{ margin: '0 0 8px', fontSize: 14, borderLeft: '3px solid var(--border)', paddingLeft: 8 }}
                  >
                    {entity} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {members.length}</span>
                  </h4>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {members.map((c, i) => (
                      <div
                        key={i}
                        className="card"
                        style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar photoUrl={c.photoUrl} name={c.fullName || ''} />
                            <div>
                              <strong>{c.fullName || '—'}</strong>
                              {c.title ? <span style={{ color: 'var(--muted)' }}> · {c.title}</span> : null}
                              {c.city || c.country ? (
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                  {[c.city, c.country].filter(Boolean).join(', ')}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div style={{ whiteSpace: 'nowrap' }}>
                            {c.family ? (
                              <span className="badge" style={{ marginRight: 4 }}>
                                {c.family}
                              </span>
                            ) : null}
                            {c.decisionRole ? (
                              <span className={`badge ${c.decisionRole}`}>{c.decisionRole}</span>
                            ) : null}{' '}
                            {c.qualifStatus ? (
                              <span className={`badge ${QUALIF_TONE[c.qualifStatus] ?? ''}`} style={{ marginRight: 4 }}>
                                {QUALIF_LABELS[c.qualifStatus] ?? c.qualifStatus}
                              </span>
                            ) : null}
                            {c.sourceTag ? (
                              <span
                                className={`badge ${c.sourceTag === 'PUBLIC' ? 'PUBLIC' : c.sourceTag === 'INTERNE' ? 'INTERNE' : c.sourceTag === 'RISQUE' ? 'RISQUE' : 'HYPOTHESE'}`}
                              >
                                {c.sourceTag}
                              </span>
                            ) : null}
                            {c.priority != null ? (
                              <span style={{ color: 'var(--muted)' }}> · P{c.priority}</span>
                            ) : null}
                            {typeof c.contactScore === 'number' ? (
                              <span style={{ color: 'var(--accent)', marginLeft: 6 }}> · {c.contactScore}/100</span>
                            ) : null}
                          </div>
                          {c.priorityReason ? (
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.priorityReason}</div>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12 }}>
                          {c.email ? (
                            <a href={`mailto:${c.email}`} style={{ color: 'var(--fg)' }}>
                              ✉ {c.email}
                              {c.emailVerified ? ' ✓' : ''}
                            </a>
                          ) : null}
                          {c.phone ? <span>☎ {c.phone}</span> : null}
                          {c.linkedinUrl ? (
                            <a href={c.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--muted)' }}>
                              LinkedIn ↗
                            </a>
                          ) : null}
                          {c.userStatus && c.userStatus !== 'new' ? (
                            <span style={{ color: 'var(--muted)' }}>statut : {c.userStatus}</span>
                          ) : null}
                        </div>
                        {c.apolloDetails ? (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 8,
                              marginTop: 8,
                              fontSize: 12,
                              color: 'var(--muted)',
                            }}
                          >
                            {c.apolloDetails.seniority ? (
                              <span className="badge">séniorité : {c.apolloDetails.seniority}</span>
                            ) : null}
                            {c.apolloDetails.departments?.length ? (
                              <span>dépt : {c.apolloDetails.departments.join(', ')}</span>
                            ) : null}
                            {c.apolloDetails.functions?.length ? (
                              <span>fonctions : {c.apolloDetails.functions.join(', ')}</span>
                            ) : null}
                            {c.apolloDetails.organization ? <span>org : {c.apolloDetails.organization}</span> : null}
                          </div>
                        ) : null}
                        {c.apolloDetails?.headline ? (
                          <p style={{ margin: '4px 0 0', fontSize: 12, fontStyle: 'italic', color: 'var(--muted)' }}>
                            {c.apolloDetails.headline}
                          </p>
                        ) : null}
                        {c.apolloDetails?.employmentHistory?.length ? (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>
                              Parcours ({c.apolloDetails.employmentHistory.length})
                            </summary>
                            <ul style={{ margin: '6px 0 0', fontSize: 12 }}>
                              {c.apolloDetails.employmentHistory.map((e, j) => (
                                <li key={j}>
                                  {e.title || '—'}
                                  {e.organization ? ` · ${e.organization}` : ''}
                                  {e.current ? ' (actuel)' : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        {c.profileSummary ? (
                          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>{c.profileSummary}</p>
                        ) : null}
                        {c.whyContact ? <p style={{ margin: '6px 0 0', fontSize: 13 }}>{c.whyContact}</p> : null}
                        {(c.careerLevers?.length ?? 0) > 0 || (c.implicitFears?.length ?? 0) > 0 ? (
                          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
                            {(c.careerLevers?.length ?? 0) > 0 ? (
                              <div>
                                <span style={{ color: 'var(--accent)' }}>↗ leviers : </span>
                                <span style={{ color: 'var(--muted)' }}>{c.careerLevers!.join(' · ')}</span>
                              </div>
                            ) : null}
                            {(c.implicitFears?.length ?? 0) > 0 ? (
                              <div>
                                <span style={{ color: 'var(--danger)' }}>⚠ peurs : </span>
                                <span style={{ color: 'var(--muted)' }}>{c.implicitFears!.join(' · ')}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {c.message ? (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>
                              Message prêt à envoyer
                            </summary>
                            <p style={{ margin: '6px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.message}</p>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </>
  )
}

/** Les personnes repérées dans les sources mais non converties en contacts. */
export function AnalysisPeopleMentioned({ raw }: { raw: Dict }) {
  const peopleMentioned = asArray(pick(raw, 'people_mentioned', 'peopleMentioned'))
  if (peopleMentioned.length === 0) return null

  return (
    <Section title={`Personnes mentionnées (${peopleMentioned.length}) — non converties en contacts`}>
      <ul style={{ fontSize: 13 }}>
        {peopleMentioned.map((p, i) => {
          const o = (p ?? {}) as Dict
          return (
            <li key={i}>
              {str(o.name)}
              {str(o.title) ? <span style={{ color: 'var(--muted)' }}> · {str(o.title)}</span> : null}
              {str(o.entity) ? <span style={{ color: 'var(--muted)' }}> · {str(o.entity)}</span> : null}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
