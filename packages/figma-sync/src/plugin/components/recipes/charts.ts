import type { ColorName } from '../../scene'
import { b, type BoxPart, i, type Part, rect, type Recipe, t } from '../recipe'

/**
 * Les composants de DONNÉES : KPI, graphes, planning. Lus dans
 * `apps/dashboard-manager/src/ui/*` (KpiTile, Stat, Delta, Sparkline,
 * SegmentBar, Heatmap), `apps/dashboard-manager/src/app/_components/charts.tsx`
 * (BarChart, StackedBar, WaterfallChart, Donut, CohortGrid) et la frise de
 * `apps/web/src/features/missions/view/PlanningPage.tsx` (Gantt).
 *
 * Trois règles tenues ici, toutes venues du code :
 * - « non mesuré » n'est JAMAIS 0 : un point absent est un TROU visible
 *   (pointillés), jamais une barre à hauteur nulle ; une valeur absente est « — » ;
 * - aucune probabilité, aucun prévisionnel pondéré ;
 * - la couleur ne porte jamais le sens seule (flèche + texte du Delta).
 *
 * Les graphes s'étirent (`stretch`) : barres et cellules sont en largeur FILL,
 * une proportion s'y dessine en UNITÉS égales (10 ou 20 par piste) — ce qui
 * reste juste à toutes les largeurs, 360 px compris. Les hauteurs de barres
 * sont une forme d'exemple : la maquette ne porte pas de données.
 */

/** La palette de séries : une couleur d'accent, puis les sémantiques (le cycle de SegmentBar.tsx). */
const SERIES: readonly ColorName[] = [
  'primary/500',
  'semantic/info',
  'semantic/success',
  'semantic/warning',
  'semantic/danger',
]
const serie = (k: number): ColorName => SERIES[k % SERIES.length] as ColorName

const BACKOFFICE_NOTE =
  'Le backoffice a ses propres variables (--surface, --border, --muted, --accent, --green, --red) : rendues par les tokens de l’app (surface/1, border/default, text/muted, primary/500, semantic/*) — il migre sur ces tokens, pas l’inverse (README).'
const HEX_NOTE =
  'Couleurs de séries en hexadécimal littéral dans charts.tsx (`COLORS`) : rendues par l’accent primary/500 puis les couleurs sémantiques (le cycle de SegmentBar.tsx).'
const SMALL_TEXT_NOTE = 'Libellés d’axe à 10-11 px dans le code : rendus à 12 px, le plancher typographique (GA-31).'

const muted = (name: string, value: string, extra: Partial<Parameters<typeof t>[3]> = {}): Part =>
  t(name, value, { size: 12, color: 'text/muted' }, extra)

/**
 * Une piste proportionnelle : `total` unités égales en FILL, les `filled` premières peintes.
 * S'étire et se replie avec son parent (aucune largeur fixe ne s'impose à 360 px).
 */
function track(
  name: string,
  filled: number,
  total: number,
  color: ColorName,
  height: number,
  extra: Partial<BoxPart> = {},
): BoxPart {
  return b(
    name,
    { direction: 'row', height, radius: 'rounded-sm', fill: 'bg/default', clip: true, align: 'stretch' },
    Array.from({ length: total }, (_, k) =>
      rect(`unit/${k + 1}`, 4, height, { fill: k < filled ? color : undefined, fillWidth: true }),
    ),
    { fillWidth: true, ...extra },
  )
}

/** Une case « non mesuré » : un cadre en pointillés, jamais une couleur de la palette. */
const unmeasuredCell = (name: string, height: number): BoxPart =>
  b(name, { direction: 'row', height, radius: 3, stroke: 'border/default', dashed: true }, [], { fillWidth: true })

/** Le pied des graphes du backoffice : la période à gauche, « calculé le … » à droite. */
const footer = (): BoxPart =>
  b(
    'footer',
    { direction: 'row', justify: 'between', gap: 8, wrap: true },
    [muted('period', '30 derniers jours', { prop: 'period' }), muted('asOf', 'calculé le 25 sept.', { prop: 'asOf' })],
    { fillWidth: true },
  )

