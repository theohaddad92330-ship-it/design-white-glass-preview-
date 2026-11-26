import { actionHistoryCategorySchema, actionRiskSchema, workflowTriggerSchema } from '@bellum/contracts'
import { z } from 'zod'

export const actionHistorySearchSchema = z.object({
  // `since` = l'onglet « Depuis votre dernière connexion » (§8), à côté de `all`
  // et des catégories.
  category: actionHistoryCategorySchema.or(z.literal('all')).or(z.literal('since')).optional().catch(undefined),
  type: actionHistoryCategorySchema.optional().catch(undefined),
  status: z.string().optional(),
  period: z.enum(['7d', '30d', '90d']).optional().catch(undefined),
  // Recherche par compte : même borne que le contrat serveur, pour qu'un lien
  // trafiqué soit rejeté ici plutôt que de partir en 400.
  account: z.string().trim().min(1).max(120).optional().catch(undefined),
  // Auteur de l'action. `uuid()` : seul un id de membre a du sens ici.
  member: z.string().guid().optional().catch(undefined),
  // #2717 — la tuile « En retard » du Dashboard ouvre directement l'onglet du
  // Centre d'actions qu'elle détaille, filtré. `tab` reprend les clés de
  // `TabKey` (`ActionCenter.tsx`) : une valeur inconnue retombe sur l'onglet
  // par défaut plutôt que de faire planter la route.
  tab: z.enum(['toApprove', 'scheduled', 'running', 'done', 'failed', 'workflows', 'mine']).optional().catch(undefined),
  overdue: z.boolean().optional().catch(undefined),
  // #2200.39 / #2200.42 / #2200.43 (épopée #2867) — les filtres Risque / Agent /
  // Source de la file « À valider » du Centre d'actions. Portée : l'onglet
  // `toApprove` SEUL, jamais le journal ci-dessous (dont les filtres sont
  // au-dessus, `type`/`status`/`account`/`member`…). Un lien trafiqué retombe
  // sur « aucun filtre » plutôt que de partir en 400.
  risk: actionRiskSchema.optional().catch(undefined),
  agent: z.enum(['human', 'automation']).optional().catch(undefined),
  source: workflowTriggerSchema.optional().catch(undefined),
})
