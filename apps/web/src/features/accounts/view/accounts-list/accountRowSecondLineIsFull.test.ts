import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * LA DEUXIÈME LIGNE DE LA LIGNE DE COMPTE EST PLEINE — cliquet.
 *
 * Mesuré en PRODUCTION le 06/09/2026 sur `/accounts`, fenêtre à 1 456 px :
 *
 *   largeur de la ligne 2 ................... 159 px
 *   besoin cumulé de ses enfants ............ 679 px   (4,3×)
 *     · secteur .......... 89 px rendus / 423 px requis
 *     · effectif ......... 29 px rendus / 138 px requis
 *     · parcours (#1577) . 25 px rendus / 118 px requis
 *
 * « 64 parcours observés » tenait dans 7 pixels. Le fragment était RENDU et
 * ILLISIBLE : il volait le tiers d'une ligne déjà saturée pour n'afficher
 * qu'une ellipse. Il a été retiré ; la donnée continue de voyager sur la ligne
 * (`market_paths_observed`) et s'affiche sur la CARTE, qui a sa largeur.
 *
 * ⚠️ POURQUOI UNE GARDE DE SOURCE ET PAS UNE MESURE
 * Parce qu'une mesure est impossible ici : jsdom ne met rien en page — toutes
 * les largeurs y valent zéro, et un test qui « vérifie » la troncature en jsdom
 * passerait au vert quel que soit le code. Le seul signal honnête à la portée de
 * la CI est le NOMBRE de prétendants à cette ligne. La vraie vérification reste
 * la recette, et c'est elle qui a trouvé le défaut.
 *
 * ⚠️ CE QUE `hidden lg:inline` NE FAIT PAS
 * Il commande la VISIBILITÉ, pas le rétrécissement. Un enfant `flex-auto`
 * visible se fait écraser par ses voisins quelle que soit la borne à laquelle
 * on l'affiche. C'est exactement l'erreur commise, et elle a coûté une mise en
 * production.
 */

const ROW = join(__dirname, 'AccountTableRow.tsx')
const FOLD = join(__dirname, 'AccountRowFacts.tsx')

/**
 * Le bloc de la ligne 2, **commentaires RETIRÉS**.
 *
 * ⚠️ Sans ce retrait, la garde s'attrape sur SA PROPRE JUSTIFICATION : le
 * commentaire qui explique pourquoi le fragment a été enlevé contient les mots
 * `flex-auto` et `account-market-paths`. Elle comptait 4 prétendants là où il y
 * en a 2, et refusait de passer sur du code juste. C'est la leçon de GA-255,
 * payée une seconde fois ici — un extracteur qui lit du JSX doit toujours
 * retirer les commentaires AVANT de compter.
 */
function secondLineBlock(): string {
  const source = readFileSync(ROW, 'utf8')
    // `{/* … */}` du JSX, puis les blocs `/* … */` restants.
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const start = source.indexOf('className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"')
  expect(start).toBeGreaterThan(-1)
  // On s'arrête à la cellule suivante — largement au-delà de la ligne 2.
  const end = source.indexOf('<TableCell', start)
  return source.slice(start, end === -1 ? source.length : end)
}

describe('la 2e ligne de la ligne de compte ne gagne pas un prétendant de plus', () => {
  it('lit un corpus réel — sinon la garde est borgne', () => {
    const bloc = secondLineBlock()
    expect(bloc.length).toBeGreaterThan(200)
    // L'unique occupant légitime est bien vu par la lecture.
    expect(bloc).toContain('<AccountRowFacts')
  })

  /**
   * ⚠️ LE CLIQUET S'EST RESSERRÉ LE 11/09/2026 (#1417.1), de DEUX à UN.
   *
   * Deux `flex-auto` qui se partagent une largeur qui manque déjà à un seul ne
   * font pas un compromis : ils font DEUX textes tronqués. Mesuré le 06/09, à
   * 1 456 px — secteur 89 px rendus pour 423 requis, effectif 29 pour 138, dans
   * une ligne de 159 px. L'effectif s'est replié (`AccountRowFacts`), et le
   * secteur ne partage plus.
   *
   * Il ne peut donc plus y en avoir qu'UN, et c'est le déclencheur du repli
   * lui-même : tout ce qui voudrait revenir sur cette ligne a désormais un
   * endroit où aller.
   */
  it('UN SEUL enfant rétrécissable, et il vit dans le repli', () => {
    // `flex-auto` = « je rétrécis proportionnellement avec mes voisins ». Chaque
    // nouvel enfant de cette famille divise une largeur qui manque déjà.
    const bloc = secondLineBlock()
    expect(
      (bloc.match(/flex-auto/g) ?? []).length,
      [
        'Un enfant `flex-auto` a été ajouté à la deuxième ligne, à côté du repli.',
        'Elle fait 159 px et le secteur en demande 423 à lui seul : le nouveau',
        'venu sera rendu et illisible, et il rendra le secteur pire.',
        'Ce qui doit se lire là se replie dans `AccountRowFacts` (#1417.7).',
      ].join('\n'),
    ).toBe(0)

    // Le déclencheur, lui, EST rétrécissable — c'est lui, l'unique prétendant.
    // Le compter dans son propre fichier évite de confondre « la ligne n'a plus
    // de prétendant » avec « le prétendant a disparu ».
    const repli = readFileSync(FOLD, 'utf8')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect((repli.match(/flex-auto/g) ?? []).length).toBe(1)
  })

  it('l’effectif et le libellé NAF entier ont QUITTÉ cette ligne — ils ne sont pas perdus', () => {
    const bloc = secondLineBlock()
    expect(bloc).not.toContain('data-testid="account-employees"')
    expect(bloc).not.toContain('data-testid="account-sector"')
  })

  it('le fragment « parcours observés » n’est pas revenu sur cette ligne', () => {
    // Retiré après mesure en production. La donnée reste sur la ligne et
    // s'affiche sur la carte — c'est le RENDU ici qui est refusé, pas le champ.
    expect(secondLineBlock()).not.toContain('account-market-paths')
  })
})
