/**
 * LA BARRE LATÉRALE DIT OÙ L'ON EST — D51 (26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Neuf routes n'allumaient AUCUNE entrée : `/rfp`, `/team`, `/integrations`,
 * `/mailbox`, `/contacts`, `/discover`, `/watchlist`, `/propositions` — et
 * `/pilotage/rex` dès que le modèle le range ailleurs que sous `/pilotage`.
 *
 * Toutes sont des routes d'ONGLET : la réduction de la barre à neuf entrées a
 * absorbé chaque surface dans une section, mais la route de l'onglet ne préfixe
 * pas celle de sa section (`/rfp` n'est pas sous `/projects`). Or l'allumage se
 * décidait par PRÉFIXE d'URL. L'utilisateur était sur un écran, et la
 * navigation ne lui disait pas où.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────
 * a. les neuf routes allument bien l'entrée de leur SECTION ;
 * b. **tout ce qui marchait déjà marche encore** — c'est le point important :
 *    les fiches, les onglets déjà préfixés, les Réglages, et les entrées qui ne
 *    sont PAS des routes de section (barre du backoffice) ;
 * c. la barre de RÉGLAGES est intacte : elle répond à une autre question — elle
 *    liste des routes-feuilles DANS une section, donc la règle « la section qui
 *    possède le chemin » y allumerait « Préférences » sur chaque écran ;
 * d. la garde LIT quelque chose : le modèle de sections, la barre réellement
 *    rendue (`PLATFORM_SECTIONS`) et les routes du DISQUE — chaque corpus est
 *    asserté non vide, sinon un test vert ne dirait rien ;
 * e. l'entrée active est ANNONCÉE (`aria-current="page"`), pas seulement
 *    colorée : c'est l'écran où « savoir où l'on est » se joue, et la couleur
 *    seule ne le dit pas à un lecteur d'écran.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { screen, type RenderResult } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { isNavEntryActive, NAV_SECTIONS, rootSection, sectionForPath } from '@/components/navigation/sections'
import { AppSidebar } from './AppSidebar'
import { BACKOFFICE_SECTION, PLATFORM_FOOT_SECTION, PLATFORM_SECTIONS } from './items'
import { SETTINGS_SECTIONS } from './items.settings'

/** Les entrées RÉELLEMENT rendues par la barre de l'application — la rubrique et, depuis la
 *  coque Théo (23/10/2026), son PIED (Intégrations, Paramètres). */
const SIDEBAR_ITEMS = [...(PLATFORM_SECTIONS[0]?.items ?? []), ...PLATFORM_FOOT_SECTION.items]
const SIDEBAR_ENTRIES: string[] = SIDEBAR_ITEMS.map(item => String(item.to))

/**
 * Les entrées que ce chemin allume — il ne doit jamais y en avoir deux. #4492 (PR 12C) : Comptes,
 * Contacts et Signaux sont des SECTIONS (plus d'onglets promus) — chaque entrée s'allume par sa section
 * racine (`isNavEntryActive`), /team et /pilotage allument « Ma journée ».
 */
function litEntries(pathname: string, entries: string[] = SIDEBAR_ENTRIES): string[] {
  return entries.filter(entry => isNavEntryActive(entry, pathname))
}

describe('le corpus que cette garde LIT', () => {
  it('lit les neuf sections du modèle', () => {
    expect(NAV_SECTIONS.length).toBeGreaterThanOrEqual(9)
  })

  it('lit la barre réellement rendue, et elle n’est pas vide', () => {
    expect(SIDEBAR_ENTRIES.length).toBeGreaterThanOrEqual(8)
    expect(SIDEBAR_ENTRIES).toContain('/accounts')
  })

  it('lit les routes du disque, et elles ne sont pas vides', () => {
    const routes = fileRoutes()
    expect(routes.length).toBeGreaterThan(50)
    expect(routes).toContain('/projects') // #4359 — /rfp retirée
  })
})

