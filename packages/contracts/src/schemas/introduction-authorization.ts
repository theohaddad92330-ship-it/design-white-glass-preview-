import { z } from 'zod'
import { linkKindSchema, relationalWarmthSchema } from './link-kind.js'

/**
 * #2373.9 — LA PREUVE D'AUTORISATION D'UNE INTRODUCTION, DANS LE TEMPS
 * (LAU-FINAL-088 § PREUVES).
 *
 * « Autorisation, date, canal, texte, périmètre, restrictions » — six choses à
 * conserver pour qu'une phrase comme « Ahmed m'a transmis votre contact »
 * reste vérifiable après coup, pas seulement crue sur le moment.
 */
export const INTRODUCTION_AUTHORIZATION_CHANNELS = ['email', 'sms', 'appel', 'linkedin', 'verbal', 'autre'] as const
export const introductionAuthorizationChannelSchema = z.enum(INTRODUCTION_AUTHORIZATION_CHANNELS)
export type IntroductionAuthorizationChannel = z.infer<typeof introductionAuthorizationChannelSchema>

/**
 * Body de `POST /contacts/:id/introduction-authorizations`. Ni `workspaceId`
 * ni `recordedBy` — dérivés du JWT + du workspace actif côté contrôleur,
 * jamais du body (même règle que `createAccountFeedbackSchema`).
 *
 * `granted: false` (un refus) est un body VALIDE — un refus est une preuve,
 * pas moins qu'un accord.
 */
export const createIntroductionAuthorizationSchema = z.object({
  targetContactId: z.string().guid(),
  referrerContactId: z.string().guid().optional(),
  // Quand le référent n'est pas un contact CRM (ex. collègue du workspace).
  referrerLabel: z.string().max(200).optional(),
  granted: z.boolean(),
  channel: introductionAuthorizationChannelSchema,
  // Le texte TEL QUEL de l'échange — cité, jamais reformulé.
  text: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  restrictions: z.string().max(500).optional(),
  // Quand l'autorisation (ou le refus) a réellement eu lieu — pas quand on
  // l'enregistre.
  authorizedAt: z.string(),
  /**
   * #3403.7 — LE TYPE DE LIEN, ENFIN PERSISTÉ.
   *
   * Jusqu'ici, `ContactWarmIntroCard` classait le lien (`LinkKind`) dans un
   * `useState` de la session : « le serveur ne les persiste pas encore »
   * (docblock de la carte, #2373.2). Optionnel : une ligne déjà en base, ou
   * enregistrée avant ce commit, n'en porte aucun — `null` au contrat, jamais
   * un type deviné après coup.
   */
  linkKind: linkKindSchema.optional(),
  /** #3403.7 — vérifié au moment de la saisie, jamais recalculé plus tard :
   *  une vérification n'a de sens qu'à l'instant où elle est déclarée. */
  verified: z.boolean().optional(),
  /** #3403.12 — chaleur relationnelle déclarée ; absente = non déclarée. */
  warmth: relationalWarmthSchema.optional(),
})
export type CreateIntroductionAuthorization = z.infer<typeof createIntroductionAuthorizationSchema>

/** Wire shape d'une preuve d'autorisation (GET .../introduction-authorizations)
 *  — pas de fuite `workspace_id`/`recorded_by`. */
export const introductionAuthorizationItemSchema = z.object({
  id: z.string().guid(),
  targetContactId: z.string().guid(),
  referrerContactId: z.string().guid().nullable(),
  referrerLabel: z.string().nullable(),
  granted: z.boolean(),
  channel: introductionAuthorizationChannelSchema,
  text: z.string().nullable(),
  scope: z.string().nullable(),
  restrictions: z.string().nullable(),
  authorizedAt: z.string(),
  createdAt: z.string(),
  /** `null` = ligne enregistrée avant #3403.7, ou sans type déclaré. */
  linkKind: linkKindSchema.nullable(),
  verified: z.boolean(),
  /** `null` = non déclarée. */
  warmth: relationalWarmthSchema.nullable(),
})
export type IntroductionAuthorizationItem = z.infer<typeof introductionAuthorizationItemSchema>
