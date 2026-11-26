import { z } from 'zod'
import { contactSendChannelSchema, contactSendStateSchema } from './contact-send-state.js'
import { mailboxProviderSchema } from './mailbox.js'

/**
 * #3699.6 — un document de la bibliothèque que la personne PEUT choisir de
 * joindre à cet e-mail : seuls les assets qui portent un fichier réel. Un
 * asset retenu par son droit d'usage reste nommé, avec sa raison
 * (`interest_not_confirmed`, #2372.6) — jamais retiré en silence.
 */
export const contactAttachableDocumentSchema = z.object({
  asset_id: z.string().guid(),
  title: z.string(),
  file_name: z.string(),
  content_type: z.string(),
  byte_size: z.number().int().nonnegative(),
  blocked_reason: z.enum(['interest_not_confirmed']).nullable(),
})
export type ContactAttachableDocument = z.infer<typeof contactAttachableDocumentSchema>

/**
 * #3699.6 — la preuve d'une pièce jointe partie (ou tentée) : de quoi la
 * RECONNAÎTRE — nom, taille, empreinte SHA-256 des octets réellement relus
 * pour partir. Jamais le contenu, jamais un chemin de magasin.
 */
export const contactSendAttachmentProofSchema = z.object({
  name: z.string(),
  byte_size: z.number().int().nonnegative(),
  sha256: z.string(),
})
export type ContactSendAttachmentProof = z.infer<typeof contactSendAttachmentProofSchema>

/**
 * `GET /contacts/:id/sendability` — « puis-je envoyer un email à CE contact,
 * maintenant ? », répondu avant que le commercial n'investisse du temps à
 * rédiger.
 *
 * Existe pour une raison précise : l'opt-out vit dans la table `email_suppression`
 * (clé workspace + email), donc le client ne peut pas le déduire du contact. Sans
 * cet appel, un commercial peut éditer longuement un brouillon destiné à quelqu'un
 * qui ne pourra JAMAIS le recevoir — le serveur refuse au dernier moment.
 *
 * Divulgation minimale, volontairement : un seul contact par appel, résolu dans
 * le workspace de l'appelant, l'email n'apparaît jamais dans l'URL (l'id du
 * contact est le seul paramètre), et la liste de suppression n'est pas exposée
 * en masse sur les endpoints de liste.
 */
export const contactSendabilitySchema = z.object({
  contact_id: z.string().guid(),
  /** `true` si un envoi partirait effectivement (toutes gardes serveur vertes). */
  can_send: z.boolean(),
  /** Pourquoi l'envoi est bloqué, `null` si `can_send`. Même ordre de gardes que
   *  `deliverDraft` — le brouillon (`no_draft`) reste une affaire de client. */
  reason: z.enum(['no_email', 'already_sent', 'suppressed', 'send_in_progress', 'send_uncertain']).nullable(),
  /**
   * #3699.1 — l'adresse d'où le message partira VRAIMENT (celle de l'espace,
   * sinon celle de l'environnement), lue au même endroit que l'envoi. Présente
   * seulement quand `can_send` : un envoi bloqué n'a pas d'expéditeur à montrer.
   */
  sender: z.string().optional(),
  /** L'adresse de réponse (le commercial) ; `null` si elle n'est pas connue. */
  reply_to: z.string().nullable().optional(),
  /**
   * #3699.4 — la boîte CONNECTÉE du commercial et ce qu'elle peut faire ICI. Le
   * client en tire le choix explicite du canal : boîte prête ⇒ proposée par
   * défaut ; boîte connectée mais sans droit d'envoi (portée manquante,
   * connexion expirée) ⇒ dite telle quelle, et l'envoi par l'espace n'est
   * jamais choisi à la place de la personne. Elle bloque l'envoi, pas la lecture.
   */
  mailbox: z
    .object({
      connected: z.boolean(),
      provider: mailboxProviderSchema.nullable(),
      address: z.string().nullable(),
      can_send: z.boolean(),
    })
    .optional(),
  /** #3699.5 — la dernière tentative d'envoi, quand il y en a une. */
  last_send: z
    .object({
      state: contactSendStateSchema,
      channel: contactSendChannelSchema.nullable(),
      from: z.string().nullable(),
      at: z.string().nullable(),
      /** #3699.6 — les pièces de cette tentative ; absent ou vide = aucune. */
      attachments: z.array(contactSendAttachmentProofSchema).optional(),
      /**
       * #4179.2 — l'instant où le message sortant a été LU dans la boîte connectée.
       * Absent = jamais observé : « dans les éléments envoyés » ne s'affiche pas.
       */
      observed_at: z.string().optional(),
    })
    .nullable()
    .optional(),
  /**
   * #3699.6 — les documents joignables, présents seulement quand `can_send`.
   * La personne choisit ; rien n'est coché d'office.
   */
  attachable_documents: z.array(contactAttachableDocumentSchema).optional(),
  /** #3699 — salle de démonstration : le dialogue se montre, rien ne part. */
  demo: z.boolean().optional(),
})

export type ContactSendability = z.infer<typeof contactSendabilitySchema>