/** La légende : une pastille et un libellé par série (`item/N` pour les libellés de page). */
const legend = (labels: readonly string[], swatch = 8): BoxPart =>
  b(
    'legend',
    { direction: 'row', gap: 12, wrap: true },
    labels.map((label, k) =>
      b(`item/${k + 1}`, { direction: 'row', gap: 6, align: 'center' }, [
        rect('swatch', swatch, swatch, { fill: serie(k), radius: 2 }),
        muted('label', label),
      ]),
    ),
    { fillWidth: true },
  )

// ─── Delta, KPI, Stat ──────────────────────────────────────────────────────

const DELTA: Record<string, { arrow: string; text: string; color: ColorName }> = {
  up: { arrow: '↑', text: '+8,2 %', color: 'semantic/success' },
  down: { arrow: '↓', text: '−4,3 %', color: 'semantic/danger' },
  flat: { arrow: '→', text: '0 %', color: 'text/muted' },
  unknown: { arrow: '', text: 'non mesuré', color: 'text/muted' },
}

/** Flèche + texte : la couleur ne porte jamais le signe seule (Delta.tsx). */
function deltaParts(tone: string, prop = 'value'): Part[] {
  const d = DELTA[tone] ?? (DELTA.unknown as (typeof DELTA)[string])
  return [
    t('arrow', d.arrow || '→', { size: 12, weight: 600, color: d.color }, { hidden: tone === 'unknown' }),
    t('value', d.text, { size: 12, weight: tone === 'unknown' ? 400 : 600, color: d.color }, { prop }),
  ]
}

const delta: Recipe = {
  family: 'Données',
  usage:
    'Évolution d’un chiffre (+8,2 % ↑). Toujours flèche ET texte ; un delta absent s’écrit « non mesuré », jamais « 0 % ».',
  notes: [
    '`unknown` en italique dans le code (Delta.module.css) : rendu en graisse normale, sans italique (pas de style italique dans les tokens).',
    BACKOFFICE_NOTE,
  ],
  draw: v => b('Delta', { direction: 'row', gap: 3, align: 'center' }, deltaParts(v.tone ?? 'up')),
}

const kpiTile: Recipe = {
  family: 'Données',
  usage:
    'Un chiffre clé en tête de tableau de bord : libellé, valeur, delta, période. Sans valeur : « — » (jamais 0). Sans delta : pas de ligne de delta.',
  stretch: true,
  notes: [
    'Rayon `border-radius: 12px` littéral (KpiTile.module.css) : la valeur de `rounded-xl`, liée à cette variable.',
    'Libellé en capitales (text-transform: uppercase) : la maquette garde la casse du contenu.',
    'Valeur 26 px bold : hors styles de texte.',
    BACKOFFICE_NOTE,
  ],
  draw: v => {
    const tone = v.delta ?? 'up'
    return b(
      'KpiTile',
      {
        direction: 'column',
        gap: 8,
        padX: 20,
        padY: 20,
        radius: 'rounded-xl',
        fill: 'surface/1',
        stroke: 'border/default',
        align: 'stretch',
        width: 240,
      },
      [
        t('label', 'Libellé', { size: 13, color: 'text/muted' }, { prop: 'label', truncate: 1 }),
        t('value', v.state === 'unmeasured' ? '—' : 'Valeur', { size: 26, weight: 700 }, { prop: 'value' }),
        b('footer', { direction: 'row', gap: 8, align: 'center', wrap: true }, [
          b('delta', { direction: 'row', gap: 3, align: 'center' }, deltaParts(tone, 'delta'), {
            hidden: tone === 'none',
          }),
          t('period', 'sur 30 jours', { size: 13, color: 'text/muted' }, { prop: 'period' }),
        ]),
      ],
    )
  },
}

