import { Logger } from '@nestjs/common'
import { parseWhisperSegments, parseWhisperWords, wordsWithUncertainty, type TranscribedWord } from './word-confidence'
import { collapseRepeatedTranscript } from './transcript-repeat'

/**
 * La transcription d'un enregistrement déposé par l'utilisateur.
 *
 * #1939.14 — MODULE NEUTRE (12/09/2026). Ce client vivait dans `meeting-notes/`
 * alors qu'il ne sait rien d'un rendez-vous : il transcrit des octets. Il sert
 * désormais DEUX gestes, sans appartenir à aucun — le compte rendu de rendez-vous
 * (`meeting-notes.service.ts`) et le message vocal de Laura
 * (`ia-proxy.controller.ts`, `POST /ia/chat/voice/transcribe`). Il n'importe rien
 * d'un écran, et c'est `transcription.client.spec.ts` qui le tient.
 *
 * Arbitrage Louis du 03/08 : « upload audio → transcription → compte rendu ». La
 * question du consentement se règle par la nature du geste — c'est SON
 * enregistrement, qu'il dépose lui-même, contrairement à l'ingestion de
 * transcriptions d'appels où l'ESN doit cocher une case pour l'ensemble de ses
 * lignes.
 *
 * **Sans clé, no-op strict** : la capacité est déclarée `false`, l'écran le dit,
 * et aucune requête ne part. On ne rend jamais une transcription vide qui se
 * lirait « l'enregistrement était silencieux ».
 *
 * Le contrat suivi est celui d'OpenAI (`POST /v1/audio/transcriptions`,
 * multipart `file` + `model`), que tout le monde réimplémente — d'où l'URL
 * surchargeable : un opérateur qui héberge son propre Whisper pointe dessus sans
 * redéploiement, comme pour les embeddings du RAG.
 */

const DEFAULT_URL = 'https://api.openai.com/v1/audio/transcriptions'
const DEFAULT_MODEL = 'whisper-1'

/** Borne dure, alignée sur celle du fournisseur. Au-delà, le refus est
 *  IMMÉDIAT et explicite : envoyer 40 Mo pour se faire jeter au bout de deux
 *  minutes est la pire des réponses. */
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024

const logger = new Logger('TranscriptionClient')

/**
 * #1939 — le service a répondu, et n'a RIEN entendu.
 *
 * Une classe à part, et pas un message à comparer : « rien entendu » appelle
 * « rapproche-toi du micro », « le service est tombé » appelle « réessaie ». Les
 * confondre ferait redemander la même chose dans les deux cas. Le message est
 * celui d'avant le déplacement, mot pour mot — le compte rendu de rendez-vous le
 * remontait déjà tel quel.
 */
export class EmptyTranscriptionError extends Error {
  constructor() {
    super('Le service de transcription n’a rendu aucun texte.')
    this.name = 'EmptyTranscriptionError'
  }
}

type TranscriptionConfig = { url: string; apiKey: string; model: string }

/** #2434.40 — un SEGMENT (quelques mots à quelques phrases), jamais un mot. */
type TranscriptionSegment = { text: string; avgLogprob: number }

/**
 * #2434.40 / #2434.74-.77 / #2434.85 — ce que `verbose_json` (avec
 * `timestamp_granularities: ['word']`) rend en plus du texte : la langue
 * DÉTECTÉE par le fournisseur, les segments avec leur confiance, et le VERDICT
 * PAR MOT dérivé des mêmes segments (`words`, voir `word-confidence.ts`). Une
 * SEULE requête verbose_json couvre les trois — jamais deux appels payants
 * pour un seul message vocal.
 *
 * Exporté (#3579) : `voxtral.client.ts` rend la MÊME forme pour rester
 * interchangeable à l'appelant — `segments`/`words` vides quand le
 * fournisseur ne les documente pas, jamais devinés.
 */
export type TranscriptionDetail = {
  text: string
  /** `null` = le fournisseur ne l'a pas rendue. */
  language: string | null
  segments: TranscriptionSegment[]
  words: TranscribedWord[]
  /** #3579 — durée audio rendue par le service (secondes) ; `null` = non rendue (coût non tarifé). */
  durationSeconds: number | null
}

/** La configuration, ou `null` quand la fonctionnalité n'est pas activée. */
export function readTranscriptionConfig(): TranscriptionConfig | null {
  const apiKey = process.env['TRANSCRIPTION_API_KEY']?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    url: process.env['TRANSCRIPTION_API_URL']?.trim() || DEFAULT_URL,
    model: process.env['TRANSCRIPTION_MODEL']?.trim() || DEFAULT_MODEL,
  }
}

type TranscriptionInput = { audio: Buffer; filename: string; language?: string; prompt?: string }

