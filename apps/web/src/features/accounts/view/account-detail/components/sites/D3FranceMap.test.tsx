import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { D3FranceMap } from './D3FranceMap'

// Polygone minimal mais valide : d3-geo doit pouvoir calculer une bbox pour
// `geoMercator().fitExtent(...)` sans lever.
const FRANCE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 46],
            [3, 46],
            [3, 47],
            [2, 47],
            [2, 46],
          ],
        ],
      },
    },
  ],
}

function stubGeoFetch() {
  const spy = vi.fn(async () => ({ ok: true, json: async () => FRANCE_GEOJSON }) as unknown as Response)
  vi.stubGlobal('fetch', spy)
  return spy
}

/**
 * jsdom n'implémente pas `SVGSVGElement.viewBox` (un `SVGAnimatedRect` avec
 * `.baseVal`) : `d3-zoom` s'appuie dessus (`defaultExtent`, `zoom.js`) pour
 * déduire l'étendue d'un geste quand aucun `.extent(...)` explicite n'est
 * posé — ce qui est le choix fait dans `D3FranceMap` (l'étendue suit
 * naturellement le `viewBox` du SVG). Sans ce polyfill, un `scaleBy`
 * programmatique lève `TypeError: Cannot read properties of undefined
 * (reading 'baseVal')` — un manque de jsdom, pas un bug de l'app : un vrai
 * navigateur lit `viewBox.baseVal` normalement.
 */
function polyfillViewBox(svg: SVGSVGElement, width: number, height: number) {
  Object.defineProperty(svg, 'viewBox', {
    configurable: true,
    value: { baseVal: { x: 0, y: 0, width, height } },
  })
}

// d3-zoom pose la propriété JS `__zoom` sur le nœud SVG de façon SYNCHRONE
// dès que `select(svgNode).call(zoomBehaviour)` s'exécute — voir
// `zoom.js` : `selection.property("__zoom", defaultTransform)`, où
// `defaultTransform` vaut `this.__zoom || identity`. C'est le signal
// observable, indépendant du DOM, que l'effet d'attachement
// (`D3FranceMap.tsx` ~l.61-92) a réellement tourné. `findByRole('button', …)`
// résout dès que le bouton existe dans le DOM, ce qui peut précéder le flush
// de cet effet passif — la course qui a fait échouer la CI une fois (run
// 35398576680, `expected null not to be null`).
type ZoomedNode = SVGSVGElement & { __zoom?: unknown }

async function waitForZoomAttached(svg: SVGSVGElement) {
  await waitFor(() => {
    expect((svg as ZoomedNode).__zoom).toBeDefined()
  })
}

describe('D3FranceMap (#2612)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    stubGeoFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('le comportement d3-zoom est réellement attaché une fois la carte chargée : « Zoomer » change l’échelle', async () => {
    render(<D3FranceMap rows={[]} expanded={false} />)

    const zoomInButton = await screen.findByRole('button', { name: 'Zoomer' })
    const svg = screen.getByRole('img', { name: 'Carte interactive des sites en France' }) as unknown as SVGSVGElement
    polyfillViewBox(svg, 720, 760)
    const content = svg.querySelector(':scope > g')
    expect(content).not.toBeNull()
    // Avant tout zoom, d3-zoom n'a encore jamais écrit l'attribut transform.
    expect(content?.getAttribute('transform')).toBeNull()

    // Précondition observable de l'attachement — pas un `setTimeout`, pas un
    // retry de clic : un seul clic suit, une fois l'attachement prouvé.
    await waitForZoomAttached(svg)

    fireEvent.click(zoomInButton)

    // Si le zoom est bien attaché au nœud SVG réel, cliquer « Zoomer » fait
    // écrire une transform avec une échelle > 1 par le handler `.on('zoom', …)`.
    const transformAfterClick = content?.getAttribute('transform')
    expect(transformAfterClick).not.toBeNull()
    expect(transformAfterClick).toMatch(/scale\(1\.35\)/)
  })
})
