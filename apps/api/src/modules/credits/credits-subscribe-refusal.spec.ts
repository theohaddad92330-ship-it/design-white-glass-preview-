import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { CreditsController } from './credits.controller'

// #4629.3 — QUI s'abonne : le propriétaire de facturation seul. Un membre simple est REFUSÉ côté serveur, pas
// seulement masqué à l'écran : chaque route qui engage de l'argent exige `billing:manage` (refus 403 par
// `WorkspacePermissionGuard`, voir `workspace-permission.guard.spec.ts` « is refused (403) on billing »).
describe('#4629.3 — s’abonner exige billing:manage', () => {
  const proto = CreditsController.prototype as unknown as Record<string, () => unknown>

  it.each(['createCheckout', 'createPortal', 'setupPaymentMethod', 'createTopup'])(
    '%s est refusé à qui n’a pas billing:manage',
    handler => {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[handler])).toEqual(['billing:manage'])
    },
  )
})
