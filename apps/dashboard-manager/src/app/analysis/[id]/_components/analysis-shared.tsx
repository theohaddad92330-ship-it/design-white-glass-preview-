import type { ReactNode } from 'react'
import type { fetchTelemetryDetail } from '@/lib/telemetry'

/**
 * Le socle commun des sections du détail d'une analyse.
 *
 * Ce qui vit ici est ce qui est lu par PLUSIEURS sections : les accès tolérants
 * à `raw_analysis` (qui est « snake_casé » en profondeur à la persistance, donc
 * lu en snake puis en camel), l'enveloppe `<Section>`, le rendu générique des
 * blocs de plan, et les deux dérivations partagées — les filiales et le plan.
 * Une dérivation vit à un seul endroit : deux chemins qui la refont divergent.
 *
 * Tout le reste appartient à la section qui s'en sert et vit dans son fichier.
 */

export type Dict = Record<string, unknown>

/** Le détail rendu par la télémétrie. Le type n'est pas exporté par `lib/telemetry` (knip refuse un export de type sans consommateur) — on le relit depuis la fonction. */
export type AnalysisDetail = Awaited<ReturnType<typeof fetchTelemetryDetail>>

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function pick(obj: Dict, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null) return obj[k]
  }
  return undefined
}

export function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{title}</h3>
      {children}
    </section>
  )
}

// Generic, bounded renderer for the free-form plan sections (Claude dicts whose
// inner shape isn't contractually fixed) — strings/numbers inline, arrays as
// lists, objects as labelled key/value blocks.
export function RenderValue({ value }: { value: unknown }): ReactNode {
  if (value == null || value === '') return null
  if (typeof value !== 'object') return <span>{String(value)}</span>
  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: '4px 0' }}>
        {value.map((v, i) => (
          <li key={i}>
            <RenderValue value={v} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div>
      {Object.entries(value as Dict).map(([k, v]) => (
        <div key={k} style={{ margin: '3px 0' }}>
          <strong style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</strong> <RenderValue value={v} />
        </div>
      ))}
    </div>
  )
}

/** Le blob de plan, lu sous ses trois noms. L'entête, le cockpit et le plan le lisent — il se dérive une fois. */
export function planOf(raw: Dict): Dict | undefined {
  return pick(raw, 'plan', 'action_plan', 'actionPlan') as Dict | undefined
}

/**
 * Les filiales, lues par l'entête (le compte) et par la section « Filiales ».
 * Prefer the operating-only view (legal noise — SCI / holdings / GIE —
 * filtered out); fall back to the raw list for older analyses.
 */
export function readSubsidiaries(raw: Dict): {
  allSubsidiaries: unknown[]
  subsidiaries: unknown[]
  subsSummary: Dict | undefined
  filteredCount: number
} {
  const allSubsidiaries = asArray(pick(raw, 'subsidiaries'))
  const meaningfulSubs = asArray(pick(raw, 'meaningful_subsidiaries', 'meaningfulSubsidiaries'))
  const subsidiaries = meaningfulSubs.length > 0 ? meaningfulSubs : allSubsidiaries
  const subsSummary = pick(raw, 'subsidiaries_summary', 'subsidiariesSummary') as Dict | undefined
  const filteredCount = Number(pick(subsSummary ?? {}, 'filtered') ?? 0)
  return { allSubsidiaries, subsidiaries, subsSummary, filteredCount }
}
