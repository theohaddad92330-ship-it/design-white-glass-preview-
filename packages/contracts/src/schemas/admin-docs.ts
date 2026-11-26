import { z } from 'zod'

/**
 * Administratif : signatures en attente et factures impayées (§5.9 du rapport
 * besoins, déclencheurs n°11 et n°12).
 *
 * Décision Louis du 03/08 : « lecture + envoi à signature après approbation ».
 * Bellum ne signe rien, ne paie rien et ne stocke aucun IBAN. Il regarde ce qui
 * traîne et le dit — ce qui est exactement ce que les deux routines `contrats à
 * signer` et `factures en souffrance` promettaient sans avoir de source.
 */

export const adminDocsProviderSchema = z.enum(['yousign', 'docusign', 'qonto', 'tiime'])

export type AdminDocsProvider = z.infer<typeof adminDocsProviderSchema>

export const adminDocsStatusSchema = z.object({
  /** Les fournisseurs connectés sur cet espace. Vide = rien de branché. */
  connected: z.array(adminDocsProviderSchema),
})

export type AdminDocsStatus = z.infer<typeof adminDocsStatusSchema>

export const adminDocsCredentialsSchema = z
  .object({
    provider: adminDocsProviderSchema,
    apiKey: z.string().trim().min(8).max(500),
    /** Second secret quand le fournisseur en demande un (identifiant + clé). */
    apiSecret: z.string().trim().max(500).optional(),
    /** Surcharge d'URL — le contrat de certains n'est pas public. */
    baseUrl: z.string().trim().url().max(300).optional(),
  })
  .strict()

export type AdminDocsCredentials = z.infer<typeof adminDocsCredentialsSchema>

/** Une signature en attente. `null` partout où le fournisseur ne dit rien. */
export const pendingSignatureSchema = z.object({
  id: z.string(),
  provider: adminDocsProviderSchema,
  title: z.string().nullable(),
  /** Qui doit signer, tel que le fournisseur le nomme. */
  signer: z.string().nullable(),
  sentAt: z.string().nullable(),
  /** Jours écoulés depuis l'envoi. `null` quand la date est illisible. */
  daysWaiting: z.number().int().nonnegative().nullable(),
})

export type PendingSignature = z.infer<typeof pendingSignatureSchema>

/**
 * #4295.27 — le statut de LA demande de signature d'une proposition. `signed` n'est écrit que sur preuve du
 * connecteur (la demande listée parmi les terminées) ; `not_sent` = aucune demande rattachée ; `unread` = l'outil
 * n'a pas répondu ; `not_found` = ni en cours ni terminée dans ce que l'outil rend.
 */
export const proposalSignatureStatusSchema = z.object({
  state: z.enum(['not_sent', 'pending', 'signed', 'not_found', 'unread']),
  signatureRequestId: z.string().nullable(),
  sentAt: z.string().nullable(),
  /** Quand l'outil a été lu — la date de la preuve. */
  readAt: z.string().nullable(),
  daysWaiting: z.number().int().nonnegative().nullable(),
})

export type ProposalSignatureStatus = z.infer<typeof proposalSignatureStatusSchema>

/** Une facture non réglée. */
export const unpaidInvoiceSchema = z.object({
  id: z.string(),
  provider: adminDocsProviderSchema,
  reference: z.string().nullable(),
  client: z.string().nullable(),
  /** En centimes, pour ne jamais arrondir un montant. `null` si absent. */
  amountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** Jours de retard. `null` quand l'échéance est inconnue — ce qui n'est pas 0. */
  daysOverdue: z.number().int().nullable(),
})

export type UnpaidInvoice = z.infer<typeof unpaidInvoiceSchema>
