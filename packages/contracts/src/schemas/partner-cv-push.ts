import { z } from 'zod'

/**
 * #2887 (#2371.8) — LA REVUE D'UN CV POUSSÉ À UN PARTENAIRE.
 *
 * Absente jusqu'ici : sept passes consécutives (24→28/09) avaient confirmé
 * qu'aucun écran ni aucune table ne portait ce geste — pousser le profil d'UN
 * consultant vers UN partenaire (`partner_relations`, tome 4, D61), à
 * distinguer du push vers une OPPORTUNITÉ cliente (`consultant_push_feedback`,
 * annexe p22) : ici le destinataire est une ESN, jamais un client final.
 *
 * Deux valeurs SEULEMENT sont déclarées par un humain (`marginSharePct`,
 * l'outcome) — le reste (`brief`, `economics.tjm`) est une pure DÉRIVATION du
 * consultant au moment de la lecture, jamais dupliqué en base (GA-26) : un
 * TJM qui change sur la fiche consultant se reflète immédiatement ici, sans
 * resynchronisation à écrire.
 *
 * `status` distingue « préparé » de « déclaré envoyé » — jamais une preuve
 * d'envoi (doctrine, Louis 21/09/2026) : Laura/l'écran PRÉPARENT, le
 * commercial pousse lui-même, à la main, hors de l'outil.
 */
export const PARTNER_CV_PUSH_STATUSES = ['preparee', 'envoyee_declaree'] as const
export const partnerCvPushStatusSchema = z.enum(PARTNER_CV_PUSH_STATUSES)
export type PartnerCvPushStatus = (typeof PARTNER_CV_PUSH_STATUSES)[number]

/** Le retour du partenaire — jamais une probabilité, un fait daté ou son absence. */
export const PARTNER_CV_PUSH_OUTCOMES = ['en_attente', 'retenu', 'refuse'] as const
export const partnerCvPushOutcomeSchema = z.enum(PARTNER_CV_PUSH_OUTCOMES)
export type PartnerCvPushOutcome = (typeof PARTNER_CV_PUSH_OUTCOMES)[number]

/** Le BRIEF — dérivé du consultant, jamais saisi à part (une seconde saisie divergerait). */
export const partnerCvPushBriefSchema = z.object({
  consultantName: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.string(),
  yearsExperience: z.number().nullable(),
})
export type PartnerCvPushBrief = z.infer<typeof partnerCvPushBriefSchema>

/**
 * L'ÉCONOMIE — `tjm` est lu sur la fiche consultant (une donnée réelle,
 * jamais devinée) ; `marginSharePct` est le seul champ que ce chantier
 * ajoute et il reste `null` tant que personne ne l'a déclaré (GA-18/19 : un
 * partage non déclaré n'est pas un partage à 0 %).
 */
export const partnerCvPushEconomicsSchema = z.object({
  tjm: z.number().nullable(),
  marginSharePct: z.number().nullable(),
})
export type PartnerCvPushEconomics = z.infer<typeof partnerCvPushEconomicsSchema>

export const partnerCvPushSchema = z.object({
  id: z.string(),
  partnerRelationId: z.string(),
  consultantId: z.string(),
  brief: partnerCvPushBriefSchema,
  economics: partnerCvPushEconomicsSchema,
  status: partnerCvPushStatusSchema,
  outcome: partnerCvPushOutcomeSchema,
  createdAt: z.string(),
  sentDeclaredAt: z.string().nullable(),
})
export type PartnerCvPush = z.infer<typeof partnerCvPushSchema>
