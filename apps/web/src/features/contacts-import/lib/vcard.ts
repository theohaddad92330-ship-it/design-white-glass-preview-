/**
 * Théo B c3-imports-sources.N1 — « Carnet d'adresses » : un fichier vCard (.vcf) est lu DANS LE NAVIGATEUR et
 * devient un tableau (CSV `;`) que l'import universel sait déjà lire — mêmes colonnes proposées, même vérification
 * avant import. Aucune carte n'est envoyée telle quelle, aucune valeur n'est devinée : un champ absent reste vide.
 */
const HEADERS = ['Nom', 'Fonction', 'Entreprise', 'Email', 'Téléphone', 'linkedin'] as const

type Card = Record<(typeof HEADERS)[number], string>

const escapeCell = (value: string): string => (/[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** RFC 6350 §3.2 — une ligne qui commence par une espace ou une tabulation prolonge la précédente. */
function unfold(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if (/^[ \t]/.test(raw) && lines.length > 0) lines[lines.length - 1] += raw.slice(1)
    else lines.push(raw)
  }
  return lines
}

const unescapeValue = (value: string): string =>
  value
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim()

export function vcardToCsv(text: string): string | null {
  const cards: Card[] = []
  let current: Card | null = null
  let structuredName = ''
  for (const line of unfold(text)) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = { Nom: '', Fonction: '', Entreprise: '', Email: '', Téléphone: '', linkedin: '' }
      structuredName = ''
      continue
    }
    if (upper === 'END:VCARD') {
      if (current) {
        if (!current.Nom && structuredName) current.Nom = structuredName
        cards.push(current)
      }
      current = null
      continue
    }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const property = (line.slice(0, colon).split(';')[0] ?? '').toUpperCase().replace(/^ITEM\d+\./, '')
    const value = line.slice(colon + 1)
    if (property === 'FN') current.Nom = unescapeValue(value)
    else if (property === 'N') {
      const [family = '', given = ''] = value.split(';')
      structuredName = [given, family].map(unescapeValue).filter(Boolean).join(' ')
    } else if (property === 'TITLE' && !current.Fonction) current.Fonction = unescapeValue(value)
    else if (property === 'ORG' && !current.Entreprise) current.Entreprise = unescapeValue(value.split(';')[0] ?? '')
    else if (property === 'EMAIL' && !current.Email) current.Email = unescapeValue(value)
    else if (property === 'TEL' && !current.Téléphone) current.Téléphone = unescapeValue(value)
    else if (property === 'URL' && !current.linkedin && /linkedin\./.test(value))
      current.linkedin = unescapeValue(value)
  }
  if (cards.length === 0) return null
  const rows = cards.map(card => HEADERS.map(header => escapeCell(card[header])).join(';'))
  return `${[HEADERS.join(';'), ...rows].join('\n')}\n`
}
