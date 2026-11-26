/**
 * #2434.74 / #2434.75 / #2434.77 — LE PORT DE RAFFINEMENT DE LA TRANSCRIPTION,
 * NOMMÉ NON BRANCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE TRI DU 24/09 A TROUVÉ, ET CE QU'ON N'EN FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois points demandaient une transcription plus fine sur l'accent, le bruit
 * ambiant, et le mélange FR/EN : `chatVoiceTranscribeSchema` (`chat-voice.ts`)
 * ne porte aucun de ces trois réglages, parce que le fournisseur suivi
 * (`transcription.client.ts`, contrat OpenAI `POST /v1/audio/transcriptions`)
 * n'expose RIEN de tel en entrée — ni paramètre d'accent, ni de bruit, ni de
 * mode bilingue. Les DEVINER (envoyer un champ que le fournisseur ignorera
 * silencieusement, ou pire, qui ferait échouer la requête selon les versions)
 * serait deviner un contrat d'API non vérifiable — refusé par doctrine
 * (`agent_docs/doctrine.md:34`, « un contrat d'API non vérifiable ne se
 * devine pas »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VARIANTE CONFORME : NOMMER LE PORT, PAS LE FOURNISSEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne parle à AUCUN service — c'est le PORT que remplirait un jour un
 * fournisseur DÉDIÉ à ce raffinement (une classification d'accent, une
 * détection de bruit, un routage bilingue), le jour où un tel fournisseur
 * existe et se vérifie — même discipline que `RetainedInvoiceConnectorPort`
 * avant l'arrivée d'un adaptateur réel. Rien n'y est configurable aujourd'hui :
 * une variable d'environnement qui ne servirait aucun code appelant serait un
 * réglage mort, pas un port. Le statut est donc un LITTÉRAL, jamais calculé —
 * `voiceStatus()` (`ia-proxy.controller.ts`) le rend tel quel, et l'écran
 * (`VoiceInput.tsx`, notice avant la première activation) le NOMME plutôt que
 * de laisser la question ouverte ou de prétendre à une précision qui n'existe
 * pas. « Non branché » n'est pas un échec à corriger dans ce lot : c'est l'état
 * honnête tant qu'aucun fournisseur vérifiable n'est branché ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #3579 (décision Louis 14/10, QCM) — LE PORT EST ENFIN REMPLI, PAR SEGMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Fournisseur nommé : Mistral Voxtral (`voxtral.client.ts`), au contrat
 * VÉRIFIÉ seul (`text`, `language`, `usage.prompt_audio_seconds` — rien
 * d'autre, voir le docblock de ce client). Voxtral n'expose lui-même AUCUN
 * réglage explicite d'accent ou de bruit : c'est le MODÈLE qui est robuste à
 * ces deux axes, jamais un paramètre qu'on devinerait côté requête — d'où
 * `'robust_model'`, qui NOMME la capacité, jamais le fournisseur (doctrine :
 * « nos fournisseurs ne se nomment jamais »).
 *
 * Le bascule exige les DEUX : la transcription elle-même branchée
 * (`transcriptionWired`, `readTranscriptionConfig()`) ET Voxtral configuré
 * (`voxtralWired`, `readVoxtralConfig()`) — Voxtral ne s'ajoute qu'À une
 * capacité déjà active, il ne l'allume jamais seul. Sans `OCR_API_KEY`
 * (absente en production au 14/10/2026) : `voxtralWired` vaut toujours
 * `false`, donc `accent`/`noise` restent `not_wired` — chemin byte-identique
 * à avant ce lot (no-op strict).
 */

/** Consommé uniquement ici — la forme équivalente côté contrat est `ChatVoiceRefinementStatus` (`chat-voice.ts`). */
type ChatVoiceRefinementStatus = {
  /** #2434.74 — reconnaissance affinée d'un accent régional ou étranger. */
  accent: 'not_wired' | 'robust_model'
  /** #2434.75 — atténuation ou signalement d'un bruit ambiant important. */
  noise: 'not_wired' | 'robust_model'
  /**
   * #2434.77 / #3579 — mélange FR/EN : la langue de chaque segment est rendue
   * (`segment-language.ts`) dès que la transcription est branchée.
   */
  mixedLanguage: 'not_wired' | 'segment_language'
}

/**
 * Mélange FR/EN : branché avec la transcription (`transcriptionWired`).
 * Accent et bruit (#3579) : branchés quand la transcription ET Voxtral
 * (`voxtralWired`) le sont — jamais Voxtral seul (voir le docblock ci-dessus).
 */
export function voiceRefinementStatus(transcriptionWired = false, voxtralWired = false): ChatVoiceRefinementStatus {
  const accentAndNoiseWired = transcriptionWired && voxtralWired
  return {
    accent: accentAndNoiseWired ? 'robust_model' : 'not_wired',
    noise: accentAndNoiseWired ? 'robust_model' : 'not_wired',
    mixedLanguage: transcriptionWired ? 'segment_language' : 'not_wired',
  }
}
