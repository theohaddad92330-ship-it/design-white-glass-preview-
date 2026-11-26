import { type Dict, Section, asArray, pick, str } from './analysis-shared'

/**
 * CE QUE CHAQUE SOURCE A RAPPORTÉ — les sources parallèles (NAF + les six
 * enrichisseurs) rendues telles quelles, pour que l'opérateur vérifie ce que
 * chaque API a réellement ramené ; puis les preuves datées, la liste des
 * sources consultées, et la fraîcheur des données.
 *
 * Le bloc « Grounding » vit dans `AnalysisHeader.tsx` : il rend la MÊME lecture
 * de confiance que l'entête, et la raison est écrite là-bas.
 */

/** Registre, stack observée, BODACC, actualités, offres IT, bénéficiaires effectifs. */
export function AnalysisRawSources({ raw }: { raw: Dict }) {
  // The parallel data sources (NAF + 6 enrichers) — surfaced so the manager can
  // verify exactly what each API brought back.
  const nafCode = str(pick(raw, 'naf_code', 'nafCode'))
  const detectedTechStack = asArray(pick(raw, 'detected_tech_stack', 'detectedTechStack'))
  const registryAnnuaire = pick(raw, 'registry_annuaire', 'registryAnnuaire') as Dict | undefined
  const legalSignals = asArray(pick(raw, 'legal_signals', 'legalSignals'))
  const news = asArray(pick(raw, 'news'))
  const itJobSignals = asArray(pick(raw, 'it_job_signals', 'itJobSignals'))
  const beneficialOwners = asArray(pick(raw, 'beneficial_owners', 'beneficialOwners'))

  return (
    <>
      {nafCode || detectedTechStack.length > 0 || registryAnnuaire ? (
        <Section title="Registre & stack technique">
          {nafCode ? (
            <p style={{ margin: '0 0 8px' }}>
              <span className="badge technical">NAF {nafCode}</span>
            </p>
          ) : null}
          {detectedTechStack.length > 0 ? (
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>Stack observée (tech-detect) : </span>
              {detectedTechStack.map(t => str(t)).join(' · ')}
            </p>
          ) : null}
          {registryAnnuaire ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Registre (recherche-entreprises) :{' '}
              {str(pick(registryAnnuaire, 'nombre_etablissements', 'nombreEtablissements')) || '—'} établissements
            </p>
          ) : null}
        </Section>
      ) : null}

      {legalSignals.length > 0 ? (
        <Section title={`Signaux légaux — BODACC (${legalSignals.length})`}>
          <ul>
            {legalSignals.map((s, i) => {
              const o = (s ?? {}) as Dict
              return (
                <li key={i}>
                  {str(o.date)} — {str(o.type)} {str(o.commercant) ? `(${str(o.commercant)})` : ''}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {news.length > 0 ? (
        <Section title={`Actualités — Brave News (${news.length})`}>
          <ul>
            {news.map((n, i) => {
              const o = (n ?? {}) as Dict
              return (
                <li key={i}>
                  {o.url ? (
                    <a href={str(o.url)} target="_blank" rel="noreferrer">
                      {str(o.title)}
                    </a>
                  ) : (
                    str(o.title)
                  )}
                  {str(o.age) ? <span style={{ color: 'var(--muted)' }}> · {str(o.age)}</span> : null}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {itJobSignals.length > 0 ? (
        <Section title={`Offres IT — France Travail (${itJobSignals.length})`}>
          <ul>
            {itJobSignals.map((j, i) => {
              const o = (j ?? {}) as Dict
              const skills = asArray(o.skills)
              return (
                <li key={i}>
                  {str(o.title)}
                  {str(o.location) ? ` · ${str(o.location)}` : ''}
                  {str(o.date) ? ` · ${str(o.date)}` : ''}
                  {skills.length ? (
                    <span style={{ color: 'var(--muted)' }}> — {skills.map(s => str(s)).join(', ')}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {beneficialOwners.length > 0 ? (
        <Section title={`Bénéficiaires effectifs — INPI (${beneficialOwners.length})`}>
          <ul>
            {beneficialOwners.map((b, i) => {
              const o = (b ?? {}) as Dict
              const part = str(pick(o, 'detention_part', 'detentionPart'))
              return (
                <li key={i}>
                  {str(o.name)}
                  {part ? ` — ${part}%` : ''}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}
    </>
  )
}

/** Les faits sourcés, avec leur étiquette fait / hypothèse, leur date et leurs références. */
export function AnalysisEvidence({ raw }: { raw: Dict }) {
  const sources = pick(raw, 'sources') as Dict | undefined
  const evidence = (sources?.evidence ?? {}) as Dict
  const evidenceEntries = Object.entries(evidence)
  const factTags = (sources?.tags ?? {}) as Dict
  if (evidenceEntries.length === 0) return null

  return (
    <Section title={`Preuves · faits sourcés (${evidenceEntries.length})`}>
      <table>
        <tbody>
          {evidenceEntries.map(([k, e]) => {
            const o = (e ?? {}) as Dict
            const tag = str(factTags[k])
            return (
              <tr key={k}>
                <td>
                  {tag ? <span className={`badge ${tag === 'PUBLIC' ? 'PUBLIC' : 'HYPOTHESE'}`}>{tag}</span> : null}{' '}
                  {str(o.extract)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {str(o.date) || '—'}
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{asArray(o.refs).join(', ')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}

/** La liste des sources consultées, bornée à 40 lignes. */
export function AnalysisRegistry({ raw }: { raw: Dict }) {
  const sources = pick(raw, 'sources') as Dict | undefined
  const registry = asArray(sources?.registry)
  const coverage = (sources?.coverage ?? {}) as Dict
  if (registry.length === 0) return null

  return (
    <Section title={`Sources consultées (${registry.length})`}>
      {Object.keys(coverage).length > 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' }}>
          {Object.entries(coverage)
            .map(([k, v]) => `${k}: ${str(v)}`)
            .join(' · ')}
        </p>
      ) : null}
      <table>
        <tbody>
          {registry.slice(0, 40).map((s, i) => {
            const o = (s ?? {}) as Dict
            const url = str(o.url)
            return (
              <tr key={i}>
                <td>
                  <span className="pill">{str(o.provider)}</span>
                </td>
                <td>
                  {url ? (
                    <a className="link" href={url} target="_blank" rel="noreferrer">
                      {str(o.title) || url}
                    </a>
                  ) : (
                    str(o.title) || str(o.ref)
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}

/** L'âge des données et les réglementations qui pèsent sur le compte. */
export function AnalysisFreshness({ raw }: { raw: Dict }) {
  const dataFreshness = (pick(raw, 'data_freshness', 'dataFreshness') ?? {}) as Dict
  const regulations = asArray(pick(raw, 'regulations'))
  if (Object.keys(dataFreshness).length === 0 && regulations.length === 0) return null

  return (
    <Section title="Fraîcheur des données & conformité">
      {Object.keys(dataFreshness).length > 0 ? (
        <p style={{ fontSize: 13, margin: '0 0 6px' }}>
          {(
            [
              ['signals', 'signaux'],
              ['financials', 'finances'],
              ['contacts', 'contacts'],
            ] as const
          )
            .filter(([k]) => str(dataFreshness[k]))
            .map(([k, label]) => {
              const v = str(dataFreshness[k])
              return (
                <span key={k} style={{ marginRight: 10 }}>
                  <span style={{ color: 'var(--muted)' }}>{label} : </span>
                  <span className={`badge ${v === 'recent' ? 'PUBLIC' : v === 'old' ? 'error' : 'HYPOTHESE'}`}>
                    {v}
                  </span>
                </span>
              )
            })}
        </p>
      ) : null}
      {regulations.length > 0 ? (
        <p style={{ fontSize: 13, margin: 0, color: 'var(--muted)' }}>
          Réglementations : {regulations.map(str).join(' · ')}
        </p>
      ) : null}
    </Section>
  )
}
