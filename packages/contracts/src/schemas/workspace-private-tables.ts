/**
 * #4268.c (décision Louis 19/10/2026, base commune) — CE QUI NE SE PARTAGE JAMAIS ENTRE ESPACES.
 *
 * Ce que Bellum collecte ou calcule sur une société profite à tous les espaces ; ce qui
 * concerne l'ESN ou l'utilisateur reste chez lui. Cette liste nomme les tables de la
 * seconde famille, par nature. Un chemin de PARTAGE (`apps/api/src/modules/shared-base/`)
 * qui en lit une sans borne d'espace fait rougir la garde GA-415
 * (`apps/api/src/architecture/ga-415-base-commune-tables-privees.spec.ts`).
 *
 * « Borne d'espace » : la requête porte `workspace_id` (filtre, jointure ou comptage par
 * espace pour un agrégat anonyme à k ≥ 3, GA-43) — ou n'est qu'une sonde d'existence
 * (`EXISTS (SELECT 1 FROM …)`) qui ne rend aucune valeur de la table.
 */
export const WORKSPACE_PRIVATE_TABLES = {
  /** Son CRM : affaires, activités, notes. */
  crm: ['opportunities', 'activities', 'notes'],
  /** Ses messages : versions envoyées, brouillons, fil de Laura. */
  messages: ['outreach_message_versions', 'engagement_drafts', 'chat_messages'],
  /** Ses prix et coûts d'accès (GA-43 : jamais agrégés entre espaces). */
  prices: ['access_facts', 'mission_rate_history'],
  /** Ses corrections : provenance des champs, journal, organigramme corrigé. */
  corrections: ['field_provenance', 'record_field_audit', 'org_graph_corrections'],
  /** Ses plans. */
  plans: ['action_plans', 'action_plan_items'],
  /** Ses consultants, leurs CV et leurs missions. */
  consultants: ['consultants', 'cv_versions', 'missions'],
  /** Ses comptes suivis. */
  follows: ['account_follows'],
} as const satisfies Record<string, readonly string[]>
