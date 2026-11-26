import { AdminClientHealthController } from './admin-client-health.controller'
import type { AdminClientHealthService } from './admin-client-health.service'

/**
 * Le contrôleur de `/revenus/clients` (#1652) : trois lignes, mais deux
 * décisions qui se cassent en silence si personne ne les regarde.
 *
 *  1. **L'horloge est lue ICI, et nulle part ailleurs.** Le service et le calcul
 *     la REÇOIVENT ; si le contrôleur cessait de la passer, les deux se
 *     mettraient à lire `new Date()` chacun de leur côté et deux specs vertes
 *     couvriraient un code non déterministe.
 *  2. **Une recherche vide n'est pas une recherche.** `?search=` (ou
 *     `?search=%20`) doit valoir « pas de filtre », sinon le `ILIKE '%%'` du
 *     service tourne pour rien — et surtout `?search=   ` filtrerait sur des
 *     espaces et rendrait un écran vide qu'on lirait « aucun client ».
 */

function monter(): { controller: AdminClientHealthController; appels: { search?: string; now: Date }[] } {
  const appels: { search?: string; now: Date }[] = []
  const service = {
    list: async (query: { search?: string; now: Date }) => {
      appels.push(query)
      return { rows: [], total: 0, windowDays: 90, featureCatalogue: null, computedAt: query.now.toISOString() }
    },
  } as unknown as AdminClientHealthService
  return { controller: new AdminClientHealthController(service), appels }
}

describe('GET internal/admin/client-health', () => {
  it('passe une horloge au service — elle n’est jamais lue plus bas', async () => {
    const { controller, appels } = monter()
    const avant = Date.now()
    await controller.list()
    const apres = Date.now()

    expect(appels).toHaveLength(1)
    const passe = appels[0]?.now
    expect(passe).toBeInstanceOf(Date)
    // Encadrée plutôt que comparée : c'est l'instant de LA REQUÊTE, pas une
    // constante — le test le prouve sans figer le temps.
    expect(passe!.getTime()).toBeGreaterThanOrEqual(avant)
    expect(passe!.getTime()).toBeLessThanOrEqual(apres)
  })

  it('transmet une recherche utile, taillée de ses espaces', async () => {
    const { controller, appels } = monter()
    await controller.list('  abricot  ')
    expect(appels[0]?.search).toBe('abricot')
  })

  it('ne transmet PAS une recherche vide — un filtre sur du vide vide l’écran', async () => {
    const { controller, appels } = monter()
    await controller.list('')
    await controller.list('   ')
    await controller.list()
    expect(appels.map(appel => appel.search)).toEqual([undefined, undefined, undefined])
  })

  it('rend ce que le service rend, sans le retoucher', async () => {
    const { controller } = monter()
    const rapport = await controller.list()
    expect(rapport.rows).toEqual([])
    expect(rapport.windowDays).toBe(90)
    // ⚠️ `featureCatalogue: null` traverse le contrôleur TEL QUEL. Un `?? 0`
    // ici transformerait « aucun geste enregistré » en « zéro fonction », et
    // tout le travail fait plus bas serait annulé par la couche la plus mince.
    expect(rapport.featureCatalogue).toBeNull()
  })
})
