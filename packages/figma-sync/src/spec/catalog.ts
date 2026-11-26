/**
 * Le CATALOGUE du contrat : les composants et les gabarits que les specs de
 * pages ont le droit de citer. C'est une donnée runtime (la validation la lit)
 * ET la source des types (`types.ts` les dérive) — un seul endroit, GA-26.
 *
 * ⚠️ Ajouter une variante ici ne la crée pas dans le code : chaque valeur
 * listée DOIT exister dans le fichier `source` du composant (les `cva`, les
 * unions de props). Le test du catalogue vérifie que le fichier existe ; la
 * relecture vérifie que la variante y est.
 */

/** Les états d'interaction qu'un composant interactif doit montrer dans Figma. */
const INTERACTION = ['default', 'hover', 'focus', 'disabled'] as const
const FIELD_STATE = ['default', 'focus', 'disabled', 'error'] as const
const SEMANTIC = ['default', 'info', 'success', 'warning', 'danger'] as const
const SIZE_SML = ['sm', 'md', 'lg'] as const

/**
 * La définition d'un composant dans le catalogue.
 *
 * - `source`   : le fichier du dépôt qui le porte (relatif à la racine).
 * - `variants` : chaque axe de variante et ses valeurs — deviennent des
 *                propriétés de variante du composant Figma, et des props typées.
 * - `content`  : les textes qu'une spec peut remplir (`label`, `title`…).
 * - `items`    : le composant prend une liste de libellés (onglets, filtres…).
 *                Un nombre = nombre EXACT exigé (la barre mobile : 4).
 * - `table`    : le composant prend des colonnes et des lignes.
 * - `children` : le composant contient d'autres blocs (carte, modale…).
 */
interface ComponentDef {
  source: string
  variants: Readonly<Record<string, readonly string[]>>
  content: readonly string[]
  items?: true | number
  table?: true
  children?: true
}

