import { strFromU8, unzipSync } from 'fflate'

/**
 * #3803 — LIRE un fichier Office (OOXML) dans le navigateur, sans rien exécuter.
 *
 * Un docx/xlsx/pptx est une archive ZIP de fichiers XML. On en lit les PARTIES
 * utiles par expressions régulières sur un XML bien formé (produit par un
 * tableur ou un traitement de texte) — jamais par `innerHTML`, jamais par un
 * moteur qui interpréterait un script. Ce qu'on rend est du TEXTE ; c'est
 * l'écran qui le met en forme, et React l'échappe.
 *
 * Chargé À LA DEMANDE (import dynamique de la visionneuse) : fflate n'entre
 * jamais dans le bundle initial.
 */

/** Les parties d'une archive, par chemin. Une archive illisible lève — l'écran retombe sur le texte. */
export function readArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes)
}

export function partText(archive: Record<string, Uint8Array>, path: string): string | null {
  const part = archive[path]
  return part ? strFromU8(part) : null
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Décode les entités XML (nommées et numériques). */
export function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    return ENTITIES[entity] ?? ''
  })
}

/** La valeur d'un attribut d'une balise ouvrante (préfixe d'espace de noms toléré). */
export function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag)
  return match?.[1] !== undefined ? decodeXml(match[1]) : null
}

/** Tous les textes `<prefix:t>…</prefix:t>` d'un fragment, concaténés. */
export function textRuns(fragment: string, prefix: string): string {
  const pattern = new RegExp(`<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)</${prefix}:t>`, 'g')
  let text = ''
  for (const match of fragment.matchAll(pattern)) text += decodeXml(match[1] ?? '')
  return text
}

/** Les relations d'une partie (`_rels/*.rels`) : identifiant → cible. */
export function relationships(xml: string | null): Map<string, string> {
  const rels = new Map<string, string>()
  if (!xml) return rels
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attribute(match[0], 'Id')
    const target = attribute(match[0], 'Target')
    if (id && target) rels.set(id, target)
  }
  return rels
}

/** Résout une cible relative (`../slides/slide1.xml`) depuis un dossier (`ppt/slides`). */
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = baseDir.split('/').filter(Boolean)
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}
