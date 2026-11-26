import { z } from 'zod'
import { outreachMessageChannelSchema, type OutreachMessageChannel } from './outreach-canonical.js'

/**
 * #2185.51 — « Préparer un message », depuis la fiche consultant.
 *
 * Volontairement SÉPARÉ du moteur `outreach_messages` (séquences, versions,
 * preuve d'approbation, `contact_id` NOT NULL au cœur de tout le mécanisme) :
 * le généraliser à une seconde entité est un chantier à part (revue produit,
 * migration risquée sur une table qui porte des séquences vivantes) — tranché
 * sans Louis (brief nuit du 26/09/2026), la plus petite tranche prouvable :
 * un brouillon SIMPLE, jamais envoyé, jamais entré dans une séquence.
 *
 * Le canal réutilise le VOCABULAIRE existant de l'outreach (GA-26 : un
 * réglage vit à un seul endroit) plutôt que d'en inventer un second pour la
 * même idée.
 *
 * Doctrine : le copilote PRÉPARE, il n'envoie jamais — ce message n'a et
 * n'aura aucun geste d'envoi attaché.
 */
export const talentPreparedMessageChannelSchema = outreachMessageChannelSchema
export type TalentPreparedMessageChannel = OutreachMessageChannel

export const prepareTalentMessageInputSchema = z
  .object({
    channel: talentPreparedMessageChannelSchema,
    /** `null`/absent : pas d'objet (cas du téléphone). Jamais une chaîne vide. */
    subject: z.string().trim().min(1).max(200).nullable().optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
export type PrepareTalentMessageInput = z.infer<typeof prepareTalentMessageInputSchema>

export const talentPreparedMessageSchema = z
  .object({
    id: z.string().guid(),
    talentId: z.string().guid(),
    channel: talentPreparedMessageChannelSchema,
    subject: z.string().nullable(),
    body: z.string(),
    /** Qui l'a préparé — `null` quand l'auteur a quitté l'espace (on archive, on ne supprime pas). */
    preparedByName: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()
export type TalentPreparedMessage = z.infer<typeof talentPreparedMessageSchema>

/**
 * #4347 — « Préparer un message » s'ouvre DÉJÀ RÉDIGÉ par Laura (décision Louis 19/10/2026 :
 * « préparer les appels, les messages, les mails, ça doit être généré par l'IA / Laura, pas des
 * champs vides à remplir »). La demande ne porte que le canal et, pour une variante, le texte
 * à réécrire : le consultant, le besoin et le client se lisent côté serveur, jamais depuis le
 * navigateur — et aucun critère protégé n'a de clé ici (`.strict()`).
 */
export const talentMessageVariantSchema = z.enum(['regenerate', 'shorter', 'more_direct'])

/**
 * #4347.3 — ce que le message cherche à obtenir. DÉDUIT par le serveur (un besoin ouvert qui matche le
 * consultant → proposer la mission ; sinon → revalider sa disponibilité), modifiable en un clic.
 */
export const talentMessageObjectiveSchema = z.enum(['propose_mission', 'revalidate_availability'])
export type TalentMessageObjective = z.infer<typeof talentMessageObjectiveSchema>

export const draftTalentMessageInputSchema = z
  .object({
    channel: talentPreparedMessageChannelSchema,
    /** Absent = le serveur déduit. Présent = le choix de la personne, respecté si un besoin le permet. */
    objective: talentMessageObjectiveSchema.optional(),
    variant: talentMessageVariantSchema.optional(),
    /** Le texte à réécrire (« Plus court », « Plus direct ») — sans lui, une variante n'a pas de sens. */
    previousBody: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
export type DraftTalentMessageInput = z.infer<typeof draftTalentMessageInputSchema>

export const talentMessageDraftSchema = z
  .object({
    /** `null` hors e-mail : l'objet n'existe que sur le canal qui en porte un. */
    subject: z.string().nullable(),
    body: z.string(),
    /** L'objectif RETENU (déduit ou demandé) — affiché en tête de la fenêtre. */
    objective: talentMessageObjectiveSchema,
    /** Ce sur quoi Laura s'est appuyée — la mention « Rédigé par Laura à partir de … ». `null` = absent, jamais « 0 ». */
    basis: z
      .object({
        consultant: z.string().nullable(),
        need: z.string().nullable(),
        client: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
export type TalentMessageDraft = z.infer<typeof talentMessageDraftSchema>