export const COMPONENTS = {
  // ── Actions ──
  Button: {
    source: 'packages/ui/src/components/button.tsx',
    variants: {
      variant: ['default', 'black', 'light', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'violet'],
      size: ['default', 'xs', 'sm', 'lg', 'xl', 'icon'],
      state: [...INTERACTION, 'loading'],
    },
    content: ['label', 'icon'],
  },
  DropdownMenu: {
    source: 'packages/ui/src/components/dropdown-menu.tsx',
    variants: {},
    content: ['trigger'],
    items: true,
  },
  CopyField: { source: 'packages/ui/src/molecules/copy-field.tsx', variants: {}, content: ['label', 'value'] },

  // ── Saisie ──
  Input: {
    source: 'packages/ui/src/components/input.tsx',
    variants: { state: FIELD_STATE },
    content: ['label', 'placeholder', 'value'],
  },
  PasswordField: {
    source: 'packages/ui/src/components/password-field.tsx',
    variants: { state: FIELD_STATE },
    content: ['label', 'value'],
  },
  Textarea: {
    source: 'packages/ui/src/components/textarea.tsx',
    variants: { state: FIELD_STATE },
    content: ['label', 'placeholder', 'value'],
  },
  Select: {
    source: 'packages/ui/src/molecules/select-field.tsx',
    variants: { size: ['sm', 'md'], state: FIELD_STATE },
    content: ['label', 'placeholder', 'value'],
    items: true,
  },
  Checkbox: {
    source: 'packages/ui/src/components/checkbox.tsx',
    variants: { checked: ['unchecked', 'checked', 'indeterminate'], state: ['default', 'focus', 'disabled'] },
    content: ['label'],
  },
  Switch: {
    source: 'packages/ui/src/components/switch.tsx',
    variants: { size: ['sm', 'default'], checked: ['off', 'on'], state: ['default', 'focus', 'disabled'] },
    content: ['label'],
  },
  Slider: {
    source: 'packages/ui/src/components/slider.tsx',
    variants: { state: ['default', 'disabled'] },
    content: ['label', 'value'],
  },
  InputOTP: {
    source: 'packages/ui/src/components/input-otp.tsx',
    variants: { state: FIELD_STATE },
    content: ['value'],
  },
  SearchInput: {
    source: 'packages/ui/src/molecules/search-input.tsx',
    variants: { size: ['sm', 'md'] },
    content: ['placeholder', 'value'],
  },
  FilterBar: {
    source: 'packages/ui/src/molecules/filter-bar.tsx',
    variants: {},
    content: ['placeholder'],
    items: true,
  },
  /** Boutons radio natifs dans des étiquettes de 44 px (GA-30), en rangée qui passe à la ligne. */
  RadioGroup: {
    source: 'apps/web/src/features/memory/view/MemoryScopeChoice.tsx',
    variants: { state: ['default', 'disabled'] },
    content: ['legend', 'hint'],
    items: true,
  },
  FilterChips: {
    source: 'packages/ui/src/molecules/filter-chips.tsx',
    variants: { size: ['sm', 'md'] },
    content: [],
    items: true,
  },

  // ── Navigation ──
  Tabs: { source: 'packages/ui/src/components/tabs.tsx', variants: {}, content: [], items: true },
  ModeTabs: { source: 'packages/ui/src/components/mode-tabs.tsx', variants: {}, content: [], items: true },
  TabNav: {
    source: 'packages/ui/src/molecules/tab-nav.tsx',
    variants: { variant: ['underline', 'pill'] },
    content: [],
    items: true,
  },
  GroupedTabNav: { source: 'packages/ui/src/molecules/grouped-tab-nav.tsx', variants: {}, content: [], items: true },
  TabBar: {
    source: 'packages/ui/src/molecules/tab-bar.tsx',
    variants: { size: ['sm', 'md'] },
    content: [],
    items: true,
  },
  SectionSidebarNav: {
    source: 'packages/ui/src/organisms/section-sidebar-nav.tsx',
    variants: {},
    content: ['title'],
    items: true,
  },
  /** Le rail d'étapes d'un parcours (`wizard`) : en ligne sous 768 px, en colonne au-dessus (OnboardingStepper). */
  Stepper: {
    source: 'apps/web/src/features/onboarding/components/OnboardingStepper.tsx',
    variants: { orientation: ['horizontal', 'vertical'] },
    content: [],
    items: true,
  },
  Breadcrumb: { source: 'packages/ui/src/components/breadcrumb.tsx', variants: {}, content: [], items: true },
  /** La navigation de bureau de l'app (au-dessus de 768 px). */
  Sidebar: {
    source: 'apps/web/src/components/sidebar/AppSidebar.tsx',
    variants: { variant: ['sidebar', 'floating', 'inset'], state: ['expanded', 'collapsed'] },
    content: ['active'],
    items: true,
  },
  /** La navigation mobile : QUATRE onglets, sous 768 px (gardes GA-28/29). */
  MobileTabBar: {
    source: 'apps/web/src/features/mobile/MobileTabBar.tsx',
    variants: {},
    content: ['active'],
    items: 4,
  },
  /**
   * La coque du BACKOFFICE (DM, RUX-08 révisé — Q7 : le DM est un produit mobile) : le rail à partir
   * de 768 px (déplié à 240 à partir de 1024, en icônes de 64 dessous), les 5 groupes de `nav-sections.ts`,
   * le badge d'environnement et la recherche ⌘K. Jamais la `Sidebar` d'un commercial.
   */
  BackofficeRail: {
    source: 'apps/dashboard-manager/src/app/_components/side-rail.tsx',
    variants: { state: ['expanded', 'collapsed'] },
    content: ['active'],
    items: true,
  },
  /**
   * Sous 768 px : la barre du HAUT du backoffice (menu des 5 groupes, environnement, recherche ⌘K en
   * plein écran) et les onglets de groupe qui défilent dessous. Pas de `MobileTabBar` : quatre onglets
   * d'un commercial ne disent rien d'un poste d'administration. Cible de maquette : le code n'a pas
   * encore de navigation mobile (écart noté dans `docs/revue-ux.md` T2).
   */
  BackofficeTopBar: {
    source: 'apps/dashboard-manager/src/app/_components/side-rail.tsx',
    variants: {},
    content: ['active'],
    items: true,
  },

  // ── Affichage de données ──
  // `density` cible RUX-05/26 (`docs/revue-ux.md` §4, T12) : `comfort` (app, PAR DÉFAUT — une spec
  // qui omet `density` vaut `comfort`) et `compact` (DM, et la bascule de l'utilisateur de l'app) ;
  // pas encore une prop du composant réel, la maquette précède le code sur ce point.
  Table: {
    source: 'packages/ui/src/components/table.tsx',
    variants: { density: ['comfort', 'compact'] },
    content: ['caption'],
    table: true,
  },
  DataList: {
    source: 'packages/ui/src/molecules/data-list.tsx',
    variants: { align: ['left', 'center', 'right'] },
    content: [],
    children: true,
  },
  DataRow: { source: 'packages/ui/src/molecules/data-row.tsx', variants: {}, content: ['label', 'value'] },
  InfoLine: { source: 'packages/ui/src/molecules/info-line.tsx', variants: {}, content: ['label', 'value'] },
  Badge: {
    source: 'packages/ui/src/components/badge.tsx',
    variants: {
      variant: ['default', 'primary', 'success', 'warning', 'danger', 'info', 'outline', 'destructive', 'secondary'],
    },
    content: ['label'],
  },
  CountBadge: {
    source: 'packages/ui/src/atoms/count-badge.tsx',
    variants: { shape: ['pill', 'square'] },
    content: ['value'],
  },
  DotIndicator: {
    source: 'packages/ui/src/atoms/dot-indicator.tsx',
    variants: { variant: SEMANTIC, size: SIZE_SML },
    content: [],
  },
  IconBadge: { source: 'packages/ui/src/atoms/icon-badge.tsx', variants: { size: SIZE_SML }, content: ['icon'] },
  Progress: {
    source: 'packages/ui/src/atoms/progress.tsx',
    variants: { variant: ['default', 'success', 'warning', 'danger'], size: SIZE_SML },
    content: ['value'],
  },
  Gauge: {
    source: 'packages/ui/src/atoms/gauge.tsx',
    variants: { size: ['tiny', 'small', 'medium', 'large'] },
    content: ['value', 'label'],
  },
  UsageBar: {
    source: 'packages/ui/src/molecules/usage-bar.tsx',
    variants: { size: SIZE_SML },
    content: ['label', 'used', 'limit'],
  },
  Avatar: { source: 'packages/ui/src/components/avatar.tsx', variants: {}, content: ['initials'] },
  EntityAvatar: {
    source: 'packages/ui/src/components/entity-avatar.tsx',
    variants: { size: ['xs', 'sm', 'md', 'lg'], shape: ['circle', 'square'] },
    content: ['name'],
  },
  UserCell: { source: 'packages/ui/src/molecules/user-cell.tsx', variants: {}, content: ['name', 'subtitle'] },
  TruncatedText: { source: 'packages/ui/src/molecules/truncated-text.tsx', variants: {}, content: ['value'] },
  /** Le visage de Laura, le copilote (D82 : elle s'appelle Laura partout). */
  LauraFace: { source: 'packages/ui/src/assets/laura-face.tsx', variants: {}, content: [] },
  BrandMark: {
    source: 'packages/ui/src/molecules/brand-mark.tsx',
    variants: { size: ['sm', 'md', 'lg', 'xl', '2xl', '3xl'] },
    content: [],
  },

  // ── Données chiffrées et graphes ──
  // Doctrine (RUX-29/#2613, docs/revue-ux.md T15) : dans une LISTE, une KPI ou une pastille sans valeur
  // ne se dessine PAS DU TOUT — jamais « — » ni « non mesuré » comme valeur. Seul un SCORE garde ses
  // axes, nommés, y compris ceux qui n'ont pas pu être évalués. Jamais 0 pour une absence, jamais de
  // probabilité. `data: partial` = la forme que prend le code quand un point, une colonne ou une étape
  // n'est pas mesuré.
  /** Tuile de KPI : libellé, valeur, delta, période. `unmeasured` existe côté code ; la MAQUETTE cible
   * n'instancie plus cette variante pour une tuile isolée (RUX-29) — la tuile est omise. */
  KpiTile: {
    source: 'apps/dashboard-manager/src/ui/KpiTile.tsx',
    variants: { state: ['measured', 'unmeasured'], delta: ['up', 'down', 'flat', 'unknown', 'none'] },
    content: ['label', 'value', 'delta', 'period'],
  },
  Stat: {
    source: 'apps/dashboard-manager/src/ui/Stat.tsx',
    variants: { state: ['measured', 'unmeasured'] },
    content: ['label', 'value'],
  },
  /** Flèche + texte, jamais la couleur seule ; `unknown` = « non mesuré », jamais « 0 % ». */
  Delta: {
    source: 'apps/dashboard-manager/src/ui/Delta.tsx',
    variants: { tone: ['up', 'down', 'flat', 'unknown'] },
    content: ['value'],
  },
  Sparkline: {
    source: 'apps/dashboard-manager/src/ui/Sparkline.tsx',
    variants: { data: ['complete', 'partial'] },
    content: [],
  },
  /** Barres horizontales : libellé · barre · valeur (les libellés par `items`). */
  BarChart: {
    source: 'apps/dashboard-manager/src/app/_components/charts.tsx',
    variants: {},
    content: [],
    items: true,
  },
  StackedBar: {
    source: 'apps/dashboard-manager/src/app/_components/charts.tsx',
    variants: { data: ['complete', 'partial'] },
    content: ['period', 'asOf'],
    items: true,
  },
  WaterfallChart: {
    source: 'apps/dashboard-manager/src/app/_components/charts.tsx',
    variants: { data: ['complete', 'partial'] },
    content: ['period', 'asOf'],
    items: true,
  },
  Donut: {
    source: 'apps/dashboard-manager/src/app/_components/charts.tsx',
    variants: {},
    content: ['total'],
    items: true,
  },
  Heatmap: {
    source: 'apps/dashboard-manager/src/app/monitoring/_components/analyses-heatmap.tsx',
    variants: { data: ['complete', 'partial'] },
    content: [],
  },
  CohortGrid: {
    source: 'apps/dashboard-manager/src/app/_components/charts.tsx',
    variants: { data: ['complete', 'partial'] },
    content: ['period', 'asOf'],
  },
  SegmentBar: {
    source: 'apps/dashboard-manager/src/ui/SegmentBar.tsx',
    variants: { state: ['measured', 'unmeasured'] },
    content: [],
    items: true,
  },
  /** La frise de planification des missions : une ligne par mission, aujourd'hui repéré, défile en largeur. */
  Gantt: {
    source: 'apps/web/src/features/missions/view/PlanningPage.tsx',
    variants: {},
    content: ['today', 'availability'],
    items: true,
  },

  // ── Conteneurs ──
  Card: {
    source: 'packages/ui/src/components/card.tsx',
    variants: {},
    content: ['title', 'description'],
    children: true,
  },
  SectionCard: {
    source: 'packages/ui/src/molecules/section-card.tsx',
    variants: {},
    content: ['title', 'description'],
    children: true,
  },
  SettingsGroup: {
    source: 'packages/ui/src/molecules/settings-group.tsx',
    variants: { tone: ['default', 'danger'] },
    content: ['title', 'description'],
    children: true,
  },
  SettingsRow: {
    source: 'packages/ui/src/molecules/settings-row.tsx',
    variants: {},
    content: ['label', 'description', 'value'],
    children: true,
  },
  DangerZone: {
    source: 'packages/ui/src/molecules/danger-zone.tsx',
    variants: {},
    content: ['title', 'description'],
    children: true,
  },
  Separator: {
    source: 'packages/ui/src/components/separator.tsx',
    variants: { orientation: ['horizontal', 'vertical'] },
    content: [],
  },

  // ── Retours ──
  InfoBanner: {
    source: 'packages/ui/src/molecules/info-banner.tsx',
    variants: { variant: SEMANTIC, size: SIZE_SML },
    content: ['title', 'description'],
  },
  EmptyState: {
    source: 'packages/ui/src/molecules/empty-state.tsx',
    variants: { size: SIZE_SML, align: ['center', 'start'] },
    content: ['title', 'description', 'icon', 'action'],
  },
  /** Composé sur EmptyState dans le code : titre, phrase, icône (loupe par défaut), UNE action optionnelle. */
  SearchEmptyState: {
    source: 'packages/ui/src/molecules/search-empty-state.tsx',
    variants: {},
    content: ['title', 'description', 'icon', 'action'],
  },
  /** Le chargeur braille de packages/ui : première image de chaque animation (5 textes, 12 grilles 5 × 5). */
  BrailleLoader: {
    source: 'packages/ui/src/loaders/braille-loader.tsx',
    variants: {
      variant: [
        'orbit',
        'breathe',
        'snake',
        'pulse',
        'wave',
        'grid',
        'grid-importing',
        'grid-syncing',
        'grid-searching',
        'grid-spiral',
        'grid-columns',
        'grid-orbit',
        'grid-breathe',
        'grid-snake',
        'grid-pulse',
        'grid-wave',
        'grid-diagonal',
      ],
    },
    content: [],
  },
  GenericProblemMessage: {
    source: 'packages/ui/src/organisms/generic-problem-message.tsx',
    variants: {},
    content: ['title', 'description'],
  },
  /** Rendu Figma d'un squelette : `shape` est un indice de dessin, le composant code n'a qu'un `className`. */
  Skeleton: {
    source: 'packages/ui/src/components/skeleton.tsx',
    variants: { shape: ['line', 'block', 'circle', 'table'] },
    content: [],
  },
  Spinner: { source: 'packages/ui/src/atoms/spinner.tsx', variants: {}, content: [] },
  Toast: {
    source: 'packages/ui/src/components/toast.tsx',
    variants: { variant: ['default', 'destructive'] },
    content: ['title', 'description'],
  },
  Tooltip: { source: 'packages/ui/src/components/tooltip.tsx', variants: {}, content: ['label'] },
  HelpIcon: { source: 'packages/ui/src/molecules/help-icon.tsx', variants: {}, content: ['label'] },

  // ── Surcouches ──
  Dialog: {
    source: 'packages/ui/src/components/dialog.tsx',
    variants: {},
    content: ['title', 'description'],
    children: true,
  },
  ConfirmationDialog: {
    source: 'packages/ui/src/components/confirmation-dialog.tsx',
    variants: { variant: ['confirm', 'danger'] },
    content: ['title', 'description', 'confirm', 'cancel'],
  },
  Sheet: {
    source: 'packages/ui/src/components/sheet.tsx',
    variants: { side: ['right', 'left', 'top', 'bottom'] },
    content: ['title', 'description'],
    children: true,
  },
  Popover: { source: 'packages/ui/src/components/popover.tsx', variants: {}, content: [], children: true },
} as const satisfies Record<string, ComponentDef>

