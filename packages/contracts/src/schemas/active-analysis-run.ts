import { z } from 'zod'

/**
 * #2145.9 / #2100.9 — un job d'analyse EN COURS, tel qu'Aujourd'hui le met en
 * avant.
 *
 * `started_at` est le seul fait honnête : depuis quand le job tourne. Jamais
 * de pourcentage ni d'estimation de fin ici — ça relève du suivi live d'UN
 * compte ouvert (`useAnalysisProgress`), pas d'une mise en avant portefeuille.
 */
export const activeAnalysisRunSchema = z.object({
  account_id: z.string().guid(),
  company_name: z.string(),
  started_at: z.string(),
})
export type ActiveAnalysisRun = z.infer<typeof activeAnalysisRunSchema>
