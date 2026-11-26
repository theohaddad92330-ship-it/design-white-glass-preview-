import { z } from 'zod'
import { ONBOARDING_MAX_MULTI } from './limits.js'

/**
 * Temps 1 — les 10 champs de cadrage, mappés 1:1 sur des colonnes
 * `esn_profiles`. Les chaînes sont nullables (pas encore répondu), les tableaux
 * arrivent vides par défaut. Les deux multi-selects groupés sont plafonnés à
 * {@link ONBOARDING_MAX_MULTI}.
 *
 * Ajouter une question de cadrage, c'est toucher CE fichier et le fichier de
 * sous-étape correspondant côté web — pas le contrat entier.
 */
export const TEMPS1_ANSWER_FIELDS = {
  esn_name: z.string().nullable(),
  consultant_size: z.string().nullable(),
  sales_team_size: z.string().nullable(),
  expertise_areas: z.array(z.string()),
  positioning: z.string().nullable(),
  target_sectors: z.array(z.string()),
  target_company_types: z.array(z.string()),
  staffing_model: z.string().nullable(),
  geo_zones: z.array(z.string()),
  main_sales_pain: z.string().nullable(),
}
