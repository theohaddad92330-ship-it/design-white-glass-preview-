import { z } from 'zod'

/**
 * LE MESSAGE VOCAL DE LAURA — ce que le serveur et l'écran se disent (#1939, 12/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un message vocal est une AUTRE FAÇON DE TAPER. Le commercial parle, le serveur
 * transcrit, le texte revient dans la zone de saisie, le commercial le relit, le
 * corrige, et l'envoie lui-même — par le tour ordinaire (`laura-turn.ts`,
 * GA-237), qui applique les mêmes droits, le même plafond quotidien et les mêmes
 * vérifications qu'à un message tapé (#1939.13, #1939.14). Il n'existe AUCUN
 * chemin où l'audio part vers le modèle, ni où la transcription part seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI VIT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les bornes (durée, taille) et les dérivations que les DEUX côtés appliquent —
 * l'enregistreur coupe à la même durée que celle que le serveur refuse. La durée
 * de conservation, elle, est une propriété du STOCKAGE et vit dans `storage.ts`
 * (`CHAT_VOICE_MESSAGE_RETENTION_DAYS`).
 *
 * ⚠️ Aucun nom de fournisseur ici, ni dans aucun message de refus : on nomme la
 * capacité (« la transcription »), jamais l'éditeur.
 */

/** Durée maximale d'un message vocal, en secondes (défaut retenu le 12/09). */
export const CHAT_VOICE_MESSAGE_MAX_SECONDS = 90

/**
 * La gigue d'horloge tolérée au-dessus de la borne. L'enregistreur arrête à 90 s,
 * mais son minuteur rend 90 004 ms, pas 90 000 : refuser ce message-là ferait
 * perdre une question à qui a respecté la règle.
 */
const CHAT_VOICE_DURATION_TOLERANCE_MS = 1000

/**
 * La taille maximale de l'enregistrement, en octets : deux mégaoctets.
 *
 * Quatre-vingt-dix secondes à 160 kbit/s — au-dessus du débit par défaut de
 * l'enregistreur des navigateurs (~128 kbit/s), conteneur compris. C'est la borne
 * que le SERVEUR mesure lui-même : la durée, elle, est déclarée par
 * l'enregistreur (voir {@link chatVoiceDurationRefused}).
 */
export const CHAT_VOICE_MESSAGE_MAX_BYTES = 2 * 1024 * 1024

/**
 * Ce que le CORPS peut porter, en caractères base64 : trois mégaoctets décodés.
 *
 * ⚠️ Volontairement AU-DESSUS de {@link CHAT_VOICE_MESSAGE_MAX_BYTES} : un envoi
 * de 2,5 Mo doit recevoir la phrase du serveur (« au plus 2 Mo »), pas un message
 * de validation générique. La route est montée à 4 Mo de JSON (`main.ts`).
 */
const CHAT_VOICE_BODY_MAX_BASE64_CHARS = Math.ceil((3 * 1024 * 1024) / 3) * 4

/**
 * Cette durée est-elle REFUSÉE ? `true` = oui.
 *
 * ⚠️ La durée est DÉCLARÉE par l'enregistreur : le serveur ne sait pas lire la
 * durée d'un WebM produit par un navigateur (l'en-tête ne la porte souvent pas).
 * Ce qui la borne en dur côté serveur, c'est la TAILLE — mesurée sur les octets.
 */
export function chatVoiceDurationRefused(durationMs: number): boolean {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return true
  return durationMs > CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000 + CHAT_VOICE_DURATION_TOLERANCE_MS
}

/**
 * Le conteneur audio, lu dans les PREMIERS OCTETS. `null` = ce n'est pas un
 * enregistrement que l'on sait ranger.
 *
 * C'est la même règle que le stockage (« l'extension décide, jamais le type
 * déclaré par le navigateur ») transposée à un fichier qui n'a PAS de nom : le
 * type déclaré par l'enregistreur est absent ou approximatif selon le navigateur,
 * et il se forge. Quatre octets suffisent — le contenu, lui, n'est jamais lu.
 *
 *  · WebM / Matroska : `1A 45 DF A3` (en-tête EBML) ;
 *  · Ogg : `OggS` ;
 *  · MP4 : `ftyp` à l'octet 4.
 */
