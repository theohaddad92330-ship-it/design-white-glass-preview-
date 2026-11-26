/**
 * Le repli de la barre latérale — I-105.
 *
 * La barre SAIT se replier depuis toujours (`collapsible="icon"`, une quinzaine
 * de règles CSS dans `packages/ui`), et les deux écrans qui l'utilisent
 * demandaient `collapsible="none"`. Du code juste, testé, que personne
 * n'appelait.
 *
 * Ce que ce fichier prouve, et pourquoi chaque point y est :
 *
 * a. la barre se replie — sinon le lot n'existe pas ;
 * b. **repliée, chaque entrée garde son nom accessible** — une barre où l'on ne
 *    sait plus où l'on est serait pire que pas de repli (GA-32) ;
 * c. le choix survit à un remontage ET atterrit dans `localStorage` — un
 *    utilisateur qui replie ne veut pas recommencer à chaque chargement ;
 * d. un `localStorage` qui JETTE (navigation privée, cookies bloqués, quota) ne
 *    casse pas le rendu — l'accès est enveloppé en lecture ET en écriture ;
 * e. **rien ne change sous 768 px** — la coque mobile a sa propre navigation,
 *    et les deux mécanismes ne doivent pas se marcher dessus.
 */
import { screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarProvider } from '@bellum/ui'
import { Building, Users } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useUIStore } from '@/stores'
import { AppSidebar } from './AppSidebar'
import { SettingsNavbarBody } from './SettingsNavbarBody'
import { SIDEBAR_PREFERENCE_STORAGE_KEY } from '@/stores/uiStore'
import type { SidebarSection } from './items'

// La bascule de thème du pied de barre exige son fournisseur, qui n'a rien à
// voir avec le repli : sans ce faux, la barre des Réglages tomberait sur
// « useTheme must be used within a <ThemeProvider> ».
vi.mock('./ThemeToggle', () => ({ ThemeToggle: () => null }))

const SECTION: SidebarSection = {
  items: [
    { labelKey: 'items.accounts', to: '/accounts', icon: Building },
    { labelKey: 'items.contacts', to: '/contacts', icon: Users },
  ],
}

/**
 * Le routeur en mémoire de TanStack peint son premier écran de façon
 * asynchrone : sans cette attente, chaque test interrogerait un `<div />` vide
 * et échouerait pour une raison qui n'a rien à voir avec le repli.
 */
async function renderSidebar(): Promise<RenderResult> {
  const result = renderWithRouter(
    <SidebarProvider>
      <AppSidebar topSection={SECTION} header={<span>Marque</span>} />
    </SidebarProvider>,
  )
  await screen.findByRole('link', { name: 'Comptes' })
  return result
}

/** L'élément qui porte l'état de repli (`data-state` / `data-collapsible`). */
function sidebarRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('[data-slot="sidebar"]')
  if (!(root instanceof HTMLElement)) throw new Error('barre latérale absente du rendu')
  return root
}

/**
 * jsdom n'implémente pas `matchMedia`, et la barre latérale en dépend des deux
 * côtés (le paquet UI pour son tiroir mobile, l'application pour sa coque).
 * Sans ce faux, l'écran tombe sur « window.matchMedia is not a function » — une
 * panne d'environnement qu'on prendrait pour une panne du repli.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

beforeEach(() => {
  stubMatchMedia(false)
  // Chaque test repart d'une préférence neuve : le store est un singleton de
  // module, et une préférence laissée par le test précédent ferait passer le
  // suivant pour de mauvaises raisons.
  window.localStorage.removeItem(SIDEBAR_PREFERENCE_STORAGE_KEY)
  useUIStore.setState({ sidebarOpen: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('la barre latérale se replie', () => {
  it('part dépliée et se replie au clic sur le déclencheur', async () => {
    const user = userEvent.setup()
    const { container } = await renderSidebar()

    expect(sidebarRoot(container)).toHaveAttribute('data-state', 'expanded')

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))

    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))
    // C'est `data-collapsible="icon"` qui déclenche les règles CSS du rail :
    // sans lui, la barre serait « repliée » sans rétrécir.
    expect(sidebarRoot(container)).toHaveAttribute('data-collapsible', 'icon')
  })

  it('le déclencheur se déplie à son tour, et dit ce qu il fera', async () => {
    const user = userEvent.setup()
    const { container } = await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))

    // Le nom du bouton annonce l'ACTION, pas l'état — c'est ce qu'un lecteur
    // d'écran lit avant de décider s'il appuie.
    await user.click(await screen.findByRole('button', { name: 'Déplier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'expanded'))
  })
})

describe('repliée, chaque entrée reste identifiable', () => {
  it('les entrées gardent leur nom accessible une fois repliées (GA-32)', async () => {
    const user = userEvent.setup()
    const { container } = await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))

    // Le libellé n'est pas retiré du DOM quand la barre rétrécit : il est
    // rogné visuellement. Le retirer donnerait une colonne d'icônes muettes.
    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument()
  })

  it('chaque entrée porte une infobulle qui se montre au focus', async () => {
    const user = userEvent.setup()
    const { container } = await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))

    const entry = screen.getByRole('link', { name: 'Comptes' })
    // Une infobulle Radix marque son déclencheur : sans `tooltip`, l'attribut
    // n'existe pas du tout — c'est ce qui distingue « libellé rogné » de
    // « libellé rogné SANS moyen de le lire ».
    expect(entry).toHaveAttribute('data-state')

    entry.focus()
    expect(await screen.findByRole('tooltip', { name: 'Comptes' })).toBeInTheDocument()
  })
})

describe('le choix survit', () => {
  it('un remontage retrouve la barre repliée', async () => {
    const user = userEvent.setup()
    const first = await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(first.container)).toHaveAttribute('data-state', 'collapsed'))

    first.unmount()

    const second = await renderSidebar()
    await waitFor(() => expect(sidebarRoot(second.container)).toHaveAttribute('data-state', 'collapsed'))
  })

  it('le choix est écrit dans localStorage, pas seulement en mémoire', async () => {
    const user = userEvent.setup()
    await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))

    await waitFor(() => {
      const raw = window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY)
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw as string)).toMatchObject({ state: { sidebarOpen: false } })
    })
  })
})

describe('un localStorage qui jette ne casse rien', () => {
  /** Le stockage de Safari en navigation privée : il existe, et il refuse. */
  const throwingStorage = {
    get length(): number {
      throw new Error('SecurityError')
    },
    clear: () => {
      throw new Error('SecurityError')
    },
    getItem: () => {
      throw new Error('SecurityError')
    },
    key: () => {
      throw new Error('SecurityError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  }

  it('la barre se rend et se replie quand même', async () => {
    vi.stubGlobal('localStorage', throwingStorage)
    const user = userEvent.setup()
    const { container } = await renderSidebar()

    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))
  })

  it("l'écriture de la préférence n'échoue pas non plus", () => {
    vi.stubGlobal('localStorage', throwingStorage)
    expect(() => useUIStore.getState().setSidebarOpen(false)).not.toThrow()
  })

  it('la lecture au démarrage retombe sur le défaut', async () => {
    vi.stubGlobal('localStorage', throwingStorage)
    vi.resetModules()
    // Un module NEUF : c'est au chargement que la lecture a lieu, et c'est
    // exactement le moment où la navigation privée refuse.
    const fresh = await import('@/stores/uiStore')
    expect(fresh.useUIStore.getState().sidebarOpen).toBe(true)
  })
})

