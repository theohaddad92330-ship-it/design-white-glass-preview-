import type { Feed } from '../extract/changelog'
import type { TokenSet } from '../extract/types'
import { describeVersionChange, type VersionStamp } from '../extract/version'
import type { Log } from './api'
import { pickFont } from './plan'
import type { VariableIndex } from './variables'

/**
 * Le DESSIN des pages Cover, Getting Started et Foundations — le seul module
 * qui parle au vrai `figma` (nœuds, textes). Il n'a pas de test unitaire : sa
 * preuve est le fichier Figma. Son idempotence tient à une règle simple :
 * chaque cadre est retrouvé par son nom sur sa page, VIDÉ, puis redessiné.
 */

const GAP = 200

interface Draw {
  font: FontName
  textStyles: Map<string, TextStyle>
  log: Log
}

async function prepareDraw(log: Log): Promise<Draw> {
  const available = await figma.listAvailableFontsAsync()
  const regular = pickFont(available, 'Geist', 400)
  const bold = pickFont(available, 'Geist', 600)
  if (regular.fallback) log.warn(`Fondations : ${regular.fallback}`)
  await figma.loadFontAsync(regular.fontName)
  await figma.loadFontAsync(bold.fontName)
  const textStyles = new Map((await figma.getLocalTextStylesAsync()).map(s => [s.name, s]))
  for (const s of textStyles.values()) await figma.loadFontAsync(s.fontName)
  return { font: regular.fontName, textStyles, log }
}

/** Retrouve le cadre `name` sur la page, ou le crée ; dans les deux cas il repart VIDE. */
function resetFrame(page: PageNode, name: string, direction: 'VERTICAL' | 'HORIZONTAL' = 'VERTICAL'): FrameNode {
  const found = page.children.find((n): n is FrameNode => n.type === 'FRAME' && n.name === name)
  const frame = found ?? figma.createFrame()
  if (!found) page.appendChild(frame)
  for (const child of [...frame.children]) child.remove()
  frame.name = name
  frame.layoutMode = direction
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'AUTO'
  frame.itemSpacing = 24
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 48
  return frame
}

function row(name: string, spacing = 16): FrameNode {
  const f = figma.createFrame()
  f.name = name
  f.layoutMode = 'HORIZONTAL'
  f.primaryAxisSizingMode = 'AUTO'
  f.counterAxisSizingMode = 'AUTO'
  f.itemSpacing = spacing
  f.fills = []
  return f
}

function column(name: string, spacing = 8): FrameNode {
  const f = row(name, spacing)
  f.layoutMode = 'VERTICAL'
  return f
}

async function text(d: Draw, content: string, styleName = 'text/body'): Promise<TextNode> {
  const t = figma.createText()
  t.fontName = d.font
  t.characters = content
  const style = d.textStyles.get(styleName)
  if (style) await t.setTextStyleIdAsync(style.id)
  return t
}

/** Pose une couleur LIÉE à sa variable (jamais une valeur recopiée). */
function boundFill(variable: Variable | undefined): Paint[] {
  const base: SolidPaint = { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }
  return variable ? [figma.variables.setBoundVariableForPaint(base, 'color', variable)] : [base]
}

/** Ramène les cadres de la page côte à côte, dans l'ordre donné. */
function layOut(frames: FrameNode[]): void {
  let x = 0
  for (const f of frames) {
    f.x = x
    f.y = 0
    x += f.width + GAP
  }
}

const asVariable = (v: unknown): Variable | undefined => v as Variable | undefined

