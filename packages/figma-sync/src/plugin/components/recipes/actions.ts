import type { BoxStyle } from '../../scene'
import { b, i, ref, type Recipe, t, type Values } from '../recipe'

/**
 * Famille « Actions » — lue dans packages/ui/src/components/button.tsx
 * (cva : 9 variantes × 6 tailles), dropdown-menu.tsx, molecules/copy-field.tsx.
 */

type Look = {
  fill?: string
  stroke?: string
  text: string
  hoverFill?: string
  hoverStroke?: string
  hoverOpacity?: number
}

/** Les couleurs par variante (bg-[var(--…)] du cva). `text-foreground` (shadcn) → text/primary. */
const BUTTON_LOOK: Record<string, Look> = {
  default: { fill: 'primary/500', text: 'on/primary', hoverFill: 'primary/600' },
  // bg-black / dark:bg-white : aucun token — text/primary est noir en clair et blanc en sombre, comme le code.
  black: { fill: 'text/primary', stroke: 'text/primary', text: 'bg/default', hoverOpacity: 0.88 },
  light: { fill: 'bg/lighter', stroke: 'border/default', text: 'text/primary', hoverFill: 'surface/2' },
  destructive: { fill: 'semantic/danger', text: 'on/primary', hoverOpacity: 0.85 },
  outline: { stroke: 'border/default', text: 'text/primary', hoverFill: 'surface/2', hoverStroke: 'text/muted' },
  secondary: { fill: 'surface/2', text: 'text/primary', hoverFill: 'border/default', hoverStroke: 'border/default' },
  ghost: { text: 'text/primary', hoverFill: 'surface/2' },
  link: { text: 'primary/500' },
  violet: { fill: 'primary/500', text: 'on/primary', hoverFill: 'primary/600' },
}

/** h-* px-* gap-* du cva `size` ; `icon` = size-9 carré, sans libellé. */
const BUTTON_SIZE: Record<string, { h: number; px: number; gap: number }> = {
  default: { h: 36, px: 16, gap: 8 },
  xs: { h: 28, px: 8, gap: 8 },
  sm: { h: 32, px: 12, gap: 6 },
  lg: { h: 40, px: 24, gap: 8 },
  xl: { h: 48, px: 32, gap: 8 },
  icon: { h: 36, px: 0, gap: 0 },
}

function buttonStyle(v: Values): BoxStyle {
  const look = BUTTON_LOOK[v.variant ?? 'default'] ?? (BUTTON_LOOK.default as Look)
  const size = BUTTON_SIZE[v.size ?? 'default'] ?? (BUTTON_SIZE.default as { h: number; px: number; gap: number })
  const hover = v.state === 'hover'
  // Le lien de texte est posé `h-auto p-0` par ses appelants (button.tsx, compoundVariants) : aligné sur le
  // texte voisin, à hauteur de ligne — défaut G du 25/09/2026, « Demander à Laura… » indenté sous le titre.
  const link = v.variant === 'link' && v.size !== 'icon'
  const style: BoxStyle = {
    direction: 'row',
    height: link ? undefined : size.h,
    width: v.size === 'icon' ? size.h : undefined,
    padX: link ? 0 : size.px,
    gap: size.gap,
    // rounded-md = calc(var(--radius) - 2px) = 8 px : variable Radius `rounded-md` (extraite du tailwind.config).
    radius: 'rounded-md',
    align: 'center',
    justify: 'center',
    fill: (hover && look.hoverFill) || look.fill,
    fillOpacity: hover && look.hoverOpacity ? look.hoverOpacity : undefined,
    stroke: (hover && look.hoverStroke) || look.stroke,
  }
  if (v.state === 'focus') {
    style.ring = 'focus/ring'
    style.ringWidth = 3
  }
  if (v.state === 'disabled') style.opacity = 0.5
  return style
}