/**
 * La définition d'un gabarit : ses SLOTS nommés, ceux qui sont obligatoires, et
 * les ÉTATS que toute page de ce gabarit doit dessiner. C'est ici que vit
 * l'harmonisation : deux listes de l'app n'ont pas deux façons de dire « vide ».
 *
 * La coque (Sidebar au-dessus de 768 px, MobileTabBar en dessous) n'est PAS un
 * slot : le constructeur de gabarit la pose selon la surface et le viewport.
 */
/**
 * `emptyFiltered` (RUX-14, docs/revue-ux.md T5) : une vue FILTRÉE qui ne rend rien — distincte
 * du vide « jamais rempli » (`empty`). Toujours FACULTATIF : seules les pages qui ont des filtres
 * capables de tout exclure le déclarent.
 */
type StateName = 'empty' | 'emptyFiltered' | 'loading' | 'error'

interface TemplateDef {
  description: string
  slots: readonly string[]
  required: readonly string[]
  states: readonly StateName[]
  /**
   * États que le gabarit sait dessiner mais qu'une page ne déclare QUE s'ils ont un sens pour elle
   * (un réglage n'est pas toujours une liste qui peut être vide) — jamais exigés par la validation.
   */
  optionalStates?: readonly StateName[]
}

export const TEMPLATES = {
  list: {
    description: 'Liste ou tableau d’entités, avec recherche et filtres (comptes, contacts, missions…).',
    slots: ['header', 'intro', 'actions', 'filters', 'primary', 'aside', 'bulk', 'footer'],
    required: ['header', 'primary'],
    states: ['empty', 'loading', 'error'],
    // RUX-14 (docs/revue-ux.md T5) : une page qui a des filtres capables de tout exclure déclare
    // aussi `emptyFiltered` — « Aucun compte ne passe ces filtres » + « Retirer les filtres »,
    // distinct du vide « jamais rempli » qui invite à créer, pas à retirer un filtre.
    optionalStates: ['emptyFiltered'],
  },
  detail: {
    description: 'Fiche d’une entité : entête, résumé, onglets, contenu, panneau latéral.',
    slots: ['header', 'actions', 'summary', 'tabs', 'primary', 'aside', 'footer'],
    required: ['header', 'primary'],
    states: ['loading', 'error'],
  },
  dashboard: {
    description: 'Pilotage : KPI puis graphes et listes courtes.',
    slots: ['header', 'actions', 'filters', 'kpis', 'primary', 'secondary', 'aside', 'bulk'],
    required: ['header', 'primary'],
    states: ['empty', 'loading', 'error'],
  },
  settings: {
    description: 'Réglages : navigation de section à gauche, groupes de réglages à droite.',
    slots: ['header', 'sectionNav', 'primary', 'aside', 'footer'],
    required: ['header', 'sectionNav', 'primary'],
    states: ['loading', 'error'],
    // RUX-14 (docs/revue-ux.md T5) : un réglage qui LISTE quelque chose (le journal d'activité,
    // les membres…) peut avoir besoin des deux vides — `empty` (jamais rempli) ET `emptyFiltered`
    // (filtré à vide) — jamais le même message pour les deux.
    optionalStates: ['empty', 'emptyFiltered'],
  },
  wizard: {
    description: 'Parcours en étapes (onboarding, import, lancement d’analyse).',
    slots: ['header', 'progress', 'primary', 'aside', 'footer'],
    required: ['progress', 'primary', 'footer'],
    states: ['loading', 'error'],
  },
  chat: {
    description: 'Laura : historique, fil de conversation, zone de saisie.',
    slots: ['header', 'history', 'thread', 'composer', 'aside'],
    required: ['thread', 'composer'],
    states: ['empty', 'loading', 'error'],
  },
  auth: {
    description: 'Connexion, inscription, mot de passe oublié.',
    slots: ['brand', 'primary', 'footer'],
    required: ['primary'],
    states: ['loading', 'error'],
  },
  marketing: {
    description: 'Page du site public, faite de sections.',
    slots: ['nav', 'hero', 'sections', 'cta', 'footer'],
    required: ['nav', 'hero', 'footer'],
    states: [],
  },
  'admin-table': {
    description: 'Backoffice (dashboard-manager) : tableau dense d’administration.',
    slots: ['header', 'actions', 'filters', 'primary', 'footer'],
    required: ['header', 'primary'],
    states: ['empty', 'loading', 'error'],
  },
} as const satisfies Record<string, TemplateDef>

