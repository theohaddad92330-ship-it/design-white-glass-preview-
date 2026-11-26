/**
 * #3579 / #2434.77 — LA LANGUE PAR SEGMENT (décision Louis 11/10 : transcription par l'API
 * Whisper, détection FR/EN par segment) ET LE COÛT PAR MINUTE.
 *
 * Le service de transcription ne rend la langue QUE pour l'enregistrement entier. Pour dire,
 * dans un message qui mélange français et anglais, quel segment est dans quelle langue, on la
 * déduit du TEXTE de chaque segment par un décompte de mots-outils — déterministe, sans
 * appel réseau, et honnête : égalité, segment trop court ou sans mot-outil = `null`
 * (« indéterminée »), jamais une langue devinée.
 */

type SegmentLanguage = 'fr' | 'en'

const FR_WORDS = new Set(
  'le la les un une des du de et est pour avec dans sur par que qui nous vous on je tu il elle ils ce cette ces au aux ne pas plus mais ou donc comme sont ai a été être avoir faire va'.split(
    ' ',
  ),
)
const EN_WORDS = new Set(
  'the a an and is are was were for with in on of to that this these those we you he she they it not but or so as be have has do does will would should need please send from at by our your'.split(
    ' ',
  ),
)

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^a-zàâäçéèêëîïôöùûüÿœ']+/)
    .map(word => word.replace(/^'+|'+$/g, '').replace(/^[ldjtmsnc]'/, ''))
    .filter(word => word.length > 0)
}

/** La langue d'un segment, ou `null` quand le texte ne permet pas de trancher. */
export function detectSegmentLanguage(text: string): SegmentLanguage | null {
  let fr = 0
  let en = 0
  for (const word of words(text)) {
    if (FR_WORDS.has(word)) fr += 1
    if (EN_WORDS.has(word)) en += 1
  }
  if (fr === en) return null
  return fr > en ? 'fr' : 'en'
}

/** Tarif public par minute audio du modèle de transcription (USD). */
export const TRANSCRIPTION_USD_PER_MINUTE = 0.006

const TRANSCRIPTION_TARIFF_VERSION = 'whisper-1-2026-10'

/**
 * #3579 — la ligne du registre de coûts IA pour une transcription (gouvernance de coût).
 * Durée non rendue par le service = ligne NON tarifée (`cost_usd: null`), jamais 0.
 */
export function transcriptionCostRow(durationSeconds: number | null) {
  const known = durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds >= 0
  const minutes = known ? durationSeconds / 60 : 0
  return {
    provider: 'openai',
    operation: 'transcribe',
    calls: 1,
    units: minutes,
    cost_usd: known ? minutes * TRANSCRIPTION_USD_PER_MINUTE : null,
    status: 'ok',
    ...(known ? { tariff_version: TRANSCRIPTION_TARIFF_VERSION } : {}),
  }
}
