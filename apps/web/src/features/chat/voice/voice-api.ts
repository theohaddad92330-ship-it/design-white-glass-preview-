import {
  chatVoiceStatusSchema,
  chatVoiceTranscriptionSchema,
  signedDownloadSchema,
  type ChatVoiceRefinementStatus,
  type ChatVoiceTranscription,
  type SignedDownload,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #1939 — LE CLIENT DES ROUTES VOCALES DU LOT 9.1.
 *
 * Trois lectures et une écriture, et AUCUNE ne parle au modèle : transcrire rend
 * un texte à relire, et c'est le tour ordinaire (`laura-turn.ts`, GA-237) qui
 * enverra la question — avec l'enregistrement rattaché par la persistance
 * existante (`createAgentChatMessage`), jamais par une porte parallèle (#1939.14).
 *
 * Les réponses sont REVALIDÉES contre le contrat : un texte vide ou un
 * identifiant qui n'en est pas un rejette plutôt que d'atterrir dans la saisie.
 */

/**
 * #1939.1 — la capacité, lue AVANT d'afficher le micro. `false` sur toute
 * réponse illisible ou toute panne : sans certitude, pas de bouton.
 */
export async function fetchVoiceStatus(): Promise<boolean> {
  try {
    const parsed = chatVoiceStatusSchema.safeParse(await apiFetch<unknown>({ path: '/ia/chat/voice/status' }))
    return parsed.success && parsed.data.available
  } catch {
    return false
  }
}

/**
 * #3579.3b — l'état LIVE des raffinements (accent, bruit, mélange FR/EN), lu
 * pour la notice du micro : elle dit ce que le serveur a branché, pas une
 * phrase figée. `null` sur toute réponse illisible ou panne — jamais un état
 * deviné (la notice garde alors sa mention prudente).
 */
export async function fetchVoiceRefinements(): Promise<ChatVoiceRefinementStatus | null> {
  try {
    const parsed = chatVoiceStatusSchema.safeParse(await apiFetch<unknown>({ path: '/ia/chat/voice/status' }))
    return parsed.success ? parsed.data.refinements : null
  } catch {
    return null
  }
}

/**
 * Transcrire un enregistrement. Le corps est celui du schéma `.strict()` du
 * serveur, rien de plus : ni espace, ni utilisateur, ni nom de fichier, ni type.
 */
export async function transcribeVoiceMessage(args: {
  audioB64: string
  durationMs: number
  /** #2434.74/.75/.77 — `'auto'` : la personne parle une autre langue que
   *  l'interface (accent, mélange français/anglais) — Whisper détecte seul,
   *  le serveur ne renvoie pas la langue reconnue. */
  language: 'fr' | 'en' | 'auto'
  /** #2434.33 — le dossier ouvert au moment de la dictée, pour orienter la
   *  reconnaissance des noms propres. `null` = aucun dossier ouvert. */
  accountId?: string | null
}): Promise<ChatVoiceTranscription> {
  const body = {
    audioB64: args.audioB64,
    // Le schéma serveur veut des millisecondes ENTIÈRES et positives.
    durationMs: Math.max(1, Math.round(args.durationMs)),
    language: args.language,
    ...(args.accountId ? { accountId: args.accountId } : {}),
  }
  const response = await apiFetch<unknown, typeof body>({ path: '/ia/chat/voice/transcribe', method: 'POST', body })
  return chatVoiceTranscriptionSchema.parse(response)
}

/**
 * 9.3 — l'URL signée (cinq minutes) de l'enregistrement d'un message, lue avec
 * la même portée que le texte du fil. Demandée au clic, jamais mise en cache.
 */
export async function fetchVoicePlayback(messageId: string): Promise<SignedDownload> {
  const response = await apiFetch<unknown>({ path: `/ia/chat/messages/${encodeURIComponent(messageId)}/voice` })
  return signedDownloadSchema.parse(response)
}
