import { b, i, rect, ref, type Recipe, t } from '../recipe'
import type { BoxPart } from '../recipe'

/**
 * Famille « Surfaces » — packages/ui/src/components/{card,separator,dialog,
 * confirmation-dialog,sheet,popover}.tsx, molecules/{section-card,settings-group,
 * settings-row,danger-zone}.tsx. Un conteneur porte un cadre `content` : c'est
 * là que le rendu de page pose ses enfants.
 */

const content = (label = 'Contenu'): BoxPart =>
  b(
    'content',
    { direction: 'column', gap: 12, align: 'stretch' },
    [t('placeholder', label, { size: 14, color: 'text/muted' })],
    {
      fillWidth: true,
    },
  )

const card: Recipe = {
  family: 'Surfaces',
  usage: 'Regrouper un contenu autonome (un bloc d’information, un formulaire court). Pas de carte dans une carte.',
  stretch: true,
  notes: [
    '`bg-card` / `ring-1 ring-border` (shadcn) : rendus surface/1 et border/default.',
    'Rayon rounded-xl = 12 px (défaut Tailwind 3.4, variable `rounded-xl`) ; espacement --card-spacing = 16 px (12 en `sm`).',
    'Décision de maquette : titre coupé à 1 ligne, description à 2 (« … ») — une carte étroite ne pousse plus sa colonne. Écart : card.tsx laisse passer à la ligne sans limite (à reporter en `truncate` / `line-clamp-2`).',
  ],
  draw: () =>
    b(
      'Card',
      {
        direction: 'column',
        gap: 16,
        padY: 16,
        radius: 'rounded-xl',
        fill: 'surface/1',
        stroke: 'border/default',
        align: 'stretch',
        width: 400,
        clip: true,
      },
      [
        b(
          'header',
          { direction: 'column', gap: 4, padX: 16, align: 'start' },
          [
            t(
              'title',
              'Titre de la carte',
              { size: 16, weight: 600, color: 'text/primary' },
              { prop: 'title', truncate: 1 },
            ),
            t(
              'description',
              'Une phrase de description.',
              { size: 14, color: 'text/secondary', maxChars: 70 },
              { prop: 'description', truncate: 2 },
            ),
          ],
          { fillWidth: true },
        ),
        b('body', { direction: 'column', padX: 16, align: 'stretch' }, [content()], { fillWidth: true }),
      ],
    ),
}

const sectionCard: Recipe = {
  family: 'Surfaces',
  usage: 'Une section titrée d’une page (fiche, tableau de bord) : entête séparé par un trait, puis le contenu.',
  stretch: true,
  notes: [
    'Décision de maquette : titre coupé à 1 ligne, description à 2 (« … »). Écart : section-card.tsx laisse passer à la ligne sans limite.',
  ],
  draw: () =>
    b(
      'SectionCard',
      {
        direction: 'column',
        radius: 'shadcn',
        fill: 'surface/1',
        stroke: 'border/default',
        align: 'stretch',
        width: 400,
        clip: true,
      },
      [
        b(
          'header',
          {
            direction: 'column',
            gap: 4,
            padX: 16,
            padY: 12,
            stroke: 'border/default',
            strokeSide: 'bottom',
            align: 'start',
          },
          [
            t(
              'title',
              'Titre de section',
              { size: 14, weight: 600, color: 'text/primary' },
              { prop: 'title', truncate: 1 },
            ),
            t(
              'description',
              'Description',
              { size: 12, color: 'text/muted', maxChars: 70 },
              { prop: 'description', toggle: 'show description', truncate: 2 },
            ),
          ],
          { fillWidth: true },
        ),
        b('body', { direction: 'column', padX: 16, padY: 16, align: 'stretch' }, [content()], { fillWidth: true }),
      ],
    ),
}