async function swatchSection(
  d: Draw,
  page: PageNode,
  name: string,
  entries: { name: string; cssVar: string }[],
  index: VariableIndex,
  mode: 'light' | 'dark' | null,
): Promise<FrameNode> {
  const frame = resetFrame(page, name)
  frame.fills = boundFill(asVariable(index.byName.get('bg/default')))
  if (mode) {
    const modeId = index.color[mode]
    if (modeId) frame.setExplicitVariableModeForCollection(index.color.collection as VariableCollection, modeId)
    else d.log.warn(`${name} : mode ${mode} absent du fichier — nuancier montré dans le mode par défaut`)
  }
  frame.appendChild(await text(d, name, 'text/title'))
  const groups = new Map<string, { name: string; cssVar: string }[]>()
  for (const e of entries) {
    const g = e.name.split('/')[0] ?? e.name
    groups.set(g, [...(groups.get(g) ?? []), e])
  }
  for (const [group, list] of groups) {
    frame.appendChild(await text(d, group, 'text/heading'))
    const line = row(`${group}`)
    line.layoutWrap = 'WRAP'
    line.counterAxisSpacing = 16
    line.resize(1200, 10)
    line.primaryAxisSizingMode = 'FIXED'
    for (const e of list) {
      const cell = column(e.name, 6)
      const chip = figma.createRectangle()
      chip.name = 'swatch'
      chip.resize(120, 64)
      chip.cornerRadius = 10
      chip.strokes = boundFill(asVariable(index.byName.get('border/default')))
      chip.fills = boundFill(asVariable(index.byName.get(e.name)))
      cell.appendChild(chip)
      cell.appendChild(await text(d, e.name, 'text/caption'))
      cell.appendChild(await text(d, e.cssVar, 'text/label'))
      line.appendChild(cell)
    }
    frame.appendChild(line)
  }
  return frame
}

export async function drawCover(
  page: PageNode,
  tokens: TokenSet,
  index: VariableIndex | null,
  version: VersionStamp,
  log: Log,
): Promise<void> {
  await page.loadAsync()
  const d = await prepareDraw(log)
  const frame = resetFrame(page, 'Cover')
  frame.resize(1440, 960)
  frame.primaryAxisSizingMode = 'FIXED'
  frame.counterAxisSizingMode = 'FIXED'
  frame.primaryAxisAlignItems = 'CENTER'
  frame.fills = boundFill(asVariable(index?.byName.get('bg/default')))
  if (index?.color.dark)
    frame.setExplicitVariableModeForCollection(index.color.collection as VariableCollection, index.color.dark)
  frame.appendChild(await text(d, 'BellumAI — Design System', 'text/display'))
  frame.appendChild(
    await text(
      d,
      `Généré depuis le code par @bellum/figma-sync — ${tokens.primitives.length} primitives, ${tokens.colors.length} couleurs, ` +
        `${tokens.textStyles.length} styles de texte.`,
      'text/body',
    ),
  )
  frame.appendChild(await text(d, `Sources : ${tokens.sources.join(' · ')}`, 'text/caption'))

  // Le tampon de version (point 2) : un cadre séparé, retrouvé par son nom
  // comme les autres — sa donnée de plugin (`getPluginData`) porte le DERNIER
  // tampon écrit, lu AVANT d'être remplacé, pour comparer au tampon présent.
  const previousRaw = page.children
    .find((n): n is FrameNode => n.type === 'FRAME' && n.name === 'Version')
    ?.getPluginData('stamp')
  const previous: VersionStamp | null = previousRaw ? (JSON.parse(previousRaw) as VersionStamp) : null
  const versionFrame = resetFrame(page, 'Version')
  versionFrame.setPluginData('stamp', JSON.stringify(version))
  versionFrame.appendChild(await text(d, 'Version', 'text/title'))
  versionFrame.appendChild(await text(d, describeVersionChange(previous, version), 'text/body'))
  versionFrame.appendChild(
    await text(
      d,
      `sha ${version.sha} · ${version.date.slice(0, 10)} · ${version.specCount} pages maquettées`,
      'text/caption',
    ),
  )
  log.info(describeVersionChange(previous, version))
  layOut([frame, versionFrame])
}

/** Un texte dans une couleur SÉMANTIQUE liée à sa variable — jamais une valeur recopiée (D79). */
async function coloredText(
  d: Draw,
  content: string,
  styleName: string,
  index: VariableIndex | null,
  colorName: string,
): Promise<TextNode> {
  const t = await text(d, content, styleName)
  if (index) t.fills = boundFill(asVariable(index.byName.get(colorName)))
  return t
}

