import type { TokenSet } from '../extract/types'
import type { CollectionLike, Log, SyncApi, VariableLike } from './api'
import { colorScopes } from './plan'
import { ensureLightDark, ensureSingleMode, upsertCollection, upsertVariable } from './upsert'

/** Ce que les étapes suivantes (fondations, composants) réutilisent : les variables, par nom CSS et par nom Figma. */
export interface VariableIndex {
  byCssVar: Map<string, VariableLike>
  byName: Map<string, VariableLike>
  color: { collection: CollectionLike; light: string; dark: string | null }
}

const webSyntax = (cssVar: string): string => `var(${cssVar})`

/**
 * Relit les variables DÉJÀ dans le fichier, sans rien écrire — quand la case
 * « Tokens » est décochée mais que les fondations ont besoin de s'y lier.
 * `null` si la collection `Color` n'existe pas encore.
 */
export async function readVariableIndex(api: SyncApi, tokens: TokenSet): Promise<VariableIndex | null> {
  const collections = await api.variables.getLocalVariableCollectionsAsync()
  const color = collections.find(c => c.name === 'Color')
  if (!color) return null
  const variables = await api.variables.getLocalVariablesAsync()
  const byCssVar = new Map<string, VariableLike>()
  const byName = new Map<string, VariableLike>()
  const families: [string, { name: string; cssVar?: string }[]][] = [
    ['Primitives', tokens.primitives],
    ['Color', tokens.colors],
    ['Radius', tokens.radius],
    ['Spacing', tokens.spacing],
    ['ZIndex', tokens.zIndex],
  ]
  for (const [collectionName, list] of families) {
    const collection = collections.find(c => c.name === collectionName)
    for (const t of list) {
      const v = variables.find(x => x.variableCollectionId === collection?.id && x.name === t.name)
      if (!v) continue
      byName.set(v.name, v)
      if (t.cssVar) byCssVar.set(t.cssVar, v)
    }
  }
  const light = color.modes.find(m => m.name === 'Light') ?? color.modes[0]
  const dark = color.modes.find(m => m.name === 'Dark')
  return { byCssVar, byName, color: { collection: color, light: light?.modeId ?? '', dark: dark?.modeId ?? null } }
}

/**
 * tokens.json → variables Figma : `Primitives` (1 mode, masquées), `Color`
 * (Light/Dark, alias vers les primitives), `Radius`, `Spacing`, `ZIndex`.
 * Chaque variable porte le VRAI nom CSS en code syntax WEB : c'est ce que le
 * mode Dev de Figma affiche au développeur.
 */
export async function syncVariables(api: SyncApi, tokens: TokenSet, log: Log): Promise<VariableIndex> {
  const existing = await api.variables.getLocalVariablesAsync()
  const byCssVar = new Map<string, VariableLike>()
  const byName = new Map<string, VariableLike>()
  const remember = (v: VariableLike, cssVar?: string): void => {
    byName.set(v.name, v)
    if (cssVar) byCssVar.set(cssVar, v)
  }

  // ── Primitives ──
  const primitives = await upsertCollection(api, 'Primitives')
  const primMode = ensureSingleMode(primitives)
  for (const p of tokens.primitives) {
    const v = upsertVariable(api, existing, primitives, p.name, 'COLOR', log)
    if (!v) continue
    v.setValueForMode(primMode, p.value)
    v.scopes = [] // masquée des sélecteurs : on pose une couleur SÉMANTIQUE, jamais une primitive
    v.description = `Primitive — ${p.cssVar}`
    v.setVariableCodeSyntax('WEB', webSyntax(p.cssVar))
    remember(v, p.cssVar)
  }

  // ── Color (Light / Dark) — toutes créées AVANT d'écrire les valeurs, pour qu'un alias interne se résolve ──
  const color = await upsertCollection(api, 'Color')
  const modes = ensureLightDark(color, log)
  const colorVars: [VariableLike, (typeof tokens.colors)[number]][] = []
  for (const c of tokens.colors) {
    const v = upsertVariable(api, existing, color, c.name, 'COLOR', log)
    if (!v) continue
    v.scopes = colorScopes(c.name)
    v.description = c.cssVar
    v.setVariableCodeSyntax('WEB', webSyntax(c.cssVar))
    remember(v, c.cssVar)
    colorVars.push([v, c])
  }
  let unresolved = 0
  for (const [v, c] of colorVars) {
    const writes: [string | null, (typeof c)['light']][] = [
      [modes.light, c.light],
      [modes.dark, c.dark],
    ]
    for (const [modeId, value] of writes) {
      if (!modeId) continue
      if (value.kind === 'color') {
        v.setValueForMode(modeId, value.rgba)
        continue
      }
      const target = byCssVar.get(value.ref)
      if (!target) {
        unresolved++
        log.error(`${c.cssVar} : alias vers ${value.ref} introuvable dans Figma — valeur NON écrite`)
        continue
      }
      v.setValueForMode(modeId, api.variables.createVariableAlias(target))
    }
  }

  // ── Dimensions ──
  const dimension = async (
    collectionName: string,
    list: TokenSet['radius'],
    scopes: VariableScope[],
  ): Promise<void> => {
    const collection = await upsertCollection(api, collectionName)
    const mode = ensureSingleMode(collection)
    for (const d of list) {
      const v = upsertVariable(api, existing, collection, d.name, 'FLOAT', log)
      if (!v) continue
      v.setValueForMode(mode, d.value)
      v.scopes = scopes
      v.description = d.cssVar ?? d.className ?? `${collectionName} ${d.name} = ${d.value}`
      if (d.cssVar) v.setVariableCodeSyntax('WEB', webSyntax(d.cssVar))
      else if (d.className) v.setVariableCodeSyntax('WEB', d.className)
      remember(v, d.cssVar)
    }
  }
  await dimension('Radius', tokens.radius, ['CORNER_RADIUS'])
  await dimension('Spacing', tokens.spacing, ['GAP'])
  // Aucun scope Figma ne correspond à un z-index : documentées, jamais proposées dans un sélecteur.
  await dimension('ZIndex', tokens.zIndex, [])

  log.info(
    `Variables : ${tokens.primitives.length} primitives, ${colorVars.length} couleurs` +
      `${modes.dark ? ' (Light + Dark)' : ' (Light SEULEMENT)'}, ${tokens.radius.length} rayons, ` +
      `${tokens.spacing.length} espacements, ${tokens.zIndex.length} z-index` +
      (unresolved > 0 ? ` — ${unresolved} alias non résolus` : ''),
  )
  return { byCssVar, byName, color: { collection: color, ...modes } }
}