describe('le panneau replié reste DANS la coque', () => {
  /**
   * Les deux pièges du mode `icon`, trouvés en lisant la coque plutôt que le
   * composant — et invisibles dans une capture d'écran ordinaire :
   *
   * 1. le panneau était `fixed`, donc calé sur la FENÊTRE. `#app-shell` ne
   *    l'occupe pas : il vit sous des bandeaux qui poussent le contenu vers le
   *    bas (promotion d'abonnement, bandeaux opérateur) et, en développement,
   *    sous une barre d'état de 28 px. Le panneau serait passé par-dessus, et
   *    le seul jour où on l'aurait vu est celui où un bandeau est affiché.
   * 2. l'élément flex de la rangée n'est PAS le panneau mais la boîte qui le
   *    contient : le `shrink-0` posé par l'appelant atterrissait sur le
   *    panneau, et le contenu de page en `w-full` écrasait la barre.
   */
  it('la barre est un élément flex qui ne se laisse pas écraser, et son panneau est positionné dans la coque', async () => {
    const { container } = await renderSidebar()
    const root = sidebarRoot(container)
    expect(root.className).toContain('shrink-0')
    expect(root.className).toContain('relative')

    const panel = container.querySelector('[data-slot="sidebar-container"]')
    expect(panel).toBeInstanceOf(HTMLElement)
    expect((panel as HTMLElement).className).toContain('absolute')
    expect((panel as HTMLElement).className).not.toContain('fixed')
  })
})

describe('la barre des Réglages se replie aussi', () => {
  /**
   * Les DEUX écrans denses du produit. Ne prouver que celui de l'application
   * laisserait l'autre repartir en `collapsible="none"` sans que rien ne le
   * dise — c'est exactement comme ça que la dette est née.
   */
  async function renderSettings(): Promise<RenderResult> {
    const result = renderWithRouter(
      <SidebarProvider>
        <SettingsNavbarBody />
      </SidebarProvider>,
    )
    await screen.findByRole('link', { name: 'Préférences' })
    return result
  }

  it('se replie et garde ses entrées nommées', async () => {
    const user = userEvent.setup()
    const { container } = await renderSettings()

    await user.click(screen.getByRole('button', { name: 'Replier la barre latérale' }))

    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))
    expect(sidebarRoot(container)).toHaveAttribute('data-collapsible', 'icon')
    expect(screen.getByRole('link', { name: 'Préférences' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Profil/ })).toBeInTheDocument()
  })

  it('partage la préférence avec la barre de l application', async () => {
    // Un réglage vit à un seul endroit (GA-26) : replier ici et retrouver
    // déplié là voudrait dire deux réglages qui portent le même nom.
    useUIStore.setState({ sidebarOpen: false })
    const { container } = await renderSettings()
    await waitFor(() => expect(sidebarRoot(container)).toHaveAttribute('data-state', 'collapsed'))
  })
})

describe('le repli ne descend pas sous la coque mobile', () => {
  it('sous 768 px, la barre reste non repliable et le déclencheur est masqué', async () => {
    // La coque mobile a sa propre navigation (`MobileShell` + `MobileTabBar`).
    // Le repli de bureau ne doit pas y toucher : deux mécanismes de navigation
    // sur le même écran, c'est le pire des deux.
    stubMatchMedia(true)
    const { container } = await renderSidebar()

    const root = sidebarRoot(container)
    // `collapsible="none"` : ni état de repli, ni rail — le rendu d'avant ce lot.
    expect(root).not.toHaveAttribute('data-state')
    expect(root).not.toHaveAttribute('data-collapsible')

    // Le déclencheur reste dans le même rendu, masqué en CSS sous `md`
    // (une colonne masquée l'est en CSS, pas par une branche de rendu).
    const trigger = screen.getByRole('button', { name: 'Replier la barre latérale' })
    expect(trigger.className).toContain('hidden')
    expect(trigger.className).toContain('md:inline-flex')
  })
})