/**
 * LA PAGE « NOUVEAUTÉS » (point 3) — dessine `generated/feed.json` tel quel,
 * plus récent en tête. Idempotence : `feed.json` est déjà APPEND-ONLY côté
 * extraction (`extract/changelog.ts`) — redessiner ce cadre entier à chaque
 * synchronisation ne perd donc jamais une entrée, il rejoue simplement la
 * même liste, toujours plus longue.
 */
export async function drawChangelog(page: PageNode, feed: Feed, index: VariableIndex | null, log: Log): Promise<void> {
  await page.loadAsync()
  const d = await prepareDraw(log)
  const frame = resetFrame(page, 'Nouveautés')
  frame.resize(720, frame.height)
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.appendChild(await text(d, 'Nouveautés', 'text/display'))
  frame.appendChild(
    await text(
      d,
      `${feed.entries.length} entrée(s) depuis le premier tampon, la plus récente en tête. ` +
        `« à maquetter » = la route a changé sans que sa spec suive dans le même commit.`,
      'text/body',
    ),
  )
  if (feed.entries.length === 0) {
    frame.appendChild(
      await text(d, 'Aucune entrée pour l’instant — relancer `extract` après le prochain commit.', 'text/caption'),
    )
  }
  for (const entry of feed.entries) {
    const card = column(`entry-${entry.sha.slice(0, 10)}`, 4)
    card.appendChild(await text(d, entry.subject, 'text/label'))
    card.appendChild(await text(d, `${entry.sha.slice(0, 10)} · ${entry.date.slice(0, 10)}`, 'text/caption'))
    for (const impact of entry.specs) {
      const label = `${impact.specId} — ${impact.route}`
      card.appendChild(
        impact.needsMockup
          ? await coloredText(d, `${label} · à maquetter`, 'text/caption', index, 'soft/warning/text')
          : await text(d, label, 'text/caption'),
      )
    }
    frame.appendChild(card)
  }
  log.info(`Nouveautés : ${feed.entries.length} entrée(s) dessinée(s).`)
}

const RULES = [
  'Un token naît dans apps/web/src/styles/tokens.css, jamais dans Figma seul. Figma se RÉGÉNÈRE, il ne s’édite pas.',
  'On pose une couleur SÉMANTIQUE (collection Color), jamais une primitive : la parité clair/sombre en dépend (D79).',
  'Une valeur absente ne s’affiche jamais « 0 » (GA-18/19). On n’affiche pas ce qu’on n’a pas.',
  'Typographie : l’échelle text/*, plancher 12 px (D80). Largeur de lecture : 70 caractères pour le texte (D81).',
  'Mobile = le produit : borne 768 px, quatre onglets, cibles ≥ 44 px (GA-28/29/30).',
  'Mouvement : les courbes et durées de motion.ts, aucun rebond, aucune parallaxe (GA-25).',
  'Le copilote s’appelle Laura, partout (D82).',
]

export async function drawGettingStarted(page: PageNode, log: Log): Promise<void> {
  await page.loadAsync()
  const d = await prepareDraw(log)
  const frame = resetFrame(page, 'Getting Started')
  frame.appendChild(await text(d, 'Comment lire ce fichier', 'text/title'))
  frame.appendChild(
    await text(
      d,
      'Ce fichier est construit par un plugin de développement à partir du code (packages/figma-sync). ' +
        'Toute modification faite à la main sur les variables, styles et fondations sera écrasée à la prochaine synchronisation.',
      'text/body',
    ),
  )
  frame.appendChild(await text(d, 'Les règles', 'text/heading'))
  for (const rule of RULES) frame.appendChild(await text(d, `• ${rule}`, 'text/body'))
}

