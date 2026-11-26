import type { BoxStyle } from '../../scene'
import { b, dot, i, type Part, rect, type Recipe, t, type Values } from '../recipe'

/** Plancher tactile en pointeur grossier (GA-30/32). */
const TOUCH = 44

/**
 * La ZONE TACTILE d'un contrôle plus petit que 44 px : un carré de 44 × 44 centré sur lui, hors du
 * flux et invisible — le contrôle visible ne change pas, seule la zone qu'un doigt atteint grandit
 * (le `pointer-coarse:after:-inset-*` du code). Propriété « zone tactile » pour la montrer en pointillés.
 */
const touchTarget = (visible: number): Part =>
  b('touch-target', { direction: 'row', width: TOUCH, height: TOUCH, stroke: 'guide/halo', dashed: true }, [], {
    absolute: true,
    at: { x: (visible - TOUCH) / 2, y: (visible - TOUCH) / 2 },
    hidden: true,
    toggle: 'zone tactile',
  })

/**
 * Famille « Formulaires » — lue dans packages/ui/src/components/{input,
 * password-field,textarea,checkbox,switch,slider,input-otp}.tsx et
 * molecules/{select-field,search-input,filter-bar,filter-chips}.tsx.
 */

const FIELD_W = 320

/** L'état d'un champ : bordure, anneau, opacité. `error` n'a AUCUNE classe dans input/textarea/select : rendu soft/danger. */
function fieldState(v: Values, base: BoxStyle): BoxStyle {
  const s = { ...base }
  if (v.state === 'focus') {
    s.ring = 'primary/500'
    s.ringWidth = 2
  }
  if (v.state === 'disabled') s.opacity = 0.5
  if (v.state === 'error') s.stroke = 'soft/danger/border'
  return s
}

const errorNote =
  'état `error` : aucune classe aria-invalid dans le fichier — la maquette pose la bordure soft/danger/border, le code ne la pose pas encore.'
const focusNote =
  'focus `ring-ring` (shadcn) = primary/500 dans les deux thèmes, pas focus/ring (primary/300 en sombre).'

const label = (text = 'Libellé') =>
  t('label', text, { size: 14, weight: 500, color: 'text/primary' }, { prop: 'label' })
const errorText = (v: Values) =>
  t('error', 'Message d’erreur', { size: 14, color: 'soft/danger/text' }, { hidden: v.state !== 'error' })

const input: Recipe = {
  family: 'Formulaires',
  usage:
    'Saisie d’une ligne de texte, toujours précédée de son libellé. Largeur : celle du formulaire (w-full dans le code).',
  stretch: true,
  notes: [errorNote, focusNote, 'Largeur 320 px représentative : le code est w-full.'],
  draw: v =>
    b('Input', { direction: 'column', gap: 6, align: 'stretch', width: FIELD_W }, [
      label(),
      b(
        'field',
        fieldState(v, {
          direction: 'row',
          height: 40,
          padX: 12,
          padY: 8,
          radius: 'shadcn',
          fill: 'bg/default',
          stroke: 'border/default',
        }),
        [
          t(
            'placeholder',
            'Texte indicatif',
            { size: 14, color: 'text/secondary' },
            { prop: 'placeholder', grow: true },
          ),
          t('value', '', { size: 14, color: 'text/primary' }, { prop: 'value', hidden: true }),
        ],
        { fillWidth: true },
      ),
      errorText(v),
    ]),
}

const passwordField: Recipe = {
  family: 'Formulaires',
  usage: 'Mot de passe : champ masqué + bouton œil pour l’afficher. Message d’erreur sous le champ.',
  stretch: true,
  notes: [
    'Bouton œil 28 × 28 (h-7 w-7), zone tactile de 44 × 44 centrée dessus (partie `touch-target`, invisible ; propriété « zone tactile »). Écart : password-field.tsx:44 n’a pas de pointer-coarse — à porter à `pointer-coarse:after:-inset-2`.',
    'Seul le MESSAGE porte l’état `error` dans le code, pas le champ.',
  ],
  draw: v =>
    b('PasswordField', { direction: 'column', gap: 8, align: 'stretch', width: FIELD_W }, [
      label('Mot de passe'),
      b(
        'field',
        fieldState(v, {
          direction: 'row',
          height: 40,
          padX: 12,
          radius: 'shadcn',
          fill: 'bg/default',
          stroke: 'border/default',
          justify: 'between',
        }),
        [
          t('value', '••••••••', { size: 14, color: 'text/primary' }, { prop: 'value' }),
          b(
            'toggle',
            {
              direction: 'row',
              width: 28,
              height: 28,
              radius: 'rounded-md',
              align: 'center',
              justify: 'center',
              clip: false,
            },
            // GA-30/32 — bouton œil de 28 px : zone tactile de 44 px en pointeur grossier, visible inchangé.
            [i('eye', 16, 'text/muted'), touchTarget(28)],
          ),
        ],
        { fillWidth: true },
      ),
      errorText(v),
    ]),
}

