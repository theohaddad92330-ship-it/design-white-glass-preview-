import { b, dot, i, rect, type Recipe, t } from '../recipe'

/**
 * Famille « Données » — packages/ui/src/components/{table,badge}.tsx,
 * molecules/{data-list,data-row,info-line,usage-bar,truncated-text}.tsx,
 * atoms/{count-badge,dot-indicator,icon-badge,progress,gauge}.tsx.
 */

/** Capacité du tableau Figma : le rendu de page masque ce qui dépasse la spec (colonnes, lignes). */
export const TABLE_COLUMNS = 8
export const TABLE_ROWS = 8

const table: Recipe = {
  family: 'Données',
  usage:
    'Liste d’entités à plusieurs attributs comparables. Pleine largeur (GA-34). Sous 768 px, seules les 2 premières colonnes restent visibles, 4 jusqu’à 1023 — les autres sont masquées, jamais supprimées (GA-29).',
  stretch: true,
  notes: [
    `Capacité Figma : ${TABLE_COLUMNS} colonnes × ${TABLE_ROWS} lignes ; une page masque le surplus.`,
    'Conteneur `relative w-full overflow-x-auto` (table.tsx:47) : un tableau plus large que sa colonne DÉFILE dans son cadre ; dans une colonne latérale, 2 colonnes visibles comme sur un téléphone.',
  ],
  draw: () => {
    const cell = (c: number, value: string, head: boolean) =>
      b(
        `cell/${c}`,
        { direction: 'row', height: head ? 40 : undefined, padX: 8, padY: head ? 0 : 8, align: 'center' },
        [t('label', value, { size: 14, weight: head ? 500 : 400, color: head ? 'text/secondary' : 'text/primary' })],
        { grow: true, hidden: c > 4 },
      )
    const row = (name: string, head: boolean, r: number) =>
      b(
        name,
        { direction: 'row', stroke: 'border/default', strokeSide: 'bottom', align: 'stretch' },
        Array.from({ length: TABLE_COLUMNS }, (_, k) => cell(k + 1, head ? `Colonne ${k + 1}` : '—', head)),
        { fillWidth: true, hidden: !head && r > 3 },
      )
    return b('Table', { direction: 'column', align: 'stretch', width: 720, scrollX: true }, [
      row('head', true, 0),
      ...Array.from({ length: TABLE_ROWS }, (_, r) => row(`row/${r + 1}`, false, r + 1)),
      t('caption', 'Légende du tableau', { size: 14, color: 'text/secondary' }, { prop: 'caption', hidden: true }),
    ])
  },
}

const dataList: Recipe = {
  family: 'Données',
  usage:
    'Liste en grille dans une carte (colonnes libres, lignes cliquables). Les enfants sont des DataRow ou des lignes libres.',
  stretch: true,
  notes: [
    'Fond `bg-white` et survol `bg-neutral-50/70` LITTÉRAUX dans le code (pas de parité sombre) : rendu bg/default.',
    'Rayon rounded-xl = 12 px (défaut Tailwind 3.4, variable `rounded-xl`).',
  ],
  draw: v =>
    b(
      'DataList',
      {
        direction: 'column',
        radius: 'rounded-xl',
        stroke: 'border/default',
        fill: 'bg/default',
        align: 'stretch',
        width: 480,
        clip: true,
      },
      [
        b(
          'content',
          {
            direction: 'column',
            align: v.align === 'center' ? 'center' : v.align === 'right' ? 'end' : 'stretch',
            padX: 16,
            padY: 8,
            gap: 16,
          },
          [t('placeholder', 'Lignes de la liste', { size: 12, color: 'legacy/text-muted' })],
          { fillWidth: true },
        ),
      ],
    ),
}

