import type { TokenSet } from '../extract/types'

/**
 * Écrit `token-names.generated.ts` : les NOMS de tokens en tableaux `as const`,
 * pour que le type d'une spec refuse à la compilation une couleur, un
 * espacement ou un style de texte qui n'existe pas dans tokens.css.
 *
 * Seules les couleurs de la collection `Color` (à modes) sont citables par
 * une spec — jamais une primitive : une page qui dit `primary/500` au lieu de
 * `text/accent` casserait la parité clair/sombre (D79).
 */
export function renderTokenNames(set: TokenSet): string {
  const list = (name: string, values: string[]): string => `export const ${name} = ${JSON.stringify(values)} as const\n`
  return [
    '// Généré par `pnpm --filter @bellum/figma-sync extract` depuis apps/web/src/styles/tokens.css — ne pas éditer.\n',
    list(
      'COLOR_TOKENS',
      set.colors.map(c => c.name),
    ),
    list(
      'SPACE_TOKENS',
      set.spacing.map(s => s.name),
    ),
    list(
      'RADIUS_TOKENS',
      set.radius.map(r => r.name),
    ),
    list(
      'TEXT_STYLES',
      set.textStyles.map(t => t.name),
    ),
    list(
      'SHADOW_TOKENS',
      set.shadows.map(s => s.name),
    ),
  ].join('\n')
}