const textarea: Recipe = {
  family: 'Formulaires',
  usage: 'Texte sur plusieurs lignes (note, message). Hauteur minimale 80 px.',
  stretch: true,
  notes: [
    errorNote,
    focusNote,
    'Rayon `rounded-md` (8 px) alors que l’Input est `rounded-lg` (10 px) : écart interne au design system.',
  ],
  draw: v =>
    b('Textarea', { direction: 'column', gap: 6, align: 'stretch', width: FIELD_W }, [
      label(),
      b(
        'field',
        fieldState(v, {
          direction: 'column',
          minHeight: 80,
          padX: 12,
          padY: 8,
          radius: 'rounded-md',
          fill: 'bg/default',
          stroke: 'border/default',
          align: 'start',
        }),
        [
          t('placeholder', 'Texte indicatif', { size: 14, color: 'text/secondary' }, { prop: 'placeholder' }),
          t('value', '', { size: 14, color: 'text/primary' }, { prop: 'value', hidden: true }),
        ],
        { fillWidth: true },
      ),
      errorText(v),
    ]),
}

const select: Recipe = {
  family: 'Formulaires',
  usage: 'Choix d’UNE valeur dans une liste fermée (≤ 15 options ; au-delà, une recherche).',
  stretch: true,
  notes: [errorNote, 'Liste ouverte (SelectContent) : rounded-xl 12 px (variable `rounded-xl`).'],
  draw: v =>
    b('Select', { direction: 'column', gap: 6, align: 'stretch', width: FIELD_W }, [
      label(),
      b(
        'trigger',
        fieldState(v, {
          direction: 'row',
          height: v.size === 'sm' ? 36 : 40,
          padX: 12,
          padY: 8,
          radius: 'shadcn',
          fill: v.state === 'focus' ? 'bg/lighter' : 'bg/default',
          stroke: 'border/default',
          justify: 'between',
        }),
        [
          t('placeholder', 'Choisir…', { size: 14, color: 'text/secondary' }, { prop: 'placeholder' }),
          t('value', '', { size: 14, color: 'text/primary' }, { prop: 'value', hidden: true }),
          i('chevron-down', 16, 'text/muted'),
        ],
        { fillWidth: true },
      ),
      errorText(v),
      ...[1, 2, 3, 4, 5, 6].map(n =>
        b(
          `item/${n}`,
          { direction: 'row', padX: 8, padY: 8 },
          [t('label', `Option ${n}`, { size: 14, color: 'text/secondary' })],
          { hidden: true },
        ),
      ),
    ]),
}

const checkbox: Recipe = {
  family: 'Formulaires',
  usage:
    'Choix booléen dans un formulaire ou une liste (sélection multiple). Pour un réglage appliqué tout de suite : Switch.',
  notes: [
    'Rayon `rounded` = 4 px brut (hors échelle des tokens).',
    '`indeterminate` : pas de classe dédiée dans le code — la maquette montre un tiret, le code le rendu `checked`.',
    'Zone tactile de 44 × 44 centrée sur la case (partie `touch-target`, invisible ; propriété « zone tactile » pour la montrer). Écart : le code l’élargit par un pseudo-élément (after:-inset-x-3 -inset-y-2 ≈ 40 × 32), sous 44 px (GA-32) — à porter à `pointer-coarse:after:-inset-3.5`.',
  ],
  touch: () => ({ minHeight: 44 }),
  draw: v => {
    const on = v.checked !== 'unchecked'
    const box: BoxStyle = {
      direction: 'row',
      width: 16,
      height: 16,
      radius: 4,
      align: 'center',
      justify: 'center',
      fill: on ? 'primary/400' : 'bg/default',
      stroke: on ? 'primary/400' : 'border/default',
    }
    if (v.state === 'focus') {
      box.ring = 'primary/500'
      box.ringWidth = 2
    }
    return b(
      'Checkbox',
      { direction: 'row', gap: 8, align: 'center', opacity: v.state === 'disabled' ? 0.5 : undefined },
      [
        b('box', { ...box, clip: false }, [
          ...(v.checked === 'checked' ? [i('check', 14, 'on/primary')] : []),
          ...(v.checked === 'indeterminate' ? [i('minus', 14, 'on/primary')] : []),
          // GA-30/32 — case de 16 px : zone tactile de 44 px en pointeur grossier, visible inchangé.
          touchTarget(16),
        ]),
        t('label', 'Libellé', { size: 14, color: 'text/primary' }, { prop: 'label' }),
      ],
    )
  },
}

