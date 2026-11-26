import { b, dot, i, rect, ref, type Recipe, t } from '../recipe'

/**
 * Famille « Navigation » — packages/ui/src/{components/tabs,mode-tabs,breadcrumb}.tsx,
 * molecules/{tab-nav,grouped-tab-nav,tab-bar}.tsx, organisms/section-sidebar-nav.tsx,
 * et la coque de l'app : apps/web/src/components/sidebar/AppSidebar.tsx,
 * apps/web/src/features/mobile/MobileTabBar.tsx.
 */

const labels = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, k) => `${prefix} ${k + 1}`)

const tabs: Recipe = {
  family: 'Navigation',
  usage:
    'Basculer entre des vues d’un MÊME contenu (2 à 5), dans un segment gris. Pour naviguer entre des pages : TabNav.',
  // `w-fit` + onglets `!min-w-min whitespace-nowrap` (tabs.tsx:15,68) : le segment prend la largeur de ses
  // libellés, jamais moins (défaut H, 25/09/2026 : tronqué à 1440). Il ne défile que là où il ne tient pas.
  stretch: 'narrow',
  notes: [
    'Liste `w-fit`, onglets `!min-w-min whitespace-nowrap` : le segment HUG ses libellés ; sur un téléphone ou une colonne étroite, il prend la largeur et DÉFILE (décision UX, même geste que TabNav).',
    'Onglet actif : `shadow-sm` → style d’effet shadow/sm.',
    'Rayons : liste rounded-lg (shadcn, 10 px), onglet rounded-md (8 px, variable `rounded-md`).',
  ],
  draw: () =>
    b(
      'Tabs',
      {
        direction: 'row',
        height: 36,
        padX: 3,
        padY: 3,
        radius: 'shadcn',
        fill: 'surface/2',
        align: 'stretch',
        scrollX: true,
      },
      [
        ...labels('Vue', 6).map((l, k) =>
          b(
            `item/${k + 1}`,
            {
              direction: 'row',
              padX: 8,
              padY: 4,
              gap: 6,
              radius: 'rounded-md',
              align: 'center',
              justify: 'center',
              fill: k === 0 ? 'bg/default' : undefined,
              shadow: k === 0 ? 'sm' : undefined,
            },
            [t('label', l, { size: 14, weight: 500, color: k === 0 ? 'text/primary' : 'text/secondary' })],
            { hidden: k > 2 },
          ),
        ),
      ],
    ),
}

const modeTabs: Recipe = {
  family: 'Navigation',
  usage: 'Choix de mode exclusif en boutons contigus (vue liste / carte, période). 2 à 4 options courtes.',
  stretch: true,
  notes: [
    'Décision UX : sur un écran trop étroit, le groupe DÉFILE en largeur (même geste que TabNav). Écart : le code (mode-tabs.tsx:20) est `inline-flex overflow-hidden` — il coupe la dernière option au lieu de la laisser défiler.',
  ],
  draw: () =>
    // HUG ses options ; ne prend la largeur (et ne défile) que là où il ne tient pas (défaut H, 25/09/2026).
    b('ModeTabs', { direction: 'row', scrollX: true }, [
      b(
        'group',
        { direction: 'row', height: 36, radius: 'shadcn', stroke: 'border/default', clip: true, align: 'stretch' },
        [
          ...labels('Mode', 4).map((l, k) =>
            b(
              `item/${k + 1}`,
              {
                direction: 'row',
                padX: 16,
                align: 'center',
                fill: k === 0 ? 'border/default' : 'bg/default',
                stroke: 'border/default',
                strokeSide: 'right',
              },
              [t('label', l, { size: 14, weight: 500, color: 'text/secondary' })],
              { hidden: k > 2 },
            ),
          ),
        ],
      ),
    ]),
}

