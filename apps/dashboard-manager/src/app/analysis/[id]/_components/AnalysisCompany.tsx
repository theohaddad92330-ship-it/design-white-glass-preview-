import { type Dict, RenderValue, Section, asArray, pick, str } from './analysis-shared'

/**
 * LA SOCIÉTÉ — firmographie collectée, dirigeants, historique financier, ESN
 * déjà en place et synergies. Tout ce qui décrit le compte lui-même, par
 * opposition à ce qu'on compte en faire.
 */
export function AnalysisCompany({ raw }: { raw: Dict }) {
  // Rich firmographics — collected by research, surfaced here so the manager
  // sees the maximum on each company (not just the headline figures).
  const businessDescription = str(pick(raw, 'business_description', 'businessDescription'))
  const revenue = str(pick(raw, 'revenue'))
  const headquarters = str(pick(raw, 'headquarters'))
  const website = str(pick(raw, 'website'))
  const legalForm = str(pick(raw, 'legal_form', 'legalForm'))
  const capital = str(pick(raw, 'capital'))
  const creationDate = str(pick(raw, 'creation_date', 'creationDate'))
  const pappersUrl = str(pick(raw, 'pappers_url', 'pappersUrl'))
  const executives = asArray(pick(raw, 'executives'))
  const cLevel = asArray(pick(raw, 'c_level', 'cLevel'))
  const competitors = asArray(pick(raw, 'competitors'))
  const esnSynergies = asArray(pick(raw, 'esn_synergies', 'esnSynergies'))
  // « Les ESN concurrentes déjà présentes » (Matteo/Théo) — concurrence OU rang-2.
  const esnPresence = asArray(pick(raw, 'esn_presence', 'esnPresence'))
  const financialsHistory = asArray(pick(raw, 'financials_history', 'financialsHistory'))
  const organigrammeLogic = str(pick(raw, 'organigramme_logic', 'organigrammeLogic'))
  const companyFacts: Array<[string, string]> = [
    ['Description', businessDescription],
    ['Chiffre d’affaires', revenue],
    ['Siège', headquarters],
    ['Site web', website],
    ['Forme juridique', legalForm],
    ['Capital', capital],
    ['Création', creationDate],
  ].filter(([, v]) => v) as Array<[string, string]>

  return (
    <>
      {companyFacts.length > 0 || businessDescription ? (
        <Section title="Société — fiche détaillée">
          <table>
            <tbody>
              {companyFacts.map(([label, value], i) => (
                <tr key={i}>
                  <td className="mono" style={{ width: 170, verticalAlign: 'top', color: 'var(--muted)' }}>
                    {label}
                  </td>
                  <td>
                    {label === 'Site web' && value.startsWith('http') ? (
                      <a href={value} target="_blank" rel="noreferrer">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pappersUrl ? (
            <p style={{ marginTop: 8, fontSize: 13 }}>
              <a href={pappersUrl} target="_blank" rel="noreferrer">
                Fiche Pappers ↗
              </a>
            </p>
          ) : null}
        </Section>
      ) : null}

      {executives.length > 0 || cLevel.length > 0 ? (
        <Section title={`Dirigeants & C-level (${executives.length + cLevel.length})`}>
          {organigrammeLogic ? (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>{organigrammeLogic}</p>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[['Dirigeants (mandataires)', executives] as const, ['C-level', cLevel] as const].map(([label, list]) =>
              list.length > 0 ? (
                <div key={label}>
                  <strong style={{ fontSize: 13 }}>{label}</strong>
                  <ul style={{ marginTop: 6 }}>
                    {list.map((p, i) => {
                      const o = (p ?? {}) as Dict
                      // Pappers executives carry first_name/last_name, not a `name`
                      // field — compose it, else we'd render "[object Object]".
                      const name =
                        str(pick(o, 'name', 'full_name', 'fullName')) ||
                        [str(pick(o, 'first_name', 'firstName')), str(pick(o, 'last_name', 'lastName'))]
                          .filter(Boolean)
                          .join(' ') ||
                        '—'
                      const role = str(pick(o, 'role', 'title', 'function', 'fonction'))
                      return (
                        <li key={i}>
                          {name}
                          {role ? <span style={{ color: 'var(--muted)' }}> — {role}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </Section>
      ) : null}

      {financialsHistory.length > 0 ? (
        <Section title="Finances — historique">
          <table>
            <tbody>
              {financialsHistory.map((f, i) => {
                const o = (f ?? {}) as Dict
                const year = str(pick(o, 'year', 'annee', 'exercice'))
                const ca = str(pick(o, 'revenue', 'ca', 'chiffre_affaires', 'chiffreAffaires'))
                const res = str(pick(o, 'result', 'resultat', 'net_result', 'resultatNet'))
                return (
                  <tr key={i}>
                    <td className="mono" style={{ width: 80, color: 'var(--muted)' }}>
                      {year || '—'}
                    </td>
                    <td>{ca ? `CA ${ca}` : ''}</td>
                    <td style={{ color: 'var(--muted)' }}>{res ? `résultat ${res}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      ) : null}

      {esnPresence.length > 0 ? (
        <Section
          title={`Les ESN concurrentes déjà présentes (${esnPresence.length}) — concurrencer ou solliciter en rang 2`}
        >
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
            Ces ESN semblent déjà en place sur le compte (projets/partenariats repérés). Pour chacune : soit tu la
            concurrences, soit tu la sollicites pour du rang 2 (co/sous-traitance, partenariat).
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {esnPresence.map((p, i) => {
              const o = (p ?? {}) as Dict
              const name = str(o.name)
              const known = Boolean(o.isKnownEsn ?? o.is_known_esn)
              const presence = str(o.presence)
              const evidence = str(o.evidence)
              const competeAngle = str(o.competeAngle ?? o.compete_angle)
              const partnershipAngle = str(o.partnershipAngle ?? o.partnership_angle)
              const weaknesses = asArray(o.weaknesses)
              const tjm = str(o.tjmRange ?? o.tjm_range)
              return (
                <div key={i} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{name}</strong>
                    {presence ? (
                      <span className="badge" style={{ fontSize: 11 }}>
                        {presence === 'confirmée' ? '● présence confirmée' : '○ présence probable'}
                      </span>
                    ) : null}
                    {known ? (
                      <span className="badge" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        ESN connue (battlecard)
                      </span>
                    ) : null}
                    {tjm ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>TJM {tjm}</span> : null}
                  </div>
                  {evidence ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Indices : {evidence}</div>
                  ) : null}
                  {competeAngle ? (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      <strong>⚔️ Concurrencer :</strong> {competeAngle}
                    </div>
                  ) : null}
                  {partnershipAngle ? (
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <strong>🤝 Rang 2 :</strong> {partnershipAngle}
                    </div>
                  ) : null}
                  {weaknesses.length > 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Faiblesses exploitables : {weaknesses.map(w => str(w)).join(' ; ')}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {competitors.length > 0 || esnSynergies.length > 0 ? (
        <Section title="Concurrence & synergies ESN">
          {competitors.length > 0 ? (
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              <strong>Concurrents :</strong>{' '}
              <span style={{ color: 'var(--muted)' }}>
                {competitors.map(c => str((c as Dict)?.name ?? c)).join(' · ')}
              </span>
            </p>
          ) : null}
          {esnSynergies.length > 0 ? (
            <ul style={{ marginTop: 4 }}>
              {esnSynergies.map((s, i) => (
                <li key={i}>
                  <RenderValue value={s} />
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}
    </>
  )
}
