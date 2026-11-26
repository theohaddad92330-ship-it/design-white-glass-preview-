import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1674.5 — « `prefers-reduced-motion` réellement couvert : toute
 * transition/animation du socle le respecte, pas seulement le squelette. »
 *
 * Avant ce lot, `Skeleton.module.css:26` était la SEULE occurrence de
 * `prefers-reduced-motion` de tout le back-office — et `Skeleton.tsx` n'avait
 * aucun appelant réel (#1642), donc sa couverture RÉELLE était zéro : une
 * règle écrite, jamais exécutée par personne. Ce fichier fait deux choses :
 * un CLIQUET pour que toute animation/transition future du socle porte la
 * même garde, et le CORPUS positif qui prouve que le cas connu (`Skeleton`)
 * est bien vu.
 *
 * ⚠️ L'ANGLE MORT MESURÉ, ET CORRIGÉ ICI
 * Le corpus ne portait QUE `src/ui/*.module.css`. Deux trous réels :
 *  1. `globals.css:69-73` (avant ce lot) — la transition du CORPS au
 *     changement de thème (`background-color`/`color`, 0,18s) : elle bouge à
 *     CHAQUE bascule clair/sombre, sur CHAQUE écran, et n'était vue par
 *     personne puisque `globals.css` n'est pas un `.module.css`.
 *  2. Tout `.module.css` HORS `src/ui/` — le viseur d'opérateur
 *     (`.picker-box`, dans `globals.css`) et les futurs modules de
 *     `app/**` ne sont pas dans `src/ui/` mais bougent bel et bien.
 * Le corpus couvre maintenant `src/ui/**\/*.module.css`, `app/**\/*.module.css`
 * ET `globals.css` lui-même.
 *
 * ⚠️ CE QUI COMPTE COMME « transition/animation À GARDER »
 * `animation: none` et `transition: none` sont des DÉSACTIVATIONS, pas des
 * mouvements — les compter forcerait à mettre un `@media` autour d'un endroit
 * qui ne bouge déjà pas. Seule une vraie valeur (une durée, un nom de
 * keyframes) compte. Un simple changement de couleur AU SURVOL sans propriété
 * `transition` (`.sortButton:hover { color: var(--text) }`, déjà dans ce
 * dépôt) n'est pas un mouvement non plus : il est instantané, donc hors
 * sujet — la grammaire de mouvement du dépôt cible ce qui BOUGE dans le
 * temps, pas un simple changement d'état.
 */

const UI_DIR = fileURLToPath(new URL('../ui/', import.meta.url))
const APP_DIR = fileURLToPath(new URL('../app/', import.meta.url))
const GLOBALS = fileURLToPath(new URL('../app/globals.css', import.meta.url))
const SRC = fileURLToPath(new URL('../', import.meta.url))
const MARKER = '@media (prefers-reduced-motion: reduce)'

/** Tout `.module.css`, où qu'il vive dans l'arborescence — pas seulement
 * `src/ui/` (l'angle mort mesuré par #1674.5). */
function fichiersModuleCssRecursifs(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersModuleCssRecursifs(chemin, out)
    else if (entree.endsWith('.module.css')) out.push(chemin)
  }
  return out
}

/** Le corpus RÉEL du back-office : tous les `.module.css` (socle ET écrans)
 * plus `globals.css` — le seul fichier CSS du dépôt qui n'est pas un module. */
function fichiersCss(): string[] {
  return [...fichiersModuleCssRecursifs(UI_DIR), ...fichiersModuleCssRecursifs(APP_DIR), GLOBALS]
}

/**
 * Découpe consciente des ACCOLADES, pas une regex à profondeur 1 : un bloc
 * `@media` contient toujours une règle imbriquée (`.skeleton { … }`), donc
 * DEUX accolades fermantes avant la fin du bloc. Une regex `[^}]*` s'arrêterait
 * à la première et corromprait tout ce qui suit.
 */
function borneDuBloc(css: string, debutAccolade: number): number {
  let profondeur = 0
  for (let i = debutAccolade; i < css.length; i++) {
    if (css[i] === '{') profondeur++
    else if (css[i] === '}') {
      profondeur--
      if (profondeur === 0) return i + 1
    }
  }
  return css.length
}

/** Le CSS, moins tout ce qui vit DANS un bloc `prefers-reduced-motion: reduce`. */
function horsBlocsReducedMotion(css: string): string {
  let reste = ''
  let curseur = 0
  let idx = css.indexOf(MARKER)
  while (idx !== -1) {
    reste += css.slice(curseur, idx)
    const debutAccolade = css.indexOf('{', idx)
    if (debutAccolade === -1) break
    curseur = borneDuBloc(css, debutAccolade)
    idx = css.indexOf(MARKER, curseur)
  }
  reste += css.slice(curseur)
  return reste
}

const VRAIE_ANIMATION = /\banimation(?:-name)?\s*:\s*(?!none\b)\S/
const VRAIE_TRANSITION = /\btransition(?:-property)?\s*:\s*(?!none\b)\S/

/** Une règle qui BOUGE dans le temps, en dehors de toute garde `reduced-motion`. */
function porteUnMouvementNonGarde(css: string): boolean {
  const hors = horsBlocsReducedMotion(css)
  return VRAIE_ANIMATION.test(hors) || VRAIE_TRANSITION.test(hors)
}

