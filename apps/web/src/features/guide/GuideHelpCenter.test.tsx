import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuideHelpCenter } from './GuideHelpCenter'
import { GUIDE_REGISTRY } from './guide-registry'
import { useGuideStore } from './guide-store'

/**
 * #2214.24 — LE CENTRE D'AIDE : la liste des guides, et le geste qui en lance un.
 *
 * Ce que ce test doit savoir refuser :
 * - un guide du registre absent du centre d'aide (un guide qu'on ne peut pas
 *   lancer est du code juste que personne n'appelle) ;
 * - un guide lancé HORS de son écran — il sauterait toutes ses étapes en
 *   silence (porte de route, #2212.32) : le centre d'aide ouvre d'abord
 *   l'écran, sur le clic de la personne, puis démarre le guide ;
 * - un bouton pour un écran qu'on ne sait pas ouvrir seul (un dossier compte
 *   précis) : là, on DIT où aller, on ne devine pas quel compte ouvrir.
 */

const navigate = vi.fn(async (_options: { to: string }) => undefined)
let pathname = '/search'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname } }),
}))
// #2214.17-.22 — le rôle n'est pas le sujet de cette suite (elle porte les
// gestes du centre d'aide) : `unknown` retombe sur l'ordre du registre tel
// quel, comme `orderGuidesByPersona` le documente.
vi.mock('@/lib/permissions', () => ({ useUserPermissions: () => ({ status: 'unknown' }) }))

beforeEach(() => {
  navigate.mockClear()
  pathname = '/search'
  useGuideStore.setState({ session: null })
})

function renderCenter() {
  const onOpenChange = vi.fn()
  render(<GuideHelpCenter open onOpenChange={onOpenChange} />)
  return { onOpenChange }
}

describe('le centre d’aide (#2214.24)', () => {
  it('liste TOUS les guides du registre — aucun guide sans porte d’entrée', () => {
    renderCenter()
    const items = screen.getAllByTestId('guide-help-center-item')
    expect(items).toHaveLength(GUIDE_REGISTRY.length)
    expect(GUIDE_REGISTRY.length).toBeGreaterThanOrEqual(12)
  })

  it('lance tout de suite le guide de l’écran où l’on est', async () => {
    const { onOpenChange } = renderCenter()
    const item = screen.getByTestId('guide-help-center-item-analyser-un-compte')
    await userEvent.click(within(item).getByRole('button'))
    expect(navigate).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    const session = useGuideStore.getState().session
    expect(session?.steps[0]?.anchor).toBe(GUIDE_REGISTRY.find(g => g.id === 'analyser-un-compte')!.steps[0]!.anchor)
  })

  it('ouvre D’ABORD l’écran d’un guide d’ailleurs, PUIS le démarre', async () => {
    renderCenter()
    const item = screen.getByTestId('guide-help-center-item-piloter-ses-missions')
    await userEvent.click(within(item).getByRole('button'))
    expect(navigate).toHaveBeenCalledWith({ to: '/missions' })
    await waitFor(() => expect(useGuideStore.getState().session).not.toBeNull())
    expect(useGuideStore.getState().session?.steps[0]?.requirements?.route).toBe('/missions')
  })

  it('ne propose aucun bouton pour un dossier compte hors d’un dossier : il dit où aller', () => {
    renderCenter()
    const item = screen.getByTestId('guide-help-center-item-lire-un-dossier-compte')
    expect(within(item).queryByRole('button')).toBeNull()
    expect(item).toHaveTextContent(/ouvre un dossier compte/i)
  })

  it('lance le guide du dossier compte quand on est DANS un dossier', async () => {
    pathname = '/accounts/0b3f6c1e-demo'
    renderCenter()
    const item = screen.getByTestId('guide-help-center-item-lire-un-dossier-compte')
    await userEvent.click(within(item).getByRole('button'))
    expect(navigate).not.toHaveBeenCalled()
    expect(useGuideStore.getState().session).not.toBeNull()
  })

  it('a des gestes de 44 px au moins (cible tactile)', () => {
    renderCenter()
    for (const button of screen.getAllByRole('button', { name: /lancer|ouvrir/i })) {
      expect(button.className).toMatch(/min-h-11/)
    }
  })

  it('THEO / MAQ-SHELL #lay-aide — un tiroir « Aide et guides » : « Sur cet écran » d’abord, puis « Partout »', () => {
    renderCenter()
    const dialog = screen.getByRole('dialog', { name: 'Aide et guides' })
    const groups = within(dialog)
      .getAllByRole('heading', { level: 3 })
      .map(node => node.textContent)
    expect(groups).toEqual(['Sur cet écran', 'Partout'])
    const here = within(dialog).getByRole('region', { name: 'Sur cet écran' })
    expect(within(here).getByTestId('guide-help-center-item-analyser-un-compte')).toBeInTheDocument()
    expect(within(here).queryByTestId('guide-help-center-item-piloter-ses-missions')).toBeNull()
  })
})
