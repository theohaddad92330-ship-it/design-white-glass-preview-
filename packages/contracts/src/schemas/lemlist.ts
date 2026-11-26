import { z } from 'zod'

/**
 * #4427 — Lemlist : l'outil de séquences que l'ESN a déjà.
 *
 * Bellum PRÉPARE (le contact, le message), le commercial CHOISIT une campagne
 * existante et valide ; rien ne part seul. Bellum ne crée pas de campagne, ne la
 * lance pas, n'écrit aucun message dans Lemlist : la séquence reste celle que
 * l'ESN a construite chez elle.
 *
 * Contrat lu sur la documentation publique le 21/10/2026 :
 * https://developer.lemlist.com/api-reference/getting-started/authentication
 * (authentification Basic, identifiant vide, mot de passe = la clé d'API).
 * La clé est PAR ESPACE (comme l'ATS et la téléphonie), jamais une variable
 * d'environnement globale.
 */

export const lemlistCredentialsSchema = z
  .object({
    /** La clé d'API générée dans Lemlist › Settings › Integrations. */
    apiKey: z.string().trim().min(1).max(500),
  })
  .strict()

export type LemlistCredentials = z.infer<typeof lemlistCredentialsSchema>

export const lemlistStatusSchema = z.object({
  connected: z.boolean(),
  connectedAt: z.string().nullable(),
})

export type LemlistStatus = z.infer<typeof lemlistStatusSchema>

/**
 * Une campagne existante, telle que `GET /campaigns` la rend
 * (https://developer.lemlist.com/api-reference/endpoints/campaigns/get-many-campaigns).
 * `status` vaut `null` quand Lemlist ne le donne pas — jamais deviné.
 */
export const lemlistCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().nullable(),
})

export type LemlistCampaign = z.infer<typeof lemlistCampaignSchema>

/** #4427.2 — pousser UN contact préparé dans UNE campagne choisie par la personne. */
export const lemlistPushInputSchema = z
  .object({
    contactId: z.string().trim().min(1),
    campaignId: z.string().trim().min(1).max(200),
  })
  .strict()

export type LemlistPushInput = z.infer<typeof lemlistPushInputSchema>

/**
 * L'issue d'une poussée. `already_in_campaign` = Lemlist a refusé un doublon
 * (`400 LEAD_ALREADY_IN_CAMPAIGN`, documenté sur « Create Lead in Campaign ») :
 * rien n'a été écrit, et ce n'est pas une panne.
 */
export const lemlistPushResultSchema = z.object({
  outcome: z.enum(['pushed', 'already_in_campaign']),
  campaignId: z.string(),
  campaignName: z.string().nullable(),
  leadId: z.string().nullable(),
})

export type LemlistPushResult = z.infer<typeof lemlistPushResultSchema>

/** #4427.3 — les statuts relus, dans l'ordre où une séquence les produit. */
export const LEMLIST_LEAD_STATUSES = ['sent', 'opened', 'replied', 'bounced', 'unsubscribed'] as const

type LemlistLeadStatus = (typeof LEMLIST_LEAD_STATUSES)[number]

/**
 * Les types d'activité DOCUMENTÉS (`ActivityType`,
 * https://developer.lemlist.com/api-reference/endpoints/activities/get-many-activities)
 * qui portent un statut. Un type absent de cette table n'affiche rien : un
 * statut que l'API n'expose pas n'est pas affiché.
 */
const ACTIVITY_TO_STATUS: Readonly<Record<string, LemlistLeadStatus>> = {
  emailsSent: 'sent',
  emailsOpened: 'opened',
  emailsReplied: 'replied',
  emailsBounced: 'bounced',
  emailsUnsubscribed: 'unsubscribed',
  apiUnsubscribed: 'unsubscribed',
  manualUnsubscribed: 'unsubscribed',
}

export const lemlistLeadStatusEntrySchema = z.object({
  status: z.enum(LEMLIST_LEAD_STATUSES),
  /** La date la plus récente de ce statut ; `null` = Lemlist ne l'a pas datée. */
  at: z.string().nullable(),
})

type LemlistLeadStatusEntry = z.infer<typeof lemlistLeadStatusEntrySchema>

/** Les statuts d'UN lead poussé, sur la fiche contact. */
export const lemlistContactLeadSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string().nullable(),
  pushedAt: z.string(),
  /** `null` = la relecture n'a pas répondu : ce n'est PAS « aucune activité ». */
  statuses: z.array(lemlistLeadStatusEntrySchema).nullable(),
  /** #4427.3 — quand ces statuts ont été relus chez Lemlist ; `null` = jamais relus. */
  statusesReadAt: z.string().nullable().optional(),
  /** #4427.3 — `true` = la relecture a échoué, ce sont les DERNIERS statuts gardés (datés par `statusesReadAt`). */
  statusesStale: z.boolean().optional(),
})

export type LemlistContactLead = z.infer<typeof lemlistContactLeadSchema>

/**
 * Réduit les activités d'un lead à ses statuts : une ligne par statut présent,
 * datée de sa dernière occurrence. Aucune activité ⇒ aucune ligne.
 */
export function lemlistLeadStatusesFromActivities(
  activities: ReadonlyArray<{ type: string; createdAt: string | null }>,
): LemlistLeadStatusEntry[] {
  const latest = new Map<LemlistLeadStatus, string | null>()
  for (const activity of activities) {
    const status = ACTIVITY_TO_STATUS[activity.type]
    if (!status) continue
    const known = latest.get(status)
    if (!latest.has(status) || (activity.createdAt && (!known || activity.createdAt > known))) {
      latest.set(status, activity.createdAt ?? known ?? null)
    }
  }
  return LEMLIST_LEAD_STATUSES.filter(status => latest.has(status)).map(status => ({
    status,
    at: latest.get(status) ?? null,
  }))
}