/**
 * Les LARGEURS de référence (px) — addenda de Louis du 25/09/2026 : toutes les
 * tailles d'écran, bureau d'abord puis mobile, y compris au-delà de 1920.
 *
 * - très grands écrans 3440 · 2560 ; bureau 1920 · 1536 · 1440 · 1366 · 1280 ;
 * - tablettes 1194 · 1024 · 834 · 768, et le téléphone en PAYSAGE 844 : coque
 *   bureau (≥ 768), `Sidebar` réduite aux icônes sous 1024 ;
 * - téléphones 430 · 390 · 360 · 320 : coque mobile, `MobileTabBar` à 4 onglets.
 *
 * La borne coque reste UNIQUE : 768 px (GA-28). Une spec garde
 * `viewports: ['desktop', 'mobile']` : `desktop` = 768 → 3440, `mobile` = 320 → 430.
 */
export const WIDTHS = [3440, 2560, 1920, 1536, 1440, 1366, 1280, 1194, 1024, 844, 834, 768, 430, 390, 360, 320] as const
/** La borne unique coque mobile / coque bureau (GA-28). */
export const SHELL_BREAKPOINT = 768
/** Les largeurs où une PAGE est dessinée par défaut, dans cet ordre (le plugin permet d'en cocher d'autres). */
export const DEFAULT_PAGE_WIDTHS = {
  // RUX-49 (docs/revue-ux.md T3.0) : 1024 (tablette paysage, la largeur où la `Sidebar` se déplie)
  // rejoint les largeurs par défaut de l'app et du site — 1280 reste la SEULE largeur « serrée »
  // du DM, addenda de Louis du 25/09/2026.
  app: [1440, 1920, 2560, 1280, 1024, 390, 360],
  site: [1440, 1920, 2560, 1280, 1024, 390, 360],
  // Le DM est un produit mobile (Q7, Louis 25/09/2026) : 390 et 360 comme l'app.
  dm: [1440, 1920, 2560, 1280, 390, 360],
} as const