export function sniffChatVoiceContainer(bytes: Uint8Array): 'webm' | 'ogg' | 'mp4' | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm'
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'ogg'
  }
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'mp4'
  }
  return null
}

/**
 * Le corps de `POST /ia/chat/voice/transcribe`. `.strict()` : ni espace, ni
 * utilisateur, ni nom de fichier, ni type — le serveur résout les deux premiers
 * depuis la session et décide les deux derniers sur les octets.
 */
export const chatVoiceTranscribeSchema = z
  .object({
    /** L'enregistrement, encodé en base64 — le chemin de tous les dépôts du produit. */
    audioB64: z.string().min(1).max(CHAT_VOICE_BODY_MAX_BASE64_CHARS),
    /** La durée mesurée par l'enregistreur, en millisecondes. */
    durationMs: z.number().int().positive(),
    /**
     * La langue de l'interface (décision du 12/09 : Laura répond dans la langue
     * des préférences). Passée quand elle est connue : sur un message court, la
     * détection automatique se trompe.
     *
     * #2434.74/.75/.77 — `'auto'` : la personne parle une langue différente de
     * l'interface (accent, mélange français/anglais) — le forçage à la langue de
     * l'interface aurait fait transcrire un anglais correct en pseudo-français.
     * `'auto'` ne se transmet PAS au fournisseur tel quel (ce n'est pas un code
     * ISO qu'il reconnaît) : l'appelant l'omet, Whisper détecte seul
     * (la langue reconnue n’est pas renvoyée).
     */
    language: z.enum(['fr', 'en', 'auto']).optional(),
    /**
     * #2434.33 — le dossier ouvert au moment de la dictée, s'il y en a un. Le
     * serveur RÉSOUT le nom du compte et de ses contacts depuis cet identifiant
     * (portée vérifiée comme toute lecture de dossier) pour orienter la
     * reconnaissance des noms propres — jamais l'inverse : un identifiant hors
     * de portée ou introuvable n'échoue pas la transcription, il ne l'oriente
     * simplement pas (voir `ia-proxy.controller.ts`).
     */
    accountId: z.string().guid().optional(),
  })
  .strict()

/**
 * #2434.74 / #2434.75 / #2434.77 — le port de raffinement de la transcription
 * (accent, bruit ambiant, mélange FR/EN) — voir `voice-refinement.ts` côté API
 * pour la raison complète.
 *
 * #3579 (décision Louis 14/10) — `'robust_model'` : le fournisseur NOMMÉ
 * (Mistral Voxtral) est branché pour l'accent et le bruit — jamais le nom du
 * fournisseur lui-même ici (doctrine : « nos fournisseurs ne se nomment
 * jamais »). `'not_wired'` reste l'état sans lui (ou sans transcription du
 * tout) — un contrat d'API non vérifiable ne se devine pas, et Voxtral
 * n'expose lui-même aucun réglage explicite d'accent/bruit : c'est le MODÈLE
 * qui est robuste, jamais un paramètre deviné côté requête.
 */
export const chatVoiceRefinementStatusSchema = z.object({
  accent: z.enum(['not_wired', 'robust_model']),
  noise: z.enum(['not_wired', 'robust_model']),
  /**
   * #3579 / #2434.77 — `segment_language` : la transcription rend la langue (FR/EN) de chaque
   * segment d'un message qui mélange les deux. `not_wired` : pas de transcription sur ce serveur.
   */
  mixedLanguage: z.enum(['not_wired', 'segment_language']),
})
export type ChatVoiceRefinementStatus = z.infer<typeof chatVoiceRefinementStatusSchema>

/**
 * La capacité, telle que l'écran la lit AVANT d'afficher le micro (#1939.1) :
 * `false` sans clé de transcription, et `false` en salle de démonstration. Un
 * bouton qui échoue au clic est pire qu'un bouton absent.
 */
