import { normalizeText } from './text-normalize'

/** Taille cible d'un chunk — sous le plafond d'embedding (`RAG_EMBED_CONTENT_CHARS`, 2000) côté IA. */
const DEFAULT_MAX_CHARS = 1500

/** Coupe sur les paragraphes (lignes vides), regroupés gloutonnement ; un paragraphe trop long est découpé à taille fixe. */
export function chunkText(text: string, maxChars: number = DEFAULT_MAX_CHARS): string[] {
  const clean = normalizeText(text).trim()
  if (!clean) return []

  const pieces: string[] = []
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    if (p.length <= maxChars) {
      pieces.push(p)
      continue
    }
    for (let i = 0; i < p.length; i += maxChars) pieces.push(p.slice(i, i + maxChars))
  }

  const chunks: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (!current) current = piece
    else if (current.length + 2 + piece.length <= maxChars) current += `\n\n${piece}`
    else {
      chunks.push(current)
      current = piece
    }
  }
  if (current) chunks.push(current)
  // Un découpage à taille fixe peut couper une paire de surrogates : on renormalise chaque chunk.
  return chunks.map(normalizeText).filter(c => c.trim().length > 0)
}