export async function drawFoundations(page: PageNode, tokens: TokenSet, index: VariableIndex, log: Log): Promise<void> {
  await page.loadAsync()
  const d = await prepareDraw(log)
  const frames: FrameNode[] = []

  frames.push(await swatchSection(d, page, 'Couleurs — Light', tokens.colors, index, 'light'))
  frames.push(await swatchSection(d, page, 'Couleurs — Dark', tokens.colors, index, 'dark'))
  frames.push(await swatchSection(d, page, 'Primitives', tokens.primitives, index, null))

  const typo = resetFrame(page, 'Typographie')
  typo.appendChild(await text(d, 'Typographie', 'text/title'))
  for (const t of tokens.textStyles) {
    const line = column(`text/${t.name}`, 4)
    line.appendChild(await text(d, `${t.name} — Le portefeuille de comptes`, `text/${t.name}`))
    line.appendChild(
      await text(d, `${t.className} · ${t.fontFamily} ${t.fontWeight} · ${t.fontSize}px/${t.lineHeight}`, 'text/label'),
    )
    typo.appendChild(line)
  }
  frames.push(typo)

  const radius = resetFrame(page, 'Rayons')
  radius.appendChild(await text(d, 'Rayons', 'text/title'))
  const radiusRow = row('rayons', 24)
  for (const r of tokens.radius) {
    const cell = column(r.name)
    const rect = figma.createRectangle()
    rect.resize(96, 96)
    rect.fills = boundFill(asVariable(index.byName.get('surface/2')))
    const v = asVariable(index.byCssVar.get(r.cssVar ?? ''))
    for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as const) {
      if (v) rect.setBoundVariable(corner, v)
      else rect[corner] = r.value
    }
    cell.appendChild(rect)
    cell.appendChild(await text(d, `${r.name} · ${r.value}px · ${r.cssVar ?? ''}`, 'text/caption'))
    radiusRow.appendChild(cell)
  }
  radius.appendChild(radiusRow)
  frames.push(radius)

  const spacing = resetFrame(page, 'Espacements')
  spacing.appendChild(await text(d, 'Espacements (échelle Tailwind)', 'text/title'))
  for (const s of tokens.spacing) {
    const line = row(`space-${s.name}`, 16)
    line.counterAxisAlignItems = 'CENTER'
    const bar = figma.createRectangle()
    bar.resize(s.value, 16)
    bar.fills = boundFill(asVariable(index.byName.get('text/accent')))
    line.appendChild(bar)
    line.appendChild(await text(d, `${s.name} · ${s.value}px`, 'text/caption'))
    spacing.appendChild(line)
  }
  frames.push(spacing)

  const z = resetFrame(page, 'Z-index')
  z.appendChild(await text(d, 'Z-index (tailwind.config.ts)', 'text/title'))
  for (const layer of [...tokens.zIndex].sort((a, b) => b.value - a.value)) {
    z.appendChild(await text(d, `${layer.value} — z-${layer.name}`, 'text/body'))
  }
  frames.push(z)

  const motion = resetFrame(page, 'Mouvement')
  motion.appendChild(await text(d, 'Mouvement (packages/ui/src/motion.ts)', 'text/title'))
  motion.appendChild(await text(d, 'Courbes', 'text/heading'))
  for (const e of tokens.motion.ease) {
    motion.appendChild(await text(d, `EASE.${e.name} — cubic-bezier(${e.bezier.join(', ')})`, 'text/mono'))
  }
  motion.appendChild(await text(d, 'Durées', 'text/heading'))
  for (const dur of tokens.motion.durations) {
    motion.appendChild(await text(d, `DURATION.${dur.name} — ${dur.ms} ms`, 'text/mono'))
  }
  motion.appendChild(await text(d, 'Aucun rebond, aucune parallaxe (GA-25).', 'text/caption'))
  frames.push(motion)

  if (tokens.skipped.length > 0) {
    const skipped = resetFrame(page, 'Non importés')
    skipped.appendChild(await text(d, 'Tokens non importés (et pourquoi)', 'text/title'))
    for (const s of tokens.skipped)
      skipped.appendChild(await text(d, `${s.cssVar} — ${s.source} — ${s.reason}`, 'text/caption'))
    frames.push(skipped)
  }

  layOut(frames)
  log.info(`Fondations : ${frames.length} planches`)
}