const tabNav: Recipe = {
  family: 'Navigation',
  usage:
    'Navigation entre des sous-pages ou des vues filtrées. `underline` sous un titre de page ; `pill` pour des vues rapides (même grammaire que FilterChips, chip-style.ts).',
  touch: v => (v.variant === 'pill' ? { minHeight: 44 } : null),
  // Pleine largeur, et la rangée DÉFILE : `overflow-x-auto` dans le code (tab-nav.tsx:119). Sept onglets
  // sur un téléphone ne poussent plus la page : ils glissent dans leur cadre (défilement en prototype).
  stretch: true,
  notes: [
    'Rangée défilante horizontale dans le code (`overflow-x-auto`, barre masquée) : cadre qui défile en largeur (prototype), jamais la page.',
  ],
  draw: v => {
    const pill = v.variant === 'pill'
    return b(
      'TabNav',
      pill
        ? { direction: 'row', gap: 6, scrollX: true, width: 480 }
        : {
            direction: 'row',
            gap: 4,
            stroke: 'border/default',
            strokeSide: 'bottom',
            align: 'end',
            scrollX: true,
            width: 480,
          },
      labels('Onglet', 8).map((l, k) => {
        const active = k === 0
        return pill
          ? b(
              `item/${k + 1}`,
              { direction: 'row', height: 32, padX: 12, radius: 'shadcn', fill: active ? 'primary/500' : 'chip/rest' },
              [t('label', l, { size: 14, weight: 500, color: active ? 'on/primary' : 'chip/rest-text' })],
              { hidden: k > 3 },
            )
          : b(
              `item/${k + 1}`,
              { direction: 'column', padX: 16, padTop: 4, gap: 4, align: 'center' },
              [
                t('label', l, {
                  size: 16,
                  weight: active ? 600 : 400,
                  color: active ? 'text/primary' : 'text/secondary',
                }),
                rect('indicator', 24, 2, { fill: active ? 'primary/500' : undefined, radius: 'full', fillWidth: true }),
              ],
              { hidden: k > 3 },
            )
      }),
    )
  },
}

const groupedTabNav: Recipe = {
  family: 'Navigation',
  usage:
    'Beaucoup d’écrans voisins rangés par groupes : un groupe à plusieurs membres ouvre un menu. Remplace une rangée d’onglets trop longue.',
  touch: () => ({ minHeight: 44 }),
  notes: ['Chevron dessiné en SVG 10 px dans le code : rendu par l’icône lucide chevron-down.'],
  draw: () =>
    b(
      'GroupedTabNav',
      { direction: 'row', gap: 4, stroke: 'border/default', strokeSide: 'bottom', strokeWidth: 2, align: 'end' },
      [
        ...labels('Groupe', 6).map((l, k) =>
          b(
            `item/${k + 1}`,
            {
              direction: 'row',
              padX: 12,
              padY: 8,
              gap: 6,
              radius: 'rounded-md',
              stroke: k === 0 ? 'primary/500' : undefined,
              strokeSide: 'bottom',
              strokeWidth: 2,
            },
            [
              t('label', l, { size: 14, color: k === 0 ? 'text/primary' : 'text/secondary' }),
              i('chevron-down', 10, 'text/muted'),
            ],
            { hidden: k > 3 },
          ),
        ),
      ],
    ),
}

const tabBar: Recipe = {
  family: 'Navigation',
  usage: 'Segments avec compteur (« À faire 3 · Fait 12 ») pour filtrer une liste par statut.',
  stretch: true,
  notes: [
    'Décision UX : sur un écran trop étroit, les segments DÉFILENT en largeur (même geste que TabNav). Écart : le code (tab-bar.tsx:32) ne prévoit ni défilement ni retour à la ligne.',
  ],
  draw: v => {
    const sz = { sm: { px: 10, py: 4, fs: 12 }, md: { px: 12, py: 6, fs: 14 } }[v.size === 'sm' ? 'sm' : 'md']
    return b('TabBar', { direction: 'row', scrollX: true, width: 400 }, [
      b('group', { direction: 'row', padX: 4, padY: 4, gap: 4, radius: 'shadcn', fill: 'surface/2' }, [
        ...labels('Statut', 6).map((l, k) =>
          b(
            `item/${k + 1}`,
            {
              direction: 'row',
              padX: sz.px,
              padY: sz.py,
              gap: 6,
              radius: 'rounded-md',
              fill: k === 0 ? 'surface/1' : undefined,
            },
            [
              t('label', l, { size: sz.fs, color: k === 0 ? 'text/primary' : 'text/secondary' }),
              t('count', String(k + 1), { size: 12, color: k === 0 ? 'text/secondary' : 'text/muted' }),
            ],
            { hidden: k > 2 },
          ),
        ),
      ]),
    ])
  },
}