function buildTranscriptionForm(
  config: TranscriptionConfig,
  input: TranscriptionInput,
  responseFormat: 'json' | 'verbose_json',
): FormData {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(input.audio)]), input.filename)
  form.append('model', config.model)
  // La langue est passée quand on la connaît : sur des notes courtes, la
  // détection automatique se trompe et rend un texte en anglais approximatif.
  // #2434.74/.75/.77 — l'APPELANT résout déjà `'auto'` en absence de champ
  // (ce client ne connaît pas la valeur `'auto'`, propre à l'écran de Laura) :
  // ce module reste neutre, comme le biais de vocabulaire ci-dessous.
  if (input.language) form.append('language', input.language)
  // #2434.34 / #2434.35 / #2434.36 / #2434.37 / #2434.38 — un biais de
  // vocabulaire (contrat OpenAI `prompt`), fourni par l'APPELANT : ce module
  // reste neutre (aucun jargon métier ici, voir `transcription.client.spec.ts`
  // « le déplacement »), c'est `ia-proxy.controller.ts` qui connaît le domaine
  // ESN et le compose. Sans biais fourni (compte rendu de rendez-vous), rien
  // ne change.
  if (input.prompt) form.append('prompt', input.prompt)
  // #2434.40 / #2434.74-.77 — `verbose_json` (et non `json`) : c'est le seul
  // format où le fournisseur rend la langue détectée et les segments avec leur
  // `avg_logprob`. Superset de `json` : `text` y est toujours présent.
  form.append('response_format', responseFormat)
  return form
}

async function postTranscription(config: TranscriptionConfig, form: FormData): Promise<Record<string, unknown>> {
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      detail = body?.error?.message || detail
    } catch {
      // Le corps n'est pas du JSON : le code de statut suffit.
    }
    logger.warn(`Transcription refusée par le service : ${detail}`)
    throw new Error(`Transcription impossible : ${detail}`)
  }

  return (await res.json()) as Record<string, unknown>
}

/**
 * Transcrit un enregistrement, texte seul — la forme qu'utilisait déjà le
 * compte rendu de rendez-vous (`meeting-notes.service.ts`), inchangée. `json`
 * (et non `verbose_json`) : ce chemin n'a besoin ni de la langue détectée, ni
 * des segments, ni du verdict par mot — {@link transcribeAudioDetailed} porte
 * ces trois-là pour l'appelant qui en a besoin (le message vocal de Laura).
 */
export async function transcribeAudio(config: TranscriptionConfig, input: TranscriptionInput): Promise<string> {
  const data = await postTranscription(config, buildTranscriptionForm(config, input, 'json'))
  const text = typeof data?.['text'] === 'string' ? (data['text'] as string).trim() : ''
  if (!text) throw new EmptyTranscriptionError()
  return text
}

/**
 * Transcrit un enregistrement et rend le DÉTAIL complet — texte, langue
 * détectée par le fournisseur, segments avec leur confiance, ET le verdict par
 * mot (#2434.40 / #2434.74-.77 / #2434.85). Une SEULE requête `verbose_json` +
 * `timestamp_granularities: ['word']` : le fournisseur y rend la langue, les
 * segments ET les horodatages par mot dans la MÊME réponse — jamais deux
 * appels payants pour un seul message vocal (voir `ia-proxy.controller.ts`,
 * `POST /ia/chat/voice/transcribe`, seul appelant).
 *
 * Lève une erreur nommée sur tout échec — l'appelant la remonte telle quelle.
 * Une transcription ratée doit se voir : c'est la seule chose qui distingue
 * « la réunion n'a rien donné » de « le service est tombé ».
 */
export async function transcribeAudioDetailed(
  config: TranscriptionConfig,
  input: TranscriptionInput,
): Promise<TranscriptionDetail> {
  const form = buildTranscriptionForm(config, input, 'verbose_json')
  // Contrat OpenAI `verbose_json` : sans ce paramètre, la réponse ne porte que
  // les segments, jamais le tableau `words` par mot.
  form.append('timestamp_granularities[]', 'word')
  const data = await postTranscription(config, form)
  const text = typeof data?.['text'] === 'string' ? (data['text'] as string).trim() : ''
  if (!text) throw new EmptyTranscriptionError()
  const language =
    typeof data?.['language'] === 'string' && (data['language'] as string).trim()
      ? (data['language'] as string).trim()
      : null
  const rawSegments = data['segments']
  const segments: TranscriptionSegment[] = Array.isArray(rawSegments)
    ? rawSegments
        .filter(
          (segment): segment is { text: string; avg_logprob: number } =>
            typeof segment?.text === 'string' && typeof segment?.avg_logprob === 'number',
        )
        .map(segment => ({ text: segment.text, avgLogprob: segment.avg_logprob }))
    : []
  const words = wordsWithUncertainty(parseWhisperWords(data['words']), parseWhisperSegments(data['segments']))
  const duration = data['duration']
  const durationSeconds = typeof duration === 'number' && Number.isFinite(duration) ? duration : null
  // #3457 — la phrase rendue deux fois de suite ne s'écrit qu'une fois ; le
  // verdict par mot suit (premier exemplaire), ou se tait s'il ne se découpe pas
  // proprement : « non mesuré » plutôt qu'un verdict décalé.
  const { text: spoken, copies } = collapseRepeatedTranscript(text)
  if (copies > 1) {
    const keep = words.length % copies === 0 ? words.length / copies : 0
    return { text: spoken, language, segments, words: words.slice(0, keep), durationSeconds }
  }
  return { text, language, segments, words, durationSeconds }
}
