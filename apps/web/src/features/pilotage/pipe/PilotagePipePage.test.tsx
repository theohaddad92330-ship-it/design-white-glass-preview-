import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4197 (L6) — « Pilotage › Pipe » : LE SEUL ENDROIT DU CA PROBABLE.
 *
 * Le panneau vivait au-dessus du kanban de `/projects` (#4016 L1) ; Louis le
 * 14/10 : « le CA probable se lit dans Pilotage ». La page le MONTE — elle n'en
 * écrit pas une seconde version (GA-26 : rien n'apparaît deux fois).
 */
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) => (
    <main aria-label={pageTitle}>{children}</main>
  ),
}))
vi.mock('../view/CrmPipelinePanel', () => ({ CrmPipelinePanel: () => null }))
vi.mock('./PipeWaterfall', () => ({ PipeWaterfall: () => null }))
vi.mock('./PipeInspection', () => ({ PipeInspection: () => null }))
vi.mock('./PipeNeedsTracker', () => ({ PipeNeedsTracker: () => <section data-testid="pipe-needs-tracker" /> }))
vi.mock('./PipeByOwner', () => ({ PipeByOwner: () => null }))
vi.mock('@/features/chains/view/ChainsPage', () => ({ ChainsPage: () => null }))
vi.mock('@/features/laura/bubble/page-context-store', () => ({ useLauraContext: () => undefined }))
vi.mock('@/features/projects/probability/ProbableQuarterPanel', () => ({
  ProbableQuarterPanel: () => <section data-testid="probable-quarter-panel" />,
}))

import { PipeScreen } from './PipeScreen'

afterEach(cleanup)

describe('PipeScreen — CA probable', () => {
  it('monte le panneau du CA probable', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    expect(screen.getByTestId('probable-quarter-panel')).toBeInTheDocument()
  })

  // RV4-E-FIX 4295.13 — l'APPELANT du traceur : sans cette ligne il serait du code juste que personne n'appelle.
  it('monte le traceur des besoins ouverts (CA potentiel, dernier TJM connu)', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    expect(screen.getByTestId('pipe-needs-tracker')).toBeInTheDocument()
  })

  // Théo D (22/10/2026) — Pilotage est UNE page à sections ancrées : le Pipe est une section, il ne porte plus sa propre
  // page (`CustomerPage`, repère « main »). Le titre « Pilotage » et la barre d'ancres sont ceux de `PilotagePage`.
  it('est une section de Pilotage : aucune page propre, aucun repère « main » en double', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('monte le panneau UNE seule fois', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    expect(screen.getAllByTestId('probable-quarter-panel')).toHaveLength(1)
  })
})