const sectionSidebarNav: Recipe = {
  family: 'Navigation',
  usage: 'Sommaire « Sur cette page » d’une page longue (≥ 2 sections, sinon il ne s’affiche pas).',
  notes: ['Trait des sous-items `border-white/10` littéral : rendu border/default (aucun token, pas de parité clair).'],
  draw: () =>
    b('SectionSidebarNav', { direction: 'column', gap: 12, align: 'start', width: 220 }, [
      t('title', 'Sur cette page', { size: 12, color: 'text/muted' }, { prop: 'title' }),
      b(
        'list',
        { direction: 'column', gap: 6, align: 'start' },
        labels('Section', 8).map((l, k) =>
          b(
            `item/${k + 1}`,
            { direction: 'row' },
            [t('label', l, { size: 14, weight: k === 0 ? 600 : 400, color: k === 0 ? 'text/primary' : 'text/muted' })],
            { hidden: k > 3 },
          ),
        ),
      ),
    ]),
}

const breadcrumb: Recipe = {
  family: 'Navigation',
  usage: 'Fil d’Ariane au-dessus du titre d’une page profonde (≥ 2 niveaux). La page courante n’est pas un lien.',
  draw: () =>
    b(
      'Breadcrumb',
      { direction: 'row', gap: 6, align: 'center', wrap: true },
      labels('Niveau', 5).map((l, k) =>
        b(
          `item/${k + 1}`,
          { direction: 'row', gap: 6, align: 'center' },
          [
            t('label', l, { size: 14, color: k === 2 ? 'text/primary' : 'text/secondary' }),
            i('chevron-right', 14, 'text/secondary', { hidden: k === 2 }),
          ],
          { hidden: k > 2 },
        ),
      ),
    ),
}

/**
 * Les 9 entrées de la barre : RUX-09 (`docs/revue-ux.md` §4, T2, D82) — « Laura » en PREMIÈRE
 * position, avec le `LauraFace` (pas une icône lucide, marquée par l'icône vide `''`). Avant :
 * l'entrée s'appelait « copilote » et était absente de la barre latérale (8 entrées, i18n
 * nav.items) — présente seulement dans `MobileTabBar` sous le nom « Laura ».
 */
export const SIDEBAR_ITEMS: readonly [string, string][] = [
  ['Laura', ''],
  ['Aujourd’hui', 'sunrise'],
  ['Prospection', 'building'],
  ['Opportunités', 'lightbulb'],
  ['Vivier', 'user-round'],
  ['Missions', 'briefcase'],
  ['Actions', 'history'],
  ['Pilotage', 'gauge'],
  ['Paramètres', 'settings'],
]

