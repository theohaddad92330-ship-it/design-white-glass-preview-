import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { useProductTourStore } from '@/features/product-tour/product-tour-store'
import { useSalesScenarioStore } from '@/features/sales-scenario/sales-scenario-store'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))
const apiFetchMock = vi.mocked(apiFetch)

const { HelpAndAboutGroups } = await import('./HelpAndAboutGroups')
const { renderWithRouter } = await import('@/test-utils/renderWithRouter')

/** Les renvois (« Raccourcis », « Mes données ») sont des liens : le rendu passe par le routeur. */
async function renderView() {
  const view = renderWithRouter(<HelpAndAboutGroups />)
  await screen.findByText('Raccourcis')
  return view
}

/**
 * #2731 — « la visite guidée ne se relance que depuis "Nouveautés" ».
 *
 * Verbatim du retour (call du 22/09/2026, via Loïc Inacio) : « un utilisateur
 * qui cherche de l'aide ne va pas dans "Nouveautés" ». La visite EXISTE et se
 * relance déjà (`ChangelogMenu`, #1794.2) — le défaut mesuré est l'absence
 * d'un second point d'entrée, plus évident : Réglages › Aide & signalements, où vit
 * déjà le bouton jumeau « Relancer le tutoriel de démarrage » (#1794.3).
 *
 * ⚠️ Le geste réutilise le MÊME store que `ChangelogMenu`
 * (`useProductTourStore`, GA-26 : un réglage vit à un seul endroit) — cette
 * suite le prouve en lisant l'état du store après le clic, pas un état local
 * muet qui pourrait diverger.
 */
describe('#2731 — Réglages relance la visite guidée, pas seulement « Nouveautés »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    apiFetchMock.mockResolvedValue({ commit: 'abc123', environment: 'test', timestamp: '' })
    // Singleton : sans remise à zéro, un test lit l'état laissé par le précédent.
    useProductTourStore.setState({ phase: 'off', index: 0, hasVisited: false })
  })

  it('le groupe « Aide » porte un bouton pour revoir la visite guidée', async () => {
    await renderView()
    expect(screen.getByRole('button', { name: 'Revoir la visite guidée' })).toBeInTheDocument()
  })

  it('cliquer dessus démarre VRAIMENT la visite, sur sa première étape', async () => {
    await renderView()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Revoir la visite guidée' }))

    const state = useProductTourStore.getState()
    expect(state.phase).toBe('reading')
    expect(state.index).toBe(0)
  })
})

/**
 * #2731.2 — le scénario commercial a lui aussi sa porte de lancement, au même
 * endroit que son jumeau la visite guidée (Réglages › Aide & signalements).
 *
 * ⚠️ « Lancer l'un arrête l'autre » (docblock de `sales-scenario.ts`) : les
 * deux composants montés au root (`ProductTour`, `SalesScenario`) ne rendent
 * rien tant que leur store dit `off`/`active: false` — s'ils étaient actifs en
 * même temps, DEUX barres non modales se disputeraient le même emplacement
 * fixe en bas d'écran. Cette suite le prouve en lisant les DEUX stores après
 * chaque clic, pas un état local qui pourrait diverger.
 */
describe('#2731.2 — Réglages lance le scénario commercial, et arrête son jumeau', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    apiFetchMock.mockResolvedValue({ commit: 'abc123', environment: 'test', timestamp: '' })
    useProductTourStore.setState({ phase: 'off', index: 0, hasVisited: false })
    useSalesScenarioStore.setState({ active: false, index: 0 })
  })

  it('le groupe « Aide » porte un bouton pour revoir le scénario commercial', async () => {
    await renderView()
    expect(screen.getByRole('button', { name: 'Revoir le scénario commercial' })).toBeInTheDocument()
  })

  it('cliquer dessus démarre VRAIMENT le scénario, et arrête la visite guidée si elle tournait', async () => {
    useProductTourStore.setState({ phase: 'reading', index: 3, hasVisited: true })
    await renderView()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Revoir le scénario commercial' }))

    expect(useSalesScenarioStore.getState()).toEqual(expect.objectContaining({ active: true, index: 0 }))
    expect(useProductTourStore.getState().phase).toBe('off')
  })

  it('relancer la visite guidée arrête le scénario s’il tournait', async () => {
    useSalesScenarioStore.setState({ active: true, index: 2 })
    await renderView()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Revoir la visite guidée' }))

    expect(useProductTourStore.getState().phase).toBe('reading')
    expect(useSalesScenarioStore.getState().active).toBe(false)
  })

  it('Théo D settings-outils — « Raccourcis » et « Conserver mon travail » renvoient, sans refaire', async () => {
    await renderView()
    expect(screen.getByRole('link', { name: 'Consulter' })).toHaveAttribute('href', '/settings/shortcuts')
    expect(screen.getByRole('link', { name: 'Mes données' })).toHaveAttribute('href', '/settings/mes-donnees')
  })
})