const dataRow: Recipe = {
  family: 'Données',
  usage:
    'Une paire libellé / valeur sur une ligne (fiche, résumé). Une valeur absente ne s’écrit jamais « 0 » (GA-18/19).',
  notes: [
    'Écart : le libellé est `shrink-0` dans le code (data-row.tsx:36) — un libellé plus long que sa cellule y déborde ; la maquette le fait passer sur 2 lignes (à reporter : `min-w-0` au lieu de `shrink-0`).',
  ],
  stretch: true,
  draw: () =>
    b(
      'DataRow',
      {
        direction: 'row',
        padX: 16,
        padY: 12,
        gap: 8,
        justify: 'between',
        stroke: 'border/default',
        strokeSide: 'bottom',
        width: 400,
        // Cellule étroite : la valeur passe SOUS le libellé au lieu de le couper lettre à lettre (25/09/2026).
        wrap: true,
      },
      [
        // Décision de maquette : le libellé passe sur 2 lignes au plus quand la cellule est étroite.
        t('label', 'Libellé', { size: 14, color: 'text/secondary' }, { prop: 'label', truncate: 2, minChars: 12 }),
        // Valeur libre (data-row.tsx:36) : elle passe à la ligne.
        t(
          'value',
          'Valeur',
          { size: 14, weight: 500, color: 'text/primary' },
          { prop: 'value', fillWidth: true, minChars: 6 },
        ),
      ],
    ),
}

const infoLine: Recipe = {
  family: 'Données',
  usage:
    'Une information courte en ligne dans un texte (« Secteur : Industrie »). La valeur est en accent, à la différence de DataRow.',
  stretch: true,
  draw: () =>
    b('InfoLine', { direction: 'row', gap: 8, align: 'start', width: 320, wrap: true }, [
      t('label', 'Libellé :', { size: 14, color: 'text/secondary' }, { prop: 'label', truncate: 2, minChars: 12 }),
      // Du texte en ligne dans le code : la valeur passe à la ligne au lieu de pousser la colonne.
      t(
        'value',
        'Valeur',
        { size: 14, weight: 500, color: 'text/accent' },
        { prop: 'value', fillWidth: true, minChars: 6 },
      ),
    ]),
}

/** Teintes : color-mix(<couleur> 15 %, transparent) dans le code → la couleur à 15 % d'opacité. */
const BADGE: Record<string, { fill?: string; opacity?: number; text: string; stroke?: string }> = {
  default: { fill: 'surface/2', text: 'text/primary' },
  secondary: { fill: 'surface/2', text: 'text/primary' },
  primary: { fill: 'primary/500', opacity: 0.15, text: 'text/accent' },
  success: { fill: 'semantic/success', opacity: 0.15, text: 'success/text' },
  warning: { fill: 'semantic/warning', opacity: 0.15, text: 'warning/text' },
  danger: { fill: 'semantic/danger', opacity: 0.15, text: 'soft/danger/text' },
  destructive: { fill: 'semantic/danger', opacity: 0.15, text: 'soft/danger/text' },
  info: { fill: 'semantic/info', opacity: 0.15, text: 'soft/info/text' },
  outline: { stroke: 'border/default', text: 'text/primary' },
}

const badge: Recipe = {
  family: 'Données',
  usage: 'Statut ou étiquette courte, sur une ligne (ne s’étire jamais). La couleur double un mot, jamais seule.',
  notes: ['Teintes en color-mix(15 %) : rendues par la couleur sémantique à 15 % d’opacité.'],
  draw: v => {
    const look = BADGE[v.variant ?? 'default'] ?? { text: 'text/primary' }
    return b(
      'Badge',
      {
        direction: 'row',
        padX: 10,
        padY: 2,
        radius: 'full',
        fill: look.fill,
        fillOpacity: look.opacity,
        stroke: look.stroke,
      },
      [t('label', 'Statut', { size: 12, weight: 500, color: look.text }, { prop: 'label' })],
    )
  },
}

