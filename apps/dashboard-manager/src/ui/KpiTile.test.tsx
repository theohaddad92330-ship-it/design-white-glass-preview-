import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KpiTile } from './KpiTile'

;(globalThis as unknown as { React: typeof React }).React = React

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const valeur = (h: string) => />([^<]*)<\/div><\/div>$/.exec(h)?.[1]

// #4595.3 — une mesure absente dit « non mesuré » (avec sa raison si on la sait), jamais « 0 » ni un tiret muet.
describe('KpiTile — valeur absente', () => {
  it.each([null, undefined, Number.NaN])('%s rend « non mesuré », jamais 0', value => {
    const h = html(<KpiTile label="Appels" value={value} />)
    expect(h).toContain('non mesuré')
    expect(h).not.toMatch(/>0</)
  })

  it('nomme la raison quand elle est connue', () => {
    expect(html(<KpiTile label="Appels" value={null} unmeasuredReason="collecte arrêtée le 12/10" />)).toContain(
      'collecte arrêtée le 12/10',
    )
  })

  it('une vraie mesure à zéro reste « 0 »', () => {
    const h = html(<KpiTile label="Appels" value={0} />)
    expect(h).toContain('>0<')
    expect(h).not.toContain('non mesuré')
    expect(valeur(h)).toBe('0')
  })
})
