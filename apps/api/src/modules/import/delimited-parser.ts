/**
 * Le lecteur de fichier délimité — séparateur détecté, guillemets respectés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN LECTEUR ICI, ALORS QU'IL EN EXISTE DÉJÀ UN
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts/csv-import.ts` lit des CONTACTS : ses alias, ses champs obligatoires
 * et sa forme de sortie sont ceux d'une fiche contact. Celui-ci ne connaît aucun
 * objet — il rend des lignes brutes, en-têtes compris, et c'est le moteur
 * d'import qui décide ce qu'elles deviennent. Les fusionner obligerait le
 * lecteur de contacts à devenir générique, donc à changer un chemin qui marche
 * et qui a ses tests, pour économiser vingt lignes.
 *
 * Ce que le ticket interdit — « créer un second moteur de synchronisation » —
 * porte sur la SYNCHRONISATION, pas sur la lecture d'un fichier texte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAUT SAVOIR SUR LES EXPORTS FRANÇAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Excel FR écrit un point-VIRGULE et non une virgule, place un BOM UTF-8 en tête
 * quand on lui demande « CSV UTF-8 », et sinon encode en Windows-1252. Le
 * séparateur se détecte donc, il ne se suppose pas : un fichier lu avec le
 * mauvais séparateur rend UNE colonne, et l'écran annonce alors « aucune colonne
 * reconnue » sur un fichier parfaitement valide.
 */

type DelimitedFile = {
  headers: string[]
  rows: Record<string, string>[]
  /** Le séparateur retenu, pour que l'écran puisse le DIRE. */
  delimiter: ',' | ';' | '\t'
  /** Le fichier dépassait la borne : on le dit, on ne le coupe pas en silence. */
  truncated: boolean
}

/**
 * Le séparateur, décidé sur la LIGNE D'EN-TÊTE et pas sur le fichier entier.
 *
 * Un corps de fichier contient des virgules dans les adresses et des
 * point-virgules dans les listes de compétences ; l'en-tête, lui, n'en contient
 * qu'à titre de séparateur. Compter sur tout le fichier ferait gagner le
 * caractère le plus fréquent DANS les valeurs.
 */
export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const counts: [',' | ';' | '\t', number][] = [
    [';', (headerLine.match(/;/g) ?? []).length],
    [',', (headerLine.match(/,/g) ?? []).length],
    ['\t', (headerLine.match(/\t/g) ?? []).length],
  ]
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a))
  return best[1] > 0 ? best[0] : ','
}

/** Découpe une ligne en respectant les guillemets et les `""` échappés. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else quoted = false
      } else current += char
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  out.push(current)
  return out.map(value => value.trim())
}

/**
 * Regroupe les lignes physiques en lignes LOGIQUES.
 *
 * Une valeur entre guillemets peut contenir un retour à la ligne — c'est le cas
 * de toutes les notes exportées d'un CRM. Découper naïvement sur `\n` les
 * transforme en dizaines de lignes invalides, et le rapport de simulation
 * annonce alors « 400 lignes ignorées » sur un fichier de 40 notes.
 */
function logicalLines(content: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (const char of content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) {
    if (char === '"') quoted = !quoted
    if (char === '\n' && !quoted) {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current)
  return out.filter(line => line.trim().length > 0)
}

export function parseDelimited(content: string, maxRows: number): DelimitedFile {
  // Le BOM UTF-8 : invisible, et il colle à l'en-tête de la première colonne,
  // qui cesse alors d'être reconnue. Un fichier « CSV UTF-8 » d'Excel en porte
  // toujours un.
  const clean = content.replace(/^\uFEFF/, '')
  const lines = logicalLines(clean)
  if (lines.length === 0) return { headers: [], rows: [], delimiter: ',', truncated: false }

  const delimiter = detectDelimiter(lines[0] as string)
  const headers = splitLine(lines[0] as string, delimiter)
  const body = lines.slice(1)
  const truncated = body.length > maxRows

  const rows = body.slice(0, maxRows).map(line => {
    const values = splitLine(line, delimiter)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    return row
  })

  return { headers, rows, delimiter, truncated }
}
