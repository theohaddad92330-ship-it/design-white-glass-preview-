import type { TokenSet } from '../extract/types'
import type { OverlaySpec, PageSpec, Surface } from '../spec/types'
import { validateOverlay, validateOverlays, validatePage, validatePages } from '../spec/validate'
import type { Log } from './api'
import { drawComponents, familyOf, RECIPES } from './components'
import { readRegistry } from './components/engine'
import { renderFilterSheets, renderOverlays } from './overlays/render'
import { renderSurface, renderUxRules } from './pages/render'
import { prepareScene, type Scene } from './scene'
import { drawTemplates } from './templates/layout'
import type { VariableIndex } from './variables'

/**
 * Les trois constructeurs du design system : composants, gabarits, pages.
 * Chacun relit ce que le fichier contient déjà (variables, composants,
 * gabarits) — on peut les lancer séparément, dans l'ordre.
 */
export interface BuildContext {
  tokens: TokenSet
  /** `null` si l'étape Tokens n'a pas tourné et qu'aucune variable n'a été retrouvée. */
  variables: VariableIndex | null
  log: Log
  /** Le `figma` qui dessine (le vrai dans le plugin, un faux dans les tests). */
  draw: Scene['api']
  /** Les largeurs cochées dans le plugin (px). Absent = largeurs par défaut (pages) / toutes (gabarits). */
  widths?: readonly number[]
}

async function scene(ctx: BuildContext, step: string): Promise<Scene | null> {
  if (!ctx.variables) {
    ctx.log.error(
      `${step} : aucune variable dans le fichier — cocher « Tokens » d’abord (aucune couleur n’est posée sans variable).`,
    )
    return null
  }
  return prepareScene(ctx.draw, ctx.tokens, ctx.variables, ctx.log)
}

/** Un COMPONENT_SET par composant du catalogue, une page par famille ; les icônes lucide en composants à part. */
export async function buildComponents(ctx: BuildContext): Promise<void> {
  const s = await scene(ctx, 'Composants')
  if (!s) return
  const { report } = await drawComponents(s)
  ctx.log.info(
    `Composants : ${report.components} composants, ${report.sets} jeux, ${report.variants} variantes, ${report.icons} icônes` +
      (report.missing.length ? ` — ${report.missing.length} partie(s) manquante(s)` : ''),
  )
}

/** Les 9 gabarits × largeurs × états, page « Templates », avec leurs règles en annotation. */
export async function buildTemplates(ctx: BuildContext): Promise<void> {
  const s = await scene(ctx, 'Gabarits')
  if (!s) return
  const page = ctx.draw.root.children.find(p => p.name === 'Templates')
  if (!page) {
    ctx.log.error('Gabarits : page « Templates » absente')
    return
  }
  await page.loadAsync()
  const reg = await readRegistry(s, familyOf)
  const variants = await drawTemplates(s, reg, page)
  ctx.log.info(`Gabarits : 9 gabarits, ${variants} variantes (largeurs × états)`)
}

/** Une page Figma par surface / domaine, un cadre par spec × largeur × état ; les `uxNotes` sur « Rules (UX) ». */
export async function buildPages(ctx: BuildContext, surface: Surface, pages: readonly PageSpec[]): Promise<void> {
  const mine = pages.filter(p => p.surface === surface)
  const errors = validatePages(mine)
  for (const e of errors) ctx.log.error(`Spec invalide — ${e}`)
  // Une spec invalide n'est pas dessinée : elle le serait de travers.
  const valid = mine.filter(p => validatePage(p).length === 0)
  const s = await scene(ctx, `Pages ${surface}`)
  if (!s) return
  const reg = await readRegistry(s, familyOf)
  const result = await renderSurface(s, reg, RECIPES, surface, valid, ctx.widths)
  // Le backoffice sous 768 : ses filtres en feuille basse, à côté des cadres de la page (Q7).
  const sheets = surface === 'dm' ? await renderFilterSheets(s, reg, RECIPES, valid, ctx.widths) : 0
  const rules = ctx.draw.root.children.find(p => p.name === 'Rules (UX)')
  const notes = rules ? await renderUxRules(s, rules, valid, surface) : 0
  ctx.log.info(
    `Pages ${surface} : ${valid.length}/${mine.length} spec(s), ${result.frames} cadre(s) sur ${result.pages.join(', ') || 'aucune page'}, ${notes} note(s) UX` +
      (sheets ? `, ${sheets} feuille(s) de filtres` : ''),
  )
}

/**
 * Les surcouches d'une surface, sur « Overlays — App / Site / DM » : un cadre par surcouche × largeur
 * (1440, 390, selon ses viewports), la page parente dessous, voilée pour les familles modales ; pour le DM,
 * les feuilles basses de filtres de ses pages sous 768 sont dessinées avec les pages (`buildPages`).
 */
export async function buildOverlays(
  ctx: BuildContext,
  surface: Surface,
  overlays: readonly OverlaySpec[],
  pages: readonly PageSpec[],
): Promise<void> {
  const mine = overlays.filter(o => o.surface === surface)
  for (const e of validateOverlays(mine, pages)) ctx.log.error(`Surcouche invalide — ${e}`)
  // Une spec invalide n'est pas dessinée, ni une page parente invalide (elle le serait de travers).
  const validPages = pages.filter(p => validatePage(p).length === 0)
  const valid = mine.filter(o => validateOverlay(o, validPages).length === 0)
  const s = await scene(ctx, `Surcouches ${surface}`)
  if (!s) return
  const reg = await readRegistry(s, familyOf)
  const result = await renderOverlays(s, reg, RECIPES, surface, valid, validPages)
  ctx.log.info(
    `Surcouches ${surface} : ${valid.length}/${mine.length} spec(s), ${result.frames} cadre(s) sur ${result.page}`,
  )
}