const stat: Recipe = {
  family: 'Données',
  usage: 'Libellé + valeur dans une grille dense (sans cadre : la grille espace). Sans valeur : « — ».',
  notes: ['Libellé en capitales dans le code.', BACKOFFICE_NOTE],
  draw: v =>
    b('Stat', { direction: 'column', gap: 2, align: 'stretch', width: 160 }, [
      t('label', 'Libellé', { size: 13, color: 'text/muted' }, { prop: 'label', truncate: 1 }),
      t('value', v.state === 'unmeasured' ? '—' : 'Valeur', { size: 16, weight: 600 }, { prop: 'value' }),
    ]),
}

// ─── Petits graphes ────────────────────────────────────────────────────────

const SPARK = [40, 55, 48, 70, 62, 80, 75, 90, 68, 85, 95, 100]

const sparkline: Recipe = {
  family: 'Données',
  usage:
    'Tendance d’une série sous un chiffre (barres fines). Un point non mesuré est un TROU visible, jamais une barre à 0.',
  stretch: true,
  notes: [BACKOFFICE_NOTE],
  draw: v =>
    b(
      'Sparkline',
      { direction: 'row', gap: 2, height: 28, align: 'end', width: 120 },
      SPARK.map((pct, k) =>
        v.data === 'partial' && k === 7
          ? b(
              `bar/${k + 1}`,
              { direction: 'row', height: 1, stroke: 'border/default', strokeSide: 'bottom', dashed: true },
              [],
              {
                fillWidth: true,
                name: `missing/${k + 1}`,
              },
            )
          : rect(`bar/${k + 1}`, 2, Math.round((pct / 100) * 28), { fill: 'primary/500', radius: 1, fillWidth: true }),
      ),
    ),
}

const BARS = [10, 7, 5, 3, 2]

const barChart: Recipe = {
  family: 'Données',
  usage: 'Comparer quelques valeurs entre elles (≤ 8 lignes) : libellé · barre · valeur, la valeur toujours écrite.',
  stretch: true,
  notes: [
    'Grille `140px 1fr 64px` : le libellé garde 140 px et se coupe « … », la barre prend le reste.',
    'Rayon de piste 6 px littéral : la valeur de `rounded-sm`, liée.',
    HEX_NOTE,
    BACKOFFICE_NOTE,
  ],
  draw: () =>
    b(
      'BarChart',
      { direction: 'column', gap: 8, align: 'stretch', width: 480 },
      ['Libellé 1', 'Libellé 2', 'Libellé 3', 'Libellé 4', 'Libellé 5'].map((label, k) =>
        b(
          `item/${k + 1}`,
          { direction: 'row', gap: 10, align: 'center' },
          [
            b('head', { direction: 'row', width: 140 }, [
              t('label', label, { size: 13, color: 'text/muted' }, { truncate: 1 }),
            ]),
            track('bar', BARS[k] ?? 1, 10, serie(k), 22, { grow: true }),
            b('tail', { direction: 'row', width: 64, justify: 'end' }, [t('value', 'Valeur', { size: 13 })]),
          ],
          { fillWidth: true },
        ),
      ),
    ),
}

// ─── Colonnes : empilé, cascade ────────────────────────────────────────────

const PLOT = 160
const MONTHS = ['avr.', 'mai', 'juin', 'juil.', 'août', 'sept.']

/** Une colonne du graphe : son dessin, puis son libellé d'axe (coupé « … », jamais débordant). */
const column = (k: number, label: string, drawing: Part): BoxPart =>
  b(
    `item/${k + 1}`,
    { direction: 'column', gap: 4, align: 'stretch' },
    [
      b('plot', { direction: 'column', height: PLOT, justify: 'end', align: 'stretch' }, [drawing], {
        fillWidth: true,
      }),
      t('label', label, { size: 12, color: 'text/muted' }, { truncate: 1 }),
    ],
    { fillWidth: true },
  )

const STACK = [
  [40, 30, 20],
  [45, 30, 25],
  [50, 35, 25],
  [55, 35, 30],
  [60, 40, 30],
  [65, 45, 35],
]

