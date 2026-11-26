import { describe, expect, it } from 'vitest'
import { auditShareUrl } from './audit-share-url'

/**
 * #2075.17 — L'AUDIT EST DÉJÀ WORKSPACE-SCOPÉ CÔTÉ SERVEUR (un seul par
 * espace, dérivé d'`esn_profiles`) : ce module ne fait que composer l'URL
 * FIXE de l'écran, comme `chatShareUrl` pour le fil — aucun second chemin
 * de lecture, aucun paramètre de portée à porter.
 */
describe('auditShareUrl', () => {
  it('rend le lien fixe vers /settings/profile/audit', () => {
    expect(auditShareUrl('https://app.example.test')).toBe('https://app.example.test/settings/profile/audit')
  })

  it("ne dépend d'aucun identifiant — même lien pour tout membre de l'espace", () => {
    const a = auditShareUrl('https://app.example.test')
    const b = auditShareUrl('https://app.example.test')
    expect(a).toBe(b)
  })
})
