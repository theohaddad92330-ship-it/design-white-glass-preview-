import { z } from 'zod'

/**
 * Téléphonie — journal d'appels et, quand l'espace l'a explicitement autorisé,
 * transcriptions déjà produites par l'outil.
 *
 * Huit contributeurs de l'audit terrain citent Aircall, Ringover ou Modjo. Ce
 * qu'ils demandent n'est pas « enregistrer mes appels » : c'est « que l'appel
 * finisse dans le CRM sans que je le ressaisisse » (§5.1 « l'absence de traces
 * après les appels empêche un pilotage fiable ») et « prépare mon prochain call
 * avec l'historique » (§14 requête n°37).
 *
 * Bellum ne transcrit RIEN lui-même. Il lit ce que l'outil de téléphonie a déjà
 * produit, et seulement si l'espace a coché la case : enregistrer et transcrire
 * une conversation engage le consentement des DEUX parties, et cette décision
 * appartient à l'ESN, pas à nous.
 */

export const telephonyProviderSchema = z.enum(['aircall', 'ringover', 'allo'])

export type TelephonyProvider = z.infer<typeof telephonyProviderSchema>

export const telephonyStatusSchema = z.object({
  connected: z.boolean(),
  provider: telephonyProviderSchema.nullable(),
  connectedAt: z.string().nullable(),
  /** L'espace a-t-il autorisé la lecture des transcriptions ? Défaut : non. */
  transcriptsEnabled: z.boolean(),
  /**
   * #4016 L12 — l'ESN a-t-elle DÉCLARÉ que l'enregistrement est annoncé aux
   * deux parties au début de l'appel ? Sans cette déclaration, aucun appel n'est
   * analysé (art. 226-1 du Code pénal). Défaut : non.
   */
  recordingConsentAnnounced: z.boolean(),
})

export type TelephonyStatus = z.infer<typeof telephonyStatusSchema>

export const telephonyCredentialsSchema = z
  .object({
    provider: telephonyProviderSchema,
    /** Aircall : l'identifiant d'API. Ringover et Allo ne l'utilisent pas. */
    apiId: z.string().trim().min(1).max(200).optional(),
    /** Le jeton (Aircall), la clé d'API (Ringover) ou la clé d'API (Allo,
     *  ``Authorization: <clé>``, sans préfixe — vérifié sur la spécification
     *  publique de l'API le 28/09/2026, `help.withallo.com`). */
    apiKey: z.string().trim().min(1).max(500),
    /** Allo UNIQUEMENT : `GET /calls` exige un `allo_number` (E.164) — Allo
     *  liste le journal d'UN numéro, contrairement à Aircall/Ringover qui
     *  rendent tout le standard. Aucun repli : deviner un numéro afficherait
     *  le journal d'une autre ligne que celle voulue. */
    alloNumber: z.string().trim().min(1).max(32).optional(),
    /** Lecture des transcriptions déjà produites par l'outil. Défaut : non. */
    transcriptsEnabled: z.boolean().default(false),
    /** #4016 L12 — déclaration que l'enregistrement est annoncé. Défaut : non. */
    recordingConsentAnnounced: z.boolean().default(false),
  })
  .strict()
  .refine(value => value.provider !== 'aircall' || Boolean(value.apiId), {
    message: "Aircall demande un identifiant d'API en plus du jeton",
  })
  .refine(value => value.provider !== 'allo' || Boolean(value.alloNumber), {
    message: 'Allo demande le numéro (E.164) dont lire le journal',
  })

export type TelephonyCredentials = z.infer<typeof telephonyCredentialsSchema>

/**
 * Un appel, normalisé. Tout ce qui n'est pas lisible chez le fournisseur vaut
 * `null` — jamais une valeur de remplissage. Un appel sans durée n'a pas duré
 * zéro seconde : on ne sait pas combien il a duré.
 */
export const callRecordSchema = z.object({
  id: z.string(),
  provider: telephonyProviderSchema,
  direction: z.enum(['inbound', 'outbound', 'unknown']),
  /** Le numéro de l'interlocuteur, tel que le fournisseur le rend. */
  counterpartNumber: z.string().nullable(),
  counterpartName: z.string().nullable(),
  counterpartEmail: z.string().nullable(),
  /** Le collaborateur de l'ESN qui a passé ou reçu l'appel. */
  agentName: z.string().nullable(),
  startedAt: z.string().nullable(),
  /** Secondes. `null` quand le fournisseur ne le dit pas. */
  durationSeconds: z.number().nullable(),
  /** `true` décroché, `false` manqué, `null` quand l'état est illisible. */
  answered: z.boolean().nullable(),
  /** Présente uniquement quand l'espace a autorisé les transcriptions ET que
   *  l'outil en a produit une. */
  transcript: z.string().nullable(),
})