const stackedBar: Recipe = {
  family: 'Données',
  usage:
    'Décomposer une grandeur en parts non négatives, période par période (MRR par origine). Une colonne non mesurée est un repère en pointillés, jamais une colonne à 0.',
  stretch: true,
  notes: [HEX_NOTE, SMALL_TEXT_NOTE, BACKOFFICE_NOTE],
  draw: v =>
    b('StackedBar', { direction: 'column', gap: 8, align: 'stretch', width: 480 }, [
      b(
        'columns',
        { direction: 'row', gap: 6, align: 'end' },
        MONTHS.map((m, k) =>
          column(
            k,
            m,
            v.data === 'partial' && k === 4
              ? unmeasuredCell('unmeasured', 4)
              : b(
                  'stack',
                  { direction: 'column', radius: 3, clip: true, align: 'stretch' },
                  [...(STACK[k] ?? [])]
                    .reverse()
                    .map((h, s) => rect(`part/${s + 1}`, 8, h, { fill: serie(2 - s), fillWidth: true })),
                  { fillWidth: true },
                ),
          ),
        ),
        { fillWidth: true },
      ),
      legend(['Nouveau', 'Expansion', 'Existant']),
      footer(),
    ]),
}

const WATERFALL: readonly { label: string; delta: number; tone: 'neutral' | 'positive' | 'negative' }[] = [
  { label: 'Début', delta: 100, tone: 'neutral' },
  { label: 'Nouveau', delta: 30, tone: 'positive' },
  { label: 'Expansion', delta: 10, tone: 'positive' },
  { label: 'Contraction', delta: -15, tone: 'negative' },
  { label: 'Churn', delta: -20, tone: 'negative' },
  { label: 'Fin', delta: 0, tone: 'neutral' },
]
const TONE: Record<string, ColorName> = {
  neutral: 'semantic/info',
  positive: 'semantic/success',
  negative: 'semantic/danger',
}

/**
 * Les barres flottantes : chacune part du total courant. Une étape non mesurée ne dessine
 * pas de barre et NE FAIT PAS avancer le total (`computeWaterfall` de charts.logic.ts).
 */
function waterfallBars(unknownIndex: number | null): { y0: number; y1: number; unknown: boolean }[] {
  let total = 0
  return WATERFALL.map((step, k) => {
    if (k === unknownIndex) return { y0: total, y1: total, unknown: true }
    if (k === 0) {
      total = step.delta
      return { y0: 0, y1: total, unknown: false }
    }
    if (k === WATERFALL.length - 1) return { y0: 0, y1: total, unknown: false }
    const from = total
    total += step.delta
    return { y0: Math.min(from, total), y1: Math.max(from, total), unknown: false }
  })
}

const waterfallChart: Recipe = {
  family: 'Données',
  usage:
    'Expliquer un solde : début + entrées − sorties = fin (MRR). Une étape non mesurée est un trait en pointillés et ne fait pas avancer le total.',
  stretch: true,
  notes: [SMALL_TEXT_NOTE, BACKOFFICE_NOTE],
  draw: v => {
    const bars = waterfallBars(v.data === 'partial' ? 2 : null)
    const max = Math.max(1, ...bars.map(x => x.y1))
    const px = (n: number): number => Math.round((n / max) * (PLOT - 8))
    return b('WaterfallChart', { direction: 'column', gap: 8, align: 'stretch', width: 480 }, [
      b(
        'columns',
        { direction: 'row', gap: 8, align: 'end' },
        WATERFALL.map((step, k) => {
          const bar = bars[k] as { y0: number; y1: number; unknown: boolean }
          const drawing = bar.unknown
            ? b(
                'unmeasured',
                { direction: 'row', height: 2, stroke: 'text/muted', strokeSide: 'top', strokeWidth: 2, dashed: true },
                [],
                {
                  fillWidth: true,
                },
              )
            : rect('bar', 8, Math.max(2, px(bar.y1 - bar.y0)), {
                fill: TONE[step.tone] ?? 'semantic/info',
                radius: 3,
                fillWidth: true,
              })
          return column(
            k,
            step.label,
            b(
              'float',
              { direction: 'column', align: 'stretch' },
              [drawing, rect('base', 8, px(bar.y0), { fillWidth: true })],
              {
                fillWidth: true,
              },
            ),
          )
        }),
        { fillWidth: true },
      ),
      footer(),
    ])
  },
}

