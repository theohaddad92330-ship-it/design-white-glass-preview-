import { Logger } from '@nestjs/common'
import { EmptyTranscriptionError, type TranscriptionDetail } from './transcription.client'

/**
 * #3579 (décision Louis 14/10, QCM) — LE FOURNISSEUR DE TRANSCRIPTION POUR
 * L'ACCENT ET LE BRUIT (#2434.74 / #2434.75) : Mistral Voxtral.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONTRAT SUIVI, ET RIEN QUE LUI
 * ─────────────────────────────────────────────────────────────────────────────
 * `POST https://api.mistral.ai/v1/audio/transcriptions`, documenté par Mistral
 * (docs.mistral.ai/api/endpoint/audio/transcriptions, vérifié le 14/10/2026) :
 *  - authentification `Authorization: Bearer <clé>` ;
 *  - requête avec `model` (`voxtral-mini-latest`) et `file` (l'enregistrement),
 *    `language` en option (code ISO, « peut améliorer la précision ») ;
 *  - réponse `{ text, language, model, segments, usage }`, dont `usage` porte
 *    `prompt_audio_seconds` (exemple documenté).
 *
 * ⚠️ CE QUI N'EST PAS VÉRIFIABLE DEPUIS CETTE DOC, DONC PAS DEVINÉ ICI : la
 * forme de chaque entrée de `segments` (`TranscriptionSegmentChunk`) n'est
 * documentée NULLE PART sur la page suivie, ni dans l'OpenAPI (page tronquée
 * au-delà de 100 000 caractères à la lecture) — aucun horodatage, aucun champ
 * de confiance par mot n'y figure. Un contrat d'API non vérifiable ne se
 * devine pas (`agent_docs/doctrine.md`) : ce client lit UNIQUEMENT `text`,
 * `language` et `usage.prompt_audio_seconds`, les trois seuls champs donnés
 * avec un exemple sur la page suivie. `segments`/`words` sortent donc
 * TOUJOURS vides de ce client — jamais un score ou un horodatage inventé —
 * contrairement au contrat OpenAI que suit `transcription.client.ts`
 * (`verbose_json`, qui documente lui `avg_logprob` par segment).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS CLÉ, NO-OP STRICT
 * ─────────────────────────────────────────────────────────────────────────────
 * `readVoxtralConfig` rend `null` sans `OCR_API_KEY` — aucune de ces
 * fonctions n'est alors appelée par `ia-proxy.controller.ts` : zéro appel
 * réseau, chemin byte-identique à avant ce lot (clé absente en production au
 * 14/10/2026).
 */

const VOXTRAL_URL = 'https://api.mistral.ai/v1/audio/transcriptions'
const VOXTRAL_MODEL = 'voxtral-mini-latest'

const logger = new Logger('VoxtralClient')

type VoxtralConfig = { url: string; apiKey: string; model: string }

/** La configuration, ou `null` quand `OCR_API_KEY` est absente — la capacité n'existe pas. */
export function readVoxtralConfig(): VoxtralConfig | null {
  const apiKey = process.env['OCR_API_KEY']?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    url: process.env['MISTRAL_API_URL']?.trim() || VOXTRAL_URL,
    model: process.env['MISTRAL_VOXTRAL_MODEL']?.trim() || VOXTRAL_MODEL,
  }
}

/**
 * LOT (15/10) DATA-C — `context_bias`, relu le 15/10/2026 (docs.mistral.ai,
 * « Offline transcription ») : « up to 100 words or phrases to guide the model
 * toward correct spellings of names, technical terms ». Envoyé en champ
 * multipart RÉPÉTÉ — la forme du SDK officiel `mistralai` 3.2.0
 * (`serialize_multipart_form` : une liste = le même nom répété). Doc : optimisé
 * pour l'anglais, « expérimental » ailleurs — un terme mal servi coûte au pire
 * la transcription d'avant, jamais un mot inventé.
 *
 * Délibérément PAS ici : `timestamp_granularities`. La même page : « currently
 * not compatible with `language`, please use either one or the other » — or
 * l'appelant passe la langue choisie (précision), et aucun écran ne lit
 * d'horodatage. Le score de segment Voxtral (`score`) n'est pas un
 * `avg_logprob` : il ne remplit pas `segments`.
 */
const CONTEXT_BIAS_MAX_TERMS = 100

function contextBiasTerms(raw: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  for (const term of raw ?? []) {
    const clean = term.trim()
    if (clean && !seen.has(clean)) seen.add(clean)
    if (seen.size >= CONTEXT_BIAS_MAX_TERMS) break
  }
  return [...seen]
}

type VoxtralInput = { audio: Buffer; filename: string; language?: string; contextBias?: readonly string[] }

/**
 * Transcrit un enregistrement via Voxtral, au contrat VÉRIFIÉ seulement.
 *
 * Rend la MÊME forme que {@link transcribeAudioDetailed} (`transcription.client.ts`)
 * pour rester interchangeable à l'appelant : `segments: []` et `words: []`
 * (non documentés par ce fournisseur, jamais devinés) laissent
 * `chatVoiceUncertainSegments` et le verdict par mot honnêtement muets sur
 * cette voie — jamais un score inventé. `durationSeconds` vient de
 * `usage.prompt_audio_seconds` (documenté) ; absent ou illisible → `null`,
 * jamais `0` (une ligne de coût non tarifée, pas gratuite).
 *
 * Jamais de clé côté client : cette fonction ne tourne QUE côté serveur
 * (`apps/api`), `config.apiKey` vient de `readVoxtralConfig()`, lu depuis
 * l'environnement du serveur. `res.ok` est vérifié avant toute lecture du
 * corps — un refus HTTP lève, jamais un texte deviné.
 */
export async function transcribeWithVoxtral(config: VoxtralConfig, input: VoxtralInput): Promise<TranscriptionDetail> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(input.audio)]), input.filename)
  form.append('model', config.model)
  if (input.language) form.append('language', input.language)
  for (const term of contextBiasTerms(input.contextBias)) form.append('context_bias', term)

  const res = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string }
      detail = body?.message || detail
    } catch {
      // Le corps n'est pas du JSON : le code de statut suffit.
    }
    logger.warn(`Transcription Voxtral refusée par le service : ${detail}`)
    throw new Error(`Transcription impossible : ${detail}`)
  }

  const data = (await res.json()) as Record<string, unknown>
  const text = typeof data['text'] === 'string' ? (data['text'] as string).trim() : ''
  if (!text) throw new EmptyTranscriptionError()
  const language =
    typeof data['language'] === 'string' && (data['language'] as string).trim()
      ? (data['language'] as string).trim()
      : null
  const usage = data['usage']
  const promptAudioSeconds =
    usage && typeof usage === 'object' ? (usage as Record<string, unknown>)['prompt_audio_seconds'] : null
  const durationSeconds =
    typeof promptAudioSeconds === 'number' && Number.isFinite(promptAudioSeconds) ? promptAudioSeconds : null

  return { text, language, segments: [], words: [], durationSeconds }
}
