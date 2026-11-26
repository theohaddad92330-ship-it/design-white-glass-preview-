import { z } from 'zod'
import type { BusinessUnitAccess } from './business-unit.js'
import type { WorkspaceRole } from './workspace.js'

/**
 * #2081.14 — LES RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUI LES DISTINGUE D'UN RÉGLAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'ici, tout ce qui décidait de ce qu'une personne voit ou fait était
 * PAR PERSONNE : son rôle, ses permissions accordées en propre, son niveau
 * d'accès aux unités (`business_unit_access`). Une règle d'espace est posée
 * UNE fois, par un administrateur, pour TOUT l'espace — et elle PRIME sur le
 * réglage individuel qui la contredirait. C'est toute sa raison d'être : un
 * réglage individuel oublié ne doit pas rouvrir ce que l'espace a fermé.
 *
 * Le socle en porte deux, et pas davantage :
 *  1. la visibilité par défaut des comptes rattachés à une unité ;
 *  2. qui peut exporter.
 *
 * ⚠️ Une règle ne fait que RESTREINDRE. Aucune valeur ne rend à quelqu'un un
 * droit que son rôle ou son réglage lui refuse : la valeur par défaut de
 * chaque règle est le comportement d'AVANT, et les autres valeurs retirent.
 *
 * ⚠️ Ce fichier ne dit pas QUI a le droit de changer une règle (l'API le
 * décide : propriétaire ou administrateur, `WorkspaceRulesService`), ni OÙ on
 * la change (Réglages › Règles d'espace, un seul écran — GA-26).
 */

/** Les comptes rattachés à une unité. */
export const businessUnitAccountsVisibilityValues = [
  /** Défaut, et le comportement d'avant la règle : le niveau d'accès de chacun décide. */
  'shared',
  /** Seuls les membres de l'unité voient ses comptes — le réglage individuel « tout l'espace » ne l'emporte plus. */
  'private',
] as const
export const businessUnitAccountsVisibilitySchema = z.enum(businessUnitAccountsVisibilityValues)
export type BusinessUnitAccountsVisibility = z.infer<typeof businessUnitAccountsVisibilitySchema>

/**
 * Qui peut FAIRE SORTIR des données de l'espace : CSV, téléchargements,
 * exports vers un tableur ou un outil externe (`workspaceRuleGestures`).
 *
 * #2081.14 — DÉCISION Louis 19/09/2026 (QCM) : la règle ne s'appuie PLUS sur
 * la permission `data:export`. Cette permission garde aussi l'import, les
 * liens de partage, l'envoi à signature, l'explication de matching et le
 * versement des appels au CRM — une règle « export réservé aux
 * administrateurs » les fermait tous. Ils restent ouverts aux membres.
 */
export const workspaceExportPolicyValues = [
  /** Défaut, et le comportement d'avant la règle : le rôle et les accords de chacun décident. */
  'everyone',
  /** Propriétaire et administrateurs seulement, quel que soit l'accord individuel. */
  'admins',
] as const
export const workspaceExportPolicySchema = z.enum(workspaceExportPolicyValues)
export type WorkspaceExportPolicy = z.infer<typeof workspaceExportPolicySchema>

export interface WorkspaceRuleValues {
  businessUnitAccountsVisibility: BusinessUnitAccountsVisibility
  exportPolicy: WorkspaceExportPolicy
}

export type WorkspaceRuleKey = keyof WorkspaceRuleValues

/** Les valeurs d'un espace qui n'a jamais rien posé : le comportement d'avant. */
export const WORKSPACE_RULE_DEFAULTS: Readonly<WorkspaceRuleValues> = Object.freeze({
  businessUnitAccountsVisibility: 'shared',
  exportPolicy: 'everyone',
})

/**
 * Les sièges qui POSENT les règles, et que la règle ne vise pas.
 *
 * Propriétaire et administrateur, pas `team:manage` : un responsable d'agence
 * (`sales_ops`) porte `team:manage` sur son équipe, et c'est précisément lui
 * que « privée » doit tenir dans son unité.
 */
const WORKSPACE_RULE_ADMIN_ROLES: readonly WorkspaceRole[] = ['owner', 'admin']

export function isWorkspaceRuleAdmin(role: WorkspaceRole | null | undefined): boolean {
  return role !== null && role !== undefined && WORKSPACE_RULE_ADMIN_ROLES.includes(role)
}

/**
 * Le niveau d'accès aux unités qui S'APPLIQUE, règle d'espace comprise.
 *
 * `private` fait de « tout l'espace » un « mes unités » pour tout siège qui
 * n'est pas administrateur. Un membre déjà cloisonné le reste, administrateur
 * compris : la règle ne rouvre jamais ce qu'un réglage a fermé. `role` absent
 * (pas membre de cet espace) n'est jamais exempté.
 */
export function effectiveBusinessUnitAccess(
  individual: BusinessUnitAccess,
  role: WorkspaceRole | null,
  visibility: BusinessUnitAccountsVisibility,
): BusinessUnitAccess {
  if (visibility === 'shared') return individual
  if (individual === 'business_unit') return 'business_unit'
  return isWorkspaceRuleAdmin(role) ? individual : 'business_unit'
}

