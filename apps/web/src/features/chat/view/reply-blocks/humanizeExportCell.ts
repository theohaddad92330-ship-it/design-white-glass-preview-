import type { TFunction } from 'i18next'
import { formatDate } from '@/lib/locale'

// #3864.7 — une cellule de tableau se LIT. Le modèle (ou l'outil) peut laisser
// passer un objet sérialisé (« {'term': 'Java', 'level': None} »), une clé
// interne (`to_match`) ou un horodatage ISO ; l'écran ne montre jamais ça.
// `null` = « non mesuré » (rendu par l'appelant), jamais un morceau de JSON.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/
const LABEL_KEYS = ['term', 'name', 'label', 'title', 'value'] as const

function labelOf(item: unknown): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    const key = LABEL_KEYS.find(k => typeof record[k] === 'string' && (record[k] as string).trim())
    if (!key) return ''
    const label = (record[key] as string).trim()
    const level = typeof record.level === 'string' ? record.level.trim() : ''
    return level ? `${label} (${level})` : label
  }
  if (typeof item === 'string') return item.trim()
  if (typeof item === 'number') return String(item)
  return ''
}

/** Lit un objet / une liste sérialisés (JSON ou repr Python) ; `null` si illisible. */
function parseSerialized(text: string): string | null {
  const jsonish = text
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/'/g, '"')
  const wrapped = jsonish.startsWith('{') ? `[${jsonish}]` : jsonish
  try {
    const parsed: unknown = JSON.parse(wrapped)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    const out = items.map(labelOf).filter(Boolean).join(', ')
    return out || null
  } catch {
    return null
  }
}

export function humanizeExportCell(cell: string | null, t: TFunction): string | null {
  if (cell === null) return null
  const text = cell.trim()
  if (!text) return null
  if (text.startsWith('{') || text.startsWith('[')) {
    const parsed = parseSerialized(text)
    // Garde : un résultat qui ressemble encore à un objet n'est jamais affiché.
    return parsed && !/^[{[]/.test(parsed) ? parsed : null
  }
  if (ISO_DATE.test(text)) return formatDate(text, { dateStyle: 'short' }) ?? text
  for (const prefix of ['projects:needStatus.', 'projects:openNeeds.nextAction.']) {
    const key = `${prefix}${text}`
    if (/^[a-z]+(?:_[a-z]+)*$/.test(text) && t(key, { defaultValue: '' })) return t(key)
  }
  return text
}
