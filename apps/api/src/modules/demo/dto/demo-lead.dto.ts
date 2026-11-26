import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { DEMO_LEAD_JOB_TITLES, isProfessionalEmail } from '../demo-lead'

/**
 * #2705 — le formulaire obligatoire du lien de démo. Validation SERVEUR,
 * toujours — une validation d'interface seule se contourne depuis la console
 * en trois secondes. Message d'erreur MOT POUR MOT (issue #2705).
 *
 * ⚠️ Aucun champ obligatoire de plus que la liste (« ce qu'on ne fait pas »,
 * issue #2705) : le téléphone reste `optional()`, jamais `nullish()` avec une
 * valeur devinée.
 */
export const demoLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).refine(isProfessionalEmail, {
    message: 'Merci d’utiliser votre adresse e-mail professionnelle, par exemple prenom@entreprise.com.',
  }),
  jobTitle: z.enum(DEMO_LEAD_JOB_TITLES),
  company: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40).optional(),
  // UTM : lus dans la query de `/demo`, portés jusqu'à l'enregistrement. Un
  // paramètre absent reste `undefined` (→ `NULL` en base), jamais deviné.
  utmSource: z.string().trim().min(1).max(200).optional(),
  utmMedium: z.string().trim().min(1).max(200).optional(),
  utmCampaign: z.string().trim().min(1).max(200).optional(),
  utmTerm: z.string().trim().min(1).max(200).optional(),
  utmContent: z.string().trim().min(1).max(200).optional(),
})

export class DemoLeadDto extends createZodDto(demoLeadSchema) {}