/**
 * Les routes de la mesure D51, et l'entrée qui DOIT s'allumer.
 *
 * ⚠️ Elles étaient NEUF. `/integrations` en est sortie le 01/09/2026 avec
 * l'onglet « Outils connectés » : elle n'est plus rangée sous aucune section, sa
 * porte est la barre de Réglages, et c'est le bloc « la barre de RÉGLAGES ne
 * bouge pas » plus bas qui la tient désormais.
 *
 * ⚠️ `/propositions` en est sortie le 05/09/2026 (#1453). Le studio n'est plus
 * une destination : on y entre depuis le dossier concerné, « Préparer la
 * proposition », et la route ne survit que pour les liens déjà partis. Elle
 * n'allume donc plus rien, et c'est le comportement voulu — la garde d'orphelins
 * de `sections.test.ts` est ce qui la tient désormais, avec sa raison écrite.
 * ⚠️⚠️ Ne PAS la remettre ici « pour faire passer le test » : la remettre
 * exigerait de recréer l'onglet que le retour demandait de retirer.
 *
 * L'attendu n'est PAS écrit à la main : chaque ligne dit la section attendue, et
 * l'entrée est relue dans le modèle. Recopier `/projects` ici ferait passer le
 * test le jour où un lot déplace l'onglet — c'est exactement ce qui arrive à
 * `/pilotage/rex`, déplacé sous Missions par le lot D40.
 */
const ROUTES_D51: readonly { route: string; section: string }[] = [
  // ⚠️ `/rfp` en est sortie le 19/10/2026 (#4341) : elle REDIRIGE vers le pipe
  // (`/projects?lens=rfp`), qui allume Affaires. Elle n'a plus rien à allumer.
  { route: '/team', section: 'team' }, // #4158.9 — Équipe a quitté Pilotage
  // ⚠️ D40 · 26/08 a rangé cette route sous MISSIONS — c'est l'écran de celui
  // qui revient de mission. Le modèle décide, cette table le suit : c'est
  // exactement le cas que le commentaire au-dessus annonçait.
  { route: '/pilotage/rex', section: 'missions' },
  // ⚠️ Coque Théo (23/10/2026) — `/mailbox` en est sortie : la maquette promeut Messagerie en
  // entrée de la rubrique (onglet promu, comme Contacts). Elle s'allume elle-même, plus bas.
  // ⚠️ #3132 — `/contacts` en est sortie (27/09/2026) : elle allumait l'entrée
  // de sa SECTION (`/accounts`, faute d'entrée propre) ; elle a désormais sa
  // PROPRE entrée de barre latérale (voir le describe dédié plus bas).
  // #4359 — `/watchlist` n'a plus de fichier de route : c'est une adresse légataire
  // (`lib/legacy-addresses.ts` → `/mes-cibles`), elle ne s'allume plus d'elle-même.
]

describe('les routes qui n’allumaient rien (D51)', () => {
  it.each(ROUTES_D51)('$route allume l’entrée de sa section « $section »', ({ route, section }) => {
    const owner = NAV_SECTIONS.find(candidate => candidate.key === section)
    expect(owner, `section inconnue : ${section}`).toBeDefined()
    // ⚠️ Le modèle décide, pas cette liste : si un lot déplace la route, c'est
    // `sectionForPath` qui doit suivre, et l'assertion ci-dessous le dit.
    expect(sectionForPath(route)?.section.key).toBe(section)
    // #4492.2 (PR 12C) — une section FILLE (Équipe) allume l'entrée qui la porte : « Ma journée ».
    expect(litEntries(route)).toEqual([String(owner ? rootSection(owner).to : undefined)])
  })

  // #3132 — Contacts a sa propre entrée de barre depuis que le tiroir
  // « Prospection » a disparu : `/contacts` allume désormais « Contacts »
  // lui-même, plus précis que « Comptes » (même règle que Mes cibles).
  it('`/contacts` allume sa PROPRE entrée depuis #3132, plus « Comptes »', () => {
    // #4492.3 (PR 12C) — Contacts est une SECTION, avec ses sous-entrées.
    expect(sectionForPath('/contacts')?.section.key).toBe('contacts')
    expect(litEntries('/contacts')).toEqual(['/contacts'])
  })

  // #3610 — Découvrir n'a plus d'entrée de liste (doublon du bouton du haut) :
  // la route reste rangée sous Comptes, sans allumer une entrée qui n'existe plus.
  it('`/discover` n’allume aucune entrée de liste « Découvrir » (#3610)', () => {
    // #4492.3 (PR 12C) — Découvrir est une section hors rubrique : sa porte est le bouton du haut.
    expect(sectionForPath('/discover')?.section.key).toBe('discover')
    expect(litEntries('/discover')).not.toContain('/discover')
  })

  // #4312 — « c'est la grille Comptes qui est flaggée, alors que je ne suis pas sur la partie compte » :
  // Découvrir a SON bouton lavande en haut de la barre ; « Comptes » ne doit pas s'allumer en plus. Un seul
  // repère actif par écran, et c'est le bon — sur /discover comme sur les écrans qui en descendent.
  it.each(['/discover', '/discover/lots', '/discover/lots/abc-123'])(
    '#4312 — `%s` n’allume AUCUNE entrée de liste (le bouton Découvrir est le repère)',
    route => {
      expect(litEntries(route)).toEqual([])
    },
  )

  it('#4312 — famille : `/signals` allume « Signaux » seule, jamais « Comptes » en plus', () => {
    expect(litEntries('/signals')).toEqual(['/signals'])
  })
})

