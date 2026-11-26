/**
 * #4605.1 — le bandeau d'incarnation (fixe, y 12-80 mesuré) RECOUVRAIT la barre d'onglets (y 24-62) de toute page
 * construite comme `/settings/mes-donnees` : en session d'accompagnement, les onglets étaient inaccessibles à la souris.
 *
 * Corrigé AU BANDEAU, une seule fois pour toutes les pages : la coque `#app-shell` (le seul ancrage de hauteur du
 * produit, index.css) commence SOUS lui. Le bandeau publie sa hauteur (`--impersonation-banner-height`) ; la page
 * la déduit de sa hauteur fixe ET la pose en marge haute. Sans bandeau, la variable est absente : `0px`, rien ne bouge.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `règle ${selector} introuvable`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

describe('la coque commence sous le bandeau d’incarnation', () => {
  it('sa hauteur déduit celle du bandeau, avec 0px par défaut', () => {
    expect(rule('#app-shell')).toMatch(/height:\s*calc\(100dvh\s*-\s*var\(--impersonation-banner-height,\s*0px\)\)/)
  })

  it('et elle est posée SOUS lui (pas dessous au sens de la profondeur)', () => {
    expect(rule('body')).toMatch(/padding-top:\s*var\(--impersonation-banner-height,\s*0px\)/)
  })

  it('sait dire NON : la hauteur reste celle du viewport quand aucune incarnation ne publie la variable', () => {
    // `var(x, 0px)` : sans variable, le calcul vaut 100dvh — la règle ne change rien hors incarnation.
    expect(rule('#app-shell')).not.toMatch(/height:\s*100dvh\s*;/)
  })
})
