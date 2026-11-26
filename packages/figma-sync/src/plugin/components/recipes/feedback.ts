import { b, type BoxPart, i, rect, ref, type Recipe, t, type Values } from '../recipe'

/**
 * Famille « Retours » — packages/ui/src/molecules/{info-banner,empty-state,
 * search-empty-state,help-icon}.tsx, organisms/generic-problem-message.tsx,
 * components/{skeleton,toast,tooltip}.tsx, atoms/spinner.tsx.
 */

/** InfoBanner : fond color-mix(<couleur> 12 %), bordure color-mix(30 %), texte plein. */
const BANNER: Record<string, { fill: string; opacity?: number; stroke: string; text: string; icon: string }> = {
  default: { fill: 'surface/2', stroke: 'border/default', text: 'text/primary', icon: 'info' },
  info: { fill: 'semantic/info', opacity: 0.12, stroke: 'soft/info/border', text: 'semantic/info', icon: 'info' },
  success: {
    fill: 'semantic/success',
    opacity: 0.12,
    stroke: 'soft/success/border',
    text: 'success/text',
    icon: 'circle-check',
  },
  warning: {
    fill: 'semantic/warning',
    opacity: 0.12,
    stroke: 'soft/warning/border',
    text: 'warning/text',
    icon: 'triangle-alert',
  },
  danger: {
    fill: 'semantic/danger',
    opacity: 0.12,
    stroke: 'soft/danger/border',
    text: 'semantic/danger',
    icon: 'circle-alert',
  },
}
const SML = (v?: string): 'sm' | 'md' | 'lg' => (v === 'sm' ? 'sm' : v === 'lg' ? 'lg' : 'md')

const infoBanner: Recipe = {
  family: 'Retours',
  usage:
    'Un message contextuel dans la page (information, avertissement, erreur récupérable). Jamais pour une donnée : une donnée s’affiche, elle ne s’annonce pas.',
  stretch: true,
  notes: [
    'Fond color-mix(12 %) de la couleur sémantique : rendu à 12 % d’opacité ; bordure color-mix(30 %) rapprochée de soft/<ton>/border.',
    '`danger` et `warning` posent role="alert".',
  ],
  draw: v => {
    const c = BANNER[v.variant ?? 'default'] ?? (BANNER.default as (typeof BANNER)['default'])
    const p = { sm: 8, md: 12, lg: 16 }[SML(v.size)]
    return b(
      'InfoBanner',
      {
        direction: 'row',
        gap: 10,
        padX: p,
        padY: p,
        radius: 'shadcn',
        fill: c.fill,
        fillOpacity: c.opacity,
        stroke: c.stroke,
        align: 'start',
        width: 560,
      },
      [
        i(c.icon, v.size === 'sm' ? 14 : 16, c.text, { prop: 'icon' }),
        b(
          'text',
          { direction: 'column', gap: 4, align: 'start' },
          [
            t('title', 'Titre du message', { size: 12, weight: 600, color: c.text }, { prop: 'title' }),
            t(
              'description',
              'Ce qu’il faut savoir, en une phrase.',
              { size: 12, color: 'text/primary', maxChars: 70 },
              { prop: 'description' },
            ),
          ],
          { grow: true },
        ),
      ],
    )
  },
}

/**
 * Le dessin d'`EmptyState` (molecules/empty-state.tsx), partagé avec `SearchEmptyState` qui est
 * COMPOSÉ dessus dans le code : mêmes tailles, même action optionnelle — seule l'icône change.
 */
function drawEmptyState(name: string, v: Values, icon: string): BoxPart {
  const sz = { sm: { p: 32, icon: 40, fs: 14 }, md: { p: 48, icon: 56, fs: 16 }, lg: { p: 64, icon: 80, fs: 18 } }[
    SML(v.size)
  ]
  const center = v.align !== 'start'
  return b(name, { direction: 'column', gap: 16, padY: sz.p, align: center ? 'center' : 'start', width: 560 }, [
    b(
      'icon-box',
      {
        direction: 'row',
        width: sz.icon,
        height: sz.icon,
        radius: center ? 16 : 0,
        align: 'center',
        justify: 'center',
      },
      [i(icon, Math.round(sz.icon / 2), 'text/muted', { prop: 'icon' })],
    ),
    t('title', 'Titre de l’état vide', { size: sz.fs, weight: 500, color: 'text/primary' }, { prop: 'title' }),
    t(
      'description',
      'Une phrase qui dit quoi faire ensuite.',
      { style: 'body', maxChars: 70 },
      { prop: 'description' },
    ),
    // Le bouton `default` de button.tsx (h-9 px-4 rounded-md), dessiné ici pour que son libellé soit une
    // propriété TEXT de l'état vide : Figma n'expose pas le texte d'une instance imbriquée.
    b(
      'action',
      {
        direction: 'row',
        height: 36,
        padX: 16,
        radius: 'rounded-md',
        fill: 'primary/500',
        align: 'center',
        justify: 'center',
      },
      [t('label', 'Action principale', { size: 14, weight: 500, color: 'on/primary' }, { prop: 'action' })],
      { toggle: 'show action' },
    ),
  ])
}

