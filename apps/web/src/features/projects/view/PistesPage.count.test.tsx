import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import type { TFunction } from 'i18next'
import { measuredCounter, unmeasuredCounter } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { pipelineHeaderSummary } from './pipeline-header-summary'

/**
 * #4191 (recette 2, E2) — UN seul chiffre de pistes : le Pipe, `/projects/pistes` et Pilotage
 * lisent `pistes_to_review` (232), jamais `leads_to_qualify` (214, les AFFAIRES à qualifier).
 */
const counters = vi.hoisted(() => ({ pistesToReview: 232 as number | null }))
function currentCounters() {
  return {
    opportunities_active: measuredCounter(12, 'opportunities_active'),
    leads_to_qualify: measuredCounter(214, 'leads_to_qualify'),
    pistes_to_review:
      counters.pistesToReview === null
        ? unmeasuredCounter('pistes_to_review')
        : measuredCounter(counters.pistesToReview, 'pistes_to_review'),
  }
}
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({ data: { counters: currentCounters() } }),
}))

const { PistesCount } = await import('./PistesCount')

afterEach(() => {
  cleanup()
  counters.pistesToReview = 232
})

describe('E2 — le même nombre de pistes sur tous les écrans', () => {
  it('l’en-tête de /projects/pistes dit 232, pas 214', async () => {
    await i18n.loadNamespaces('projects')
    render(
      <I18nextProvider i18n={i18n}>
        <PistesCount />
      </I18nextProvider>,
    )
    expect(screen.getByText(/232 pistes/)).toBeInTheDocument()
    expect(screen.queryByText(/214/)).not.toBeInTheDocument()
  })

  it('la ligne « N pistes » du Pipe dit le même 232', async () => {
    await i18n.loadNamespaces('projects')
    const t = i18n.getFixedT('fr', 'projects') as TFunction<'projects'>
    const line = pipelineHeaderSummary(t, { total_count: 12, columns: [] }, [], currentCounters())
    expect(line).toContain('232 pistes')
    expect(line).not.toContain('214')
  })

  // #4545 — l'en-tête annonçait « 0 piste à revoir » au-dessus de 2 708 lignes : `pistes_to_review` compte les
  // DÉTECTIONS à confirmer, le tableau montre aussi les besoins par compte. Zéro détection = aucune ligne
  // (GA-18 / GA-19) ; le tableau dit lui-même combien de lignes il montre (puce « Toutes N »).
  it('zéro détection à revoir : l’en-tête se tait, il ne dit JAMAIS « 0 piste à revoir »', async () => {
    await i18n.loadNamespaces('projects')
    counters.pistesToReview = 0
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <PistesCount />
      </I18nextProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/0 pistes? à revoir/)).not.toBeInTheDocument()
  })

  it('non mesuré : l’en-tête se tait, la ligne du Pipe le NOMME — jamais « 0 »', async () => {
    await i18n.loadNamespaces('projects')
    counters.pistesToReview = null
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <PistesCount />
      </I18nextProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    const t = i18n.getFixedT('fr', 'projects') as TFunction<'projects'>
    const line = pipelineHeaderSummary(t, { total_count: 1, columns: [] }, [], currentCounters())
    expect(line).toContain('Pistes : non mesuré')
  })
})
