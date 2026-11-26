import { workspaceRoleSchema, type WorkspaceRole } from '@bellum/contracts'

/**
 * Théo D team-admin.R5 — les CINQ profils de la matrice de droits (Direction/administration · Opérations
 * commerciales · Commercial · Administrateur technique · Lecture seule).
 *
 * C'est une CORRESPONDANCE D'AFFICHAGE, écrite et totale : chaque rôle stocké (`WorkspaceRole`) appartient à
 * UN profil, aucun n'est renommé ni migré en base, donc personne ne perd un droit — « Membre » se lit
 * « Commercial », « Admin » se lit « Direction / administration ». Le test de ce fichier échoue si un rôle
 * ajouté demain n'a pas de profil.
 */
export type TeamProfile = 'direction' | 'operations' | 'commercial' | 'tech' | 'readonly'

export const TEAM_PROFILES: readonly TeamProfile[] = ['direction', 'operations', 'commercial', 'tech', 'readonly']

export const PROFILE_OF_ROLE: Readonly<Record<WorkspaceRole, TeamProfile>> = {
  owner: 'direction',
  admin: 'direction',
  sales_ops: 'operations',
  finance: 'operations',
  sales: 'commercial',
  member: 'commercial',
  recruiter: 'commercial',
  tech_admin: 'tech',
  viewer: 'readonly',
}

/** Les quatre colonnes de la matrice : ce que chaque profil ouvre dans Équipe. */
export const RIGHTS_COLUMNS = ['collective', 'members', 'finance', 'privateConversations'] as const
type RightsColumn = (typeof RIGHTS_COLUMNS)[number]

/**
 * Chaque case est une CLÉ de phrase (i18n `teamAdmin:rights.cells.*`), jamais une valeur chiffrée. La colonne
 * « Conversations privées » dit la même chose pour tous : pas de nouvel accès — Équipe ne donne jamais la
 * messagerie (Louis 22/10, Q3 ; doctrine `c96`).
 */
export const RIGHTS_MATRIX: Readonly<Record<TeamProfile, Readonly<Record<RightsColumn, string>>>> = {
  direction: { collective: 'yes', members: 'yes', finance: 'byFinanceRight', privateConversations: 'noNewAccess' },
  operations: {
    collective: 'byPermission',
    members: 'authorizedScope',
    finance: 'notByDefault',
    privateConversations: 'noNewAccess',
  },
  commercial: {
    collective: 'ownActivity',
    members: 'no',
    finance: 'ownScope',
    privateConversations: 'noNewAccess',
  },
  tech: {
    collective: 'notByDefault',
    members: 'noCommercialDelegation',
    finance: 'no',
    privateConversations: 'noNewAccess',
  },
  readonly: {
    collective: 'authorizedScope',
    members: 'no',
    finance: 'byPermission',
    privateConversations: 'noNewAccess',
  },
}

export function profileOf(role: WorkspaceRole): TeamProfile {
  return PROFILE_OF_ROLE[role]
}

/** Les rôles réellement connus du contrat — pour la garde de totalité. */
export const KNOWN_ROLES: readonly WorkspaceRole[] = workspaceRoleSchema.options
