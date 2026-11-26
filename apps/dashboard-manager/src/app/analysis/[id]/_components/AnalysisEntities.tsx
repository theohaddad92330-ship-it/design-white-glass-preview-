import { type Dict, Section, asArray, pick, readSubsidiaries, str } from './analysis-shared'

/**
 * OÙ CHASSER — les entités du groupe classées par priorité, les filiales
 * opérationnelles (le bruit juridique retiré) et les sites français.
 */

// Influence × accessibility matrix — the deck's 4 zones (computed in the IA
// service). Ordered best-first for the header summary.
const ZONE_META: Array<[string, string]> = [
  ['attaque_immediate', 'Attaque immédiate'],
  ['influence_a_activer', 'Influence à activer'],
  ['quick_win', 'Quick win'],
  ['longue_traine', 'Longue traîne'],
]
const ZONE_LABEL: Record<string, string> = Object.fromEntries(ZONE_META)
const ACCESS_LABEL: Record<string, string> = { high: 'accès facile', medium: 'accès moyen', low: 'accès difficile' }

export function AnalysisEntities({ raw }: { raw: Dict }) {
  const entities = asArray(pick(raw, 'entities_exhaustive', 'entitiesExhaustive'))
  const tierCounts = (pick(raw, 'entity_tier_counts', 'entityTierCounts') ?? {}) as Dict
  const entityZones = (pick(raw, 'entity_zones', 'entityZones') ?? {}) as Dict
  const itEntities = asArray(pick(raw, 'it_entities', 'itEntities'))
  const { allSubsidiaries, subsidiaries, subsSummary, filteredCount } = readSubsidiaries(raw)
  const sites = asArray(pick(raw, 'sites_france', 'sitesFrance'))

  return (
    <>
      {entities.length > 0 ? (
        <Section title={`Entités / zones de chasse (${entities.length})`}>
          {Object.keys(tierCounts).length > 0 ? (
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              {/* #4595.3 — un palier absent ne fait AUCUN badge : jamais « P2 0 » pour un palier non mesuré. */}
              {(['P1', 'P2', 'P3'] as const)
                .filter(tier => tierCounts[tier] != null)
                .map(tier => (
                  <span key={tier}>
                    <span className={`badge ${tier}`}>
                      {tier} {str(tierCounts[tier])}
                    </span>{' '}
                  </span>
                ))}
              <span style={{ color: 'var(--muted)' }}> · attaque immédiate / second temps / longue traîne</span>
            </p>
          ) : null}
          {Object.keys(entityZones).length > 0 ? (
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>Matrice influence × accessibilité : </span>
              {/* #4595.3 — une zone absente ne fait aucune pastille, jamais « 0 ». */}
              {ZONE_META.filter(([key]) => entityZones[key] != null).map(([key, label]) => (
                <span key={key} className={`badge ${key}`} style={{ marginRight: 6 }}>
                  {label} {str(entityZones[key])}
                </span>
              ))}
            </p>
          ) : null}
          {itEntities.length > 0 ? (
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              <span className="badge technical">🎯 entité IT</span>{' '}
              <span style={{ color: 'var(--muted)' }}>cible n°1 ESN : </span>
              {itEntities.map(e => str((e as Dict).name)).join(', ')}
            </p>
          ) : null}
          <table>
            <tbody>
              {[...entities]
                .sort(
                  (a, b) =>
                    Number(pick(a as Dict, 'priority_rank', 'priorityRank') ?? 99) -
                    Number(pick(b as Dict, 'priority_rank', 'priorityRank') ?? 99),
                )
                .map((e, i) => {
                  const o = (e ?? {}) as Dict
                  // raw_analysis is deep snake_cased on persist — snake first, camel fallback.
                  const tier = str(pick(o, 'priority_tier', 'priorityTier'))
                  const zone = str(o.zone)
                  const access = str(pick(o, 'accessibility_band', 'accessibilityBand'))
                  const whatToSell = asArray(pick(o, 'what_to_sell', 'whatToSell'))
                    .map(str)
                    .filter(Boolean)
                  const stack = asArray(o.stack).map(str).filter(Boolean)
                  return (
                    <tr key={i}>
                      <td>{tier ? <span className={`badge ${tier}`}>{tier}</span> : null}</td>
                      <td>
                        {str(o.name)}
                        {pick(o, 'is_it_entity', 'isItEntity') ? (
                          <span className="badge technical" style={{ marginLeft: 8 }}>
                            🎯 entité IT
                          </span>
                        ) : null}
                        {whatToSell.length > 0 ? (
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            <span style={{ color: 'var(--muted)' }}>à vendre : </span>
                            {whatToSell.join(' · ')}
                          </div>
                        ) : null}
                        {stack.length > 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>stack : {stack.join(' · ')}</div>
                        ) : null}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{str(o.type)}</td>
                      <td style={{ color: 'var(--muted)' }}>
                        {str(pick(o, 'estimated_headcount', 'estimatedHeadcount'))}
                        {str(o.region) ? ` · ${str(o.region)}` : ''}
                        {str(pick(o, 'it_autonomy', 'itAutonomy')) ? (
                          <span style={{ marginLeft: 6 }}>IT {str(pick(o, 'it_autonomy', 'itAutonomy'))}</span>
                        ) : null}
                      </td>
                      <td>
                        {zone ? <span className={`badge ${zone}`}>{ZONE_LABEL[zone] ?? zone}</span> : null}
                        {access ? (
                          <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>
                            {ACCESS_LABEL[access] ?? access}
                          </span>
                        ) : null}
                        {(() => {
                          const eng = (o.engagement ?? {}) as Dict
                          const cadence = str(eng.cadence)
                          const tier = str(pick(eng, 'contactTier', 'contact_tier'))
                          return cadence ? (
                            <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                              {tier ? `tier ${tier} · ` : ''}
                              recontact {cadence}
                            </div>
                          ) : null
                        })()}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </Section>
      ) : null}

      {subsidiaries.length > 0 ? (
        <Section title={`Filiales opérationnelles (${subsidiaries.length})`}>
          {filteredCount > 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' }}>
              {allSubsidiaries.length} entités légales · {filteredCount} filtrées (SCI / holdings / GIE)
              {subsSummary?.filteredReasons ? ` — ${Object.keys(subsSummary.filteredReasons as Dict).join(', ')}` : ''}
            </p>
          ) : null}
          <table>
            <tbody>
              {subsidiaries.map((sb, i) => {
                const o = (sb ?? {}) as Dict
                return (
                  <tr key={i}>
                    <td>{str(o.name) || '—'}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {str(o.siren)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      ) : null}

      {sites.length > 0 ? (
        <Section title={`Sites France (${sites.length})`}>
          <ul>
            {sites.map((st, i) => {
              const o = (st ?? {}) as Dict
              return (
                <li key={i}>
                  {str(o.city)} — {str(o.type)} {str(o.importance) ? `(${str(o.importance)})` : ''}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}
    </>
  )
}
