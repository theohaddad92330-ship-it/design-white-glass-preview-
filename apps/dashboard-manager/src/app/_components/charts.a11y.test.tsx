import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AreaChart, BarChart, CohortGrid, Donut, Gauge, LineChart, StackedBar, WaterfallChart } from './charts'

/** Le texte du `<Resume>` seul — pas le reste du HTML, qui garde `M0`..`M11`
 * en en-tête de colonnes (le tracé visuel, `aria-hidden`, mais pas retiré du
 * DOM). Chercher « M2 » dans le HTML entier trouverait toujours l'en-tête. */
function texteDuResume(html: string): string {
  const m = /<p[^>]*>([\s\S]*?)<\/p>/.exec(html)
  return m?.[1] ?? ''
}

/**
 * #1674.6 — 0 `aria-label`/`role="img"` sur les graphiques de ce fichier :
 * chaque valeur n'existait qu'au SURVOL (`LineChartHoverLayer`, souris
 * uniquement) ou dans un attribut `title` (jamais lu au clavier, annoncé de
 * façon inégale par les lecteurs d'écran). Ce filet compare le HTML RENDU —
 * pas une recherche de libellé — pour prouver deux choses à la fois :
 *  1. le résumé textuel EXISTE et porte les VRAIES valeurs (pas un texte
 *     générique qui passerait même si le calcul était faux) ;
 *  2. le tracé décoratif est bien `aria-hidden`, et ce qui était DÉJÀ
 *     accessible avant ce lot (le texte de chaque ligne de `BarChart`, la
 *     légende de `Donut`) ne l'est pas devenu MOINS.
 *
 * Le lanceur de tests lit `jsx: "preserve"` du tsconfig (celui que Next
 * utilise) et retombe donc sur le runtime JSX classique — `React` doit être
 * global, comme dans `analysis/[id]/page.test.tsx`.
 */
;(globalThis as unknown as { React: typeof React }).React = React

