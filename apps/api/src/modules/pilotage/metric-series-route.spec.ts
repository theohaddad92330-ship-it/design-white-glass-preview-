import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { METRIC_SERIES_MAX_MONTHS } from '@bellum/contracts'
import { WORKSPACE_READ_KEY } from '../../common/decorator/workspace-read.decorator'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { PilotageController } from './pilotage.controller'

/**
 * LA ROUTE QUI MANQUAIT À LA PHOTO MENSUELLE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE EXISTE POUR EMPÊCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * `StockSnapshotService.seriesFor` était écrite, testée, juste — et appelée par
 * PERSONNE. C'est le défaut n°1 du dépôt, et le poser n'était pas une erreur du
 * lot précédent : il n'avait pas le droit de toucher aux écrans, donc une route
 * de plus aurait juste déplacé le problème d'un cran.
 *
 * Cette garde tient la moitié serveur du branchement, et elle vérifie trois
 * choses qu'un `grep` ne distingue pas :
 *
 *  1. la route existe et APPELLE réellement `seriesFor` — pas « une méthode
 *     existe sur le contrôleur » ;
 *  2. le marqueur de lecture d'espace est posé en MÉTADONNÉE, pas écrit dans un
 *     commentaire (le dépôt a déjà payé cette confusion deux fois — un
 *     renommage i18n sur la mauvaise clé, et GA-05 qui sautait un fichier
 *     entier parce qu'un nom de décorateur traînait dans une prose) ;
 *  3. aucune permission n'est exigée — `ROLE_PERMISSIONS` n'en a AUCUNE de
 *     lecture, et en inventer une fermerait la porte à `viewer` et à `sales`,
 *     qui lisent déjà ces mêmes chiffres nus sur `/pilotage`.
 *
 * ⚠️ Le point 2 se vérifie SUR L'OBJET, jamais sur le texte : c'est la seule
 * lecture qui distingue un décorateur appliqué d'un décorateur commenté, importé
 * sans être posé, ou posé sur le mauvais membre.
 */

type Recorded = { workspaceId: string; months: number }

function controllerUnderTest(recorded: Recorded[]): PilotageController {
  const snapshots = {
    seriesFor: async (workspaceId: string, months: number) => {
      recorded.push({ workspaceId, months })
      return { series: [], monthsCovered: 0 }
    },
  }
  const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: 'ws-1' }) }
  // Les AUTRES dépendances ne sont pas touchées par cette route : les passer
  // nulles PROUVE qu'elle ne les appelle pas — un mock complaisant laisserait
  // passer une route qui recalcule la chaîne pour rien.
  //
  // ⚠️ Construit par NOM et non par position. La version positionnelle a cassé
  // à la fusion du 01/09, quand un autre lot a inséré `FinanceTargetService`
  // en cinquième argument : `workspaceContext` s'est retrouvé à sa place, et
  // l'erreur — « Cannot read properties of undefined » — ne nommait ni le lot
  // ni la cause. Une jointure par position dérive au premier ajout.
  const controller = Object.create(PilotageController.prototype) as PilotageController
  Object.assign(controller, { stockSnapshots: snapshots, workspaceContext })
  return controller
}

describe('GET /pilotage/metric-series — la série des photos mensuelles', () => {
  it('la garde LIT quelque chose — la méthode existe sur le contrôleur', () => {
    // Sans ceci, tout ce qui suit passerait au vert sur un contrôleur vide le
    // jour où quelqu'un renomme la route.
    expect(typeof (PilotageController.prototype as unknown as Record<string, unknown>).metricSeries).toBe('function')
  })

  it('appelle `seriesFor` sur l’espace ACTIF de l’appelant, jamais sur un identifiant reçu', () => {
    const recorded: Recorded[] = []
    return controllerUnderTest(recorded)
      .metricSeries({ userId: 'user-1' } as never, { months: 6 } as never)
      .then(() => {
        expect(recorded).toEqual([{ workspaceId: 'ws-1', months: 6 }])
      })
  })

  it('sans `months`, remonte douze mois — assez pour « vs N-1 »', () => {
    const recorded: Recorded[] = []
    return controllerUnderTest(recorded)
      .metricSeries({ userId: 'user-1' } as never, {} as never)
      .then(() => {
        expect(recorded[0]?.months).toBe(12)
        expect(recorded[0]?.months).toBeLessThanOrEqual(METRIC_SERIES_MAX_MONTHS)
      })
  })

  it('porte le marqueur de lecture d’espace — en MÉTADONNÉE, pas dans un commentaire', () => {
    const handler = (PilotageController.prototype as unknown as Record<string, object>).metricSeries
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handler)).toBe(true)
  })

  it('n’exige AUCUNE permission — la matrice n’en a pas pour une lecture', () => {
    const handler = (PilotageController.prototype as unknown as Record<string, object>).metricSeries
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBeUndefined()
  })

  it('le marqueur n’est PAS posé sur le contrôleur entier — les cinq autres routes restent comptées', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, PilotageController)).toBeUndefined()
  })

  /**
   * Le marqueur est-il SOUS le décorateur de route ?
   *
   * GA-05 segmente les routes en partant du verbe HTTP : un marqueur écrit
   * AU-DESSUS du `@Get(...)` compte pour la route PRÉCÉDENTE, la route neuve
   * redevient nue, et rien ne rougit — la métadonnée, elle, serait quand même
   * posée au bon endroit. C'est le seul défaut de ce lot qu'aucun des tests
   * ci-dessus ne peut voir, d'où cette lecture du TEXTE, qui est ici la bonne.
   *
   * ⚠️ Les commentaires partent AVANT la recherche : la première version de
   * cette garde trouvait le nom du décorateur dans son propre docblock.
   */
  it('le marqueur est posé SOUS le décorateur de route, jamais au-dessus', () => {
    const source = readFileSync(join(__dirname, 'pilotage.controller.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    const route = source.indexOf("@Get('metric-series')")
    const marker = source.indexOf('@WorkspaceRead()')
    expect(route).toBeGreaterThan(-1)
    expect(marker).toBeGreaterThan(route)
    // Et RIEN d'autre entre les deux qu'un saut de ligne : un décorateur glissé
    // au milieu déplacerait le marqueur hors de sa route.
    expect(source.slice(route + "@Get('metric-series')".length, marker).trim()).toBe('')
  })
})
