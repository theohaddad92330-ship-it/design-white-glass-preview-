/**
 * Les décisions PURES de la synchronisation (sans `figma`), testées seules.
 */

/**
 * Où une couleur a le droit d'être posée dans Figma. Un scope précis est ce
 * qui empêche un designer de mettre `text/muted` en fond : le sélecteur ne le
 * propose simplement pas.
 */
export function colorScopes(name: string): VariableScope[] {
  const FILL: VariableScope[] = ['FRAME_FILL', 'SHAPE_FILL']
  const TEXT: VariableScope[] = ['TEXT_FILL']
  const STROKE: VariableScope[] = ['STROKE_COLOR']
  const leaf = name.split('/').pop() ?? ''
  if (name.startsWith('soft/')) return leaf === 'text' ? TEXT : leaf === 'border' ? STROKE : FILL
  if (name.startsWith('text/') || name.startsWith('on/') || leaf === 'text' || leaf.endsWith('-text')) return TEXT
  if (name.startsWith('border/') || name === 'focus/ring' || name === 'guide/halo') return STROKE
  if (/^(bg|surface|sidebar|chip|guide)\//.test(name)) return FILL
  if (name.startsWith('legacy/')) {
    if (leaf.startsWith('text-')) return TEXT
    if (leaf.endsWith('-border')) return STROKE
    if (leaf.startsWith('bg-')) return FILL
  }
  // Une couleur d'accent historique (violet-500, green-500…) : partout, faute de rôle unique.
  return [...FILL, ...TEXT, ...STROKE]
}

const WEIGHT_STYLES: Record<number, string[]> = {
  300: ['Light'],
  400: ['Regular'],
  500: ['Medium'],
  600: ['SemiBold', 'Semi Bold'],
  700: ['Bold'],
  800: ['ExtraBold', 'Extra Bold'],
  900: ['Black'],
}

const FALLBACK_FAMILY = 'Inter'

/**
 * Choisit la police d'un style de texte parmi celles INSTALLÉES. Geist
 * d'abord ; sinon Inter — et le repli est RENDU (`fallback`) pour être
 * journalisé, jamais silencieux : un fichier en Inter qui se croit en Geist
 * trompe tout le monde sur les longueurs de ligne.
 */
export function pickFont(
  available: readonly Font[],
  family: string,
  weight: number,
): { fontName: FontName; fallback?: string } {
  const styles = WEIGHT_STYLES[weight] ?? ['Regular']
  const find = (fam: string): FontName | undefined =>
    available.find(f => f.fontName.family === fam && styles.includes(f.fontName.style))?.fontName
  const exact = find(family)
  if (exact) return { fontName: exact }
  const inter = find(FALLBACK_FAMILY)
  const fontName = inter ?? { family: FALLBACK_FAMILY, style: 'Regular' }
  return {
    fontName,
    fallback: `${family} ${weight} introuvable dans les polices installées — repli sur ${fontName.family} ${fontName.style}`,
  }
}
