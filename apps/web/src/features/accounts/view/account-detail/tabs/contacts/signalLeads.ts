import { isTechnicalDeciderTitle } from '@bellum/contracts'
import { normalizeEventText } from '@/features/accounts/model/watchEvents'

/**
 * #4324.1(b) — STEF Transport (recette 22/10) : un DSI cité dans un signal, aucune fiche contact. Les personnes que
 * les signaux NOMMENT (`raw_analysis.peopleMentioned`) et qui n'ont pas de fiche deviennent des PISTES de contact :
 * nom et fonction tels que le signal les donne, jamais complétés ni devinés. Un ancien titulaire (`former`) n'est
 * pas une piste ; un contact écarté n'est pas une fiche. Un décideur technique passe en tête (le siège qui manque).
 */
export type SignalLead = { name: string; title: string | null; entity: string | null }

type NamedContact = { full_name?: string | null; excluded_at?: string | null }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function readSignalLeads(rawAnalysis: Record<string, unknown>, contacts: readonly NamedContact[]): SignalLead[] {
  const mentioned = rawAnalysis['peopleMentioned']
  if (!Array.isArray(mentioned)) return []
  const known = new Set(
    contacts.filter(contact => !contact.excluded_at).map(contact => normalizeEventText(contact.full_name ?? '')),
  )
  const seen = new Set<string>()
  const leads: SignalLead[] = []
  for (const item of mentioned) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = text(record['name'])
    if (!name || record['former'] === true) continue
    const key = normalizeEventText(name)
    if (!key || known.has(key) || seen.has(key)) continue
    seen.add(key)
    leads.push({ name, title: text(record['title']), entity: text(record['entity']) })
  }
  return leads
    .map((lead, index) => ({ lead, index, technical: isTechnicalDeciderTitle(lead.title) }))
    .sort((a, b) => Number(b.technical) - Number(a.technical) || a.index - b.index)
    .map(row => row.lead)
}
