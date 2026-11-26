import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { chooseOption } from '@/test/select'
import {
  ACCOUNT_SECTIONS,
  AccountDetailTabsBar,
  MERGED_SUB_TABS,
  SECTION_KEYS,
  TAB_KEYS,
  sectionOfTab,
  subSectionAnchorId,
  tabsOfSection,
} from './AccountDetailTabsBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// #2130.54 — le double de `trackTabOpened` : le geste, jamais l'identifiant du
// compte (voir la garde voisine `product-tracker-emits-no-content.spec.ts`).
const tracker = vi.hoisted(() => ({ trackTabOpened: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

const sectionsNav = () => screen.getByRole('navigation', { name: 'sectionsNav.sections' })
const subSectionsNav = () => screen.getByRole('navigation', { name: 'sectionsNav.subSections' })

/**
 * #2115.14-27, #2115.40-47 — LE DOSSIER EN SEPT SECTIONS (D8, Louis 14/09/2026).
 *
 * Les quatorze onglets ne disparaissent pas : ils sont ABSORBÉS par sept
 * sections, et chacun devient une SOUS-SECTION atteinte par ancre. Ce que ces
 * tests tiennent, et qui n'est pas décoratif : `TAB_KEYS` reste le contrat du
 * paramètre d'URL — un lien déjà partagé (`?tab=partners`) ouvre la même page
 * qu'avant, dans sa section — et la section active se DÉDUIT de l'onglet, donc
 * il n'y a pas de second état à désynchroniser.
 */
describe('AccountDetailTabsBar — les sept sections (#2115.14-20)', () => {
  it('affiche les HUIT sections de la page appliquée (Théo A comptes-fiche.R2), dans l’ordre de la décision', () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    const labels = within(sectionsNav())
      .getAllByRole('button')
      .map(button => button.textContent?.trim())
    expect(labels).toEqual([
      'tabSections.synthesis',
      'tabSections.perimeters',
      'tabSections.opportunities',
      'tabSections.people',
      'tabSections.organigramme',
      'tabSections.ecosystem',
      'tabSections.actionPlan',
      'tabSections.historyProofs',
      'tabSections.finance',
    ])
  })

  it('#2115.42 — la section ACTIVE est la seule marquée comme telle', () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    const marked = within(sectionsNav())
      .getAllByRole('button')
      .filter(button => button.getAttribute('aria-current') === 'page')
    expect(marked.map(button => button.textContent?.trim())).toEqual(['tabSections.synthesis'])
  })

  it('un DEEP-LINK ouvre la bonne section tout seul — aucune URL ne casse', () => {
    // `?tab=partners` : « Écosystème & accès » doit être active sans qu'on ait
    // cliqué quoi que ce soit, sinon le lien partagé atterrit dans le vide.
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    expect(within(sectionsNav()).getByRole('button', { name: 'tabSections.ecosystem' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('cliquer une section ouvre sa PREMIÈRE page', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.historyProofs' }))

    // Refonte Théo (23/10) — « Historique & preuves » s'ouvre sur l'Activité (le fil du compte), comme la maquette.
    expect(onTabChange).toHaveBeenCalledWith('history')
  })

  // #2620.1 — revirement assumé de #1817 : le retour dit qu'on vient chercher
  // des gens, pas un schéma. « Personnes » s'ouvre désormais sur les
  // CONTACTS ; l'organigramme reste à un clic (tri par priorité déjà en
  // place, `CompactContactRow.tsx`).
  it('#2620.1 — « Personnes » s’ouvre sur les contacts, pas sur l’organigramme', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.people' }))

    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  it('#2620.1 — sait dire NON : cliquer « Personnes » n’ouvre plus l’organigramme', async () => {
    // Casse volontairement l'attendu pour prouver que ce test peut échouer :
    // avant le correctif, `onTabChange` recevait 'organigramme'.
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.people' }))

    expect(onTabChange).not.toHaveBeenCalledWith('organigramme')
  })

  it('cliquer la section DÉJÀ active ne rejoue rien', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} hiddenTabs={['brief']} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.synthesis' }))

    expect(onTabChange).not.toHaveBeenCalled()
  })
})

describe('AccountDetailTabsBar — les sous-sections sont des ANCRES (#2115.44)', () => {
  it('une section à plusieurs sous-parties les nomme, et chacune est une ancre', () => {
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    const links = within(subSectionsNav()).getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual(['#dossier-partners', '#dossier-access'])
    expect(links.map(link => link.textContent?.trim())).toEqual(['tabs.partners', 'tabs.access'])
  })

  it('Théo comptes-fiche — la Synthèse est UN seul panneau : « Ce que je sais », « Vue d’ensemble » et « Score » ne sont jamais des pastilles', () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    expect(screen.queryByRole('navigation', { name: 'sectionsNav.subSections' })).not.toBeInTheDocument()
    for (const tab of ['brief', 'overview', 'evaluation']) {
      expect(screen.queryByText(`tabs.${tab}`)).not.toBeInTheDocument()
    }
  })

  it('une sous-partie d’une AUTRE section n’encombre pas la barre', () => {
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    expect(within(subSectionsNav()).queryByText('tabs.overview')).not.toBeInTheDocument()
  })

  it('cliquer une ancre ouvre sa sous-partie, sans quitter la section', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={onTabChange} />)

    await userEvent.click(within(subSectionsNav()).getByRole('link', { name: 'tabs.access' }))

    expect(onTabChange).toHaveBeenCalledWith('access')
  })

  it('une section d’UNE seule sous-partie n’affiche pas de second niveau vide', () => {
    // Une barre d'ancres à une entrée répéterait le nom de la section et ne
    // mènerait nulle part.
    //
    // #3677 — « Périmètres » ne porte plus que les sites : le cas est naturel,
    // sans masquer quoi que ce soit.
    render(<AccountDetailTabsBar activeTab="sites" onTabChange={() => {}} />)

    expect(screen.queryByRole('navigation', { name: 'sectionsNav.subSections' })).not.toBeInTheDocument()
  })

  // #3624 / #3676 (Louis 05/10) — les sous-onglets FONDUS (`veille`,
  // `projects`) gardent leur URL et leur section, mais ne sont plus nommés en
  // pastille : leur section n'en affiche aucune. Ce test les en exempte
  // nommément, délibérément — pour tous les autres, la règle tient.
  it('chaque onglet du contrat d’URL est NOMMÉ quelque part — aucun ne disparaît', () => {
    for (const tab of TAB_KEYS) {
      const { unmount } = render(<AccountDetailTabsBar activeTab={tab} onTabChange={() => {}} />)
      const section = sectionOfTab(tab)
      expect(
        within(sectionsNav()).getByRole('button', { name: `tabSections.${section}` }),
        `${tab} tombe dans une section qui ne s'affiche pas`,
      ).toHaveAttribute('aria-current', 'page')
      const pills = tabsOfSection(section).filter(entry => !MERGED_SUB_TABS.includes(entry))
      if (pills.length > 1) {
        expect(
          within(subSectionsNav()).getByRole('link', { name: `tabs.${tab}` }),
          `${tab} n'est nommé nulle part`,
        ).toHaveAttribute('href', `#${subSectionAnchorId(tab)}`)
      }
      unmount()
    }
  })

  // #3624 / #3676 (Louis 05/10) — « ne plus avoir 3 écrans, ne faire qu'un
  // écran » : Signaux / Opportunités / Besoins confirmés ne sont plus trois
  // pastilles, quelle que soit la clé d'URL qui ouvre la section (`needs` est
  // un alias de `veille`, résolu avant la barre).
  it.each(['veille', 'projects'] as const)(
    '#3624 — la section Opportunités n’affiche AUCUNE pastille (?tab=%s)',
    tab => {
      render(<AccountDetailTabsBar activeTab={tab} onTabChange={() => {}} />)
      expect(within(sectionsNav()).getByRole('button', { name: 'tabSections.opportunities' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.queryByRole('navigation', { name: 'sectionsNav.subSections' })).not.toBeInTheDocument()
      expect(screen.queryByText('tabs.veille')).not.toBeInTheDocument()
      expect(screen.queryByText('tabs.projects')).not.toBeInTheDocument()
    },
  )

  it('#3676 — cliquer « Opportunités » ouvre l’écran « Signaux et besoins » (`veille`)', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} />)
    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.opportunities' }))
    expect(onTabChange).toHaveBeenCalledWith('veille')
  })

  // #3625 (Louis 05/10) — « supprime le sous-onglet Programme, dans Périmètre
  // on verra juste les sites ».
  // `programs` n'est plus une clé (#3677) : `?tab=programs` est un alias de
  // `veille`, résolu avant la barre.
  it('#3625 — Périmètres n’affiche plus la pastille Programmes', () => {
    render(<AccountDetailTabsBar activeTab="sites" onTabChange={() => {}} />)
    expect(screen.queryByRole('navigation', { name: 'sectionsNav.subSections' })).not.toBeInTheDocument()
    expect(screen.queryByText('tabs.programs')).not.toBeInTheDocument()
  })

  it('sait dire NON : une section non fondue (Écosystème) garde ses pastilles', () => {
    render(<AccountDetailTabsBar activeTab="access" onTabChange={() => {}} />)
    expect(within(subSectionsNav()).getAllByRole('link')).toHaveLength(2)
  })

  it('sait dire NON : une ancre ne pointe jamais sur l’identifiant d’une autre sous-partie', () => {
    const ids = TAB_KEYS.map(subSectionAnchorId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(subSectionAnchorId('access')).not.toBe(subSectionAnchorId('partners'))
  })
})

describe('AccountDetailTabsBar — les sous-sections annoncent leur état (#2479)', () => {
  // #2479 — deuxième défaut, distinct de la sélection qui ne suit pas le
  // clic : `TabNav` ne posait `aria-pressed` que sur sa branche `<button>`
  // (`tab-nav.tsx`, l'état ACTIF calculé n'était jamais transmis à
  // `renderLink`) — un lecteur d'écran ne savait donc jamais QUELLE
  // sous-partie était ouverte, alors que la pastille voisine (branche
  // bouton) le porte depuis toujours.
  it('l’ancre active porte aria-pressed=true, les autres false', () => {
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    const links = within(subSectionsNav()).getAllByRole('link')
    expect(links.map(link => link.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })
})

describe('AccountDetailTabsBar — onglets masqués (recette finale §33)', () => {
  it('retire une sous-partie sans contenu actionnable, sans retirer sa section', () => {
    render(<AccountDetailTabsBar activeTab="contacts" onTabChange={() => {}} hiddenTabs={['coverage']} />)

    expect(within(subSectionsNav()).queryByText('tabs.coverage')).not.toBeInTheDocument()
    expect(within(subSectionsNav()).getByText('tabs.contacts')).toBeInTheDocument()
    expect(within(sectionsNav()).getByRole('button', { name: 'tabSections.people' })).toBeInTheDocument()
  })

  it('garde la sous-partie ACTIVE même listée comme masquée', () => {
    // Le cas du lien partagé : `?tab=coverage` doit ouvrir la couverture et la
    // nommer, sinon l'utilisateur atterrit sur une page dont rien n'est allumé.
    render(<AccountDetailTabsBar activeTab="coverage" onTabChange={() => {}} hiddenTabs={['coverage']} />)

    expect(within(subSectionsNav()).getByText('tabs.coverage')).toBeInTheDocument()
    expect(within(sectionsNav()).getByRole('button', { name: 'tabSections.people' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('retire une section dont TOUTES les sous-parties sont masquées', () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} hiddenTabs={['sites']} />)

    // Une entrée de section qui n'ouvre rien est pire qu'une entrée absente.
    expect(within(sectionsNav()).queryByText('tabSections.perimeters')).not.toBeInTheDocument()
    expect(within(sectionsNav()).getByText('tabSections.historyProofs')).toBeInTheDocument()
  })
})

describe('AccountDetailTabsBar — mobile (#2115.45-47)', () => {
  it('#2115.45 — la même barre porte un sélecteur compact, dans le MÊME rendu', () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    expect(screen.getByRole('combobox', { name: 'sectionsNav.mobile' })).toBeInTheDocument()
  })

  it('#2115.45 — choisir une section dans le sélecteur ouvre sa première page', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={onTabChange} />)

    await chooseOption(screen.getByRole('combobox', { name: 'sectionsNav.mobile' }), 'ecosystem')

    expect(onTabChange).toHaveBeenCalledWith('partners')
  })

  it('#2115.47 — un bouton ramène au résumé depuis n’importe quelle section', async () => {
    const onTabChange = vi.fn()
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={onTabChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'sectionsNav.backToSummary' }))

    expect(onTabChange).toHaveBeenCalledWith('overview')
  })

  it('#2115.47 — et il ne s’affiche pas quand on Y EST déjà', () => {
    render(<AccountDetailTabsBar activeTab="evaluation" onTabChange={() => {}} />)

    expect(screen.queryByRole('button', { name: 'sectionsNav.backToSummary' })).not.toBeInTheDocument()
  })
})

