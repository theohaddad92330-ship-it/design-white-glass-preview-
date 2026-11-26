import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2395.6 — interdire à toute page de créer une liste d'actions PARALLÈLE.
 *
 * Trois maisons natives portent une « chose à faire » (`action_plan_items`,
 * `tasks`, `outreach_call_tasks` — inventaire complet : registre
 * `.claude/notes/registre-2026-09-20-chat-lot4.md#2395.1`). Un écran qui
 * requête l'une d'elles DIRECTEMENT, plutôt que par la fonction déjà exportée
 * de son module, recrée sa propre liste : la même donnée finit par diverger de
 * l'objet Action canonique (`packages/contracts/src/schemas/action.ts`) que
 * `GET /action-os/actions` rend.
 *
 * Ce que cette garde protège précisément : SEULS les trois clients HTTP qui
 * SONT le module (`planItems.api.ts`, `tasks/api.ts`, `outreach/api.ts`)
 * portent un `path:` littéral vers ces endpoints. Toute autre page passe par
 * les fonctions qu'ils exportent — jamais par un `apiFetch` refait sur place.
 *
 * #2871 (28/09) — RESSERRÉE. #2395.5 (la bascule du plan de compte sur une
 * projection en lecture seule du contrat canonique, `useAccountCanonicalActions`
 * / `GET /accounts/:id/actions`) est livrée (lot G, 27/09, `b910272ab5`) : le
 * blind spot documenté ci-dessous jusqu'ici — « rien n'empêche une page
 * d'IMPORTER une fonction de liste pour en refaire le rendu à côté de la page
 * Actions » — n'a plus de raison de rester ouvert. La deuxième moitié de cette
 * garde (plus bas) le ferme : SEULS les fichiers d'`APPELANTS_LISTE_AUTORISES`
 * ont le droit d'appeler `planItemsApi.list`/`.mine` (les deux fonctions qui
 * lisent `action_plan_items` en LISTE). Tout NOUVEAU fichier qui les appelle
 * recrée la liste parallèle que #2395.6 interdit.
 */

const FEATURES = join(import.meta.dirname, '..', 'features')

/** Les trois clients HTTP qui SONT le module — rien d'autre n'a le droit. */
const CLIENTS_AUTORISES = ['features/actions/planItems.api.ts', 'features/tasks/api.ts', 'features/outreach/api.ts']

/** Un `path:` littéral vers une des trois maisons natives, hors mutation par id. */
const APPEL_BRUT = /path:\s*[`'"]\/(plan-items|outreach\/call-tasks|tasks)(?=[/'"`?]|$)/m

/**
 * #2871 (#2395.6) — un appel à l'une des DEUX fonctions qui listent
 * `action_plan_items` en entier (`.list()` par compte, `.mine()` tous comptes).
 * `.create`/`.update`/etc. ne sont jamais visés : écrire une ligne n'en
 * recrée pas une liste parallèle, c'est exactement le geste que la maison
 * native attend de tout écran.
 */
const APPEL_LISTE = /planItemsApi\.(list|mine)\(/

/**
 * Les seuls fichiers qui ont le droit de LIRE `action_plan_items` en liste,
 * chacun avec sa raison — une liste FERMÉE, pas un motif regex qui laisserait
 * passer un cousin non revu :
 * - `actions/hooks/usePlanItems.ts` — la maison native elle-même (gestes du
 *   plan de compte, `ActionPlanBoard`).
 * - `actions/hooks/useMyActions.ts` — « Mes relances » du Centre d'actions
 *   (#2114.46/.57), antérieur au contrat canonique #2395 ; en migrer le
 *   rendu vers `GET /action-os/actions` est un chantier produit à part (accepté
 *   dans son propre docstring), pas une tranche de #2395.6.
 * - `global-search/useActionSearchResults.ts` — filtre en mémoire la MÊME
 *   liste `mine()` pour la palette de recherche globale ; ne rend jamais un
 *   écran Actions concurrent.
 * - `accounts/view/account-detail/search/AccountDossierSearch.tsx` — même
 *   geste, côté recherche du dossier compte ; MÊME clé de cache que
 *   `usePlanItems` (`planItemsKey`), donc pas une seconde requête réseau.
 */
const APPELANTS_LISTE_AUTORISES = [
  'features/actions/hooks/usePlanItems.ts',
  'features/actions/hooks/useMyActions.ts',
  'features/global-search/useActionSearchResults.ts',
  'features/accounts/view/account-detail/search/AccountDossierSearch.tsx',
]

function fichiersSurveilles(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      fichiersSurveilles(chemin, acc)
      continue
    }
    if (!/\.tsx?$/.test(entree) || /\.(test|spec|fixture)\.tsx?$/.test(entree)) continue
    acc.push(chemin)
  }
  return acc
}