// ─── Anneau ────────────────────────────────────────────────────────────────

const DONUT = [0.4, 0.25, 0.2, 0.15]

const donut: Recipe = {
  family: 'Données',
  usage:
    'Une répartition en 2 à 5 parts, total au centre, légende à côté (qui passe dessous quand la place manque). Jamais une probabilité.',
  notes: [HEX_NOTE, BACKOFFICE_NOTE],
  draw: () => {
    let start = -Math.PI / 2
    const arcs = DONUT.map((frac, k) => {
      const end = start + frac * 2 * Math.PI
      const part: Part = {
        kind: 'shape',
        shape: 'ellipse',
        name: `arc/${k + 1}`,
        width: 132,
        height: 132,
        fill: serie(k),
        arc: { start, end, inner: 0.72 },
        absolute: true,
      }
      start = end
      return part
    })
    return b('Donut', { direction: 'row', gap: 18, align: 'center', wrap: true }, [
      b('ring', { direction: 'row', width: 132, height: 132, align: 'center', justify: 'center' }, [
        ...arcs,
        t('total', 'Total', { size: 22, weight: 700 }, { prop: 'total' }),
      ]),
      b(
        'legend',
        { direction: 'column', gap: 4, align: 'start' },
        ['Libellé 1', 'Libellé 2', 'Libellé 3', 'Libellé 4'].map((label, k) =>
          b(`item/${k + 1}`, { direction: 'row', gap: 8, align: 'center' }, [
            rect('swatch', 10, 10, { fill: serie(k), radius: 3 }),
            t('label', label, { size: 13, color: 'text/muted' }),
          ]),
        ),
      ),
    ])
  },
}

// ─── Grilles d'intensité ───────────────────────────────────────────────────

/** Les 5 paliers : des OPACITÉS de l'accent (Heatmap.module.css), pas 5 couleurs nommées. */
const INTENSITY = [0.12, 0.32, 0.52, 0.72, 1]

const intensityCell = (name: string, level: number): Part =>
  rect(name, 8, 16, { fill: 'primary/500', fillOpacity: INTENSITY[level] ?? 1, radius: 3, fillWidth: true })

/** Une ligne d'une grille : son libellé (largeur fixe, coupé « … »), puis ses cellules en FILL. */
const gridRow = (name: string, label: string, labelWidth: number, cells: Part[]): BoxPart =>
  b(
    name,
    { direction: 'row', gap: 3, align: 'center' },
    [b('head', { direction: 'row', width: labelWidth }, [muted('label', label, { truncate: 1 })]), ...cells],
    { fillWidth: true },
  )

const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const SLOTS = ['0 h', '3 h', '6 h', '9 h', '12 h', '15 h', '18 h', '21 h']

const heatmap: Recipe = {
  family: 'Données',
  usage:
    'Répartition jour × tranche horaire en 5 intensités. Une cellule non mesurée est un cadre en pointillés, jamais le palier le plus bas.',
  stretch: true,
  notes: [
    'Cellules carrées (`aspect-ratio: 1`) dans le code : hauteur fixe de 16 px en maquette, la largeur suit la place.',
    BACKOFFICE_NOTE,
  ],
  draw: v =>
    b('Heatmap', { direction: 'column', gap: 3, align: 'stretch', width: 420 }, [
      gridRow(
        'hours',
        '',
        36,
        SLOTS.map((h, k) =>
          b(`slot/${k + 1}`, { direction: 'row' }, [muted('label', h, { truncate: 1 })], { fillWidth: true }),
        ),
      ),
      ...DAYS.map((day, d) =>
        gridRow(
          `day/${d + 1}`,
          day,
          36,
          SLOTS.map((_, h) =>
            v.data === 'partial' && d === 2 && h === 5
              ? unmeasuredCell(`cell/${h + 1}`, 16)
              : intensityCell(`cell/${h + 1}`, (d + h * 2) % 5),
          ),
        ),
      ),
    ]),
}

