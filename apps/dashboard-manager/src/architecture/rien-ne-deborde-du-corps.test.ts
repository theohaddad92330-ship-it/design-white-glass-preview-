import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * « Ce qui déborde défile dans SON conteneur, jamais le corps de la page. »
 *
 * MESURÉ EN PRODUCTION le 06/09/2026, sur /clients : un tableau de 1 312 px
 * dans une colonne de 1 292 px, `overflow-x: visible` — donc le BODY défilait
 * (scrollWidth 1 588 pour un clientWidth de 1 512) et la colonne « Actions »
 * sortait de l'écran. Le rail latéral (#1644) l'a RÉVÉLÉ en prenant 220 px ; il
 * ne l'a pas créé. Le compte du jour : 46 tableaux dans 26 fichiers, dont
 * 39 sans aucun conteneur défilant.
 *
 * POURQUOI LA BORNE EST DANS LE CSS ET PAS DANS LES ÉCRANS
 * C'est un défaut de POPULATION : juste sur chaque tableau qu'on emballe, faux
 * sur celui qu'on oublie — et sur celui qu'on ajoutera. Trente-neuf emballages
 * à la main garantissent le quarantième. La borne vit une fois, sur `.wrap`,
 * que TOUS les écrans portent.
 *
 * ⚠️ CE QUE CETTE GARDE PEUT ET NE PEUT PAS FAIRE
 * L'environnement de test du back-office est `node` : rien n'est mis en page,
 * donc RIEN ICI NE MESURE UN DÉBORDEMENT. Elle vérifie que la borne est
 * toujours écrite, et que la coque ne réintroduit pas une largeur fixe qui la
 * contournerait. Le débordement lui-même se mesure en direct, dans le
 * navigateur — c'est ainsi qu'il a été trouvé, et c'est écrit ici pour que
 * personne ne croie cette garde plus forte qu'elle n'est.
 */

const CSS = fileURLToPath(new URL('../app/globals.css', import.meta.url))

function regle(nom: string, source: string): string | null {
  const bloc = new RegExp(`\\.${nom}\\s*\\{([^}]*)\\}`).exec(source)
  return bloc?.[1] ?? null
}

describe('rien ne déborde du corps de la page (mesuré en prod le 06/09/2026)', () => {
  it('LIT quelque chose — la feuille existe et porte la coque', () => {
    const css = readFileSync(CSS, 'utf8')
    expect(css.length).toBeGreaterThan(5000)
    expect(regle('wrap', css)).not.toBeNull()
    expect(regle('shell__main', css)).not.toBeNull()
  })

  it('la colonne de contenu contient son propre débordement', () => {
    const wrap = regle('wrap', readFileSync(CSS, 'utf8')) ?? ''
    expect(wrap, '`.wrap` doit porter `overflow-x: auto` : sinon un tableau large pousse le BODY.').toMatch(
      /overflow-x:\s*auto/,
    )
  })

  it('la colonne de contenu peut RÉTRÉCIR — sans ça, la borne ne sert à rien', () => {
    // `min-width: auto` est la valeur par défaut d'un enfant de flex, et c'est
    // le premier responsable des débordements horizontaux : la colonne refuse
    // de descendre sous la largeur de son contenu, et pousse tout le reste.
    const main = regle('shell__main', readFileSync(CSS, 'utf8')) ?? ''
    expect(main).toMatch(/min-width:\s*0/)
  })

  it('sait dire NON — une colonne sans borne est refusée', () => {
    const casse = '.wrap {\n  width: 100%;\n  padding: 12px;\n}'
    expect(regle('wrap', casse)).not.toMatch(/overflow-x:\s*auto/)
  })
})
