import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen } from '@testing-library/react'
import { SidebarProvider, TooltipProvider } from '@bellum/ui'
import { Building, Users } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AppSidebar } from '@/components/sidebar/AppSidebar'
import { SidebarCollapseToggle } from '@/components/sidebar/SidebarCollapseToggle'
import type { SidebarSection } from '@/components/sidebar/items'

/**
 * GA-95 — LA BARRE LATÉRALE NE PORTE AUCUN CAPUCHON PERMANENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA TENSION QUE CETTE GARDE ARBITRE, ET ELLE EST RÉELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 29/08 a posé les touches sur chaque entrée de navigation pour une
 * raison juste et mesurée : « un raccourci qu'il faut deviner n'existe pas »,
 * et le dépôt entier ne contenait alors qu'UN `<kbd>`, dans une liste
 * atteignable par le seul raccourci que rien n'annonçait.
 *
 * Le 30/08, Louis a mesuré le résultat à l'écran : `G J`, `G C`, `G P`, `G T`,
 * `G M`, `G A`, `G L` et `⌘ K` — **sept capuchons visibles en permanence sur
 * huit lignes**, dans la colonne la plus étroite du produit, ouverte huit heures
 * par jour. « Plus que ça pollue l'interface. »
 *
 * Les deux ont raison, et la contradiction n'est qu'apparente : la règle porte
 * sur la VISIBILITÉ, pas sur l'EMPLACEMENT. Ce lot déplace la réponse — la page
 * `/settings/shortcuts` en dit PLUS (la portée, ce que fait chaque raccourci, où
 * il mène) et ne coûte rien tant qu'on ne l'ouvre pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE, ET POURQUOI CE N'EST PAS UNE EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Une INFOBULLE ne pollue rien : elle n'existe que pendant qu'on survole, elle
 * ne prend aucune place, et elle répond exactement là où la question se pose.
 * C'est d'ailleurs ce que la source demandait littéralement — « tout raccourci
 * est affiché dans le tooltip du bouton correspondant ».
 *
 * Trois surfaces à la demande survivent donc, et cette garde EXIGE qu'elles
 * survivent (une garde qui n'exigerait que le retrait laisserait effacer
 * l'information au lieu de la déplacer) :
 *  - l'infobulle des entrées de navigation, que `SidebarMenuButton` ne montre
 *    QUE barre repliée — dépliée, elle doublerait un libellé déjà lisible ;
 *  - l'infobulle du bouton de repli (`⌘B`) ;
 *  - l'attribut `title` et `aria-keyshortcuts` de la porte de Laura (`⌘K`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PEUT PROUVER, ET CE QU'ELLE NE PEUT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle MONTE la barre pour de vrai : « aucun capuchon dans la ligne » est une
 * assertion sur le DOM, pas sur du texte source. C'est le seul niveau où la
 * question se pose — du code juste que personne ne rend passerait une garde
 * textuelle.
 *
 * Pour la porte de Laura, elle lit la SOURCE : `CustomerNavbarBody` monte
 * `NavUser` et les conversations, donc une session, une file de requêtes et un
 * socket. Le rendre ici ferait une garde longue et fragile qui tomberait pour
 * des raisons étrangères à son sujet. Elle vérifie donc les deux moitiés du
 * fait : plus aucun `<ShortcutKeys` dans le fichier (le capuchon est parti) ET
 * `aria-keyshortcuts` + `title` toujours là (l'information, elle, est restée).
 * Ce que ce couple ne peut pas voir est nommé : si quelqu'un écrivait `⌘K` en
 * dur, c'est GA-44 — « `<kbd>` n'est rendu qu'à un seul endroit » — qui parle.
 */

const SIDEBAR_DIR = join(__dirname, '..', 'components', 'sidebar')
const LAURA_DOOR = join(SIDEBAR_DIR, 'CustomerNavbarBody.tsx')
const NAV = join(SIDEBAR_DIR, 'AppSidebar.tsx')

/**
 * Le code sans ses commentaires.
 *
 * ⚠️ Indispensable ici : les docblocks de ces deux fichiers RACONTENT l'histoire
 * des capuchons et citent `ShortcutKeys` en toutes lettres. Une garde qui compte
 * une citation compte un rendu qui n'existe pas — le défaut « listes découpées
 * sans retirer les commentaires », déjà vécu deux fois dans ce dépôt.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Une entrée AVEC raccourci et une entrée SANS : sans la seconde, le test
 *  resterait vert si le composant cessait d'afficher quoi que ce soit. */
const SECTION: SidebarSection = {
  items: [
    { labelKey: 'items.accounts', to: '/accounts', icon: Building },
    { labelKey: 'items.contacts', to: '/contacts', icon: Users },
  ],
}