const COHORTS = ['janv. 2026', 'févr. 2026', 'mars 2026', 'avr. 2026', 'mai 2026']

const cohortGrid: Recipe = {
  family: 'Données',
  usage:
    'Rétention par cohorte mensuelle (12 mois). Mois futur = case VIDE ; mois écoulé sans donnée = pointillés ; cohorte de moins de 3 espaces non affichée (anonymat).',
  stretch: true,
  notes: [SMALL_TEXT_NOTE, BACKOFFICE_NOTE],
  draw: v =>
    b('CohortGrid', { direction: 'column', gap: 3, align: 'stretch', width: 560 }, [
      gridRow(
        'months',
        '',
        88,
        Array.from({ length: 12 }, (_, m) =>
          b(`month/${m + 1}`, { direction: 'row', justify: 'center' }, [muted('label', `M${m}`, { truncate: 1 })], {
            fillWidth: true,
          }),
        ),
      ),
      ...COHORTS.map((label, r) =>
        gridRow(
          `cohort/${r + 1}`,
          label,
          88,
          Array.from({ length: 12 }, (_, m) => {
            const elapsed = 12 - r * 2
            if (m >= elapsed) return b(`cell/${m + 1}`, { direction: 'row', height: 16 }, [], { fillWidth: true })
            if (v.data === 'partial' && r === 1 && m === 3) return unmeasuredCell(`cell/${m + 1}`, 16)
            return intensityCell(`cell/${m + 1}`, Math.max(0, 4 - Math.floor(m / 2)))
          }),
        ),
      ),
      footer(),
    ]),
}

const SEGMENTS = [8, 5, 4, 2, 1]

const segmentBar: Recipe = {
  family: 'Données',
  usage:
    'Une répartition en une barre + légende (statuts, origines). Rien à répartir : « Non mesuré », jamais une barre vide à 0.',
  stretch: true,
  notes: ['Rayon 5 px (hauteur 10) : rendu en pilule.', BACKOFFICE_NOTE],
  draw: v => {
    const measured = v.state !== 'unmeasured'
    let at = 0
    const units: Part[] = SEGMENTS.flatMap((n, k) =>
      Array.from({ length: n }, () => rect(`unit/${++at}`, 4, 10, { fill: serie(k), fillWidth: true })),
    )
    return b('SegmentBar', { direction: 'column', gap: 8, align: 'stretch', width: 360 }, [
      b('bar', { direction: 'row', height: 10, radius: 'full', fill: 'border/default', clip: true }, units, {
        fillWidth: true,
        hidden: !measured,
      }),
      {
        ...legend([
          'Libellé 1 · valeur',
          'Libellé 2 · valeur',
          'Libellé 3 · valeur',
          'Libellé 4 · valeur',
          'Libellé 5 · valeur',
        ]),
        hidden: !measured,
      },
      muted('unmeasured', 'Non mesuré', { hidden: measured }),
    ])
  },
}

// ─── Frise de planification ────────────────────────────────────────────────