const sidebar: Recipe = {
  family: 'Navigation',
  usage:
    'La navigation de l’app à partir de 768 px (GA-28) : dépliée (240 px) à partir de 1024, réduite aux icônes (56 px) de 768 à 1023. Sous 768 : MobileTabBar.',
  notes: [
    'Le panneau réel est peint en bg/default (SIDEBAR_BG de packages/ui/src/components/sidebar.tsx), pas en sidebar/default — la maquette suit le code.',
    'Variantes `floating` et `inset` : primitives shadcn NON utilisées par AppSidebar — dessinées avec marge et coins arrondis, sans usage dans l’app.',
    'Sous-menu « Prospection » (Comptes, Contacts, Mes cibles) non déplié dans la maquette.',
    'RUX-09 (D82, `docs/revue-ux.md` §4) : « Laura » en première position, avec `LauraFace` — avant, l’entrée s’appelait « copilote » et était absente de cette barre (8 entrées), visible seulement dans `MobileTabBar` sous le nom « Laura ». `LauraFace` garde ici sa taille authored (40 px, `identity.ts`) faute de prop de taille exposée par le composant catalogué (`variants: {}`) — la cible reste 20 px, un suivi pour le lot qui touchera `LauraFace`.',
    'RUX-31 (`docs/revue-ux.md` §4) : UNE porte principale pour le geste cœur du produit — « Analyser une entreprise », bouton `default` sous le logo, au-dessus des sections ; réduite, un bouton icône `+`. Avant : 5 portes au moins (recherche, lanceur des comptes, composer de Laura, suggestion, comptes similaires), aucune dans la barre latérale.',
    'RUX-07 (`docs/revue-ux.md` §4, T2) : un déclencheur « Rechercher · ⌘K » sous le bouton d’analyse ouvre `app/overlays/palette-commandes` — le DM en a un (`side-rail.tsx:152-159`), l’app n’en avait aucun. Réduite, l’icône loupe seule.',
  ],
  draw: v => {
    const collapsed = v.state === 'collapsed'
    const detached = v.variant !== 'sidebar'
    return b(
      'Sidebar',
      {
        direction: 'column',
        width: collapsed ? 56 : 240,
        padX: collapsed ? 6 : 16,
        padY: 16,
        gap: 12,
        align: collapsed ? 'center' : 'stretch',
        fill: 'bg/default',
        stroke: detached ? 'border/default' : 'border/default',
        strokeSide: detached ? undefined : 'right',
        radius: detached ? 'shadcn' : 0,
        minHeight: 640,
      },
      [
        b(
          'header',
          { direction: 'row', gap: 12, align: 'center', justify: collapsed ? 'center' : 'between' },
          [
            // Réduite : le glyphe seul (le mot-marque est masqué, HIDDEN_WHEN_COLLAPSED).
            { kind: 'ref', name: 'brand', component: 'BrandMark', values: { size: 'sm' }, hidden: collapsed },
            dot('glyph', 20, 'primary/400', { hidden: !collapsed }),
            i('panel-left', 16, 'text/muted', { hidden: collapsed }),
          ],
          { fillWidth: !collapsed },
        ),
        // RUX-31 (`docs/revue-ux.md` §4) : UN verbe, UNE porte principale — « Analyser une entreprise »
        // en tête de la barre, sous le logo, au-dessus des sections ; en icône `+` quand réduite.
        ref(
          'Button',
          { variant: 'default', size: collapsed ? 'icon' : 'default' },
          collapsed ? { icon: 'plus' } : { label: 'Analyser une entreprise', icon: 'plus' },
          { name: 'launch-analysis', fillWidth: !collapsed },
        ),
        // RUX-07 (`docs/revue-ux.md` §4) : la palette ⌘K (`app/overlays/palette-commandes`), sur le
        // modèle de celle du DM — absente jusqu'ici de la barre de l'app.
        b(
          'search-trigger',
          collapsed
            ? { direction: 'row', width: 44, height: 44, radius: 'shadcn', align: 'center', justify: 'center' }
            : { direction: 'row', padX: 8, padY: 6, gap: 8, radius: 'shadcn', minHeight: 32, align: 'center' },
          [
            i('search', 16, 'text/muted'),
            t('label', 'Rechercher', { size: 14, color: 'text/secondary' }, { hidden: collapsed, grow: true }),
            t('shortcut', '⌘K', { size: 12, color: 'text/muted' }, { hidden: collapsed }),
          ],
          { fillWidth: !collapsed },
        ),
        b(
          'nav',
          { direction: 'column', gap: 2, align: collapsed ? 'center' : 'stretch' },
          SIDEBAR_ITEMS.map(([label, icon], k) =>
            b(
              `item/${k + 1}`,
              collapsed
                ? {
                    direction: 'row',
                    width: 44,
                    height: 44,
                    radius: 'shadcn',
                    align: 'center',
                    justify: 'center',
                    fill: k === 0 ? 'surface/2' : undefined,
                  }
                : {
                    direction: 'row',
                    padX: 8,
                    padY: 6,
                    gap: 8,
                    radius: 'shadcn',
                    minHeight: 32,
                    fill: k === 0 ? 'surface/2' : undefined,
                  },
              [
                // RUX-09 : Laura (item 0) porte son visage (`LauraFace`), pas une icône lucide.
                k === 0 ? ref('LauraFace', {}, {}, { name: 'laura-face' }) : i(icon, 16, 'text/muted'),
                t(
                  'label',
                  label,
                  { size: 14, color: k === 0 ? 'text/primary' : 'text/secondary' },
                  { hidden: collapsed },
                ),
              ],
              { fillWidth: !collapsed },
            ),
          ),
          { fillWidth: !collapsed },
        ),
      ],
    )
  },
}

/** Les 4 onglets réels (MobileTabBar.tsx) : Laura, Aujourd'hui, Comptes, Actions. */
const TAB_ITEMS: readonly [string, string][] = [
  ['Laura', 'sparkles'],
  ['Aujourd’hui', 'calendar-check'],
  ['Comptes', 'building-2'],
  ['Actions', 'zap'],
]

