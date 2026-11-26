import { b, dot, i, type Recipe, t } from '../recipe'

/**
 * Famille « Identité » — packages/ui/src/components/{avatar,entity-avatar}.tsx,
 * molecules/{user-cell,brand-mark}.tsx, assets/laura-face.tsx (+ les icônes lucide).
 */

const avatar: Recipe = {
  family: 'Identité',
  usage:
    'Photo ou initiales d’une personne, 40 px. Pour une entreprise ou une personne sans photo, préférer EntityAvatar.',
  draw: () =>
    b(
      'Avatar',
      {
        direction: 'row',
        width: 40,
        height: 40,
        radius: 'full',
        fill: 'surface/2',
        align: 'center',
        justify: 'center',
        clip: true,
      },
      [t('initials', 'AB', { size: 14, weight: 500, color: 'text/secondary' }, { prop: 'initials' })],
    ),
}

const ENTITY: Record<string, { d: number; fs: number }> = {
  xs: { d: 32, fs: 12 },
  sm: { d: 36, fs: 12 },
  md: { d: 44, fs: 14 },
  lg: { d: 64, fs: 18 },
}

const entityAvatar: Recipe = {
  family: 'Identité',
  usage:
    'Initiales d’une entreprise ou d’une personne (liste, fiche). `square` pour une entreprise, `circle` pour une personne.',
  notes: [
    'Fond border/default en clair, surface/2 en sombre dans le code (deux tokens selon le thème) : rendu border/default.',
    'AVATAR_PALETTE (amber, emerald, sky, rose Tailwind) : couleurs littérales hors tokens, non reproduites.',
  ],
  draw: v => {
    const e = ENTITY[v.size ?? 'md'] ?? { d: 44, fs: 14 }
    return b(
      'EntityAvatar',
      {
        direction: 'row',
        width: e.d,
        height: e.d,
        radius: v.shape === 'square' ? 'rounded-md' : 'full',
        fill: 'border/default',
        align: 'center',
        justify: 'center',
      },
      [t('name', 'AB', { size: e.fs, weight: 600, color: 'text/primary' }, { prop: 'name' })],
    )
  },
}

const userCell: Recipe = {
  family: 'Identité',
  usage:
    'Une personne dans une ligne de tableau ou de liste : avatar 36 px, nom, sous-titre (poste). Les deux lignes se tronquent.',
  // `min-w-0` + `truncate` (user-cell.tsx:55-63) : le texte prend la place restante et se coupe « … ».
  stretch: true,
  draw: () =>
    b('UserCell', { direction: 'row', gap: 12, align: 'center', width: 240 }, [
      b(
        'avatar',
        {
          direction: 'row',
          width: 36,
          height: 36,
          radius: 'full',
          fill: 'surface/2',
          align: 'center',
          justify: 'center',
        },
        [t('initials', 'AB', { size: 12, weight: 500, color: 'text/secondary' })],
      ),
      b(
        'text',
        { direction: 'column', gap: 2, align: 'stretch' },
        [
          t('name', 'Prénom Nom', { size: 14, weight: 500, color: 'text/primary' }, { prop: 'name', truncate: 1 }),
          t('subtitle', 'Poste', { size: 14, color: 'text/secondary' }, { prop: 'subtitle', truncate: 1 }),
        ],
        { grow: true },
      ),
    ]),
}

const lauraFace: Recipe = {
  family: 'Identité',
  usage:
    'Le visage de Laura, le copilote (D82 : Laura partout). Rond, taille libre. L’état (chargement, erreur) est porté par la bulle, jamais par l’avatar.',
  notes: [
    'Portrait raster embarqué (data URI) sur fond bleu nuit FIXE dans les deux thèmes (D137) : Figma montre un emplacement nommé, à remplacer par l’image — pas une forme inventée.',
  ],
  draw: () =>
    b(
      'LauraFace',
      {
        direction: 'row',
        width: 40,
        height: 40,
        radius: 'full',
        fill: 'soft/accent/bg',
        stroke: 'soft/accent/border',
        align: 'center',
        justify: 'center',
      },
      [i('sparkles', 20, 'soft/accent/text', { name: 'portrait (image)' })],
    ),
}

const BRAND: Record<string, { h: number; fs: number }> = {
  sm: { h: 20, fs: 14 },
  md: { h: 24, fs: 16 },
  lg: { h: 32, fs: 18 },
  xl: { h: 40, fs: 20 },
  '2xl': { h: 48, fs: 24 },
  '3xl': { h: 56, fs: 30 },
}

const brandMark: Recipe = {
  family: 'Identité',
  usage:
    'La marque (glyphe + BellumAI) en tête de navigation, d’authentification, du site. Un espace client peut y poser son logo.',
  notes: ['Glyphe SVG du logo rendu par une pastille primary/400 : le tracé du logo n’est pas une icône lucide.'],
  draw: v => {
    const m = BRAND[v.size ?? 'md'] ?? { h: 24, fs: 16 }
    return b('BrandMark', { direction: 'row', gap: 8, height: m.h, align: 'center' }, [
      dot('glyph', m.h, 'primary/400'),
      t('wordmark', 'BellumAI', { size: m.fs, weight: 600, color: 'text/primary' }),
    ])
  },
}

export const IDENTITY = {
  Avatar: avatar,
  EntityAvatar: entityAvatar,
  UserCell: userCell,
  LauraFace: lauraFace,
  BrandMark: brandMark,
}
