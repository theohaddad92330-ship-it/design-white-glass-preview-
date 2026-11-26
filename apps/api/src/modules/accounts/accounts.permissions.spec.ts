import 'reflect-metadata'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { AccountsController } from './accounts.controller'

/**
 * Chaque ÉCRITURE du contrôleur des comptes déclare sa permission (PDF 2 §14).
 *
 * Le défaut que cette garde ferme : `WorkspacePermissionGuard` est fail-open,
 * donc une route sans `@RequirePermission` passe intacte. Le rôle `viewer` —
 * documenté « strictly read-only … refused on every mutation » — créait,
 * archivait et reclassait des comptes ; `finance`, dont la matrice dit « AUCUN
 * droit d'écriture sur les fiches », aussi.
 *
 * Une garde par NOM DE MÉTHODE plutôt qu'un `grep` sur le fichier : une méthode
 * ajoutée demain sans permission tombe ici, alors qu'un fichier qui contient
 * déjà douze décorateurs passerait un grep sans rien prouver.
 */
describe('AccountsController — les écritures déclarent leur permission', () => {
  const EXPECTED: Record<string, string> = {
    create: 'records:write',
    addToPortfolio: 'records:write',
    removeFromPortfolio: 'records:write',
    createShareLink: 'data:export',
    archive: 'records:write',
    setCommercialStatus: 'records:write',
    setRelationshipMemory: 'records:write',
    importContacts: 'records:write',
    importContactsCsv: 'records:write',
    // #2123.46 — alias déprécié le 17/09 : même garde qu'avant.
    addPlanAction: 'records:write',
    addAttackAngle: 'records:write',
    delete: 'records:write',
  }

  for (const [method, permission] of Object.entries(EXPECTED)) {
    it(`${method} exige ${permission}`, () => {
      const handler = (AccountsController.prototype as unknown as Record<string, () => unknown>)[method]
      expect(typeof handler).toBe('function')
      // La métadonnée porte une LISTE : plusieurs permissions peuvent ouvrir une
      // route, et l'UNE d'entre elles suffit.
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toEqual([permission])
    })
  }

  it('ne garde PAS les lectures — voir un compte de son équipe est le principe du portefeuille partagé', () => {
    const reads = ['findAll', 'findOne', 'listBranches']
    for (const method of reads) {
      const handler = (AccountsController.prototype as unknown as Record<string, () => unknown>)[method]
      if (typeof handler !== 'function') continue
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toBeUndefined()
    }
  })
})