describe('#2395.6 — aucune page ne requête les actions hors de leur module', () => {
  it('seuls les trois clients HTTP du module portent un chemin brut', () => {
    const surveilles = fichiersSurveilles(FEATURES)

    // Une garde qui ne lit rien est verte pour rien.
    expect(surveilles.length).toBeGreaterThan(100)

    const fautifs = surveilles
      .map(chemin => ({
        chemin,
        relatif:
          'features/' +
          chemin
            .slice(FEATURES.length + 1)
            .split(/[\\/]/)
            .join('/'),
      }))
      .filter(({ relatif }) => !CLIENTS_AUTORISES.includes(relatif))
      .filter(({ chemin }) => APPEL_BRUT.test(readFileSync(chemin, 'utf8')))
      .map(({ relatif }) => relatif)

    expect(fautifs).toEqual([])
  })

  it('#2395.6 resserrée — seuls les appelants nommés lisent action_plan_items en LISTE', () => {
    const surveilles = fichiersSurveilles(FEATURES)
    expect(surveilles.length).toBeGreaterThan(100)

    const fautifs = surveilles
      .map(chemin => ({
        chemin,
        relatif:
          'features/' +
          chemin
            .slice(FEATURES.length + 1)
            .split(/[\\/]/)
            .join('/'),
      }))
      .filter(({ relatif }) => !APPELANTS_LISTE_AUTORISES.includes(relatif))
      .filter(({ chemin }) => APPEL_LISTE.test(readFileSync(chemin, 'utf8')))
      .map(({ relatif }) => relatif)

    expect(fautifs).toEqual([])
  })

  it('les quatre appelants autorisés existent VRAIMENT et appellent bien `.list`/`.mine`', () => {
    // Une allowlist qui pointe vers un fichier renommé ou déplacé ne protège
    // plus rien — elle passe silencieusement, comme une garde qui ne lit rien.
    for (const relatif of APPELANTS_LISTE_AUTORISES) {
      const source = readFileSync(join(FEATURES, relatif.slice('features/'.length)), 'utf8')
      expect(APPEL_LISTE.test(source)).toBe(true)
    }
  })

  it('la garde sait dire NON, et ne se trompe pas de forme', () => {
    expect(APPEL_BRUT.test(`return apiFetch<Task[]>({ path: '/tasks' })`)).toBe(true)
    expect(APPEL_BRUT.test(`return apiFetch<OutreachCallTask[]>({ path: '/outreach/call-tasks' })`)).toBe(true)
    expect(APPEL_BRUT.test(`path: \`/plan-items/\${id}\`,`)).toBe(true)
    // Une clé de cache TanStack (`['plan-items', 'mine']`) n'est pas un appel HTTP.
    expect(APPEL_BRUT.test(`export const myPlanActionsKey = ['plan-items', 'mine'] as const`)).toBe(false)
    // Un commentaire qui NOMME l'endpoint sans l'appeler ne doit pas accuser le fichier.
    expect(APPEL_BRUT.test(`// #2123 — une action du plan telle que \`GET /plan-items\` la rend`)).toBe(false)
  })

  it('#2395.6 — `APPEL_LISTE` distingue une LECTURE de liste d’une simple écriture', () => {
    expect(APPEL_LISTE.test('planItemsApi.list(accountId)')).toBe(true)
    expect(APPEL_LISTE.test('planItemsApi.mine({ overdue: true })')).toBe(true)
    // Créer/mettre à jour UNE ligne n'en recrée pas une liste — la maison
    // native attend justement ce geste de tout écran.
    expect(APPEL_LISTE.test('planItemsApi.create(input)')).toBe(false)
    expect(APPEL_LISTE.test('planItemsApi.update(id, patch)')).toBe(false)
    // Un commentaire qui NOMME la fonction sans l'appeler ne doit pas accuser le fichier.
    expect(APPEL_LISTE.test('// voir `planItemsApi.list` pour le détail')).toBe(false)
  })
})