const countBadge: Recipe = {
  family: 'Données',
  usage: 'Compteur de non-lus / d’éléments en attente (« 99+ » au-delà). Variante par défaut du code : danger.',
  notes: ['Fond color-mix(12 %) de la couleur sémantique : rendu à 12 % d’opacité.'],
  draw: v =>
    b(
      'CountBadge',
      {
        direction: 'row',
        height: 20,
        minWidth: 20,
        padX: 6,
        radius: v.shape === 'square' ? 'rounded-md' : 'full',
        fill: 'semantic/danger',
        fillOpacity: 0.12,
        align: 'center',
        justify: 'center',
      },
      [t('value', '3', { size: 12, weight: 500, color: 'semantic/danger' }, { prop: 'value' })],
    ),
}

const DOT_FILL: Record<string, string> = {
  default: 'text/muted',
  info: 'semantic/info',
  success: 'semantic/success',
  warning: 'semantic/warning',
  danger: 'semantic/danger',
}
const DOT_SIZE: Record<string, number> = { sm: 6, md: 8, lg: 10 }

const dotIndicator: Recipe = {
  family: 'Données',
  usage: 'Pastille d’état à côté d’un libellé (en ligne, nouveau). Jamais seule : un mot l’accompagne.',
  draw: v =>
    b('DotIndicator', { direction: 'row' }, [
      dot('dot', DOT_SIZE[v.size ?? 'md'] ?? 8, DOT_FILL[v.variant ?? 'default'] ?? 'text/muted'),
    ]),
}

const iconBadge: Recipe = {
  family: 'Données',
  usage: 'Icône dans un carré teinté, en tête de carte ou de ligne. L’icône se change par INSTANCE_SWAP.',
  notes: [
    'Fond et couleur libres par props dans le code (chaînes Tailwind) : la maquette montre le défaut surface/2 + text/accent.',
    '`dark:text-black` fixe sur l’icône : écart en sombre.',
  ],
  draw: v => {
    const pad = { sm: 4, md: 8, lg: 16 }[v.size === 'sm' ? 'sm' : v.size === 'lg' ? 'lg' : 'md']
    return b('IconBadge', { direction: 'row', padX: pad, padY: pad, radius: 'shadcn', fill: 'surface/2' }, [
      i('sparkles', 20, 'text/accent', { prop: 'icon' }),
    ])
  },
}

const PROGRESS: Record<string, string> = {
  default: 'primary/500',
  success: 'semantic/success',
  warning: 'semantic/warning',
  danger: 'semantic/danger',
}

const progress: Recipe = {
  family: 'Données',
  usage: 'Avancement d’une tâche mesurée (import, analyse). Une valeur non mesurée ne se dessine pas à 0.',
  stretch: true,
  notes: ['Piste color-mix(15 %) de la couleur : rendue à 15 % d’opacité.'],
  draw: v => {
    const h = { sm: 4, md: 8, lg: 12 }[v.size === 'sm' ? 'sm' : v.size === 'lg' ? 'lg' : 'md']
    const color = PROGRESS[v.variant ?? 'default'] ?? 'primary/500'
    return b(
      'Progress',
      {
        direction: 'row',
        width: 240,
        height: h,
        radius: 'full',
        fill: color,
        fillOpacity: 0.15,
        clip: true,
        align: 'stretch',
      },
      [rect('indicator', 144, h, { fill: color })],
    )
  },
}

const GAUGE: Record<string, { d: number; fs: number }> = {
  tiny: { d: 38, fs: 0 },
  small: { d: 48, fs: 14 },
  medium: { d: 72, fs: 22 },
  large: { d: 104, fs: 31 },
}

