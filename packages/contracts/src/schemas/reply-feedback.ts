import { z } from 'zod'

/**
 * #1919 — DIRE À LAURA QU'UNE RÉPONSE NE VA PAS, ET QUE ÇA COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTRAT À PART, ET PAS `account_feedback.target = chat_reply`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre proposait d'ajouter une cible à `account_feedback`. Vérifié dans
 * le code, trois faits l'excluent :
 *  · `account_feedback.account_id` est NOT NULL (FK `accounts`) — or la plupart
 *    des réponses de Laura sur `/chat` ne portent sur AUCUN compte (« quels
 *    comptes prioriser ? ») : elles ne pourraient pas être notées ;
 *  · ses lecteurs sont des lecteurs d'ÉQUIPE — `directivesFor` réinjecte chaque
 *    ligne dans le plan, la classification et le chat de TOUT l'espace, et
 *    `recomputeScore` recalcule la note sur tout verdict « faux » ;
 *  · or un « pas pertinent » est la mémoire DE LA PERSONNE : il ne doit ni
 *    changer ce que lit un collègue, ni se généraliser (#1919.16).
 * D'où une table voisine (`chat_reply_feedback`), cloisonnée espace + auteur.
 * La correction d'une DONNÉE du dossier, elle, reste une affaire d'équipe et
 * passe par `account_feedback` — le mécanisme existant (#1919.7).
 *
 * Les tokens sont ASCII et stables, comme `account_feedback.verdict` : ils sont
 * écrits en base, l'écran les traduit (`chat:feedback.verdict.*`).
 */

// #1919.1 → .6 — les six retours, dans l'ordre de l'issue.
export const REPLY_FEEDBACK_VERDICTS = [
  'utile',
  'pas_pertinent',
  'donnee_fausse',
  'deja_fait',
  'pas_maintenant',
  'mauvaise_priorite',
] as const
export const replyFeedbackVerdictSchema = z.enum(REPLY_FEEDBACK_VERDICTS)
export type ReplyFeedbackVerdict = z.infer<typeof replyFeedbackVerdictSchema>

// #1919.8 → .13 — les six motifs d'un « pas pertinent ». #1928.7 — « trop long »
// en fin : c'est le motif qui, répété, fait proposer une préférence de réponse.
// Un motif EXPLICITE plutôt qu'un « Autre » dont on chercherait « trop long »
// dans le texte : un détecteur de tournure qui rate ne se voit pas.
// #2444.1 (suite) — RÉFUTÉ en prod (sha 4a4e9e07d) : « Pas pertinent »
// n'offrait que 6 verdicts + 7 sous-motifs = 13 catégories, sous la demande
// « au moins 15 ». La taxonomie de 16 catégories (`REPLY_FEEDBACK_CATEGORIES`
// ci-dessous) reste l'axe INDÉPENDANT posé sous « Autre » (tranché par Louis
// 22/09 soir §1) — elle ne remplace pas ce couplage, elle vit à côté. Cinq
// motifs NOMMÉS, distincts des sept existants et des seize catégories (aucun
// token partagé), AJOUTÉS EN FIN (GA-08) : contrainte SQL élargie AVANT ce
// code (migration `1795999868273`).
export const REPLY_FEEDBACK_REASONS = [
  'mauvais_compte',
  'mauvais_contact',
  'mauvais_timing',
  'hors_positionnement',
  'deja_traite',
  'autre',
  'trop_long',
  'doublon',
  'source_douteuse',
  'contact_parti',
  'concurrent_en_place',
  'budget_insuffisant',
] as const
export const replyFeedbackReasonSchema = z.enum(REPLY_FEEDBACK_REASONS)
export type ReplyFeedbackReason = z.infer<typeof replyFeedbackReasonSchema>

// #2444.1 — la taxonomie de l'issue (16 types) mélange verdict (« faux » existe
// déjà comme `donnee_fausse`), motif de rejet (`reason`, scope `pas_pertinent`)
// et des catégories qui NE SONT PAS des raisons de rejet (bug interface,
// lenteur, coût inattendu, ton…). Ajouter ces dernières comme `reason` casserait
// le couplage `reason` ⇒ `verdict=pas_pertinent` du superRefine ci-dessous.
// Décision : un axe INDÉPENDANT, additif, applicable à N'IMPORTE QUEL verdict —
// jamais un remplacement de `verdict`/`reason` (tranché par Louis 22/09 soir,
// decisions-louis-22-09-soir.md §1 — reco appliquée : nouveau champ `category`
// optionnel sur `chat_reply_feedback`, n'écrase aucun comportement existant).
export const REPLY_FEEDBACK_CATEGORIES = [
  'faux',
  'donnee_ancienne',
  'hors_sujet',
  'trop_generique',
  'mauvaise_action',
  'mauvais_compte',
  'mauvais_contact',
  'permission_incorrecte',
  'fichier_mal_compris',
  'ton',
  'trop_long',
  'manque_capacite',
  'bug_interface',
  'lenteur',
  'cout_inattendu',
  'autre',
] as const
export const replyFeedbackCategorySchema = z.enum(REPLY_FEEDBACK_CATEGORIES)
export type ReplyFeedbackCategory = z.infer<typeof replyFeedbackCategorySchema>