/**
 * Ce qui MARCHAIT déjà — et qui compte plus que les neuf réparations.
 *
 * Un correctif de navigation qui éteint une entrée juste est une régression
 * pire que le défaut qu'il corrige : l'utilisateur avait appris à s'y fier.
 */
const DEJA_CORRECT: readonly { route: string; entry: string; why: string }[] = [
  { route: '/accounts', entry: '/accounts', why: 'la route de section elle-même' },
  { route: '/accounts/abc-123', entry: '/accounts', why: 'une FICHE reste dans la section de sa liste' },
  { route: '/accounts/partners', entry: '/accounts', why: 'un onglet déjà préfixé par sa section' },
  { route: '/briefing', entry: '/briefing', why: 'la journée' },
  { route: '/projects', entry: '/projects', why: 'les projets' },
  // #4197 (L6) — Talents s'ouvre sur « Besoins ouverts » (premier onglet) : son entrée de barre
  // est `/projects/needs`, et le Vivier comme les Positionnements l'allument.
  { route: '/projects/pistes', entry: '/projects', why: 'les pistes (#4197)' },
  // #4344 / #4349 (Louis 19/10/2026) — les besoins vivent sous Affaires ; Talents = le Vivier seul.
  { route: '/projects/needs', entry: '/projects', why: 'les besoins ouverts, sous Affaires (#4344)' },
  { route: '/consultants', entry: '/consultants', why: 'le vivier, seul écran de Talents (#4349)' },
  { route: '/consultants/abc-123', entry: '/consultants', why: 'une fiche consultant, sous Talents' },
  // #4351.1 — Missions s'ouvre sur Planning (« En cours » quitte la barre).
  { route: '/missions/planification', entry: '/missions/planification', why: 'le planning (#4351.1)' },
  { route: '/missions/cra', entry: '/missions/planification', why: 'le relevé d’activité (onglet V22, #4491.2)' },
  { route: '/actions', entry: '/actions', why: 'les actions' },
  { route: '/actions/sequences', entry: '/actions', why: 'les séquences (BEL-CRM-103)' },
  // #4492.2 (PR 12C, Louis 24/10/2026) — Pilotage vit sous « Ma journée » : c'est elle qui s'allume.
  { route: '/pilotage', entry: '/briefing', why: 'le cockpit, sous Ma journée' },
  { route: '/pilotage/finance', entry: '/briefing', why: 'la finance, sous Ma journée' },
  { route: '/mailbox', entry: '/mailbox', why: 'la messagerie, promue en entrée par la coque Théo' },
  { route: '/settings', entry: '/settings', why: 'les réglages' },
  { route: '/settings/profile', entry: '/settings', why: 'un écran de réglages garde SON entrée allumée' },
]

describe('ce qui s’allumait déjà s’allume toujours', () => {
  it.each(DEJA_CORRECT)('$route → $entry ($why)', ({ route, entry }) => {
    expect(litEntries(route)).toEqual([entry])
  })
})

describe('ce qu’une décision datée rattache à une section', () => {
  // #2162.27 / épopée #2892 — « Nouvelle analyse » produit un dossier de compte :
  // la barre allume Comptes, comme pour `/accounts/partners`.
  it('`/search` allume Comptes', () => {
    expect(litEntries('/search')).toEqual(['/accounts'])
  })
})