const settingsGroup: Recipe = {
  family: 'Surfaces',
  usage: 'Un groupe de réglages (titre + lignes SettingsRow). `danger` pour les actions irréversibles.',
  stretch: true,
  draw: v => {
    const danger = v.tone === 'danger'
    return b('SettingsGroup', { direction: 'column', gap: 12, align: 'stretch', width: 640 }, [
      b('header', { direction: 'column', gap: 4, align: 'start' }, [
        t(
          'title',
          'Titre du groupe',
          { size: 14, weight: 500, color: danger ? 'soft/danger/text' : 'text/primary' },
          { prop: 'title' },
        ),
        t('description', 'Ce que ces réglages changent.', { style: 'body', maxChars: 70 }, { prop: 'description' }),
      ]),
      b(
        'rows',
        {
          direction: 'column',
          radius: 'rounded-xl',
          fill: danger ? 'soft/danger/bg' : 'surface/1',
          stroke: danger ? 'soft/danger/border' : 'border/default',
          align: 'stretch',
        },
        [content('Lignes de réglage')],
        { fillWidth: true },
      ),
    ])
  },
}

const settingsRow: Recipe = {
  family: 'Surfaces',
  usage:
    'Un réglage : libellé et description à gauche, contrôle (Switch, Select, Button) à droite. Un réglage vit à UN endroit (GA-26).',
  stretch: true,
  draw: () =>
    b(
      'SettingsRow',
      {
        direction: 'row',
        gap: 16,
        padX: 16,
        padY: 16,
        justify: 'between',
        stroke: 'border/default',
        strokeSide: 'bottom',
        width: 640,
        wrap: true,
      },
      [
        b(
          'text',
          { direction: 'column', gap: 4, align: 'start' },
          [
            t('label', 'Réglage', { size: 14, weight: 500, color: 'text/primary' }, { prop: 'label' }),
            t(
              'description',
              'Ce que fait ce réglage.',
              { size: 14, color: 'text/secondary', maxChars: 70 },
              { prop: 'description' },
            ),
            t('value', '', { size: 14, color: 'text/secondary' }, { prop: 'value', hidden: true }),
          ],
          { grow: true },
        ),
        b('content', { direction: 'row', gap: 8, align: 'center' }, [
          ref('Switch', { checked: 'on' }, {}, { name: 'control' }),
        ]),
      ],
    ),
}

const dangerZone: Recipe = {
  family: 'Surfaces',
  usage:
    'Zone des actions irréversibles (supprimer l’espace, effacer une personne — RGPD). Toujours en bas de page, confirmée par ConfirmationDialog.',
  stretch: true,
  draw: () =>
    b(
      'DangerZone',
      {
        direction: 'column',
        gap: 12,
        padX: 16,
        padY: 12,
        radius: 'shadcn',
        fill: 'soft/danger/bg',
        stroke: 'soft/danger/border',
        align: 'stretch',
        width: 640,
      },
      [
        t('title', 'Zone de danger', { size: 14, weight: 600, color: 'soft/danger/text' }, { prop: 'title' }),
        t(
          'description',
          'Ces actions sont définitives.',
          { size: 14, color: 'text/secondary' },
          { prop: 'description' },
        ),
        b('content', { direction: 'row', gap: 8 }, [ref('Button', { variant: 'destructive' }, { label: 'Supprimer' })]),
      ],
    ),
}

const separator: Recipe = {
  family: 'Surfaces',
  usage: 'Séparer deux groupes d’un même bloc. Entre deux blocs, l’espacement suffit.',
  draw: v =>
    v.orientation === 'vertical'
      ? b('Separator', { direction: 'column', height: 24 }, [rect('line', 1, 24, { fill: 'border/default' })])
      : b('Separator', { direction: 'row', width: 240 }, [
          rect('line', 240, 1, { fill: 'border/default', fillWidth: true }),
        ]),
}

const overlay = (name: string, width: number, extra: BoxPart['children']): BoxPart =>
  b(
    name,
    {
      direction: 'column',
      gap: 16,
      padX: 24,
      padY: 24,
      // rounded-xl = 12 px (défaut Tailwind 3.4) ; shadow-lg → style d'effet shadow/lg.
      radius: 'rounded-xl',
      shadow: 'lg',
      fill: 'surface/1',
      stroke: 'border/default',
      align: 'stretch',
      width,
    },
    extra,
  )

