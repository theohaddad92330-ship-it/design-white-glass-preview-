import type { ProjectRow } from '@bellum/contracts'
import type { CrmTaskInput } from '../crm/crm-task'

/** Cap the CRM task subject so it stays a one-liner across providers. */
const SUBJECT_MAX = 250

/**
 * Compose the CRM task from a stored besoin — PURELY from persisted, factual
 * fields (label, company, detail, suggested ESN offer, source, first-detected
 * date). No pipeline metadata is invented; a besoin without a detail simply
 * yields a shorter body. This is the single place that turns an Opportunity Graph
 * row into the provider-neutral task the CRM dispatcher creates.
 */
export function buildBesoinTask(row: ProjectRow, brandName: string): CrmTaskInput {
  const company = row.company_name?.trim() || null
  const label = row.label?.trim() || 'Besoin détecté'
  const subject = (company ? `Besoin — ${company} : ${label}` : `Besoin : ${label}`).slice(0, SUBJECT_MAX)

  // Body lines are appended ONLY when the underlying field exists — an absent
  // field is omitted, never filled with a placeholder.
  const lines: string[] = [label]
  const detail = row.detail?.trim()
  if (detail) lines.push('', detail)
  const offer = row.offer?.trim()
  if (offer) lines.push('', `Offre ESN pertinente : ${offer}`)

  const meta: string[] = []
  if (row.source?.trim()) meta.push(`Source : ${row.source.trim()}`)
  if (row.confidence?.trim()) meta.push(`Confiance : ${row.confidence.trim()}`)
  const detectedOn = formatDate(row.first_detected_at)
  if (detectedOn) meta.push(`Détecté le ${detectedOn}`)
  if (meta.length > 0) lines.push('', meta.join(' · '))

  // ⚠️ Cette ligne est ÉCRITE dans le CRM du client : elle survit à l'export
  // et se lit dans son outil, pas dans le nôtre.
  lines.push('', `Détecté par ${brandName}.`)

  // `company` rides along for best-effort CRM linking (deal↔company / note parent).
  // It's the stored account name or null — never a fabricated value.
  return { subject, body: lines.join('\n'), company }
}

/** ISO date → `JJ/MM/AAAA` (Europe/Paris-agnostic, date only). Empty on a
 *  non-parseable value — never a fabricated date. */
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return null
  const d = new Date(ts)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}