// ⚠️ Pas de « #1674.6 » ICI (hors commentaire) : `#1674` est un hexadécimal
// valide à 4 chiffres, et ce fichier est un `.tsx` — le seul type que
// `couleurs-passent-par-un-token.test.ts` scanne. Le numéro reste dans les
// commentaires (exclus par cette garde), jamais dans une chaîne de `describe`.
describe('chaque graphique porte un résumé textuel alternatif (issue 1674, point 6)', () => {
  it('BarChart — le résumé porte les vraies valeurs, ET le texte par ligne déjà accessible reste visible', () => {
    const html = renderToStaticMarkup(
      <BarChart
        data={[
          { label: 'Feuille A', value: 973 },
          { label: 'Feuille B', value: 12 },
        ]}
      />,
    )
    expect(html).toContain('Feuille A 973')
    expect(html).toContain('Feuille B 12')
    // Ce qui était DÉJÀ du texte normal (chaque ligne) n'est pas passé en
    // aria-hidden par ce lot : BarChart n'avait pas besoin qu'on le cache.
    expect(html).not.toContain('aria-hidden')
  })

  it('AreaChart — le résumé porte CHAQUE point (pas seulement premier/pic/dernier), et le tracé est aria-hidden', () => {
    const html = renderToStaticMarkup(
      <AreaChart
        points={[
          { label: 'Jan', value: 5 },
          { label: 'Fév', value: 42 },
          { label: 'Mar', value: 973 },
        ]}
      />,
    )
    // « Fév » à 42 n'apparaissait NULLE PART en texte avant ce lot (ni pied
    // de graphique, ni ailleurs) : seul le point intermédiaire le prouve.
    expect(html).toContain('Fév 42')
    expect(html).toContain('Pic : Mar 973')
    expect(html).toMatch(/<svg aria-hidden="true"/)
  })

  it('Donut — le résumé porte le VRAI total, et la légende déjà accessible reste visible', () => {
    const html = renderToStaticMarkup(
      <Donut
        segments={[
          { label: 'Feuille A', value: 973 },
          { label: 'Feuille B', value: 12 },
        ]}
      />,
    )
    expect(html).toContain('total 985')
    expect(html).toContain('Feuille A 973')
    expect(html).toMatch(/<svg aria-hidden="true"/)
    // La légende (texte normal, déjà accessible avant ce lot) est intacte.
    expect(html).toContain('Feuille A')
  })

  it('Donut — total réellement nul dit « aucune donnée », jamais un total à 1 (le repli de division)', () => {
    const html = renderToStaticMarkup(<Donut segments={[{ label: 'Vide', value: 0 }]} />)
    expect(html).toContain('Diagramme circulaire, aucune donnée.')
    expect(html).not.toContain('total 1')
  })

  it('Gauge — sans `label`, le résumé porte le pourcentage (rien n’existait avant ce lot)', () => {
    const html = renderToStaticMarkup(<Gauge value={42} />)
    expect(html).toContain('Jauge : 42 %.')
  })

  it('Gauge — avec `label`, pas de doublon : le texte visible existant suffit déjà', () => {
    const html = renderToStaticMarkup(<Gauge value={87} label="Feuille A" />)
    expect(html).not.toContain('<p')
    expect(html).toContain('Feuille A')
    expect(html).toContain('87')
  })

  it('LineChart — le résumé porte CHAQUE point de CHAQUE série, y compris un point non mesuré', () => {
    const html = renderToStaticMarkup(
      <LineChart
        series={[
          {
            name: 'Feuille A',
            points: [
              { label: 'Jan', value: 5 },
              { label: 'Fév', value: null },
              { label: 'Mar', value: 973 },
            ],
          },
        ]}
        period="2026"
        asOf="08/09/2026"
      />,
    )
    // Avant ce lot : RIEN de la série n'existait dans le HTML au repos — la
    // seule exposition était `LineChartHoverLayer`, à la souris. Ce résumé
    // porte la même granularité, sans survol.
    expect(html).toContain('Feuille A : Jan 5, Fév non mesuré, Mar 973')
    // Le tracé (et son survol, souris uniquement) devient décoratif.
    expect(html).toMatch(/<div aria-hidden="true">/)
  })

  it('StackedBar — le résumé porte chaque catégorie, segment par segment, et « non mesuré » n’est jamais 0', () => {
    const html = renderToStaticMarkup(
      <StackedBar
        categories={[
          { label: 'Jan', values: { a: 5, b: 12 } },
          { label: 'Fév', values: {} },
        ]}
        keys={['a', 'b']}
        labels={{ a: 'Feuille A', b: 'Feuille B' }}
        period="2026"
        asOf="08/09/2026"
      />,
    )
    expect(html).toContain('Jan total 17 (Feuille A 5, Feuille B 12)')
    // Une catégorie SANS AUCUNE valeur connue est « non mesuré », pas une
    // colonne à 0 — exactement la règle de `computeStackedColumns`.
    expect(html).toContain('Fév : non mesuré')
    expect(html).not.toContain('Fév total 0')
  })

  it('WaterfallChart — le résumé porte chaque étape, y compris une étape non mesurée', () => {
    const html = renderToStaticMarkup(
      <WaterfallChart
        steps={[
          { label: 'Début', kind: 'start', value: 100 },
          { label: 'Nouveau', kind: 'delta', value: 973 },
          { label: 'Inconnu', kind: 'delta', value: null },
          { label: 'Fin', kind: 'end', value: 500 },
        ]}
        period="2026"
        asOf="08/09/2026"
      />,
    )
    expect(html).toContain('Début 100')
    expect(html).toContain('Nouveau 973')
    expect(html).toContain('Inconnu non mesuré')
    expect(html).toContain('Fin 500')
  })

  it('CohortGrid — le résumé distingue MESURÉ, NON MESURÉ et FUTUR (jamais confondus)', () => {
    const html = renderToStaticMarkup(
      <CohortGrid
        rows={[{ cohortLabel: 'Cohorte A', spaceCount: 5, retentionByMonth: [0.42, null] }]}
        monthsElapsed={() => 1}
        period="2026"
        asOf="08/09/2026"
      />,
    )
    expect(html).toContain('Cohorte A : M0 42 %, M1 non mesuré')
    // M2..M11 sont FUTURS (au-delà de `monthsElapsed`) : rien à en dire, et
    // surtout pas confondus avec « non mesuré » (une case dans la fenêtre
    // mais sans donnée) — absents du RÉSUMÉ (l'en-tête « M2 » du tracé visuel,
    // lui, reste dans le DOM sous `aria-hidden`, donc hors de cette mesure).
    expect(texteDuResume(html)).not.toContain('M2')
  })

  it('CohortGrid — sous le seuil d’anonymat, aucune cohorte n’est résumée (comme elle n’est pas affichée)', () => {
    const html = renderToStaticMarkup(
      <CohortGrid
        rows={[{ cohortLabel: 'Trop petite', spaceCount: 1, retentionByMonth: [0.5] }]}
        monthsElapsed={() => 0}
        period="2026"
        asOf="08/09/2026"
      />,
    )
    expect(html).not.toContain('Trop petite')
  })
})
