/**
 * Lecture de l'enveloppe rendue par `/cv/extract` (apps/ia) — un texte, ou une
 * raison NOMMÉE d'échec. Le nom de la route vient de son premier appelant
 * (`cv-intake.service.ts`, PDF 3 §3.2), mais `extract_document_text`
 * (`apps/ia/app/services/document_text.py`) est générique : PDF/DOCX/XLSX/
 * PPTX/RTF/texte, quel que soit l'appelant. Réutilisée ici pour le document
 * joint à un compte rendu de rendez-vous (#2103.4) plutôt que de recoder un
 * second parseur (GA-26 : un réglage vit à un seul endroit).
 *
 * Extrait de `cv-intake.service.ts` (seul appelant avant #2103.4) : DEUX
 * appelants qui lisaient chacun leur copie de cette lecture auraient divergé
 * au premier changement de forme de l'enveloppe.
 */

/** L'enveloppe IA → le texte, ou `null` si rien d'exploitable. */
export function readExtractedText(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== 'object') return null
  const data = (envelope as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const text = (data as { text?: unknown }).text
  return typeof text === 'string' && text.trim() ? text : null
}

/** Le MOTIF de l'échec, quand le service d'extraction en donne un. */
export function readFailureDetail(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== 'object') return null
  const detail = (envelope as { detail?: unknown; error?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail
  const error = (envelope as { error?: unknown }).error
  return typeof error === 'string' && error.trim() ? error : null
}

/**
 * Une lecture PARTIELLE, telle que `/cv/extract` la nomme (#2542.3). Absence
 * de clé (une enveloppe plus ancienne, ou un chemin qui n'en porte pas) vaut
 * `false` — jamais un « partiel » inventé faute de mieux.
 */
export function readExtractionPartial(envelope: unknown): boolean {
  if (!envelope || typeof envelope !== 'object') return false
  const data = (envelope as { data?: unknown }).data
  if (!data || typeof data !== 'object') return false
  return (data as { partial?: unknown }).partial === true
}