const gauge: Recipe = {
  family: 'Données',
  usage: 'Un score sur 100 en anneau. Jamais nu : ses axes et ce qui n’a pas été évalué s’affichent à côté.',
  notes: [
    'Anneau SVG Recharts : rendu en disque + valeur centrée ; couleur par SEUILS (0 danger, 50 warning, 70 success), montrée ici en success.',
    'Valeur 22 / 31 px bold : hors styles de texte.',
    'Une valeur longue (« Non mesuré ») passe sur deux lignes DANS l’anneau, coupée « … » au-delà : le code la pose en absolu et la laisse déborder.',
    'Écart : `label` n’existe pas dans gauge.tsx — le libellé SOUS l’anneau est posé par la maquette (les pages le citent) ; il passe à la ligne sur deux lignes au plus.',
  ],
  stretch: true,
  draw: v => {
    const g = GAUGE[v.size ?? 'medium'] ?? { d: 72, fs: 22 }
    return b('Gauge', { direction: 'column', gap: 4, align: 'center', width: Math.max(g.d, 120) }, [
      b(
        'ring',
        {
          direction: 'row',
          width: g.d,
          height: g.d,
          radius: 'full',
          stroke: 'semantic/success',
          strokeWidth: Math.round(g.d * 0.14),
          fill: 'surface/2',
          align: 'center',
          justify: 'center',
        },
        [
          t(
            'value',
            '72',
            { size: Math.max(g.fs, 12), weight: 700, color: 'text/primary' },
            { prop: 'value', hidden: v.size === 'tiny', truncate: 2 },
          ),
        ],
      ),
      t('label', 'Libellé', { size: 12, color: 'text/muted' }, { prop: 'label', truncate: 2 }),
    ])
  },
}

const usageBar: Recipe = {
  family: 'Données',
  usage: 'Consommation d’un quota (crédits, sièges) : vert, puis ambre à 70 %, rouge à 90 %.',
  stretch: true,
  notes: ['Fond/bordure color-mix(8 % / 25 %) dans le code : rapprochés des tokens soft/success/*.'],
  draw: v => {
    const sz = { sm: { p: 12, fs: 12 }, md: { p: 16, fs: 14 }, lg: { p: 20, fs: 16 } }[
      v.size === 'sm' ? 'sm' : v.size === 'lg' ? 'lg' : 'md'
    ]
    return b(
      'UsageBar',
      {
        direction: 'column',
        padX: sz.p,
        padY: sz.p,
        gap: 8,
        radius: 'shadcn',
        fill: 'soft/success/bg',
        stroke: 'soft/success/border',
        align: 'stretch',
        width: 320,
      },
      [
        b(
          'head',
          { direction: 'row', justify: 'between' },
          [
            t('label', 'Crédits', { size: sz.fs, weight: 600, color: 'success/text' }, { prop: 'label' }),
            b('count', { direction: 'row', gap: 4 }, [
              t('used', '12', { size: sz.fs, weight: 500, color: 'success/text' }, { prop: 'used' }),
              t('sep', '/', { size: sz.fs, color: 'success/text' }),
              t('limit', '50', { size: sz.fs, weight: 500, color: 'success/text' }, { prop: 'limit' }),
            ]),
          ],
          { fillWidth: true },
        ),
        b(
          'bar',
          { direction: 'row', height: 8, radius: 'full', fill: 'semantic/success', fillOpacity: 0.15, clip: true },
          [rect('indicator', 60, 8, { fill: 'semantic/success' })],
          { fillWidth: true },
        ),
      ],
    )
  },
}

const truncatedText: Recipe = {
  family: 'Données',
  usage: 'Texte long coupé sur une ligne avec « … » ; le texte complet s’affiche au survol (Tooltip).',
  draw: () =>
    b('TruncatedText', { direction: 'row', width: 240, clip: true }, [
      t('value', 'Un texte trop long pour sa colonne…', { size: 14, color: 'text/primary' }, { prop: 'value' }),
    ]),
}

export const DATA = {
  Table: table,
  DataList: dataList,
  DataRow: dataRow,
  InfoLine: infoLine,
  Badge: badge,
  CountBadge: countBadge,
  DotIndicator: dotIndicator,
  IconBadge: iconBadge,
  Progress: progress,
  Gauge: gauge,
  UsageBar: usageBar,
  TruncatedText: truncatedText,
}
