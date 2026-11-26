/**
 * #4016 L13b — LA NOTE LIBRE D'ACCUEIL DÉCOUPÉE EN FAITS « À REVOIR »
 * (DÉCISION LOUIS 11/10/2026).
 *
 * ⚠️ RENVERSEMENT PARTIEL ET DATÉ de #2060.10 (« jamais transformé
 * automatiquement en plusieurs faits ») : la note peut désormais être
 * PROPOSÉE en plusieurs faits — mais jamais comme des faits certains. Ce qui
 * reste vrai, et que la garde `uncovered-activity-note-stays-opaque` tient
 * encore :
 *   - la note reste UNE chaîne verbatim en base (`string | null`) ;
 *   - un fait proposé est TEXTUEL (un extrait de la note, jamais reformulé ni
 *     enrichi) et porte TOUJOURS le statut `to_review` — un humain le confirme ;
 *   - rien ne s'écrit ailleurs sans ce geste.
 *
 * Découpage MÉCANIQUE (zéro modèle, zéro réseau) : lignes et puces, puis fins
 * de phrase suivies d'une majuscule ou d'un chiffre — « 2.5 M€ » et « cf. le
 * plan » ne coupent pas.
 */
export const ACTIVITY_NOTE_FACTS_MAX = 12

/** Sous ce nombre de caractères utiles, un fragment n'est pas un fait (« Oui. »). */
const FACT_MIN_LENGTH = 10

export type ActivityNoteFact = {
  id: string
  text: string
  status: 'to_review'
}

const BULLET = /^\s*(?:[-–—•*·]|\d+[.)])\s+/
const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"“(])/u

function stableId(text: string): string {
  let hash = 5381
  for (const char of text.toLowerCase()) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0
  return `note-fact-${hash.toString(36)}`
}

export function proposeActivityNoteFacts(note: string | null | undefined): ActivityNoteFact[] {
  if (typeof note !== 'string' || note.trim().length === 0) return []
  const seen = new Set<string>()
  const facts: ActivityNoteFact[] = []
  for (const line of note.split(/\r?\n/)) {
    for (const piece of line.replace(BULLET, '').split(SENTENCE_END)) {
      const text = piece.trim()
      if (text.replace(/[\s.!?…]/g, '').length < FACT_MIN_LENGTH) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      facts.push({ id: stableId(text), text, status: 'to_review' })
      if (facts.length === ACTIVITY_NOTE_FACTS_MAX) return facts
    }
  }
  return facts
}
