import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1642 — INTERDITS : « Ajouter Tailwind, shadcn, MUI ou toute librairie de
 * composants », parce que « le manager reste léger ».
 *
 * L'interdit porte sur ce qui PART DANS LE NAVIGATEUR. Une librairie de
 * composants arrive avec sa propre notion de thème, et c'est elle qui gagne :
 * les douze tokens de `globals.css` deviendraient décoratifs, et les deux
 * thèmes du manager cesseraient d'être une promesse — exactement ce que le
 * produit client a mis des mois à réparer de son côté.
 *
 * ⚠️ CE QUE CETTE GARDE NE DIT PAS
 * Elle ne gèle pas `devDependencies`. Un lanceur de tests ne s'exécute jamais
 * chez l'utilisateur : il ne pèse rien dans le paquet servi, et l'interdire
 * reviendrait à interdire le filet lui-même. La lettre de #1642 dit « aucune
 * dépendance ajoutée au package.json » ; son intention, écrite deux lignes
 * plus haut, est la légèreté du manager. C'est l'intention qui est tenue ici,
 * et l'écart est dit plutôt que caché.
 */

const PACKAGE = fileURLToPath(new URL('../../package.json', import.meta.url))

/** Les familles nommées par #1642, plus celles qui feraient la même chose. */
const LIBRAIRIES_DE_COMPOSANTS = [
  'tailwindcss',
  'shadcn',
  '@radix-ui/',
  '@mui/',
  '@material-ui/',
  '@chakra-ui/',
  'antd',
  'bootstrap',
  '@mantine/',
  'styled-components',
  '@emotion/',
]

function lirePackage(): { dependencies: Record<string, string> } {
  return JSON.parse(readFileSync(PACKAGE, 'utf8'))
}

describe('le back-office n’embarque aucune librairie de composants (#1642)', () => {
  it('LIT quelque chose — le package.json est celui du manager', () => {
    // Contrôle positif. Un chemin faux rendrait un JSON vide, donc zéro
    // librairie interdite, donc une garde verte qui n'a rien ouvert.
    const paquet = JSON.parse(readFileSync(PACKAGE, 'utf8'))
    expect(paquet.name).toBe('@bellum/dashboard-manager')
    expect(Object.keys(paquet.dependencies)).toContain('next')
  })

  it('dit NON à toute librairie de composants en dépendance servie', () => {
    const servies = Object.keys(lirePackage().dependencies)
    const interdites = servies.filter(nom => LIBRAIRIES_DE_COMPOSANTS.some(motif => nom.startsWith(motif)))

    expect(
      interdites,
      [
        'Une librairie de composants apporte son thème, et son thème gagne.',
        'Les douze tokens de globals.css sont BONS, ils restent (#1642) :',
        'une primitive manquante s’écrit dans src/ui/, en CSS module.',
        '',
        ...interdites,
      ].join('\n'),
    ).toEqual([])
  })
})