const button: Recipe = {
  family: 'Actions',
  usage:
    'Toute action : `default` pour l’action principale (une par zone), `outline`/`secondary`/`ghost` pour les secondaires, `destructive` pour supprimer, `link` dans une phrase. `icon` = carré sans libellé (nommer l’icône, GA-32).',
  touch: v =>
    v.variant === 'link' || v.size === 'xl' ? null : { minHeight: 44, ...(v.size === 'icon' ? { minWidth: 44 } : {}) },
  notes: [
    '`black` : bg-black / dark:bg-white sans token — rendu par text/primary (fond) et bg/default (texte), qui s’inversent pareil entre les thèmes.',
    'Survol de `black` et `destructive` : color-mix() dans le code, rendu par une opacité (0,88 / 0,85).',
    'Rayon `rounded-md` = calc(var(--radius) - 2px) = 8 px : variable Radius `rounded-md`.',
    '`shadow-xs` n’existe pas en Tailwind 3.4 (syntaxe v4) : la classe ne génère aucune CSS, le code n’affiche aucune ombre — la maquette non plus.',
    'Focus : `ring-ring/50` 3 px rendu en contour extérieur focus/ring.',
  ],
  draw: v => {
    const look = BUTTON_LOOK[v.variant ?? 'default'] ?? (BUTTON_LOOK.default as Look)
    const color = v.state === 'hover' && v.variant === 'link' ? 'primary/600' : look.text
    const iconOnly = v.size === 'icon'
    const loading = v.state === 'loading'
    return b('Button', buttonStyle(v), [
      // <Spinner size={16}> de button.tsx : le tracé lucide loader-circle à 16 px, couleur du libellé.
      ...(loading ? [i('loader-circle', 16, color, { name: 'spinner' })] : []),
      i('plus', 16, color, { name: 'icon', prop: 'icon', toggle: 'show icon', hidden: !iconOnly || loading }),
      t(
        'label',
        'Libellé',
        { size: 14, weight: 500, color, underline: v.variant === 'link' && v.state === 'hover' },
        {
          prop: 'label',
          hidden: iconOnly,
        },
      ),
    ])
  },
}

const dropdownMenu: Recipe = {
  family: 'Actions',
  usage:
    'Menu d’actions secondaires ouvert depuis un bouton (« … », « Plus »). Au-delà de 7 entrées, préférer une page ou une recherche.',
  notes: [
    'bg-popover (shadcn) = miroir de --bellum-sidebar dans les deux thèmes → sidebar/default.',
    'Liste ouverte : `shadow-md` → style d’effet shadow/md (thème Tailwind installé).',
  ],
  draw: () =>
    b('DropdownMenu', { direction: 'column', gap: 4, align: 'start' }, [
      ref('Button', { variant: 'outline', size: 'sm' }, { label: 'Actions' }, { name: 'trigger' }),
      b(
        'content',
        {
          direction: 'column',
          padX: 4,
          padY: 4,
          fill: 'sidebar/default',
          stroke: 'border/default',
          radius: 'shadcn',
          shadow: 'md',
          align: 'stretch',
          minWidth: 128,
        },
        [1, 2, 3, 4, 5, 6, 7].map(n =>
          b(
            `item/${n}`,
            {
              direction: 'row',
              padX: 8,
              padY: 6,
              gap: 8,
              radius: 'shadcn',
              fill: n === 1 ? 'legacy/bg-glass' : undefined,
            },
            [t('label', `Action ${n}`, { size: 14, color: 'text/primary' })],
            { hidden: n > 4 },
          ),
        ),
        { fillWidth: true },
      ),
    ]),
}

const copyField: Recipe = {
  family: 'Actions',
  usage: 'Une valeur à copier (clé, lien d’invitation) : champ en lecture seule + bouton Copier.',
  touch: () => ({ minHeight: 44 }),
  notes: [
    'Texte en police mono 12 px (font-mono text-xs) : pas de style de texte à cette taille, taille brute.',
    'Champ `flex-1` (copy-field.tsx:39) : il prend la place restante, la valeur se coupe « … ».',
  ],
  stretch: true,
  draw: () =>
    b('CopyField', { direction: 'column', gap: 6, align: 'stretch', width: 360 }, [
      t('label', 'Libellé', { size: 14, weight: 500, color: 'text/primary' }, { prop: 'label' }),
      b(
        'row',
        { direction: 'row', gap: 8, align: 'center' },
        [
          b(
            'field',
            { direction: 'row', height: 40, padX: 12, radius: 'shadcn', fill: 'surface/2', stroke: 'border/default' },
            [
              t(
                'value',
                'valeur-a-copier',
                { size: 12, mono: true, color: 'text/primary' },
                { prop: 'value', truncate: 1 },
              ),
            ],
            { grow: true },
          ),
          ref('Button', { variant: 'outline', size: 'icon' }, {}, { name: 'copy' }),
        ],
        { fillWidth: true },
      ),
    ]),
}

export const ACTIONS = { Button: button, DropdownMenu: dropdownMenu, CopyField: copyField }