export const chatVoiceStatusSchema = z.object({
  available: z.boolean(),
  refinements: chatVoiceRefinementStatusSchema,
})
export type ChatVoiceStatus = z.infer<typeof chatVoiceStatusSchema>

/**
 * #2434.40 / #2434.85 — un mot du transcript, marqué INCERTAIN par le
 * fournisseur (`avg_logprob` de son segment, `word-confidence.ts` côté API) —
 * jamais un pourcentage : l'écran souligne le mot, il ne le note pas.
 */
export const chatVoiceWordSchema = z.object({ text: z.string(), uncertain: z.boolean() })
export type ChatVoiceWord = z.infer<typeof chatVoiceWordSchema>

/**
 * Ce que la transcription rend : le texte à RELIRE, et l'enregistrement rangé
 * à rattacher au message quand il sera envoyé. Le texte n'est parti nulle part.
 *
 * La langue que le fournisseur a reconnue n'est PLUS rendue (retour de Louis,
 * 30/09/2026 : l'annoncer à chaque message vocal était du bruit, et plus rien
 * ne la lisait) — le sélecteur de langue à côté du micro dit ce qui est demandé.
 *
 * #2434.40 — `uncertainSegments` : les passages que Whisper a transcrits avec
 * une confiance basse (voir `chatVoiceUncertainSegments`), calculés sur les
 * SEGMENTS bruts. `words` (#2434.85) porte le MÊME verdict, réparti PAR MOT
 * (voir `chatVoiceWordSchema` / `word-confidence.ts` côté API) — les deux
 * viennent de LA MÊME requête `verbose_json` au fournisseur (jamais deux
 * appels payants pour un seul message vocal). `words` reste OPTIONNEL : absent
 * (fournisseur qui ne le rend pas), l'écran ne souligne rien plutôt que de
 * deviner un mot incertain.
 */
/** #3579 — un segment du message et sa langue (`null` = indéterminée, jamais devinée). */
export const chatVoiceSegmentSchema = z.object({
  text: z.string(),
  language: z.enum(['fr', 'en']).nullable(),
})

export const chatVoiceTranscriptionSchema = z.object({
  text: z.string().min(1),
  voiceObjectId: z.string().guid(),
  uncertainSegments: z.array(z.string()),
  words: z.array(chatVoiceWordSchema).optional(),
  /** #3579 / #2434.77 — la langue de chaque segment ; absent si le service ne rend aucun segment. */
  segments: z.array(chatVoiceSegmentSchema).optional(),
})
export type ChatVoiceTranscription = z.infer<typeof chatVoiceTranscriptionSchema>

/**
 * #2434.40 — LE SEUIL DE CONFIANCE, ÉCRIT ET DOCUMENTÉ (Whisper ne rend rien
 * de plus fin qu'un `avg_logprob` PAR SEGMENT — quelques mots à quelques
 * phrases, jamais un mot isolé). Heuristique communément citée pour ce
 * fournisseur : un segment sous -0.5 correspond souvent à un passage bruité,
 * hésitant ou halluciné ; un discours clair reste au-dessus de -0.3. Aucune
 * mesure produit ne permet de l'affiner plus — documenté plutôt que deviné.
 */
export const CHAT_VOICE_LOW_CONFIDENCE_LOG_PROB = -0.5

/**
 * Les segments dont la confiance rendue par le fournisseur est BASSE — le
 * calcul pur derrière `uncertainSegments` ci-dessus. Un
 * segment sans texte ne marque rien (rien à relire).
 */
export function chatVoiceUncertainSegments(
  segments: Array<{ text: string; avgLogprob: number }>,
  threshold: number = CHAT_VOICE_LOW_CONFIDENCE_LOG_PROB,
): string[] {
  return segments
    .filter(segment => segment.avgLogprob < threshold)
    .map(segment => segment.text.trim())
    .filter(text => text.length > 0)
}
