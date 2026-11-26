import { describe, expect, it } from 'vitest'
import { commercialAuditVersionOf } from './commercial-audit-version.js'
import type { ProfileContext } from './profile-context.js'

/**
 * #2908 (#2011.4) — `commercial_audit_version` EN EMPREINTE DE CONTENU, pas
 * un compteur. `profiles.profile_context_version` (le compteur existant)
 * bouge à chaque régénération, MÊME quand le contenu produit est identique
 * (deux réponses byte-identiques régénérées deux fois) — la régénération
 * ciblée par section (#2010.16, #2011.10) a besoin de savoir si LE CONTENU a
 * changé, pas si une génération a eu lieu.
 */
describe('commercialAuditVersionOf — une empreinte de contenu, jamais un compteur', () => {
  it('aucun contexte : `null`, jamais une empreinte inventée', () => {
    expect(commercialAuditVersionOf(null)).toBeNull()
  })

  it('deux contextes au contenu identique rendent la MÊME empreinte, quel que soit l’ordre des clés', () => {
    const a = { idealAccountProfile: { entryStrategy: 'direct' }, sectors: ['tech', 'retail'] } as ProfileContext
    const b = { sectors: ['tech', 'retail'], idealAccountProfile: { entryStrategy: 'direct' } } as ProfileContext
    expect(commercialAuditVersionOf(a)).toBe(commercialAuditVersionOf(b))
  })

  it('deux contenus différents rendent des empreintes différentes', () => {
    const a = { idealAccountProfile: { entryStrategy: 'direct' } } as ProfileContext
    const b = { idealAccountProfile: { entryStrategy: 'partner' } } as ProfileContext
    expect(commercialAuditVersionOf(a)).not.toBe(commercialAuditVersionOf(b))
  })
})