describe('ce qui n’allumait rien, et ne doit toujours rien allumer', () => {
  // Laura n'est PAS une entrée de barre : sa porte est le bouton « Demander à
  // Laura », au-dessus de la liste. Allumer une entrée serait allumer quoi ?
  it('`/chat` n’allume aucune entrée — le copilote a sa propre porte', () => {
    expect(sectionForPath('/chat')?.section.key).toBe('copilot')
    expect(litEntries('/chat')).toEqual([])
  })

  // `/search` (« Nouvelle analyse ») a quitté cette liste le 25/09/2026 : #2162.27
  // l'a rattaché à la section Comptes (`off-nav-screens.ts`) — l'écran fabrique un
  // dossier de compte, et Laura doit pouvoir y emmener quelqu'un. Voir plus bas.
  it.each(['/login', '/billing', '/knowledge', '/demo', '/onboarding'])(
    '%s n’allume aucune entrée — le modèle ne le possède pas',
    route => {
      expect(litEntries(route)).toEqual([])
    },
  )

  it('ne confond pas un voisin qui partage un préfixe de texte', () => {
    expect(litEntries('/accounts-archive')).toEqual([])
  })
})

describe('les entrées qui ne sont PAS des routes de section', () => {
  // La barre du backoffice ne passe par aucune section : elle garde le préfixe,
  // sinon `/bak/home` s'éteindrait pour n'avoir pas de propriétaire au modèle.
  // ⚠️ `BACKOFFICE_SECTIONS` (pluriel, un JEU qui se substituait à la
  // navigation cliente) est devenu `BACKOFFICE_SECTION` (singulier, une
  // section qui s'AJOUTE) — D34 · 26/08. Les deux lots ont été écrits en
  // parallèle contre origin/main et aucun ne pouvait voir l'autre.
  const BACKOFFICE_ENTRIES = (BACKOFFICE_SECTION.items ?? []).map(item => String(item.to))

  it('la barre du backoffice n’est pas vide', () => {
    expect(BACKOFFICE_ENTRIES).toContain('/bak/home')
  })

  it('`/bak/home` allume son entrée, que le modèle ignore', () => {
    expect(sectionForPath('/bak/home')).toBeNull()
    expect(litEntries('/bak/home', BACKOFFICE_ENTRIES)).toEqual(['/bak/home'])
  })
})

/**
 * LA BARRE DE RÉGLAGES EST INTACTE.
 *
 * Elle a sa PROPRE dérivation, et ce n'est pas un oubli : ses entrées sont des
 * routes-feuilles À L'INTÉRIEUR d'une seule section. Lui appliquer « la section
 * qui possède le chemin » allumerait « Préférences » (`/settings`) sur les
 * quatorze écrans, en plus de l'entrée juste.
 *
 * Et `/integrations` y est une entrée EXACTE — c'est, depuis le 01/09/2026, sa
 * SEULE porte : l'onglet « Outils connectés » d'Actions est retiré parce que cet
 * écran rend `SettingsPage` et non `CustomerPage`, si bien que le clic sortait
 * de la barre d'onglets qui l'avait proposé. Le modèle des sections ne le range
 * donc plus nulle part ; cette barre-ci doit continuer de l'allumer.
 */
