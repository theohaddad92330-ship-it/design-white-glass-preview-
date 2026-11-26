import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2377.8 — « Une conversation exploratoire ne devient pas automatiquement
 * opportunité. »
 *
 * ## Ce que cette garde vérifiait jusqu'au 25/09/2026
 *
 * Depuis #2377.3, une activité `call` porte un `call_outcome` — dont
 * `interest`. Jusqu'ici, rien dans le dépôt ne lisait ce champ pour fabriquer
 * un objet CRM, et cette garde figeait cette absence en interdisant tout
 * import du module CRM depuis `ActivitiesService`/`ActionPlanItemsService` —
 * la docstring d'alors disait explicitement qu'un futur branchement CRM
 * devrait AJOUTER cette dépendance « un geste visible en revue — plutôt que
 * de la trouver déjà là et de s'y brancher en silence ».
 *
 * ## Ce qui a changé le 25/09/2026 (#2386.A, #3010)
 *
 * Ce geste visible a eu lieu : `ActivitiesService.log()` écrit désormais
 * l'issue d'un appel sur la fiche CRM du contact (`crm-call-note.ts`,
 * `writebackCrmCallNote`) — la porte `CrmService.logActivity` (`create_note`,
 * déjà branchée depuis la téléphonie) avait cette écriture précise SANS
 * appelant depuis la saisie manuelle. La garde se RESSERRE plutôt que de
 * disparaître : `ActivitiesService` peut désormais dépendre de `CrmService`,
 * mais UNIQUEMENT pour lire une fiche (`findContactRecord`) et y écrire une
 * NOTE (`logActivity`) — jamais pour créer ou faire avancer une AFFAIRE
 * (`exportNeed` crée un Deal, `proposeDealStage` en change le stade). C'est
 * cette distinction-là, et non l'absence totale d'import, qui porte la
 * promesse du #2377.8 : une conversation « intérêt » gagne une note sur la
 * fiche, jamais une opportunité fabriquée toute seule.
 *
 * `ActionPlanItemsService` (la prochaine action issue d'un appel, #2377.6)
 * reste, lui, INCHANGÉ : aucun import CRM, aucune raison d'en avoir un — la
 * prochaine action s'écrit dans `action_plan_items`, jamais dans le CRM.
 *
 * ## Ce qu'elle ne prétend pas faire
 *
 * Elle ne prétend pas qu'aucune fonctionnalité future ne pourra jamais créer
 * d'opportunité sur un outcome — seulement que `ActivitiesService.log()` ne
 * peut appeler que les DEUX méthodes nommées ci-dessous, et qu'ajouter un
 * appel à une méthode CRM qui crée ou avance une affaire ne peut plus se
 * glisser SANS faire échouer cette liste.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

function fileSource(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf8')
}

function importLines(source: string): string[] {
  return source.split('\n').filter(line => /^import\s/.test(line.trim()))
}

const CRM_MODULE_PATTERN = /['"].*\/crm\//
/** Les seuls appels CRM que `ActivitiesService` a le droit de faire — lire une
 *  fiche, y écrire une NOTE. Jamais créer/faire avancer une AFFAIRE. */
const ALLOWED_CRM_CALLS = /this\.crm\.(findContactRecord|logActivity)\(/g
/** Les deux méthodes CRM qui créent ou font avancer une AFFAIRE — la ligne que
 *  #2377.8 interdit de franchir depuis un `call_outcome`. */
const OPPORTUNITY_CREATING_CALL = /this\.crm\.(exportNeed|proposeDealStage)\(/

describe('#2377.8 — un outcome « intérêt » ne crée jamais d’opportunité automatiquement', () => {
  const activitiesSource = fileSource('apps/api/src/modules/activities/activities.service.ts')

  it('ActionPlanItemsService (la prochaine action issue d’un appel, #2377.6) n’importe RIEN du module CRM', () => {
    const imports = importLines(fileSource('apps/api/src/modules/actions/action-plan-items.service.ts'))
    expect(imports.some(line => CRM_MODULE_PATTERN.test(line))).toBe(false)
  })

  it('ActivitiesService n’appelle le CRM QUE pour lire une fiche et y écrire une note (#2386.A)', () => {
    const calls = [...activitiesSource.matchAll(/this\.crm\.\w+\(/g)].map(match => match[0])
    expect(calls.length).toBeGreaterThan(0) // sait dire OUI : la porte #2386.A est bien câblée.
    for (const call of calls) expect(call).toMatch(ALLOWED_CRM_CALLS)
  })

  it('ActivitiesService n’appelle JAMAIS une méthode CRM qui crée ou avance une affaire', () => {
    expect(activitiesSource).not.toMatch(OPPORTUNITY_CREATING_CALL)
  })

  it('SAIT DIRE NON — un appel à `exportNeed` (création de Deal) serait détecté', () => {
    const fakeSource = 'await this.crm.exportNeed(userId, input)'
    expect(fakeSource).toMatch(OPPORTUNITY_CREATING_CALL)
  })

  it('N’ATTRAPE PAS le mot « CRM » dans un commentaire ou un nom de méthode — seuls les appels comptent', () => {
    const fakeSource = [
      '// on journalise ce que Laura a lu dans le CRM',
      '  async recordCrmLookup() {}',
      "import { WorkspaceContextService } from '../workspace/workspace-context.service'",
    ].join('\n')
    expect(fakeSource).not.toMatch(OPPORTUNITY_CREATING_CALL)
    expect([...fakeSource.matchAll(/this\.crm\.\w+\(/g)]).toHaveLength(0)
  })
})
