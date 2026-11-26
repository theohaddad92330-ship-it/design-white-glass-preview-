import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalysisProviderMetrics } from './AnalysisProviderMetrics'

// Même fabrique que `page.test.tsx` : le lanceur lit `jsx: "preserve"`.
;(globalThis as unknown as { React: typeof React }).React = React

// #4016.15c — les métriques par source (`_api_metrics.provider_metrics`) ont enfin un lecteur.
describe('AnalysisProviderMetrics — #4016.15c', () => {
  const raw = {
    _api_metrics: {
      provider_metrics: {
        brave: { calls: 12, errors: 1, duration_ms: 3400, wait_ms: 200, cost_usd: 0.036 },
        pappers: { calls: 4, errors: 0, duration_ms: 900, wait_ms: 0, cost_usd: 0.4 },
        sans_mesure: { calls: 2 },
      },
    },
  }

  it('une ligne par source avec appels, échecs, durée, attente et coût, la plus chère d’abord', () => {
    const html = renderToStaticMarkup(<AnalysisProviderMetrics raw={raw} />)
    expect(html).toContain('Appels par source')
    expect(html.indexOf('pappers')).toBeLessThan(html.indexOf('brave'))
    expect(html).toContain('3,4 s')
    expect(html).toContain('0,40')
  })

  it('une mesure absente s’affiche « — », jamais « 0 »', () => {
    const html = renderToStaticMarkup(<AnalysisProviderMetrics raw={raw} />)
    const row = html.slice(html.indexOf('sans_mesure'))
    expect(row.slice(0, row.indexOf('</tr>'))).toContain('—')
    expect(row.slice(0, row.indexOf('</tr>'))).not.toMatch(/>0(,00)?</)
  })

  it('sait dire NON : aucune métrique mesurée ⇒ aucune section', () => {
    expect(renderToStaticMarkup(<AnalysisProviderMetrics raw={{}} />)).toBe('')
    expect(renderToStaticMarkup(<AnalysisProviderMetrics raw={{ _api_metrics: { provider_metrics: {} } }} />)).toBe('')
    expect(renderToStaticMarkup(<AnalysisProviderMetrics raw={{ _api_metrics: { provider_metrics: [1] } }} />)).toBe('')
  })
})