const emptyState: Recipe = {
  family: 'Retours',
  usage:
    'L’état VIDE d’un slot `primary` : un titre, une phrase, UNE action. Remplace le contenu à sa place (jamais une modale). Même composant pour l’erreur récupérable (« Réessayer »).',
  stretch: true,
  notes: ['Cadre d’icône rounded-2xl (16 px) sans fond propre dans le code : dessiné sans fond, rayon brut.'],
  draw: v => drawEmptyState('EmptyState', v, 'inbox'),
}

const searchEmptyState: Recipe = {
  family: 'Retours',
  usage:
    'Une recherche ou des filtres sans résultat : un titre, une phrase qui dit quoi changer, et UNE action seulement s’il y a une vraie porte (effacer le filtre, aller chercher de la matière) — sinon aucune.',
  stretch: true,
  notes: ['Composé sur EmptyState (taille `md`, centré), icône `Search` par défaut.'],
  draw: () => drawEmptyState('SearchEmptyState', { size: 'md', align: 'center' }, 'search'),
}

const genericProblem: Recipe = {
  family: 'Retours',
  usage:
    'L’ERREUR d’un slot `primary` : ce qui n’a pas marché, ce que l’utilisateur peut faire (« Réessayer »). Jamais de donnée de repli inventée.',
  stretch: true,
  notes: [
    'Cercle d’icône color-mix(primary-500 8 %) en clair, primary-300 en sombre : rendu primary/500 à 8 %.',
    'Bouton principal `black` en bureau, `default` en mobile dans le code : la maquette montre `black`.',
    'Titre 36 px semibold (text-4xl) : hors styles de texte.',
  ],
  draw: () =>
    b(
      'GenericProblemMessage',
      { direction: 'row', gap: 40, padX: 16, padY: 24, align: 'center', width: 720, wrap: true },
      [
        b(
          'icon-circle',
          {
            direction: 'row',
            width: 112,
            height: 112,
            radius: 'full',
            fill: 'primary/500',
            fillOpacity: 0.08,
            align: 'center',
            justify: 'center',
          },
          [i('circle-alert', 56, 'text/accent')],
        ),
        b(
          'text',
          { direction: 'column', gap: 16, align: 'start' },
          [
            t(
              'title',
              'Je n’ai pas pu charger ce contenu.',
              { size: 36, weight: 600, color: 'text/primary', maxChars: 30 },
              { prop: 'title' },
            ),
            t('description', 'Réessaie dans un instant.', { style: 'body', maxChars: 70 }, { prop: 'description' }),
            ref('Button', { variant: 'black' }, { label: 'Réessayer' }, { name: 'retry' }),
          ],
          { grow: true },
        ),
      ],
    ),
}

const skeleton: Recipe = {
  family: 'Retours',
  usage:
    'Le CHARGEMENT : la forme du contenu attendu (ligne, bloc, rond, tableau), à sa place. Jamais un spinner seul pour un contenu de page.',
  stretch: true,
  notes: [
    '`shape` est une convention de dessin : le composant code n’a qu’un className (animate-pulse, rounded-md, bg surface/2).',
  ],
  draw: v => {
    const bar = (name: string, w: number, h: number) =>
      rect(name, w, h, { fill: 'surface/2', radius: 'rounded-md', fillWidth: true })
    switch (v.shape) {
      case 'circle':
        return b('Skeleton', { direction: 'row' }, [rect('circle', 40, 40, { fill: 'surface/2', radius: 'full' })])
      case 'block':
        return b('Skeleton', { direction: 'column', width: 480, align: 'stretch' }, [bar('block', 480, 120)])
      case 'table':
        return b(
          'Skeleton',
          { direction: 'column', gap: 12, width: 720, align: 'stretch' },
          Array.from({ length: 6 }, (_, k) => bar(`row/${k + 1}`, 720, k === 0 ? 24 : 40)),
        )
      default:
        return b('Skeleton', { direction: 'column', width: 320, align: 'stretch' }, [bar('line', 320, 16)])
    }
  },
}

