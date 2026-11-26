import { describe, expect, it, vi } from 'vitest'

/**
 * « MES missions en cours » DEMANDE le portefeuille du lecteur (D880).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc « Mon activité » du cockpit titre « Mes missions en cours » et
 * appelait `useMissions()` SANS portée — la route rend alors l'ESPACE ENTIER
 * (`readListScope` retombe sur `{ kind: 'workspace' }`,
 * `delivery.controller.ts:146-149`). Un commercial lisait donc les missions de
 * ses collègues sous un titre qui promet les siennes.
 *
 * Jumeau exact du défaut « Mon pipe » corrigé le même soir, et même classe que
 * la PR #1206 sur les quatre routes finance. Le serveur savait déjà lire
 * `?scope=own` ; seul le web ne l'envoyait pas — motif maison « paramètre
 * déclaré, jamais passé ».
 *
 * ⚠️ Ce test regarde l'URL RÉELLEMENT émise, pas un mock qui jetterait ses
 * arguments : c'est précisément un mock qui jetait son argument qui avait laissé
 * passer le jumeau.
 */
const apiFetch = vi.fn().mockResolvedValue({ missions: [], total: 0 })
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

describe('« Mes missions » demande la portée du lecteur', () => {
  it('envoie `scope=own` dans l’URL quand la portée est demandée', async () => {
    const { missionsApi } = await import('./api')
    apiFetch.mockClear()
    await missionsApi.list({ scope: 'own' })
    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/delivery/missions?scope=own' }))
  })

  it('n’envoie AUCUNE portée quand personne n’en demande — l’espace reste le défaut', async () => {
    const { missionsApi } = await import('./api')
    apiFetch.mockClear()
    await missionsApi.list()
    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/delivery/missions' }))
  })

  it('la PORTÉE entre dans la clé de cache — sinon un écran rend la réponse de l’autre', async () => {
    const { missionKeys } = await import('./api')
    expect(missionKeys.list({ scope: 'own' })).not.toEqual(missionKeys.list())
  })
})