function porteLaGarde(css: string): boolean {
  return css.includes(MARKER)
}

describe('prefers-reduced-motion couvre tout mouvement du socle (#1674.5)', () => {
  it('LIT quelque chose — le corpus (ui/, app/ et globals.css) n’est pas vide', () => {
    const fichiers = fichiersCss()
    expect(fichiers.length).toBeGreaterThan(5)
    // Le corpus couvre bien les TROIS zones, pas seulement `src/ui/` —
    // exactement l'angle mort mesuré par #1674.5.
    expect(fichiers.some(chemin => chemin.startsWith(UI_DIR))).toBe(true)
    expect(fichiers.some(chemin => chemin.startsWith(APP_DIR))).toBe(true)
    expect(fichiers).toContain(GLOBALS)
  })

  it('LIT vraiment — Skeleton.module.css est retrouvé et EXIGE la garde', () => {
    const css = readFileSync(`${UI_DIR}Skeleton.module.css`, 'utf8')
    expect(porteUnMouvementNonGarde(css)).toBe(true)
    expect(porteLaGarde(css)).toBe(true)
  })

  it('LIT vraiment l’angle mort mesuré — globals.css a de vrais mouvements, désormais gardés', () => {
    // `.picker-box` (le viseur) ET la transition du CORPS au changement de
    // thème bougent réellement — `porteUnMouvementNonGarde` reste VRAI (la
    // déclaration réelle, hors du bloc `reduced-motion`, existe toujours :
    // c'est justement pour ça qu'un repli a du sens). Ce qui change avec ce
    // lot, c'est `porteLaGarde` : FAUX avant, VRAI maintenant — donc la
    // COMBINAISON qui définit un fichier fautif (mouvement réel ET aucun
    // repli) devient fausse. Même lecture que le test « deux blocs @media
    // de suite » plus haut dans ce fichier.
    const css = readFileSync(GLOBALS, 'utf8')
    expect(css).toContain('transition:')
    expect(porteUnMouvementNonGarde(css)).toBe(true)
    expect(porteLaGarde(css)).toBe(true)
    expect(porteUnMouvementNonGarde(css) && !porteLaGarde(css)).toBe(false)
  })

  it('sait dire NON — une animation sans bloc reduced-motion est refusée', () => {
    const casse = '.foo {\n  animation: shimmer 1.4s ease-in-out infinite;\n}'
    expect(porteUnMouvementNonGarde(casse)).toBe(true)
    expect(porteLaGarde(casse)).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une désactivation, un simple survol instantané', () => {
    expect(porteUnMouvementNonGarde('.foo { animation: none; }')).toBe(false)
    expect(porteUnMouvementNonGarde('.foo { transition: none; }')).toBe(false)
    // Un changement de couleur au survol SANS `transition` est instantané —
    // exactement `.sortButton:hover` de `DataTable.module.css` aujourd’hui.
    expect(porteUnMouvementNonGarde('.foo:hover { color: var(--text); }')).toBe(false)
  })

  it('n’attrape pas un mouvement DÉJÀ dans un bloc reduced-motion — ce n’est pas ce qu’il faut garder', () => {
    const css = `@media (prefers-reduced-motion: reduce) {\n  .foo { animation: none; }\n}`
    expect(porteUnMouvementNonGarde(css)).toBe(false)
  })

  it('deux blocs `@media` de suite se découpent tous les deux — pas seulement le premier', () => {
    // `.b` a sa propre animation réelle, ET son propre bloc de repli : au
    // niveau du FICHIER (ce que vérifie la garde finale), c'est couvert. La
    // fonction bas-niveau, elle, reste littérale : elle voit toujours
    // l'animation de `.b`, écrite EN DEHORS de tout bloc — c'est `porteLaGarde`
    // (le fichier a AU MOINS un bloc reduced-motion) qui referme le dossier.
    const css = [
      '.a { color: red; }',
      '@media (prefers-reduced-motion: reduce) { .a { animation: none; } }',
      '.b { animation: spin 1s linear infinite; }',
      '@media (prefers-reduced-motion: reduce) { .b { animation: none; } }',
    ].join('\n')
    expect(porteUnMouvementNonGarde(css)).toBe(true)
    expect(porteLaGarde(css)).toBe(true)
    // La décision qui compte pour un fichier réel est la COMBINAISON des deux
    // — c'est exactement ce que vérifie le test final de ce fichier.
    expect(porteUnMouvementNonGarde(css) && !porteLaGarde(css)).toBe(false)
  })

  it('aucun CSS du back-office (ui/, app/, globals.css) ne porte un mouvement non gardé', () => {
    const fautifs = fichiersCss()
      .filter(chemin => {
        const css = readFileSync(chemin, 'utf8')
        return porteUnMouvementNonGarde(css) && !porteLaGarde(css)
      })
      .map(chemin => chemin.slice(SRC.length))

    expect(
      fautifs,
      [
        'Une transition/animation qui BOUGE dans le temps doit respecter',
        '`prefers-reduced-motion: reduce` — le shimmer de Skeleton.module.css',
        'en est le modèle : `animation: none` en repli.',
        '',
        ...fautifs,
      ].join('\n'),
    ).toEqual([])
  })
})