const mobileTabBar: Recipe = {
  family: 'Navigation',
  usage:
    'La navigation de l’app SOUS 768 px : quatre onglets, jamais plus (GA-28/29). Collée en bas ; + safe-area en PWA installée.',
  stretch: true,
  draw: () =>
    b(
      'MobileTabBar',
      {
        direction: 'row',
        height: 56,
        fill: 'legacy/bg-base',
        stroke: 'border/default',
        strokeSide: 'top',
        align: 'stretch',
        width: 390,
      },
      TAB_ITEMS.map(([label, icon], k) =>
        b(
          `item/${k + 1}`,
          { direction: 'column', padY: 8, gap: 2, align: 'center', justify: 'center' },
          [
            i(icon, 20, k === 0 ? 'text/accent' : 'legacy/text-muted'),
            t('label', label, { size: 12, color: k === 0 ? 'text/accent' : 'legacy/text-muted' }),
          ],
          { grow: true, fillHeight: true },
        ),
      ),
    ),
}

/**
 * Les entrées du BACKOFFICE (`apps/dashboard-manager/src/app/_components/nav-sections.ts:33-170`) : le
 * Cockpit puis les 5 groupes, dans l'ordre du rail. Les glyphes du code (◆ € ◈ ⚙ ☰ ⌗) deviennent des
 * icônes lucide nommées (GA-32).
 */
const BACKOFFICE_ITEMS: readonly [string, string][] = [
  ['Cockpit', 'gauge'],
  ['Revenus', 'trending-up'],
  ['Produit', 'lightbulb'],
  ['Technique', 'settings-2'],
  ['Administration', 'user-round'],
  ['Configuration', 'settings'],
]

/** Le badge d'environnement (`side-rail.tsx:125-131`) : « PROD » sur `soft/danger`, sa seule lettre en icônes. */
const envBadge = (label: string) =>
  b('env', { direction: 'row', padX: 6, padY: 2, radius: 'rounded-md', fill: 'soft/danger/bg' }, [
    t('label', label, { size: 12, weight: 600, color: 'soft/danger/text' }),
  ])

const backofficeRail: Recipe = {
  family: 'Navigation',
  usage:
    'La navigation du BACKOFFICE (DM) à partir de 768 px (GA-28) : dépliée (240 px) à partir de 1024, en icônes (64 px) de 768 à 1023 (RUX-06/08). Sous 768 : BackofficeTopBar. Jamais la Sidebar de l’app.',
  notes: [
    'Les 5 groupes de nav-sections.ts (Revenus, Produit, Technique, Administration, Configuration) après le Cockpit ; les 30 liens se déplient dans leur groupe (non dépliés dans la maquette).',
    'Le code réduit le rail aux icônes sous 1280 px (globals.css:496-526) : écart, la cible est 1024 comme la Sidebar de l’app (RUX-06).',
    'Badge d’environnement : `var(--red)` du DM rendu par soft/danger (le DM migre sur les tokens de l’app, T1).',
  ],
  draw: v => {
    const collapsed = v.state === 'collapsed'
    return b(
      'BackofficeRail',
      {
        direction: 'column',
        width: collapsed ? 64 : 240,
        padX: collapsed ? 10 : 16,
        padY: 16,
        gap: 12,
        align: collapsed ? 'center' : 'stretch',
        fill: 'bg/default',
        stroke: 'border/default',
        strokeSide: 'right',
        minHeight: 640,
      },
      [
        b(
          'header',
          { direction: 'row', gap: 8, align: 'center', justify: collapsed ? 'center' : 'between' },
          [
            { kind: 'ref', name: 'brand', component: 'BrandMark', values: { size: 'sm' }, hidden: collapsed },
            envBadge(collapsed ? 'P' : 'PROD'),
          ],
          { fillWidth: !collapsed },
        ),
        b(
          'search',
          collapsed
            ? { direction: 'row', width: 44, height: 44, radius: 'shadcn', align: 'center', justify: 'center' }
            : {
                direction: 'row',
                padX: 8,
                gap: 8,
                minHeight: 36,
                radius: 'shadcn',
                stroke: 'border/default',
                align: 'center',
              },
          [
            i('search', 16, 'text/muted'),
            t('label', 'Rechercher · ⌘K', { size: 14, color: 'text/muted' }, { hidden: collapsed }),
          ],
          { fillWidth: !collapsed },
        ),
        b(
          'nav',
          { direction: 'column', gap: 2, align: collapsed ? 'center' : 'stretch' },
          BACKOFFICE_ITEMS.map(([label, icon], k) =>
            b(
              `item/${k + 1}`,
              collapsed
                ? {
                    direction: 'row',
                    width: 44,
                    height: 44,
                    radius: 'shadcn',
                    align: 'center',
                    justify: 'center',
                    fill: k === 0 ? 'surface/2' : undefined,
                  }
                : {
                    direction: 'row',
                    padX: 8,
                    padY: 6,
                    gap: 8,
                    radius: 'shadcn',
                    minHeight: 36,
                    fill: k === 0 ? 'surface/2' : undefined,
                  },
              [
                i(icon, 16, k === 0 ? 'text/primary' : 'text/muted'),
                t(
                  'label',
                  label,
                  { size: 14, color: k === 0 ? 'text/primary' : 'text/secondary' },
                  { hidden: collapsed },
                ),
              ],
              { fillWidth: !collapsed },
            ),
          ),
          { fillWidth: !collapsed },
        ),
      ],
    )
  },
}