describe('la barre de RÉGLAGES ne bouge pas', () => {
  const SETTINGS_ENTRIES = SETTINGS_SECTIONS.flatMap(section => section.items.map(item => String(item.to)))

  it('liste bien ses entrées, `/integrations` comprise', () => {
    expect(SETTINGS_ENTRIES.length).toBeGreaterThanOrEqual(10)
    expect(SETTINGS_ENTRIES).toContain('/integrations')
    expect(SETTINGS_ENTRIES).toContain('/settings/profile')
  })

  it('n’allume QUE « Profil » sur `/settings/profile`, jamais aussi « Préférences »', () => {
    expect(settingsLit('/settings/profile')).toEqual(['/settings/profile'])
  })

  it('n’allume QUE « Préférences » sur `/settings`', () => {
    expect(settingsLit('/settings')).toEqual(['/settings'])
  })

  it('allume « Intégrations » sur `/integrations` — sa seule porte', () => {
    expect(settingsLit('/integrations')).toEqual(['/integrations'])
  })

  it('n’est plus un onglet de SECTION — donc aucune entrée principale ne s’allume', () => {
    // Le retrait de l'onglet « Outils connectés » (01/09/2026) : la route reste
    // servie et atteignable, mais la barre principale ne prétend plus qu'un de
    // ses rayons la contient. Sans cette assertion, remettre l'onglet passerait
    // inaperçu et l'utilisateur retomberait dans la coquille des Réglages en
    // croyant rester dans Actions.
    expect(sectionForPath('/integrations')).toBeNull()
    // Coque Théo (23/10/2026) — la maquette donne à Intégrations sa PROPRE entrée, au pied de la
    // barre principale : c'est elle, et elle seule, qui s'allume — jamais un rayon de section.
    expect(litEntries('/integrations')).toEqual(['/integrations'])
  })

  it('suit un sous-écran de profil sur son entrée', () => {
    expect(settingsLit('/settings/profile/identity')).toEqual(['/settings/profile'])
  })

  /** La règle de la barre de Réglages, recopiée depuis `SettingsNavbarBody`. */
  function settingsLit(pathname: string): string[] {
    return SETTINGS_ENTRIES.filter(entry =>
      entry === '/settings' ? pathname === '/settings' : pathname === entry || pathname.startsWith(`${entry}/`),
    )
  }
})

/**
 * AUCUN ÉCRAN DE SECTION NE RESTE MUET.
 *
 * Le test part du DISQUE et non d'une liste : une route créée demain sous une
 * section déclarée doit allumer son entrée sans qu'on pense à l'ajouter ici.
 */
describe('toute route possédée par le modèle allume UNE entrée', () => {
  it('aucune route de section ne laisse la barre éteinte, et jamais deux à la fois', () => {
    const muettes: string[] = []
    const routes = fileRoutes()
    expect(routes.length).toBeGreaterThan(50)
    for (const route of routes) {
      const owner = sectionForPath(route)
      if (!owner) continue
      // Le copilote n'est pas listé dans la barre (sa porte est le bouton
      // « Demander à Laura ») : rien à allumer, et c'est voulu.
      if (!SIDEBAR_ENTRIES.includes(owner.section.to)) continue
      // #4312 — Découvrir : son repère est le bouton lavande du haut, pas une entrée de liste.
      if (route === '/discover' || route.startsWith('/discover/')) {
        if (litEntries(route).length !== 0) muettes.push(`${route} → ${JSON.stringify(litEntries(route))}`)
        continue
      }
      const lit = litEntries(route)
      // #3132 — depuis que Contacts et Mes cibles ont leur PROPRE entrée,
      // l'allumée n'est plus toujours celle de la section (`owner.section.to`) :
      // elle peut être l'entrée PLUS PRÉCISE que promeut #3132. La garantie qui
      // compte reste intacte — jamais zéro, jamais deux.
      if (lit.length !== 1) muettes.push(`${route} → ${JSON.stringify(lit)}`)
    }
    expect(muettes).toEqual([])
  })
})

/**
 * L'ANNONCE. « Où suis-je ? » ne se répond pas en couleur.
 *
 * `SidebarMenuButton` ne pose que `data-active`, un crochet de style qu'aucun
 * lecteur d'écran ne lit. L'entrée active porte donc `aria-current="page"`.
 */