const spinner: Recipe = {
  family: 'Retours',
  usage: 'Attente d’une action courte DANS un contrôle (bouton qui envoie). Pour un contenu de page : Skeleton.',
  notes: ['Couleur `currentColor` (celle du parent) : rendu text/muted.'],
  draw: () =>
    b('Spinner', { direction: 'row', width: 24, height: 24, align: 'center', justify: 'center' }, [
      i('loader-circle', 24, 'text/muted'),
    ]),
}

const toast: Recipe = {
  family: 'Retours',
  usage:
    'Confirmation d’une action terminée (« Enregistré »), en bas à droite. Une erreur qui demande une action n’est pas un toast.',
  notes: [
    '`shadow-lg` → style d’effet shadow/lg.',
    '`destructive` : bouton de fermeture en rouges Tailwind littéraux (red-300/50/400/600), rendu on/primary.',
  ],
  draw: v => {
    const danger = v.variant === 'destructive'
    return b(
      'Toast',
      {
        direction: 'row',
        gap: 16,
        padX: 24,
        padY: 24,
        radius: 'shadcn',
        shadow: 'lg',
        fill: danger ? 'semantic/danger' : 'bg/default',
        stroke: danger ? 'semantic/danger' : 'border/default',
        align: 'start',
        width: 360,
      },
      [
        b(
          'text',
          { direction: 'column', gap: 4, align: 'start' },
          [
            t(
              'title',
              'Enregistré',
              { size: 14, weight: 600, color: danger ? 'on/primary' : 'text/primary' },
              { prop: 'title' },
            ),
            t(
              'description',
              'Détail optionnel.',
              { size: 14, color: danger ? 'on/primary' : 'text/secondary' },
              { prop: 'description' },
            ),
          ],
          { grow: true },
        ),
        i('x', 16, danger ? 'on/primary' : 'text/muted', { name: 'close' }),
      ],
    )
  },
}

const tooltip: Recipe = {
  family: 'Retours',
  usage: 'Nommer une icône ou compléter un libellé tronqué. Jamais une information indispensable (invisible au doigt).',
  notes: [
    'Bulle TOUJOURS sombre dans le code (zinc-800 / zinc-700 littéraux, hors tokens) : rendue par surface/2 et border/strong en mode Dark EXPLICITE, pour rester sombre dans les deux thèmes.',
    'Texte 12 px (text-xs) : au plancher D80.',
  ],
  draw: () =>
    b(
      'Tooltip',
      {
        direction: 'row',
        padX: 12,
        padY: 4,
        radius: 'shadcn',
        fill: 'surface/2',
        stroke: 'border/strong',
        mode: 'dark',
      },
      [t('label', 'Info-bulle', { size: 12, color: 'on/primary' }, { prop: 'label' })],
    ),
}

const helpIcon: Recipe = {
  family: 'Retours',
  usage: 'Un « ? » à côté d’un libellé technique, qui ouvre une explication courte (Tooltip).',
  touch: () => ({ minHeight: 44, minWidth: 44 }),
  notes: [
    'Icône en currentColor (dark:text-white littéral) : rendue text/muted. Cible 16 px sans plancher tactile dans le code — la maquette mobile pose 44 px (GA-32).',
  ],
  draw: () =>
    b('HelpIcon', { direction: 'row', gap: 4, align: 'center', justify: 'center' }, [
      i('circle-help', 16, 'text/muted'),
      t('label', 'Explication', { size: 12, color: 'text/muted' }, { prop: 'label', hidden: true }),
    ]),
}

export const FEEDBACK = {
  InfoBanner: infoBanner,
  EmptyState: emptyState,
  SearchEmptyState: searchEmptyState,
  GenericProblemMessage: genericProblem,
  Skeleton: skeleton,
  Spinner: spinner,
  Toast: toast,
  Tooltip: tooltip,
  HelpIcon: helpIcon,
}