const switchRecipe: Recipe = {
  family: 'Formulaires',
  usage: 'Réglage activé/désactivé, appliqué immédiatement (sans bouton Enregistrer).',
  notes: [
    'Pouce `bg-white` littéral : rendu on/primary (#fff dans les deux thèmes).',
    'Cible tactile par pseudo-élément, sans plancher 44 px — écart GA-32.',
  ],
  draw: v => {
    const sm = v.size === 'sm'
    const on = v.checked === 'on'
    const track: BoxStyle = {
      direction: 'row',
      width: sm ? 24 : 34,
      height: sm ? 14 : 20,
      radius: 'full',
      padX: 2,
      align: 'center',
      justify: on ? 'end' : 'start',
      fill: on ? 'primary/500' : 'border/default',
    }
    if (v.state === 'focus') {
      track.ring = 'focus/ring'
      track.ringWidth = 3
    }
    return b(
      'Switch',
      { direction: 'row', gap: 8, align: 'center', opacity: v.state === 'disabled' ? 0.5 : undefined },
      [
        b('track', track, [dot('thumb', sm ? 10 : 14, 'on/primary')]),
        t('label', 'Libellé', { size: 14, color: 'text/primary' }, { prop: 'label' }),
      ],
    )
  },
}

const slider: Recipe = {
  family: 'Formulaires',
  usage: 'Choisir une valeur dans un intervalle continu (seuil, budget). Toujours afficher la valeur choisie.',
  stretch: true,
  draw: v =>
    b(
      'Slider',
      {
        direction: 'column',
        gap: 8,
        align: 'stretch',
        width: FIELD_W,
        opacity: v.state === 'disabled' ? 0.5 : undefined,
      },
      [
        b(
          'head',
          { direction: 'row', justify: 'between' },
          [label(), t('value', '50', { size: 14, color: 'text/secondary' }, { prop: 'value' })],
          { fillWidth: true },
        ),
        b(
          'track',
          { direction: 'row', height: 16, align: 'center' },
          [
            rect('range', 160, 6, { fill: 'primary/500', radius: 'full' }),
            b('thumb', {
              direction: 'row',
              width: 16,
              height: 16,
              radius: 'full',
              fill: 'bg/default',
              stroke: 'primary/500',
            }),
            rect('rest', 140, 6, { fill: 'surface/2', radius: 'full', grow: true }),
          ],
          { fillWidth: true },
        ),
      ],
    ),
}

const inputOtp: Recipe = {
  family: 'Formulaires',
  usage: 'Code à usage unique (6 chiffres) : cases contiguës, bordures partagées.',
  notes: [errorNote],
  draw: v => {
    const cell = (n: number) =>
      b(
        `slot/${n}`,
        fieldState(v, {
          direction: 'row',
          width: 36,
          height: 36,
          align: 'center',
          justify: 'center',
          stroke: 'border/default',
          // first:rounded-l-md / last:rounded-r-md : les quatre coins en maquette (rayon par coin non géré).
          radius: n === 1 || n === 3 ? 'rounded-md' : 0,
        }),
        [t('digit', n === 1 ? '4' : '', { size: 14, color: 'text/primary' }, n === 1 ? { prop: 'value' } : {})],
      )
    return b(
      'InputOTP',
      { direction: 'row', gap: 8, align: 'center', opacity: v.state === 'disabled' ? 0.5 : undefined },
      [
        b('group/1', { direction: 'row' }, [1, 2, 3].map(cell)),
        i('minus', 16, 'text/muted', { name: 'separator' }),
        b(
          'group/2',
          { direction: 'row' },
          [1, 2, 3].map(n => cell(n + 3)),
        ),
      ],
    )
  },
}