/**
 * #2130.54 — L'OUVERTURE D'UNE SECTION/SOUS-PARTIE ÉMET `tab_opened`.
 *
 * `trackTabOpened` existait déjà (SectionTabs.tsx, la barre globale) mais
 * n'était câblé sur AUCUN des chemins de CETTE barre — celle des quatorze
 * onglets du dossier compte. `screen` est le motif de route littéral
 * `/accounts/$id` (jamais dérivé d'un `account.id`, GA-276), `tab` est
 * l'onglet réellement ouvert — jamais un contenu.
 */
describe('AccountDetailTabsBar — télémétrie (#2130.54)', () => {
  beforeEach(() => tracker.trackTabOpened.mockClear())

  it('émet au clic sur une SECTION (barre large)', async () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.people' }))

    expect(tracker.trackTabOpened).toHaveBeenCalledWith('/accounts/$id', 'contacts')
  })

  it('émet au choix d’une section dans le sélecteur MOBILE', async () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} />)

    await chooseOption(screen.getByRole('combobox', { name: 'sectionsNav.mobile' }), 'ecosystem')

    expect(tracker.trackTabOpened).toHaveBeenCalledWith('/accounts/$id', 'partners')
  })

  it('émet au clic direct sur une SOUS-PARTIE (pilule)', async () => {
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    await userEvent.click(within(subSectionsNav()).getByText('tabs.access'))

    expect(tracker.trackTabOpened).toHaveBeenCalledWith('/accounts/$id', 'access')
  })

  it('émet au retour au résumé', async () => {
    render(<AccountDetailTabsBar activeTab="partners" onTabChange={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'sectionsNav.backToSummary' }))

    expect(tracker.trackTabOpened).toHaveBeenCalledWith('/accounts/$id', 'overview')
  })

  it('n’émet rien quand la section cliquée est déjà active', async () => {
    render(<AccountDetailTabsBar activeTab="overview" onTabChange={() => {}} hiddenTabs={['brief']} />)

    await userEvent.click(within(sectionsNav()).getByRole('button', { name: 'tabSections.synthesis' }))

    expect(tracker.trackTabOpened).not.toHaveBeenCalled()
  })
})

describe('ACCOUNT_SECTIONS — la table LIT quelque chose', () => {
  it('les neuf sections absorbent les onglets, sans perte ni doublon (#4745 : + Stratégie financière)', () => {
    expect(ACCOUNT_SECTIONS.length).toBe(SECTION_KEYS.length)
    expect(ACCOUNT_SECTIONS.length).toBe(9)
    const absorbed = ACCOUNT_SECTIONS.flatMap(entry => entry.tabs)
    expect([...absorbed].sort()).toEqual([...TAB_KEYS].sort())
  })
})
