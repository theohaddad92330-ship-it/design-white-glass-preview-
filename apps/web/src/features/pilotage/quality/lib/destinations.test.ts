import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HYGIENE_CHECKS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import qualityEn from '@/i18n/locales/en/pilotage.json'
import qualityFr from '@/i18n/locales/fr/pilotage.json'
import { isReachable, knownDestinations, normalisePath } from './destinations'

/**
 * La garde des DESTINATIONS de l'écran Qualité des données (PDF-13 §3.2).
 *
 * Une garde côté API vérifie déjà que la table des liens du serveur correspond
 * à l'arbre de routes du web (`hygiene-routes.spec.ts`). Celle-ci garde l'autre
 * moitié, celle qu'un test serveur ne peut pas voir : le navigateur sait-il
 * reconnaître une destination qu'il ne peut pas ouvrir, plutôt que de rendre un
 * lien mort ?
 *
 * Les deux preuves exigées de toute garde de ce dépôt :
 *
 * 1. **Elle LIT quelque chose** — le corpus vient de `routeTree.gen.ts`, le
 *    fichier que TanStack régénère à chaque route ajoutée, et un corpus vide
 *    fait échouer le test plutôt que de le rendre vert sur du vide.
 * 2. **Elle sait dire NON** — une destination inventée est refusée, et le
 *    refus est vérifié sur un chemin de la même FAMILLE (`/pilotage/…`) qu'une
 *    route réelle, pas sur une chaîne absurde qu'aucun serveur n'émettrait.
 */
function realRoutePaths(): string[] {
  // `FileRoutesByTo` porte les chemins que l'on écrit dans un `<Link to=…>` —
  // c'est exactement ce que le serveur envoie. `FileRoutesById` porte les
  // identifiants internes (`/pilotage/`), qui ne sont pas des destinations.
  const source = readFileSync(join(__dirname, '..', '..', '..', '..', 'routeTree.gen.ts'), 'utf8')
  const start = source.indexOf('export interface FileRoutesByTo {')
  const end = source.indexOf('export interface FileRoutesById {')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return [...source.slice(start, end).matchAll(/^\s*'([^']+)':/gm)].map(match => match[1] as string)
}

describe('les destinations de la Qualité des données', () => {
  const paths = realRoutePaths()
  const known = knownDestinations(Object.fromEntries(paths.map(path => [path, true])))

  it('lit bien l’arbre de routes — un corpus vide serait vert sur du vide', () => {
    expect(paths.length).toBeGreaterThan(20)
    expect(known.size).toBeGreaterThan(20)
  })

  it('reconnaît TOUTE route réellement servie par l’application', () => {
    const unreachable = paths.filter(path => !isReachable(path, known))
    expect(unreachable).toEqual([])
  })

  // Refonte Pilotage (Louis 14/10/2026) : l'écran Qualité est supprimé et sa route retirée (#4359).
  // Les destinations restent gardées ; l'écran témoin est le Pipe, qui vit dans la même barre.
  it('l’écran témoin a une route — sinon la barre d’onglets pointerait dans le vide', () => {
    expect(isReachable('/pilotage/pipe', known)).toBe(true)
  })

  it('sait dire NON à une destination que ce navigateur ne connaît pas', () => {
    /**
     * ⚠️ L'exemple ÉTAIT `/pilotage/rex`, « la neuvième ligne annoncée par le
     * PDF-13 et jamais livrée ». Elle a été livrée le 28/08/2026 et la garde
     * est passée au rouge sans qu'aucun défaut n'existe : un fixture NÉGATIF
     * écrit en dur pourrit le jour où le produit le rattrape, et il rougit
     * alors pour la meilleure des raisons — ce qui est la façon la plus sûre de
     * se faire désactiver.
     *
     * Le fixture est donc VÉRIFIÉ contre l'arbre lui-même : s'il devient une
     * vraie route un jour, le test dit d'en choisir un autre, au lieu de
     * laisser croire que `isReachable` s'est mis à mentir.
     */
    const absent = '/pilotage/destination-qui-nexiste-pas'
    expect(paths, 'ce chemin est devenu une vraie route — en choisir un autre').not.toContain(absent)
    expect(isReachable(absent, known)).toBe(false)
    expect(isReachable('/accounts/qui-nexiste-pas', known)).toBe(false)
  })

  it('ignore la barre finale, la requête et l’ancre — un lien reste un lien', () => {
    expect(normalisePath('/accounts/')).toBe('/accounts')
    expect(normalisePath('/consultants?new=1')).toBe('/consultants')
    expect(normalisePath('/missions#facturation')).toBe('/missions')
    expect(normalisePath('/')).toBe('/')
    expect(isReachable('/pilotage/pipe/', known)).toBe(true)
  })

  it('laisse PASSER quand la table des routes est illisible', () => {
    // Un corpus vide dit « je n'ai pas su lire », jamais « rien n'existe ».
    // Effacer les huit liens sur une panne de lecture serait une régression
    // qu'on s'inflige.
    expect(isReachable('/pilotage/destination-qui-nexiste-pas', new Set())).toBe(true)
  })
})

describe('les huit contrôles sont nommés en FR et en EN', () => {
  // Un contrôle ajouté au contrat sans sa copie afficherait sa CLÉ à l'écran.
  it.each(['fr', 'en'] as const)('%s — chaque contrôle porte sa raison et son geste', language => {
    const checks = (language === 'fr' ? qualityFr : qualityEn).quality.checks as Record<
      string,
      { says?: string; action?: string } | undefined
    >
    const incomplete = HYGIENE_CHECKS.filter(check => !checks[check]?.says || !checks[check]?.action)
    expect(incomplete).toEqual([])
  })
})