const searchInput: Recipe = {
  family: 'Formulaires',
  usage:
    'Recherche dans la liste affichée : `sm` dans une barre d’outils (192 → 256 px), `md` en tête de page (pleine largeur).',
  // `md` = `w-full` (search-input.tsx:56) ; `sm` garde sa largeur.
  stretch: v => v.size !== 'sm',
  draw: v => {
    const sm = v.size === 'sm'
    return b(
      'SearchInput',
      {
        direction: 'row',
        height: sm ? 36 : 48,
        width: sm ? 256 : 480,
        padX: 12,
        gap: sm ? 8 : 12,
        radius: 'shadcn',
        fill: 'bg/default',
        stroke: 'border/default',
      },
      [
        i('search', sm ? 16 : 20, 'text/muted'),
        t('placeholder', 'Rechercher…', { size: 14, color: 'text/secondary' }, { prop: 'placeholder', grow: true }),
        t('value', '', { size: 14, color: 'text/primary' }, { prop: 'value', hidden: true }),
      ],
    )
  },
}

const filterBar: Recipe = {
  family: 'Formulaires',
  usage:
    'Ajouter des filtres à une liste : un bouton « Filtre » ouvre un menu par critère ; les filtres actifs s’affichent en pastilles.',
  notes: ['Bordure réelle `--border-subtle` = color-mix(border 60 %) : rendue border/default.'],
  draw: () =>
    b('FilterBar', { direction: 'row', gap: 6, align: 'center', wrap: true }, [
      b(
        'trigger',
        {
          direction: 'row',
          height: 32,
          padX: 10,
          gap: 6,
          radius: 'shadcn',
          fill: 'legacy/bg-elevated',
          stroke: 'border/default',
        },
        [
          i('list-filter', 16, 'legacy/text-secondary'),
          t('placeholder', 'Filtre', { size: 14, color: 'legacy/text-secondary' }, { prop: 'placeholder' }),
        ],
      ),
      ...[1, 2, 3, 4, 5, 6].map(n =>
        b(
          `item/${n}`,
          {
            direction: 'row',
            height: 32,
            padX: 10,
            gap: 6,
            radius: 'shadcn',
            fill: 'legacy/bg-elevated',
            stroke: 'border/default',
          },
          [
            t('label', `Critère ${n}`, { size: 14, color: 'legacy/text-secondary' }),
            i('chevron-down', 14, 'text/muted'),
          ],
          { hidden: n > 3 },
        ),
      ),
    ]),
}

const filterChips: Recipe = {
  family: 'Formulaires',
  usage: 'Filtres rapides en pastilles (un clic = actif). Même grammaire que TabNav `pill` (chip-style.ts, GA-26).',
  touch: () => ({ minHeight: 44 }),
  draw: v => {
    const sm = v.size === 'sm'
    return b(
      'FilterChips',
      { direction: 'row', gap: 6, align: 'center', wrap: true },
      [1, 2, 3, 4, 5, 6].map(n => {
        const active = n === 1
        return b(
          `item/${n}`,
          {
            direction: 'row',
            height: sm ? 28 : 32,
            padX: sm ? 10 : 12,
            gap: sm ? 6 : 8,
            radius: 'shadcn',
            fill: active ? 'primary/500' : 'chip/rest',
          },
          [
            t('label', `Filtre ${n}`, {
              size: sm ? 12 : 14,
              weight: 500,
              color: active ? 'on/primary' : 'chip/rest-text',
            }),
          ],
          { hidden: n > 3 },
        )
      }),
    )
  },
}

export const FORMS = {
  Input: input,
  PasswordField: passwordField,
  Textarea: textarea,
  Select: select,
  Checkbox: checkbox,
  Switch: switchRecipe,
  Slider: slider,
  InputOTP: inputOtp,
  SearchInput: searchInput,
  FilterBar: filterBar,
  FilterChips: filterChips,
}