const GANTT_MONTHS = ['juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const LEFT = 224
const SIDE = 208
const TRACK = 1024 - LEFT - SIDE

/** Une ligne de la frise : le nom, la piste (le DESSIN seul, #1372), la disponibilité courte à droite. */
function ganttRow(
  k: number,
  label: string,
  offset: number,
  width: number,
  edge: 'none' | 'clipped' | 'open',
  side: string,
): BoxPart {
  const bar: Part[] = [
    ...(edge === 'clipped' ? [i('chevron-left', 12, 'primary/700', { name: 'clipped' })] : []),
    b('bar', {
      direction: 'row',
      width,
      height: 12,
      radius: 'rounded-sm',
      fill: k % 2 ? 'primary/300' : 'primary/500',
    }),
    ...(edge === 'open'
      ? [
          b('open', {
            direction: 'row',
            width: 20,
            height: 12,
            stroke: 'primary/500',
            dashed: true,
            radius: 'rounded-sm',
          }),
        ]
      : []),
  ]
  return b(`item/${k + 1}`, { direction: 'row', align: 'stretch', stroke: 'border/default', strokeSide: 'bottom' }, [
    b('who', { direction: 'row', width: LEFT, padX: 12, padY: 10, stroke: 'border/default', strokeSide: 'right' }, [
      t('label', label, { size: 14, weight: 500 }, { truncate: 1 }),
    ]),
    b('track', { direction: 'row', width: TRACK, padY: 10, align: 'center' }, [
      rect('before', Math.max(1, offset), 12),
      ...bar,
    ]),
    b('side', { direction: 'row', width: SIDE, padX: 12, padY: 10, stroke: 'border/default', strokeSide: 'left' }, [
      muted('availability', side, { truncate: 1 }),
    ]),
  ])
}

const gantt: Recipe = {
  family: 'Données',
  usage:
    'Planification des missions : une ligne par mission, les mois en tête, aujourd’hui repéré. Bord ROGNÉ (date hors champ) = chevron ; bord OUVERT (aucune date) = hachure courte — jamais confondus.',
  stretch: true,
  notes: [
    'UN seul conteneur défile en largeur (overflow-x-auto, min-w-[64rem]) : l’entête et les lignes glissent ensemble ; la page, elle, ne défile jamais en largeur.',
    'Repère « aujourd’hui » : un trait vertical positionné au jour près dans le code ; la maquette l’écrit dans l’entête du mois courant.',
    'Logo et avatar décoratifs (#1371) : la ligne entière ouvre la mission.',
  ],
  draw: () =>
    b(
      'Gantt',
      {
        direction: 'column',
        radius: 'shadcn',
        fill: 'surface/1',
        stroke: 'border/default',
        align: 'start',
        width: 640,
        scrollX: true,
      },
      [
        b('timeline', { direction: 'column', width: 1024, align: 'stretch' }, [
          b('head', { direction: 'row', align: 'stretch', stroke: 'border/default', strokeSide: 'bottom' }, [
            b('corner', { direction: 'row', width: LEFT, stroke: 'border/default', strokeSide: 'right' }),
            b(
              'months',
              { direction: 'row', width: TRACK, align: 'stretch' },
              GANTT_MONTHS.map((m, k) =>
                b(
                  `month/${k + 1}`,
                  {
                    direction: 'column',
                    gap: 2,
                    padX: 8,
                    padY: 8,
                    align: 'start',
                    stroke: k ? 'border/default' : undefined,
                    strokeSide: 'left',
                  },
                  [
                    muted('label', m),
                    ...(k === 2
                      ? [t('today', 'Aujourd’hui', { size: 12, color: 'text/accent' }, { prop: 'today' })]
                      : []),
                  ],
                  { fillWidth: true },
                ),
              ),
            ),
            b(
              'side',
              { direction: 'row', width: SIDE, padX: 12, padY: 8, stroke: 'border/default', strokeSide: 'left' },
              [muted('availability', 'Disponibilité', { prop: 'availability', truncate: 1 })],
            ),
          ]),
          ganttRow(0, 'Mission 1', 40, 360, 'none', 'Disponible le 21 sept.'),
          ganttRow(1, 'Mission 2', 1, 220, 'clipped', 'Début avant période'),
          ganttRow(2, 'Mission 3', 180, 380, 'open', 'Fin inconnue'),
          ganttRow(3, 'Mission 4', 300, 200, 'none', 'Disponible le 3 déc.'),
        ]),
      ],
    ),
}

export const CHARTS = {
  KpiTile: kpiTile,
  Stat: stat,
  Delta: delta,
  Sparkline: sparkline,
  BarChart: barChart,
  StackedBar: stackedBar,
  WaterfallChart: waterfallChart,
  Donut: donut,
  Heatmap: heatmap,
  CohortGrid: cohortGrid,
  SegmentBar: segmentBar,
  Gantt: gantt,
} satisfies Record<string, Recipe>
