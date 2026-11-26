import { PERSONAL_SCOPE_KEY } from '../../common/decorator/personal-scope.decorator'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { MailboxController } from './mailbox.controller'

/**
 * #4682.1 — `GET mailbox/senders` lisait les boîtes de l'appelant sans déclarer ce qu'elle garde : indistinguable d'une
 * route qui a oublié sa permission. Elle est PERSONNELLE (bornée à `user.userId`) : `@PersonalScope` sur la MÉTHODE,
 * jamais sur la classe — il blanchirait les autres routes du contrôleur.
 */
describe('MailboxController — senders (#4682.1)', () => {
  const proto = MailboxController.prototype as unknown as Record<string, object>
  const meta = (key: string, method: string): unknown => Reflect.getMetadata(key, proto[method]!)

  it('senders déclare un scope PERSONNEL, sans permission d’espace', () => {
    expect(meta(PERSONAL_SCOPE_KEY, 'senders')).toBe(true)
    expect(meta(REQUIRE_PERMISSION_KEY, 'senders')).toBeUndefined()
  })

  it('le marqueur ne blanchit pas la classe : une autre route ne le porte pas', () => {
    expect(Reflect.getMetadata(PERSONAL_SCOPE_KEY, MailboxController)).toBeUndefined()
    expect(meta(PERSONAL_SCOPE_KEY, 'status')).toBeUndefined()
  })
})