beforeEach(() => {
  // jsdom n'implémente pas `matchMedia`, et la barre en dépend des deux côtés.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
})

describe('GA-95 — la barre latérale ne porte aucun capuchon permanent', () => {
  it('LIT quelque chose — la barre rend bien ses entrées', async () => {
    // Le test qui rend les autres crédibles. Sans lui, une barre qui ne rendrait
    // RIEN (un fournisseur manquant, un `return null`) satisferait « zéro
    // capuchon » à la perfection, et cette garde applaudirait un écran vide.
    renderWithRouter(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar topSection={SECTION} />
        </SidebarProvider>
      </TooltipProvider>,
    )
    expect(await screen.findByRole('link', { name: 'Comptes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeTruthy()
  })

  it('aucune entrée de navigation n’affiche ses touches en permanence', async () => {
    const { container } = renderWithRouter(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar topSection={SECTION} />
        </SidebarProvider>
      </TooltipProvider>,
    )
    const accounts = await screen.findByRole('link', { name: 'Comptes' })
    // `/accounts` EST le cas de Louis : c'est l'écran qu'il avait sous les yeux,
    // et `G C` s'y affichait à droite du libellé.
    expect([...accounts.querySelectorAll('kbd')].map(node => node.textContent)).toEqual([])
    // Et pas seulement sur cette ligne : la barre entière, dépliée, n'en porte
    // aucun. Un capuchon déplacé d'une ligne à l'entête resterait une pollution.
    expect(container.querySelectorAll('kbd')).toHaveLength(0)
  })

  it('garde à l’entrée son nom accessible — « Comptes », et rien de plus', async () => {
    // Retirer le capuchon ne doit pas être l'occasion de remettre un `sr-only`
    // « raccourci : G puis C » : il ENTRAIT dans le nom du lien, et neuf tests
    // qui cherchaient « Comptes » ne le trouvaient plus. Une aide qui renomme ce
    // qu'elle décrit n'est pas une aide.
    renderWithRouter(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar topSection={SECTION} />
        </SidebarProvider>
      </TooltipProvider>,
    )
    expect(await screen.findByRole('link', { name: 'Comptes' })).toBeTruthy()
  })

  it('l’INFOBULLE de l’entrée porte toujours le raccourci — la surface à la demande', () => {
    // Barre repliée, le libellé disparaît et l'infobulle est le seul moyen de
    // lire l'entrée : c'est là que le raccourci a sa place, et l'y perdre
    // reviendrait à effacer l'information au lieu de la déplacer.
    // `SidebarMenuButton` ne monte son infobulle qu'à l'ouverture (Radix) : ce
    // qui se vérifie sans la survoler, c'est qu'elle lui est bien PASSÉE.
    const source = stripComments(readFileSync(NAV, 'utf8'))
    expect(source).toContain('<ShortcutKeys')
    // Le capuchon ne doit exister QU'À CET endroit-là du fichier : deux
    // occurrences signifieraient que celui de la ligne est revenu.
    expect(source.match(/<ShortcutKeys/g)).toHaveLength(1)
    expect(/tooltip=\{[\s\S]{0,600}?<ShortcutKeys/.test(source)).toBe(true)
  })

  it('la porte de Laura a perdu son capuchon SANS perdre son raccourci', () => {
    const source = stripComments(readFileSync(LAURA_DOOR, 'utf8'))
    // Le capuchon `⌘ K`, qui s'affichait en permanence, est parti…
    expect(source).not.toContain('<ShortcutKeys')
    // …et les deux surfaces à la demande sont restées : l'infobulle native, et
    // l'annonce au lecteur d'écran qui ne touche pas au nom du lien.
    expect(source).toContain('aria-keyshortcuts={shortcutAriaKeys(laura)}')
    expect(source).toContain('lauraKeys')
    // Preuve que le retrait des commentaires n'a pas tout emporté : le fichier
    // dépouillé contient toujours du JSX.
    expect(source).toContain('<Link')
  })

  it('la bascule de la barre annonce toujours ⌘B, sans toucher à son nom', async () => {
    renderWithRouter(
      <TooltipProvider>
        <SidebarProvider>
          <SidebarCollapseToggle />
        </SidebarProvider>
      </TooltipProvider>,
    )
    const toggle = await screen.findByRole('button', { name: 'Replier la barre latérale' })
    // `Meta+B` ou `Control+B` selon le clavier de la machine qui exécute : le
    // figer trahirait la moitié des postes.
    expect(toggle.getAttribute('aria-keyshortcuts')).toMatch(/^(Meta|Control)\+B$/)
    // Le bouton lui-même n'affiche rien : ses touches vivent dans son infobulle.
    expect(toggle.querySelectorAll('kbd')).toHaveLength(0)
  })
})
