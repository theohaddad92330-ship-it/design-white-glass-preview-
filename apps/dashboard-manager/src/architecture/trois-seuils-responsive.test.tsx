import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * #1674.9 — « 0 occurrence de `768px`/`1280px` dans tout le dépôt ; seul
 * `(pointer: coarse)` existait, sans rapport avec la LARGEUR. » Les trois
 * seuils demandés : ≥1280 complet, 768–1279 rail replié en icônes, <768
 * LECTURE SEULE. Ce fichier tient DEUX choses séparément :
 *
 *  1. Les deux seuils EXISTENT réellement dans `globals.css` (pas une
 *     promesse dans un commentaire) et referment le rail en icônes SANS
 *     rien retirer du DOM — une restylisation, pas une perte d'information
 *     (D81 : « une colonne masquée l'est en CSS dans le MÊME rendu »).
 *
 *  2. ⚠️ LE POINT QUI COMPTE LE PLUS, ÉCRIT NOIR SUR BLANC DANS L'ISSUE :
 *     sous 768px, un bouton d'ACTION doit être ABSENT DU DOM, pas masqué en
 *     CSS — « une suppression d'utilisateur déclenchée par un pouce dans un
 *     métro est un incident ». Un `display: none` laisse le bouton
 *     CLIQUABLE au clavier (Tab l'atteint toujours) et ATTEIGNABLE par
 *     script (`document.querySelector` le trouve, `.click()` marche). Cette
 *     partie ne peut PAS se réparer en CSS — elle exige de ne pas RENDRE le
 *     bouton, une décision par écran (`DataTable`, `users/`, `revenus/`…,
 *     tous hors du périmètre de ce lot). Ce test PROUVE la distinction avec
 *     du HTML rendu, pas une affirmation : c'est la preuve que #1674.9
 *     demande explicitement, et le gabarit que l'intégrateur peut recopier
 *     dans chaque écran concerné.
 */

const GLOBALS = fileURLToPath(new URL('../app/globals.css', import.meta.url))

;(globalThis as unknown as { React: typeof React }).React = React

// ─────────────────────────────────────────────────────────────────────────
// 1. Les seuils existent, et referment le rail sans rien retirer du DOM.
// ─────────────────────────────────────────────────────────────────────────

function blocDe(css: string, marqueur: string): string {
  const debut = css.indexOf(marqueur)
  if (debut === -1) return ''
  const debutAccolade = css.indexOf('{', debut)
  let profondeur = 0
  for (let i = debutAccolade; i < css.length; i++) {
    if (css[i] === '{') profondeur++
    else if (css[i] === '}') {
      profondeur--
      if (profondeur === 0) return css.slice(debutAccolade, i + 1)
    }
  }
  return css.slice(debutAccolade)
}

// ⚠️ Pas de « #1674.9 » dans les chaînes de `describe`/`it` de ce fichier :
// `#1674` est un hexadécimal valide à 4 chiffres, et c'est un `.tsx` — le
// seul type que `couleurs-passent-par-un-token.test.ts` scanne. Le numéro
// reste dans les commentaires (exclus par cette garde).
describe('les trois seuils de largeur du back-office (issue 1674, point 9)', () => {
  it('LIT quelque chose — globals.css n’est pas vide', () => {
    const css = readFileSync(GLOBALS, 'utf8')
    expect(css.length).toBeGreaterThan(1000)
  })

  it('LIT vraiment — les deux seuils existent, littéralement, et referment le rail', () => {
    const css = readFileSync(GLOBALS, 'utf8')
    expect(css).toContain('@media (max-width: 1280px)')
    expect(css).toContain('@media (max-width: 768px)')
    const blocTablette = blocDe(css, '@media (max-width: 1280px)')
    expect(blocTablette).toContain('.siderail {')
    expect(blocTablette).toContain('width: 56px')
    // Les LIBELLÉS sont masqués en CSS, jamais retirés du sélecteur — ce
    // n'est PAS le point sensible de #1674.9 (celui-ci concerne les boutons
    // d'action, pas la navigation).
    expect(blocTablette).toContain('.siderail__items')
    expect(blocTablette).toContain('display: none')
  })

  it('sait dire NON — un fichier sans les seuils est vu comme tel', () => {
    const fabrique = '.foo { color: red; }'
    expect(fabrique).not.toContain('768px')
    expect(fabrique).not.toContain('1280px')
    expect(blocDe(fabrique, '@media (max-width: 1280px)')).toBe('')
  })

  it('l’icône reste EXCLUE de tout `display: none` — seul le libellé texte est masqué', () => {
    // Contrairement au bouton d'action (partie 2), un libellé de navigation
    // masqué en CSS reste dans le DOM : un lecteur d'écran peut toujours
    // l'atteindre, et rien n'a disparu pour un clavier. C'est la distinction
    // exacte de D81 : « masquée en CSS, dans le MÊME rendu », pas retirée.
    // `.siderail__icon` n'apparaît QUE comme exclusion (`:not(...)`), jamais
    // comme sujet direct d'une règle — sinon l'icône elle-même disparaîtrait.
    const css = readFileSync(GLOBALS, 'utf8')
    const blocTablette = blocDe(css, '@media (max-width: 1280px)')
    expect(blocTablette).toContain(':not(.siderail__icon)')
    expect(blocTablette).not.toMatch(/(?<!:not\()\.siderail__icon\s*[,{]/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. La preuve : CSS-hidden ≠ absent du DOM, pour un bouton d'ACTION.
// ─────────────────────────────────────────────────────────────────────────

/** Le geste FAUX : cacher en CSS. Recopié tel quel, il ne doit JAMAIS
 * apparaître dans un écran réel (`DataTable`, `users/`, `revenus/`…). */
function BoutonMasqueEnCss({ etroit }: { etroit: boolean }) {
  return (
    <button type="button" style={etroit ? { display: 'none' } : undefined} onClick={() => undefined}>
      Supprimer l'utilisateur
    </button>
  )
}

/** Le geste JUSTE : ne pas rendre le bouton. */
function BoutonAbsentDuDom({ etroit }: { etroit: boolean }) {
  return etroit ? null : (
    <button type="button" onClick={() => undefined}>
      Supprimer l'utilisateur
    </button>
  )
}

describe('sous 768px, un bouton d’action est ABSENT DU DOM — pas masqué en CSS (issue 1674, point 9)', () => {
  it('sait dire NON — `display: none` laisse le bouton dans le HTML rendu (cliquable au clavier, trouvable par script)', () => {
    const html = renderToStaticMarkup(<BoutonMasqueEnCss etroit={true} />)
    // Le bouton EST là : Tab l'atteint, `document.querySelector('button')`
    // le trouve, `.click()` marche. `display: none` ne retire RIEN du DOM.
    expect(html).toContain('<button')
    expect(html).toContain('Supprimer l&#x27;utilisateur')
    expect(html).toMatch(/display:\s*none/)
  })

  it('LIT vraiment — le même composant SANS l’écran étroit rend le bouton visible, normalement', () => {
    // Contrôle positif : la différence n'est pas un artefact du composant,
    // elle dépend bien du drapeau `etroit`.
    const html = renderToStaticMarkup(<BoutonMasqueEnCss etroit={false} />)
    expect(html).toContain('<button')
    expect(html).not.toMatch(/display:\s*none/)
  })

  it('la bonne réponse — ne pas RENDRE le bouton le retire réellement du HTML', () => {
    const html = renderToStaticMarkup(<BoutonAbsentDuDom etroit={true} />)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Supprimer')
  })

  it('n’attrape pas ce qu’elle ne vise pas — le même composant, écran large, rend bien le bouton', () => {
    const html = renderToStaticMarkup(<BoutonAbsentDuDom etroit={false} />)
    expect(html).toContain('<button')
    expect(html).toContain('Supprimer')
  })
})
