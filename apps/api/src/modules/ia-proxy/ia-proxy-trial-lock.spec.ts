import { REQUIRE_OPEN_TRIAL_KEY } from '../plan-features/require-feature.decorator'
import { IaProxyController } from './ia-proxy.controller'

// #4629.2 — ce qui COÛTE du modèle passe la porte de l'essai : le chat et Découvrir (les trois routes). Une route qui
// perdrait `@RequireOpenTrial()` rouvrirait l'essai terminé sur le modèle ; une route qui ne coûte rien ne le porte pas.
describe('#4629.2 — les routes qui coûtent portent le verrou d’essai', () => {
  const proto = IaProxyController.prototype as unknown as Record<string, () => unknown>
  const carries = (handler: string) => Reflect.getMetadata(REQUIRE_OPEN_TRIAL_KEY, proto[handler]) === true

  it.each(['chat', 'discover', 'discoverRegistry', 'discoverSignals'])('%s est fermé par un essai terminé', handler => {
    expect(carries(handler)).toBe(true)
  })

  it.each(['getChatQuota', 'compare'])('%s ne coûte pas de modèle ici : la porte ne le ferme pas', handler => {
    if (!proto[handler]) return
    expect(carries(handler)).toBe(false)
  })
})
