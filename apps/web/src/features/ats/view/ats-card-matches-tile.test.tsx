import type { AtsStatus } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { ConnectorTile as Model } from '@/features/integration-center/lib/connector-tiles'
import { ConnectorTile } from '@/features/integration-center/view/ConnectorTile'
import { AtsCard } from './AtsCard'

/**
 * #4689 — GARDE : la carte de la grille et le panneau de BoondManager ne peuvent pas rendre deux états différents
 * pour la même connexion. Recette écran du 28/10 : « Non connecté » sur la carte, « Branché » dans le panneau.
 * Chaque état du registre est rendu sur la carte, l'état ATS équivalent dans le panneau : le badge doit être le même
 * mot, en français comme en anglais.
 */
const mocks = vi.hoisted(() => ({ status: undefined as unknown }))
vi.mock('../api', () => ({
  useAtsStatus: () => ({ data: mocks.status }),
  useConnectAts: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useDisconnectAts: () => ({ mutate: vi.fn(), isPending: false }),
  useTestAts: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
}))

const ats = (over: Partial<AtsStatus>): AtsStatus => ({
  connected: false,
  provider: null,
  authMode: null,
  connectedAt: null,
  fromEnvironment: false,
  lastExchangeAt: null,
  needsReconnect: false,
  scopes: null,
  instanceLabel: null,
  oauthAvailable: true,
  ...over,
})

const PAIRS: { registry: Model['status']; panel: AtsStatus }[] = [
  { registry: 'connected', panel: ats({ connected: true, authMode: 'oauth2' }) },
  { registry: 'action_required', panel: ats({ connected: true, authMode: 'oauth2', needsReconnect: true }) },
  { registry: 'available', panel: ats({}) },
]

const tile = (status: Model['status']): Model => ({
  id: 'ats',
  connector: 'ats',
  family: 'crm',
  status,
  action: 'journey',
  name: 'BoondManager',
})

beforeEach(() => {
  window.history.replaceState({}, '', '/integrations')
})

describe('#4689 — carte et panneau disent le même état', () => {
  it.each(['fr', 'en'] as const)('(%s) le badge de la carte est celui du panneau, pour chaque état', async lng => {
    await i18n.changeLanguage(lng)
    const seen = new Set<string>()
    for (const { registry, panel } of PAIRS) {
      const card = render(<ConnectorTile tile={tile(registry)} onOpen={() => undefined} />)
      const cardBadge = within(screen.getByTestId('connector-tile-ats')).getAllByText(/./)
      const cardLabels = cardBadge.map(n => n.textContent ?? '')
      card.unmount()

      mocks.status = panel
      const panelView = render(<AtsCard />)
      // Le badge du panneau est dans l'en-tête, à côté du titre.
      const title = screen.getByText('BoondManager (ATS / ERP)')
      const badge = title.parentElement?.querySelector('[class*="badge"], span') as HTMLElement
      panelView.unmount()

      expect(cardLabels, `carte ${registry}`).toContain(badge.textContent)
      seen.add(badge.textContent ?? '')
    }
    // Elle sait dire NON : trois états, trois mots distincts (une garde qui lirait toujours le même mot passerait).
    expect(seen.size).toBe(3)
  })
})
