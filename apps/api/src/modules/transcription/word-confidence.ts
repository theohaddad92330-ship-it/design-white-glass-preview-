/**
 * #2434.40 / #2434.85 — LE MOT INCERTAIN, JAMAIS UN POURCENTAGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE FOURNISSEUR REND RÉELLEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contrat de transcription (`response_format: json`, `chat-voice.ts`) ne
 * porte aucune confiance — c'est ce qui bloquait ce point depuis le tri du
 * 24/09. En `verbose_json` avec `timestamp_granularities: ['word']`
 * (`transcription.client.ts`, `transcribeAudioWithWords`), le fournisseur rend
 * un horodatage par mot ET un `avg_logprob` par SEGMENT — jamais un score par
 * mot. On ne devine pas un score qui n'existe pas : le mot hérite du verdict de
 * son segment (celui dont l'intervalle [start, end] couvre son milieu), rien
 * de plus fin n'est mesurable.
 *
 * `uncertain` est un booléen, jamais le chiffre : la doctrine interdit
 * d'afficher une probabilité de closing, et par la même discipline on n'affiche
 * pas un pourcentage de confiance — l'écran souligne le mot, il ne le note pas.
 *
 * Le seuil est documenté ici, jamais recalculé ailleurs (GA-26) : `avg_logprob`
 * de Whisper vit presque toujours entre 0 et -1, un segment en dessous de
 * {@link UNCERTAIN_AVG_LOGPROB_THRESHOLD} est celui que le fournisseur lui-même
 * juge peu fiable.
 */

/** En dessous, le SEGMENT est jugé peu fiable par le fournisseur lui-même. */
export const UNCERTAIN_AVG_LOGPROB_THRESHOLD = -0.5

/** Consommé uniquement ici et dans `transcription.client.ts` (même module neutre) — non exporté au-delà. */
type WhisperWord = { word: string; start: number; end: number }
type WhisperSegment = { start: number; end: number; avg_logprob: number }
export type TranscribedWord = { text: string; uncertain: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Le tableau `words` de la réponse `verbose_json` — `[]` si absent ou illisible, jamais deviné. */
export function parseWhisperWords(value: unknown): WhisperWord[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map(entry => ({
      word: typeof entry['word'] === 'string' ? entry['word'] : '',
      start: typeof entry['start'] === 'number' ? entry['start'] : 0,
      end: typeof entry['end'] === 'number' ? entry['end'] : 0,
    }))
    .filter(word => word.word.trim().length > 0)
}

/** Le tableau `segments` de la réponse `verbose_json` — `[]` si absent ou illisible. */
export function parseWhisperSegments(value: unknown): WhisperSegment[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map(entry => ({
    start: typeof entry['start'] === 'number' ? entry['start'] : 0,
    end: typeof entry['end'] === 'number' ? entry['end'] : 0,
    avg_logprob: typeof entry['avg_logprob'] === 'number' ? entry['avg_logprob'] : 0,
  }))
}

/**
 * Chaque mot, marqué `uncertain` selon le segment qui le couvre. Un mot que
 * n'atteint aucun segment (horodatages incohérents, réponse partielle) reste
 * `false` — l'absence de mesure n'est jamais une incertitude devinée.
 */
export function wordsWithUncertainty(
  words: readonly WhisperWord[],
  segments: readonly WhisperSegment[],
): TranscribedWord[] {
  return words.map(word => {
    const mid = (word.start + word.end) / 2
    const segment = segments.find(candidate => mid >= candidate.start && mid <= candidate.end)
    return {
      text: word.word.trim(),
      uncertain: segment !== undefined && segment.avg_logprob < UNCERTAIN_AVG_LOGPROB_THRESHOLD,
    }
  })
}