const backofficeTopBar: Recipe = {
  family: 'Navigation',
  usage:
    'La navigation du BACKOFFICE (DM) SOUS 768 px : barre du haut (menu des groupes, environnement, recherche ⌘K qui s’ouvre en plein écran) et les onglets de groupe qui défilent dessous. Cibles de 44 px (GA-30/32), collée en haut, hauteur de page en `dvh`.',
  notes: [
    'Cible de maquette (Q7, 25/09/2026) : le DM n’a encore aucune navigation mobile — `side-rail.tsx` n’a pas de variante sous 768.',
    'Le menu ouvre les 5 groupes et leurs 30 liens dans un panneau bas pleine hauteur (la même liste que le rail) ; la loupe ouvre la recherche globale en plein écran (`dm/overlays/recherche-globale` à 390).',
  ],
  stretch: true,
  draw: () =>
    b(
      'BackofficeTopBar',
      {
        direction: 'column',
        width: 390,
        fill: 'bg/default',
        stroke: 'border/default',
        strokeSide: 'bottom',
        align: 'stretch',
      },
      [
        b(
          'bar',
          { direction: 'row', padX: 4, height: 56, align: 'center', justify: 'between' },
          [
            b(
              'menu',
              { direction: 'row', width: 44, height: 44, radius: 'shadcn', align: 'center', justify: 'center' },
              [i('menu', 20, 'text/primary')],
            ),
            b('identity', { direction: 'row', gap: 8, align: 'center' }, [
              { kind: 'ref', name: 'brand', component: 'BrandMark', values: { size: 'sm' } },
              envBadge('PROD'),
            ]),
            b(
              'search',
              { direction: 'row', width: 44, height: 44, radius: 'shadcn', align: 'center', justify: 'center' },
              [i('search', 20, 'text/primary')],
            ),
          ],
          { fillWidth: true },
        ),
        b(
          'groups',
          { direction: 'row', padX: 12, gap: 4, align: 'center', scrollX: true },
          BACKOFFICE_ITEMS.map(([label], k) =>
            b(
              `item/${k + 1}`,
              {
                direction: 'row',
                padX: 12,
                minHeight: 44,
                align: 'center',
                stroke: k === 0 ? 'soft/accent/border' : undefined,
                strokeSide: k === 0 ? 'bottom' : undefined,
                strokeWidth: 2,
              },
              [
                t('label', label, {
                  size: 14,
                  weight: k === 0 ? 500 : 400,
                  color: k === 0 ? 'text/primary' : 'text/secondary',
                }),
              ],
            ),
          ),
          { fillWidth: true },
        ),
      ],
    ),
}

export const NAVIGATION = {
  Tabs: tabs,
  ModeTabs: modeTabs,
  TabNav: tabNav,
  GroupedTabNav: groupedTabNav,
  TabBar: tabBar,
  SectionSidebarNav: sectionSidebarNav,
  Breadcrumb: breadcrumb,
  Sidebar: sidebar,
  MobileTabBar: mobileTabBar,
  BackofficeRail: backofficeRail,
  BackofficeTopBar: backofficeTopBar,
}