export type CallRecord = z.infer<typeof callRecordSchema>

/**
 * #4016 L12 (Louis 11/10) — POURQUOI UN APPEL N'EST PAS ANALYSÉ, ou `null`.
 *
 * Renversement daté de GA-399 (« enregistrement avec consentement seulement ») :
 * l'analyse d'appels enregistrés est permise, mais derrière DEUX cases que
 * l'espace coche lui-même — lire les transcriptions, ET déclarer que
 * l'enregistrement est annoncé aux deux parties. La seconde l'emporte dans le
 * motif : c'est la question légale, pas la préférence produit.
 */
export function callAnalysisRefusal(status: {
  transcriptsEnabled: boolean
  recordingConsentAnnounced: boolean
}): 'consent_not_announced' | 'transcripts_disabled' | null {
  if (!status.recordingConsentAnnounced) return 'consent_not_announced'
  if (!status.transcriptsEnabled) return 'transcripts_disabled'
  return null
}

/**
 * L'analyse d'UN appel — calculée à la demande, jamais stockée : le corps d'une
 * conversation ne s'archive pas dans Bellum. Chaque champ vient du modèle sur le
 * texte de la transcription ; rien n'est complété.
 */
export const callAnalysisSchema = z.object({
  callId: z.string(),
  summary: z.string(),
  decisions: z.array(z.string()),
  nextSteps: z.array(z.object({ action: z.string(), owner: z.string(), due: z.string() })),
  openQuestions: z.array(z.string()),
  /** Objections, besoins, signaux d'achat entendus — dans les mots de l'appel. */
  signals: z.array(z.string()),
})

export type CallAnalysis = z.infer<typeof callAnalysisSchema>

/** Le résultat d'un versement d'appels au CRM : ce qui est journalisé, et
 *  pourquoi le reste ne l'est pas. */
export const callLogOutcomeSchema = z.object({
  logged: z.number().int().nonnegative(),
  skipped: z.array(z.object({ callId: z.string(), reason: z.string() })),
})

export type CallLogOutcome = z.infer<typeof callLogOutcomeSchema>

/**
 * #2403.12 — LA SOURCE « APPEL EN COURS », GÉNÉRIQUE ET SIGNÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'ÉTAIT PAS CODABLE AVANT CE LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * #2403.13 a déjà livré « aucune intervention pendant une réunion CONNUE » en
 * lisant l'agenda déjà synchronisé — parce qu'à l'époque, ce dépôt n'avait
 * AUCUNE source d'état LIVE pour un appel. Ce type EST cette source : un
 * webhook entrant, générique (BellumAI définit son propre petit contrat —
 * `event`/`userId`/`callId` — plutôt que d'adapter le format propriétaire d'un
 * outil nommé), signé par le secret propre à l'espace
 * (`TelephonyConnectionEntity.webhook_secret_enc`), jamais par une clé
 * globale : deux espaces ne peuvent pas se signer l'état d'appel l'un de
 * l'autre.
 *
 * `.strict()` : un champ de plus glissé par l'appelant (nom du fournisseur,
 * numéro de téléphone, transcription) ne traverse pas — ce webhook ne porte
 * qu'un ÉTAT, jamais une donnée d'appel.
 */
export const callStateEventSchema = z
  .object({
    event: z.enum(['call.started', 'call.ended']),
    /** Le membre de l'espace concerné — l'état se pose PAR UTILISATEUR. */
    userId: z.string().guid(),
    /** L'identifiant d'appel côté outil — sert seulement à l'idempotence du log, jamais affiché. */
    callId: z.string().trim().min(1).max(200),
  })
  .strict()

export type CallStateEvent = z.infer<typeof callStateEventSchema>

/**
 * L'état posé par le webhook, avec son expiration.
 *
 * `in_progress` a TOUJOURS une expiration : un `call.ended` perdu (webhook non
 * livré, outil en panne) ne doit pas couper Laura indéfiniment — un timeout
 * n'est pas un échec, mais il n'est pas non plus une raison de se taire pour
 * toujours (même doctrine que `unknown arrête la reprise`, appliquée à la
 * DURÉE plutôt qu'au statut).
 */
export const callInProgressStateSchema = z.enum(['in_progress', 'terminated'])

export type CallInProgressState = z.infer<typeof callInProgressStateSchema>
