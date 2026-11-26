import { b, type BoxPart, dot, i, type Part, type Recipe, t } from '../recipe'

/**
 * Contrôles relevés comme MANQUANTS par les lots de pages :
 * - `RadioGroup` — les radios natifs de `apps/web/src/features/memory/view/MemoryScopeChoice.tsx`
 *   (même motif dans NotificationsView, WorkspaceRulesView, ContextModePicker…) ;
 * - `Stepper` — le rail d'étapes de `apps/web/src/features/onboarding/components/OnboardingStepper.tsx` ;
 * - `BrailleLoader` — `packages/ui/src/loaders/braille-loader.tsx`.
 */

// ─── RadioGroup ────────────────────────────────────────────────────────────

const radioGroup: Recipe = {
  family: 'Formulaires',
  usage:
    'Choisir UNE option parmi 2 à 5, toutes visibles (au-delà : Select). Chaque option est une étiquette de 44 px qui se clique entière ; l’option cochée est bordée d’accent.',
  stretch: true,
  notes: [
    'Radio natif `accent-[var(--bellum-primary-500)]` : le rond est dessiné par le navigateur, rendu ici en cercle bordé + point.',
    'Libellés `text-xs` (12 px) dans le code.',
  ],
  draw: v => {
    const disabled = v.state === 'disabled'
    const option = (label: string, k: number): BoxPart => {
      const checked = k === 0
      return b(
        `item/${k + 1}`,
        {
          direction: 'row',
          gap: 8,
          padX: 12,
          minHeight: 44,
          radius: 'shadcn',
          align: 'center',
          stroke: checked ? 'primary/500' : 'border/default',
          fill: checked ? 'surface/2' : undefined,
        },
        [
          b(
            'radio',
            {
              direction: 'row',
              width: 16,
              height: 16,
              radius: 'full',
              stroke: checked ? 'primary/500' : 'border/strong',
              align: 'center',
              justify: 'center',
            },
            [dot('checked', 8, 'primary/500', { hidden: !checked })],
          ),
          t('label', label, { size: 12, color: checked ? 'text/primary' : 'text/secondary' }),
        ],
      )
    }
    return b(
      'RadioGroup',
      { direction: 'column', gap: 6, align: 'stretch', width: 480, opacity: disabled ? 0.5 : undefined },
      [
        t('legend', 'Légende du choix', { size: 12, weight: 500, color: 'text/secondary' }, { prop: 'legend' }),
        b('options', { direction: 'row', gap: 8, wrap: true }, ['Option 1', 'Option 2', 'Option 3'].map(option), {
          fillWidth: true,
        }),
        t('hint', 'Ce que l’option choisie implique.', { size: 12, color: 'text/muted' }, { prop: 'hint' }),
      ],
    )
  },
}

// ─── Stepper ───────────────────────────────────────────────────────────────

/** Une icône métier par étape (les sept étapes nommées de l'onboarding). */
const STEP_ICONS = ['building-2', 'user-round', 'compass', 'trending-up', 'settings-2', 'flag', 'clipboard-check']
const STEP_LABELS = ['Ton ESN', 'Ton rôle', 'Ton offre', 'Ton marché', 'Tes outils', 'Tes objectifs', 'Ton audit']
/** L'état d'une étape se lit sur les réponses (#2023.1) : 2 faites, 1 en cours, le reste non commencé. */
const ACTIVE = 2