const dialog: Recipe = {
  family: 'Surfaces',
  usage:
    'Une tâche courte qui interrompt (créer, éditer un élément). Pour une confirmation : ConfirmationDialog. Sur mobile, préférer Sheet `bottom`.',
  notes: ['Voile d’arrière-plan (bg-black/80) non dessiné : aucune variable ne porte ce voile.'],
  draw: () =>
    overlay('Dialog', 480, [
      b(
        'header',
        { direction: 'row', justify: 'between', align: 'start' },
        [
          b(
            'titles',
            { direction: 'column', gap: 6, align: 'start' },
            [
              t('title', 'Titre de la fenêtre', { style: 'heading' }, { prop: 'title' }),
              t(
                'description',
                'Une phrase qui dit ce qu’on fait ici.',
                { style: 'body', maxChars: 70 },
                { prop: 'description' },
              ),
            ],
            { grow: true },
          ),
          i('x', 16, 'text/muted', { name: 'close' }),
        ],
        { fillWidth: true },
      ),
      content(),
    ]),
}

const confirmationDialog: Recipe = {
  family: 'Surfaces',
  notes: [
    '`danger` : bouton de confirmation bg-red-600 LITTÉRAL (pas --bellum-danger) — la maquette pose Button `destructive` (semantic/danger).',
  ],
  usage:
    'Confirmer une action : le titre dit l’action, le bouton répète le verbe. `danger` pour une action irréversible.',
  draw: v =>
    overlay('ConfirmationDialog', 448, [
      t('title', 'Supprimer cet élément ?', { style: 'heading' }, { prop: 'title' }),
      t('description', 'Cette action est définitive.', { style: 'body', maxChars: 70 }, { prop: 'description' }),
      b(
        'footer',
        { direction: 'row', gap: 8, justify: 'end' },
        [
          ref('Button', { variant: 'outline' }, { label: 'Annuler' }, { name: 'cancel' }),
          ref(
            'Button',
            { variant: v.variant === 'danger' ? 'destructive' : 'default' },
            { label: 'Confirmer' },
            { name: 'confirm' },
          ),
        ],
        { fillWidth: true },
      ),
    ]),
}

const sheet: Recipe = {
  family: 'Surfaces',
  usage: 'Panneau latéral pour un détail ou une édition sans quitter la liste. `bottom` sur mobile.',
  notes: [
    'Largeur `sm:max-w-sm` (384 px) pour right/left, décollé de 12 px et arrondi (rounded-lg) dans le code ; hauteur auto pour top/bottom.',
    'Voile bg-black/50 littéral non dessiné.',
    'Dans une page, le panneau remplit sa colonne (`w-3/4 sm:max-w-sm` : jamais plus large que ce qui l’accueille).',
  ],
  stretch: true,
  draw: v => {
    const vertical = v.side === 'top' || v.side === 'bottom'
    return b(
      'Sheet',
      {
        direction: 'column',
        gap: 16,
        padX: 16,
        padY: 16,
        fill: 'bg/default',
        stroke: 'border/default',
        strokeSide: v.side === 'right' ? 'left' : v.side === 'left' ? 'right' : v.side === 'top' ? 'bottom' : 'top',
        align: 'stretch',
        width: vertical ? 720 : 384,
        minHeight: vertical ? 240 : 640,
      },
      [
        t('title', 'Titre du panneau', { style: 'heading' }, { prop: 'title' }),
        t('description', 'Description', { style: 'body', maxChars: 70 }, { prop: 'description' }),
        content(),
      ],
    )
  },
}

const popover: Recipe = {
  family: 'Surfaces',
  usage: 'Un contenu court attaché à un déclencheur (détail, mini-formulaire). Se ferme au clic extérieur.',
  notes: [
    'bg-popover (shadcn) = miroir de --bellum-sidebar → sidebar/default ; `shadow-md` → shadow/md ; rounded-md 8 px (variable `rounded-md`).',
  ],
  draw: () =>
    b(
      'Popover',
      {
        direction: 'column',
        padX: 16,
        padY: 16,
        radius: 'rounded-md',
        shadow: 'md',
        fill: 'sidebar/default',
        stroke: 'border/default',
        align: 'stretch',
        width: 288,
      },
      [content()],
    ),
}

export const SURFACES = {
  Card: card,
  SectionCard: sectionCard,
  SettingsGroup: settingsGroup,
  SettingsRow: settingsRow,
  DangerZone: dangerZone,
  Separator: separator,
  Dialog: dialog,
  ConfirmationDialog: confirmationDialog,
  Sheet: sheet,
  Popover: popover,
}