/**
 * Les GESTES qu'une règle d'espace gouverne — un seul : la sortie de données.
 *
 * #2081.14 — un geste, pas une permission. Une permission garde une famille
 * d'actions (`data:export` garde aussi l'import et le partage) ; la règle,
 * elle, ne vise que ce qui fait SORTIR la donnée de l'espace. Chaque chemin
 * de sortie le déclare lui-même : `@DataExit()` sur une route de l'API,
 * `dataExitAllowed` (lu depuis l'API) pour un CSV construit dans le
 * navigateur — les deux lisent CETTE fonction, et aucune autre (GA-26).
 */
export const workspaceRuleGestures = ['data_exit'] as const
export type WorkspaceRuleGesture = (typeof workspaceRuleGestures)[number]

/**
 * La règle d'espace qui RETIRE ce geste à ce rôle, ou `null`.
 *
 * S'applique APRÈS le rôle et les accords en propre : un accord individuel
 * de `data:export` ne passe pas une règle qui réserve la sortie de données
 * aux administrateurs. `role` absent (pas membre) n'est jamais exempté.
 */
export function workspaceRuleForbids(
  rules: Pick<WorkspaceRuleValues, 'exportPolicy'>,
  role: WorkspaceRole | null,
  gesture: WorkspaceRuleGesture,
): WorkspaceRuleKey | null {
  if (gesture === 'data_exit' && rules.exportPolicy === 'admins' && !isWorkspaceRuleAdmin(role)) {
    return 'exportPolicy'
  }
  return null
}

/** Le refus NOMMÉ — la personne refusée doit savoir que c'est une règle d'espace, pas son rôle. */
const WORKSPACE_RULE_REFUSALS: Record<WorkspaceRuleKey, string> = {
  businessUnitAccountsVisibility:
    'Réservé par la règle d’espace : les comptes de cette unité ne sont visibles que de ses membres.',
  exportPolicy: 'Réservé par la règle d’espace : l’export des données est réservé aux administrateurs de l’espace.',
}

export function workspaceRuleRefusalMessage(rule: WorkspaceRuleKey): string {
  return WORKSPACE_RULE_REFUSALS[rule]
}

/**
 * La ligne `workspace_rules` lue en valeurs.
 *
 * `null` (aucune ligne) = les défauts : l'espace n'a jamais rien posé. Une
 * valeur ILLISIBLE — que la contrainte CHECK empêche d'écrire — se lit
 * RESTRICTIVE : deviner « ouvert » transformerait une ligne corrompue en
 * élargissement silencieux.
 */
export function resolveWorkspaceRuleValues(
  row: { business_unit_accounts_visibility: unknown; export_policy: unknown } | null,
): WorkspaceRuleValues {
  if (!row) return { ...WORKSPACE_RULE_DEFAULTS }
  const visibility = businessUnitAccountsVisibilitySchema.safeParse(row.business_unit_accounts_visibility)
  const exportPolicy = workspaceExportPolicySchema.safeParse(row.export_policy)
  return {
    businessUnitAccountsVisibility: visibility.success ? visibility.data : 'private',
    exportPolicy: exportPolicy.success ? exportPolicy.data : 'admins',
  }
}

/** La trace d'une règle : qui l'a changée, et quand. `null` = jamais changée (valeur par défaut). */
const workspaceRuleTraceSchema = z.object({
  changedByUserId: z.string().nullable(),
  /** Le nom affiché de qui l'a changée ; `null` si le profil n'en porte pas. */
  changedByName: z.string().nullable(),
  changedAt: z.string().nullable(),
})

/** `GET /workspaces/rules` — ce que l'écran Réglages › Règles d'espace affiche. */
export const workspaceRulesViewSchema = z.object({
  businessUnitAccountsVisibility: workspaceRuleTraceSchema.extend({ value: businessUnitAccountsVisibilitySchema }),
  exportPolicy: workspaceRuleTraceSchema.extend({ value: workspaceExportPolicySchema }),
  /** L'appelant peut-il les changer (propriétaire ou administrateur) ? L'API le re-vérifie. */
  canEdit: z.boolean(),
  /**
   * #2081.14 — la règle laisse-t-elle L'APPELANT faire sortir des données ?
   * Dérivé par l'API avec `workspaceRuleForbids` : l'écran ne recalcule pas,
   * il MASQUE le bouton d'un CSV construit dans le navigateur quand c'est
   * `false`. Le rôle et les accords décident EN PLUS, route par route.
   */
  dataExitAllowed: z.boolean(),
})
export type WorkspaceRulesView = z.infer<typeof workspaceRulesViewSchema>

/**
 * `PATCH /workspaces/rules` — une règle ou les deux. `strict()` : un champ de
 * plus (un rôle, un identifiant d'espace) est refusé, jamais ignoré.
 */
export const updateWorkspaceRulesSchema = z
  .object({
    businessUnitAccountsVisibility: businessUnitAccountsVisibilitySchema.optional(),
    exportPolicy: workspaceExportPolicySchema.optional(),
  })
  .strict()
  .refine(body => body.businessUnitAccountsVisibility !== undefined || body.exportPolicy !== undefined, {
    message: 'workspace_rules_empty_update',
  })
export type UpdateWorkspaceRules = z.infer<typeof updateWorkspaceRulesSchema>