const stepper: Recipe = {
  family: 'Navigation',
  usage:
    'Où l’on en est dans un parcours (`wizard`, slot `progress`) : chaque étape NOMMÉE, faite (coche), en cours (bordée d’accent) ou non commencée. En ligne qui passe à la ligne sous 768 px, en colonne au-dessus.',
  stretch: v => v.orientation !== 'vertical',
  notes: [
    'Une seule logique à toutes les largeurs (#2021.7) : `flex-wrap` en mobile, `md:block` en bureau — deux variantes d’orientation.',
    'L’état d’une étape vient des RÉPONSES enregistrées, jamais de sa position (#2023.1) : la maquette montre 2 faites, 1 en cours.',
  ],
  draw: v => {
    const vertical = v.orientation === 'vertical'
    const step = (label: string, k: number): BoxPart => {
      const done = k < ACTIVE
      const active = k === ACTIVE
      const badge: Part = b(
        'badge',
        {
          direction: 'row',
          width: 20,
          height: 20,
          radius: 'full',
          align: 'center',
          justify: 'center',
          fill: done ? 'primary/500' : undefined,
          stroke: done || active ? 'primary/500' : 'border/default',
        },
        done
          ? [i('check', 14, 'on/primary')]
          : [t('number', String(k + 1), { size: 12, color: active ? 'text/accent' : 'text/muted' })],
      )
      return b(`item/${k + 1}`, { direction: 'row', gap: vertical ? 12 : 8, align: 'center' }, [
        badge,
        i(STEP_ICONS[k] ?? 'flag', 16, active ? 'text/accent' : 'text/muted', { name: 'step-icon' }),
        t('label', label, { size: 14, color: active ? 'text/primary' : 'text/muted' }),
      ])
    }
    return b(
      'Stepper',
      vertical
        ? { direction: 'column', gap: 16, padTop: 16, align: 'start' }
        : { direction: 'row', gap: 16, padTop: 16, align: 'center', wrap: true, width: 640 },
      STEP_LABELS.map(step),
      {},
    )
  },
}

// ─── BrailleLoader ─────────────────────────────────────────────────────────

/** La première image NON VIDE de chaque animation texte (`BRAILLE_FRAMES`). */
const TEXT_FRAME: Record<string, string> = { orbit: '⠋', breathe: '⠁', snake: '⠁', pulse: '⠁', wave: '⠁' }
/** La première image non vide de chaque grille 5 × 5 (`GRID_FRAMES`) : les points allumés. */
const DIAGONAL = [0]
const GRID_FRAME: Record<string, readonly number[]> = {
  grid: DIAGONAL,
  'grid-diagonal': DIAGONAL,
  'grid-importing': [0, 4, 20, 24, 2, 6, 8, 10, 14, 16, 18, 22, 12],
  'grid-syncing': [22, 17, 12, 7, 11, 13],
  'grid-searching': [1, 5, 7, 6, 11],
  'grid-spiral': [0, 1],
  'grid-columns': [0, 5, 10, 15, 20],
  'grid-orbit': [0],
  'grid-breathe': [12],
  'grid-snake': [0],
  'grid-pulse': [12],
  'grid-wave': [0, 1, 2, 3, 4],
}

const brailleLoader: Recipe = {
  family: 'Retours',
  usage:
    'Attente courte et discrète en ligne (Laura qui réfléchit, un import qui tourne). Pour un contenu de page : Skeleton ; dans un bouton : Spinner.',
  notes: [
    'Animé dans le code (80 ms par image en texte, 120 ms en grille) : la maquette montre la première image non vide.',
    'Couleur `currentColor` (celle du parent) : rendue text/primary ; point éteint à 20 % d’opacité.',
    'Grille : `dotSize` 2 px, `dotGap` 1 px par défaut (props).',
    'Variante texte : glyphes braille Unicode en police mono — Geist Mono peut ne pas les porter (Figma substitue).',
  ],
  draw: v => {
    const variant = v.variant ?? 'orbit'
    const frame = GRID_FRAME[variant]
    if (!frame) {
      return b('BrailleLoader', { direction: 'row' }, [
        t('glyph', TEXT_FRAME[variant] ?? '⠋', { size: 14, mono: true, color: 'text/primary' }),
      ])
    }
    const lit = new Set(frame)
    return b(
      'BrailleLoader',
      { direction: 'column', gap: 1 },
      Array.from({ length: 5 }, (_, r) =>
        b(
          `row/${r + 1}`,
          { direction: 'row', gap: 1 },
          Array.from({ length: 5 }, (_, c) =>
            dot(`dot/${r * 5 + c + 1}`, 2, 'text/primary', { fillOpacity: lit.has(r * 5 + c) ? 1 : 0.2 }),
          ),
        ),
      ),
    )
  },
}

export const CONTROLS = {
  RadioGroup: radioGroup,
  Stepper: stepper,
  BrailleLoader: brailleLoader,
} satisfies Record<string, Recipe>