describe('l’entrée active est annoncée, pas seulement colorée', () => {
  beforeEach(() => stubMatchMedia())
  afterEach(() => vi.unstubAllGlobals())

  // #2155.1 — Comptes, Contacts et Mes cibles sont les sous-entrées du groupe
  // « Prospection » : sur les contacts, c'est « Contacts » qui s'annonce — plus
  // précis que la section, et le groupe s'est déplié pour le montrer.
  it('annonce « Contacts » sous Prospection quand on est sur les CONTACTS', async () => {
    const { container } = await renderPlatformSidebar('/contacts')
    expect(currentEntries(container)).toEqual(['/contacts'])
  })

  // #4344 — les besoins ouverts vivent sous Affaires (Louis 19/10/2026).
  it('annonce « Affaires » sur `/projects/needs`', async () => {
    const { container } = await renderPlatformSidebar('/projects/needs')
    expect(currentEntries(container)).toEqual(['/projects'])
  })

  it('annonce « Comptes » sur une FICHE de compte — le cas qui marchait déjà', async () => {
    const { container } = await renderPlatformSidebar('/accounts/abc-123')
    expect(currentEntries(container)).toEqual(['/accounts'])
  })

  it('n’annonce rien hors navigation', async () => {
    const { container } = await renderPlatformSidebar('/login')
    expect(currentEntries(container)).toEqual([])
  })

  /**
   * CE QUI EST ANNONCÉ EST CE QUI EST COLORÉ.
   *
   * `Link` a sa PROPRE idée de « actif », par préfixe, et elle écrase la nôtre
   * en dernier : la barre annoncerait une entrée qu'elle ne colore pas dès que
   * le modèle range un chemin ailleurs que sous son préfixe d'URL — le cas
   * `/pilotage/rex` sous Missions. `activeOptions={{ exact: true }}` éteint
   * cette seconde dérivation ; ces deux tests le prouvent.
   */
  it.each(['/contacts', '/projects/needs', '/accounts/abc-123', '/missions/cra', '/settings/profile', '/login'])(
    'sur %s, l’annoncé et le coloré sont le même ensemble',
    async pathname => {
      const { container } = await renderPlatformSidebar(pathname)
      expect(currentEntries(container)).toEqual(coloredEntries(container))
    },
  )

  it('l’annonce vient de NOTRE dérivation, pas du préfixe de `Link`', async () => {
    const { container } = await renderPlatformSidebar('/accounts/abc-123')
    const entry = container.querySelector('a[href="/accounts"]')
    expect(entry).not.toBeNull()
    // `Link` ne se croit PAS actif (il ne compare qu'exactement) …
    expect(entry?.getAttribute('data-status')).toBeNull()
    // … et l'entrée est pourtant annoncée : c'est le modèle qui l'a dit.
    expect(entry?.getAttribute('aria-current')).toBe('page')
  })
})

/** Les entrées portant `aria-current="page"`, dans l'ordre du rendu. */
function currentEntries(container: HTMLElement): string[] {
  // #4492.1 — les SOUS-entrées (`data-shell="nav-sub"`) s'annoncent aussi ; elles ont leur propre garde
  // (`sub-entries.test.tsx`). Ici : les entrées de premier niveau.
  return [...container.querySelectorAll('a[aria-current="page"]')]
    .filter(node => !node.closest('[data-shell="nav-sub"]'))
    .map(node => node.getAttribute('href') ?? '')
}

/** Les entrées que la barre COLORE (`data-active`, posé par `SidebarMenuButton`). */
function coloredEntries(container: HTMLElement): string[] {
  // #2155.1 — une sous-entrée de groupe se colore par `SidebarMenuSubButton`.
  const selector = [
    '[data-slot="sidebar-menu-button"][data-active="true"]',
    '[data-slot="sidebar-menu-sub-button"][data-active="true"]',
  ].join(', ')
  return [...container.querySelectorAll(selector)].map(node => node.getAttribute('href') ?? '')
}

async function renderPlatformSidebar(pathname: string): Promise<RenderResult> {
  const [topSection] = PLATFORM_SECTIONS
  const result = renderWithRouter(
    <SidebarProvider>
      <AppSidebar topSection={topSection!} />
    </SidebarProvider>,
    pathname,
  )
  // Le routeur en mémoire peint son premier écran de façon asynchrone : sans
  // cette attente, on interrogerait un `<div />` vide.
  await screen.findAllByRole('link')
  return result
}

/**
 * jsdom n'implémente pas `matchMedia`, et la barre en dépend des deux côtés (le
 * paquet UI pour son tiroir mobile, l'application pour sa coque). Sans ce faux,
 * l'écran tombe sur « window.matchMedia is not a function ».
 */
function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
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

const WEB_SRC = join(__dirname, '..', '..')

/** Les routes que le routeur SERT, lues sur le disque. */
function fileRoutes(): string[] {
  const root = join(WEB_SRC, 'routes')
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`)
        continue
      }
      if (!entry.endsWith('.tsx') || entry.startsWith('__')) continue
      const name = entry.slice(0, -4)
      // `$id` est un paramètre : on ne peut pas en construire un chemin réel.
      if (name.includes('$') || prefix.includes('$')) continue
      const path = name === 'index' ? prefix : `${prefix}/${name.replace(/\./g, '/')}`
      out.push(path || '/')
    }
  }
  walk(root, '')
  return [...new Set(out)]
}
