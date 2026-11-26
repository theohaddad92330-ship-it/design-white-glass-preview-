import 'reflect-metadata'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { REQUIRE_FEATURE_KEY } from '../plan-features/require-feature.decorator'
import { RfpController } from './rfp.controller'

/**
 * #2957 (#2179.1) — « afficher la page uniquement aux plans qui l'incluent ».
 * Les DEUX moitiés sont nécessaires : l'annotation sans le guard ne refuse
 * rien (`require-feature.decorator.ts`), le guard sans l'annotation laisse tout
 * passer.
 */
describe('RfpController — porte de palier', () => {
  it('déclare la feature « rfp » au niveau du contrôleur', () => {
    expect(Reflect.getMetadata(REQUIRE_FEATURE_KEY, RfpController)).toBe('rfp')
  })

  it('monte PlanFeatureGuard, sans quoi l’annotation ne ferme rien', () => {
    const guards = Reflect.getMetadata('__guards__', RfpController) as unknown[]
    expect(guards).toContain(PlanFeatureGuard)
  })
})

// #2957 (#2179.37, GA-05) — les deux gestes d'écriture ajoutés par ce lot
// déclarent `records:write` : un `viewer` (aucune permission) est refusé côté
// serveur comme il l'est à l'écran.
describe('RfpController — écritures déclarées', () => {
  it('commenter et attribuer une section exigent records:write, avec le guard monté', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, RfpController.prototype.addRequirementComment)).toEqual([
      'records:write',
    ])
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, RfpController.prototype.assignSectionOwner)).toEqual([
      'records:write',
    ])
    expect(Reflect.getMetadata('__guards__', RfpController) as unknown[]).toContain(WorkspacePermissionGuard)
  })
})
