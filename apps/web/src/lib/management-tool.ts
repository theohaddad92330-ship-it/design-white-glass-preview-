import type { ConnectedClientTool } from '@bellum/contracts'

/**
 * #2564 / #2575 — l'OUTIL DE GESTION que l'espace a branché, vu depuis l'écran.
 *
 * Prédicat de /pilotage/finance. Il ne cherchait que la famille `ats`
 * (BoondManager) et disait « Aucun outil de gestion n'est connecté » chez un
 * espace dont Odoo l'était (recette prod du 07/10/2026) — Odoo est catalogué
 * CRM, pas `ats` ni `admin_docs`, il se reconnaît donc par son identifiant.
 *
 * MIROIR du prédicat serveur `InvoiceConnectorWriteController.
 * connectedInvoicingProvider` (famille `admin_docs` + Odoo), élargi à `ats`.
 * GA-44 : jamais un nom deviné — seul l'outil que l'ESPACE a branché.
 */
export function connectedManagementTool(tools: readonly ConnectedClientTool[]): ConnectedClientTool | null {
  return tools.find(tool => tool.family === 'ats' || tool.family === 'admin_docs' || tool.provider === 'odoo') ?? null
}
