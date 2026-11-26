import { describe, expect, it } from 'vitest'
import {
  can,
  effectiveExtraPermissions,
  hasPermission,
  setMemberPermissionsSchema,
  workspaceRoleValues,
  type WorkspacePermission,
} from './workspace.js'

/**
 * Les permissions additives, et les deux rôles métier qui manquaient.
 *
 * Le ticket BEL-ARCH-001 partait d'une prémisse fausse — « 3 rôles ne couvrent
 * pas 5 métiers ESN » — alors que le dépôt en portait déjà sept, avec une
 * matrice unique et un guard serveur. Ce qui manquait vraiment tient en deux
 * choses : deux métiers sans siège (`recruiter`, `finance`), et l'impossibilité
 * d'accorder UN droit à UNE personne.
 *
 * Sans exception nominative, la seule réponse au commercial à qui on confie la
 * connexion du CRM était de le passer `admin` : huit droits pour en régler un.
 * C'est ainsi qu'un espace se retrouve avec quatre administrateurs, et qu'un
 * modèle de permissions cesse de vouloir dire quoi que ce soit.
 */
describe('permissions additives', () => {
  it('accorde un droit que le rôle n’a pas', () => {
    expect(hasPermission('sales', 'integrations:manage')).toBe(false)
    expect(can('sales', ['integrations:manage'], 'integrations:manage')).toBe(true)
  })

  it('n’enlève JAMAIS rien — un droit du rôle reste acquis quelle que soit la liste', () => {
    // La règle qui rend le modèle lisible. Un « rôle moins une permission » se
    // lit comme un rôle et se découvre le jour où quelqu'un est bloqué.
    expect(can('sales', [], 'analysis:run')).toBe(true)
    expect(can('sales', ['finance:read'], 'analysis:run')).toBe(true)
  })

  it('laisse `viewer` en lecture seule tant qu’on ne lui accorde rien', () => {
    expect(can('viewer', [], 'records:write')).toBe(false)
  })

  it('permet d’ouvrir UN droit à un lecteur sans en faire un commercial', () => {
    expect(can('viewer', ['data:export'], 'data:export')).toBe(true)
    expect(can('viewer', ['data:export'], 'records:write')).toBe(false)
  })

  it('n’affiche comme « en plus » que ce qui l’est vraiment', () => {
    // Montrer un accord déjà couvert par le rôle laisserait croire à un
    // privilège là où il n'y en a pas.
    expect(effectiveExtraPermissions('sales', ['analysis:run', 'finance:read'])).toEqual(['finance:read'])
  })

  it('rend une liste vide quand un membre n’a aucune exception', () => {
    expect(effectiveExtraPermissions('admin', [])).toEqual([])
  })

  it('accepte une liste vide — c’est le geste « retirer toutes les exceptions »', () => {
    expect(setMemberPermissionsSchema.safeParse({ permissions: [] }).success).toBe(true)
  })

  it('refuse une permission inventée', () => {
    expect(setMemberPermissionsSchema.safeParse({ permissions: ['tout:faire'] }).success).toBe(false)
  })
})

describe('les deux rôles métier ajoutés', () => {
  it('existe un siège recrutement et un siège finance', () => {
    expect(workspaceRoleValues).toContain('recruiter')
    expect(workspaceRoleValues).toContain('finance')
  })

  it('les ajoute EN FIN — l’ordre de cette liste pilote le tri de l’écran Équipe', () => {
    expect(workspaceRoleValues.slice(-2)).toEqual(['recruiter', 'finance'])
  })

  it('le recrutement tient le vivier sans toucher au pipe commercial', () => {
    expect(hasPermission('recruiter', 'records:write')).toBe(true)
    expect(hasPermission('recruiter', 'contacts:enrich')).toBe(true)
    expect(hasPermission('recruiter', 'analysis:run')).toBe(false)
  })

  it('le recrutement n’a PAS le droit d’envoi — un recruteur écrit depuis sa messagerie, pas via le moteur de prospection', () => {
    // Lui ouvrir `messages:send` le ferait entrer dans les plafonds d'envoi
    // d'une campagne commerciale, où il n'a rien à faire.
    expect(hasPermission('recruiter', 'messages:send')).toBe(false)
  })

  it('la finance voit la marge et l’abonnement, et n’écrit AUCUNE fiche', () => {
    expect(hasPermission('finance', 'finance:read')).toBe(true)
    expect(hasPermission('finance', 'billing:manage')).toBe(true)
    expect(hasPermission('finance', 'records:write')).toBe(false)
    expect(hasPermission('finance', 'team:manage')).toBe(false)
  })

  it('n’a modifié AUCUN rôle existant — la migration RBAC promettait de ne retirer d’accès à personne', () => {
    const before: Record<string, WorkspacePermission[]> = {
      sales: ['analysis:run', 'contacts:enrich', 'data:export', 'messages:send', 'records:write'],
      tech_admin: ['integrations:manage'],
      viewer: [],
    }
    for (const [role, permissions] of Object.entries(before)) {
      for (const permission of permissions) {
        expect(hasPermission(role as never, permission)).toBe(true)
      }
    }
    expect(hasPermission('member', 'integrations:manage')).toBe(true)
    expect(hasPermission('member', 'billing:manage')).toBe(true)
  })
})
