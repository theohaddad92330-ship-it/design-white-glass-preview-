import type { CrmKpiRow, MatchingKpiRow, QualityRow } from '@/lib/team-kpis'
import { countOrUnmeasured } from '@/lib/mesure'
import { DEEP_KPI_STR } from './strings'

/**
 * Les trois familles d'indicateurs profonds — CRM, matching, qualité.
 *
 * Elles étaient calculées et servies depuis des semaines sans qu'aucun écran ne
 * les appelle. Elles restent au BACK-OFFICE (arbitrage des 31/07 et 03/08) :
 * un taux affiché à un commercial devient une promesse chiffrée.
 *
 * Deux règles d'affichage, les mêmes partout dans le dépôt :
 *  · une valeur `null` s'écrit avec ce qui lui MANQUE, jamais « 0 » ;
 *  · un bloc qui n'a pas pu être lu le dit — « rien à signaler » n'est pas
 *    « je n'ai pas pu regarder ».
 */
export function DeepKpis({
  crm,
  matching,
  quality,
}: {
  crm: CrmKpiRow[] | null
  matching: MatchingKpiRow[] | null
  quality: QualityRow[] | null
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="h2">{DEEP_KPI_STR.title}</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        {DEEP_KPI_STR.subtitle}
      </p>

      <div
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 16 }}
      >
        <Panel title={DEEP_KPI_STR.crmTitle} rows={crm}>
          {(crm ?? []).map(kpi => (
            <Line
              key={kpi.key}
              label={DEEP_KPI_STR.crm[kpi.key] ?? kpi.key}
              value={format(kpi.value, kpi.unit)}
              // `sample` d'abord : un taux sur 3 observations n'est pas un taux.
              note={kpi.value === null ? DEEP_KPI_STR.noSample : `${DEEP_KPI_STR.onSample} ${kpi.sample}`}
              breakdown={kpi.breakdown}
            />
          ))}
        </Panel>

        <Panel title={DEEP_KPI_STR.matchingTitle} rows={matching}>
          {(matching ?? []).map(kpi => (
            <Line
              key={kpi.key}
              label={DEEP_KPI_STR.matching[kpi.key] ?? kpi.key}
              value={format(kpi.value, kpi.unit)}
              // Sous le seuil, on dit COMBIEN il manque — un taux sur deux
              // positionnements vaut 0 % ou 100 %, et les deux sont faux.
              note={
                kpi.measurability?.measurable
                  ? `${DEEP_KPI_STR.onSample} ${kpi.measurability.observed}`
                  : `${DEEP_KPI_STR.needMore} ${countOrUnmeasured(kpi.measurability?.observed)}/${kpi.measurability?.required ?? '?'}`
              }
            />
          ))}
        </Panel>

        <Panel title={DEEP_KPI_STR.qualityTitle} rows={quality}>
          {(quality ?? []).map(indicator => (
            <Line
              key={indicator.key}
              label={indicator.label}
              value={format(indicator.value, indicator.unit)}
              note={
                indicator.value === null
                  ? DEEP_KPI_STR.noSample
                  : indicator.target != null
                    ? `${DEEP_KPI_STR.target} ${format(indicator.target, indicator.unit)}`
                    : null
              }
            />
          ))}
        </Panel>
      </div>
    </section>
  )
}

function Panel({ title, rows, children }: { title: string; rows: unknown[] | null; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="h3">{title}</h3>
      {rows === null ? (
        <p className="muted">{DEEP_KPI_STR.unreadable}</p>
      ) : rows.length === 0 ? (
        <p className="muted">{DEEP_KPI_STR.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{children}</div>
      )}
    </div>
  )
}

function Line({
  label,
  value,
  note,
  breakdown,
}: {
  label: string
  value: string
  note?: string | null
  breakdown?: Record<string, number>
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {note ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {note}
        </div>
      ) : null}
      {/* La répartition, quand l'indicateur en a une. Un objet vide serait ABSENT
          plutôt que rendu : « {} » se lirait « aucune cause », ce qui est faux. */}
      {breakdown && Object.keys(breakdown).length > 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {Object.entries(breakdown)
            .map(([reason, count]) => `${reason} ${count}`)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  )
}

/** `null` ne devient JAMAIS « 0 » : il s'écrit avec le mot qui le dit. */
function format(value: number | null | undefined, unit: 'rate' | 'days' | 'count' | 'ms'): string {
  if (value == null) return DEEP_KPI_STR.notMeasured
  if (unit === 'rate') return `${Math.round(value * 100)} %`
  if (unit === 'days') return `${Math.round(value)} j`
  if (unit === 'ms') return `${Math.round(value / 1000)} s`
  return String(value)
}
