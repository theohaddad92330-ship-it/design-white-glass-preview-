import { z } from 'zod'
import { professionalEmailSchema } from './professional-email.js'

/**
 * #2705 — le formulaire obligatoire devant `/demo`. Théo (22/09/2026) : sept
 * valeurs, fermées, glissées dans une liste.
 *
 * ⚠️ Gelée comme les autres taxonomies du dépôt (GA-08) : une valeur ne
 * disparaît jamais, un ajout va en fin. La contrainte SQL
 * (`demo_leads_job_title_check`, migration `DemoLeads`) COUVRE ces sept
 * valeurs — voir `check-constraints-cover-enums.spec.ts` (GA-12), qui casse
 * si l'une des deux listes s'écarte de l'autre.
 */
export const DEMO_LEAD_JOB_TITLES = [
  'business_developer', // Business Developer / Business Manager
  'team_manager', // Manager / Responsable d'équipe
  'agency_director', // Directeur d'agence / BU
  'sales_director', // Directeur commercial / Head of Sales
  'esn_founder', // Fondateur / Dirigeant d'ESN
  'freelance', // Freelance / Indépendant
  'other', // Autre
] as const
export type DemoLeadJobTitle = (typeof DEMO_LEAD_JOB_TITLES)[number]

/**
 * Le corps de `POST /demo/lead` — validé CÔTÉ SERVEUR (ce schéma, via le DTO
 * NestJS) ET côté navigateur (le formulaire désactive son bouton avant même
 * d'appeler l'API). Aucun champ de plus que ceux listés par #2705 : le
 * téléphone reste `optional()`, et le reste — jamais.
 *
 * `token` n'est PAS ici : `?t=` (environnement verrouillé par
 * `DEMO_LINK_TOKEN`) reste dans la query jusqu'à `POST /demo/session`
 * (`DemoLinkService`), il ne traverse jamais ce formulaire.
 */
export const demoLeadFormSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: professionalEmailSchema,
  jobTitle: z.enum(DEMO_LEAD_JOB_TITLES),
  company: z.string().trim().min(1).max(200),
  // Facultatif, ET LE RESTE (#2705 — « ce qu'on ne fait pas »).
  phone: z.string().trim().min(1).max(40).optional(),
  // UTM : lus dans la query de `/demo`, portés jusqu'à l'enregistrement.
  // Un paramètre absent doit rester NULL (jamais deviné) — `optional()` ici,
  // et c'est l'appelant (`DemoLeadService`) qui écrit `null` en base pour un
  // champ absent, jamais `''`.
  utmSource: z.string().trim().min(1).max(200).optional(),
  utmMedium: z.string().trim().min(1).max(200).optional(),
  utmCampaign: z.string().trim().min(1).max(200).optional(),
  utmTerm: z.string().trim().min(1).max(200).optional(),
  utmContent: z.string().trim().min(1).max(200).optional(),
})
export type DemoLeadFormInput = z.infer<typeof demoLeadFormSchema>

/** Une ligne `demo_leads`, telle que le back-office de #2706 la lit. */
export type DemoLeadAdminRow = {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: DemoLeadJobTitle
  company: string
  /** `null` = jamais renseigné — GA-18/19, jamais deviné, jamais « 0 ». */
  phone: string | null
  firstAccessAt: string
  lastAccessAt: string
  accessCount: number
  source: 'demo'
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
}