// #1919.7 — le périmètre d'une correction : cette réponse seulement, ou le
// dossier du compte (pour l'équipe, via `account_feedback`).
export const REPLY_FEEDBACK_CORRECTION_SCOPES = ['reply', 'account'] as const
export const replyFeedbackCorrectionScopeSchema = z.enum(REPLY_FEEDBACK_CORRECTION_SCOPES)

/**
 * #1919.14 — l'EMPREINTE d'une réponse de Laura : ce qui relie un retour à sa
 * réponse sans jamais recopier le texte.
 *
 * Calculée à l'identique par l'écran (sur le texte qu'il affiche) et par l'API
 * (sur `chat_messages.content`, pour retrouver l'identifiant du message) : UNE
 * dérivation, ici, jamais deux. Synchrone et sans dépendance — `crypto.subtle`
 * est asynchrone et absent hors contexte sécurisé. Ce n'est PAS une frontière de
 * sécurité (toute lecture est cloisonnée espace + auteur), seulement une clé.
 *
 * ⚠️ Les empreintes sont STOCKÉES : changer ce calcul orphelinerait chaque
 * retour déjà donné. Le test épingle une valeur pour que ça ne se fasse pas en
 * silence.
 */
export function replyDigest(text: string): string {
  const input = text.trim()
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/**
 * Body de `POST /reply-feedback`. Ni `userId` ni `workspaceId` : le contrôleur
 * les dérive du JWT et de l'espace actif. Aucun texte de réponse : l'empreinte
 * suffit à relier (#1919.14). Les champs libres sont bornés — ils finissent
 * cités dans le prompt de la personne.
 */
export const createReplyFeedbackSchema = z
  .object({
    replyDigest: z.string().regex(/^[0-9a-f]{16}$/),
    // #1919.14 — ce que la réponse PORTE, quand elle le porte : le compte de la
    // conversation, le contact et la nature de l'action qu'elle proposait.
    accountId: z.string().guid().nullable().optional(),
    contactId: z.string().guid().nullable().optional(),
    actionKind: z
      .string()
      .regex(/^[a-z_]{1,60}$/)
      .nullable()
      .optional(),
    verdict: replyFeedbackVerdictSchema,
    reason: replyFeedbackReasonSchema.optional(),
    // #2444.1 — indépendant de `verdict`/`reason` : n'importe quel retour peut
    // préciser sa catégorie, sans changer le couplage existant.
    category: replyFeedbackCategorySchema.optional(),
    note: z.string().trim().min(1).max(500).optional(),
    correction: z
      .object({
        field: z.string().trim().min(1).max(300),
        value: z.string().trim().max(1000).optional(),
        scope: replyFeedbackCorrectionScopeSchema,
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.reason && body.verdict !== 'pas_pertinent') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Un motif accompagne « Pas pertinent ».' })
    }
    if (body.note && body.reason !== 'autre') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Un texte libre accompagne le motif « Autre ».',
      })
    }
    // #1919.7 — « Donnée fausse » demande la correction exacte et son périmètre.
    if (body.verdict === 'donnee_fausse' && !body.correction) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correction'], message: 'Dis ce qui est faux.' })
    }
    if (body.verdict !== 'donnee_fausse' && body.correction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correction'],
        message: 'Une correction accompagne « Donnée fausse ».',
      })
    }
    if (body.correction?.scope === 'account' && !body.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'Corriger un dossier suppose un compte.',
      })
    }
  })
export type CreateReplyFeedback = z.infer<typeof createReplyFeedbackSchema>

/** Un retour tel que l'écran le relit — ni `user_id`, ni `workspace_id`, ni texte. */
export const replyFeedbackItemSchema = z.object({
  id: z.string().guid(),
  replyDigest: z.string(),
  verdict: replyFeedbackVerdictSchema,
  reason: replyFeedbackReasonSchema.nullable(),
  category: replyFeedbackCategorySchema.nullable(),
  // #1919.7 — la correction a-t-elle aussi été portée au dossier du compte ?
  accountCorrected: z.boolean(),
  createdAt: z.string(),
})
export type ReplyFeedbackItem = z.infer<typeof replyFeedbackItemSchema>

/**
 * L'accusé de `POST /reply-feedback` (#1919.17).
 *
 * #1928.7 — `preferenceSuggestion` n'est posé que lorsque la MÊME personne a
 * signalé « trop long » sur au moins trois réponses distinctes : un refus unique
 * ne devient pas une préférence (#1919.16).
 */
export const replyFeedbackAckSchema = z.object({
  item: replyFeedbackItemSchema,
  preferenceSuggestion: z.object({ kind: z.literal('shorter_replies'), count: z.number().int().min(1) }).nullable(),
})
export type ReplyFeedbackAck = z.infer<typeof replyFeedbackAckSchema>
