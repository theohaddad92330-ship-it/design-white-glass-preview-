import tokensJson from '../../generated/tokens.json'
import type { Scene } from './scene'

/**
 * Un FAUX arbre de scène Figma, pour les tests des constructeurs : des objets
 * ordinaires qui gardent ce qu'on leur écrit (peintures liées, variables liées,
 * propriétés de composant, instances). Il ne calcule pas de mise en page : les
 * tests portent sur la STRUCTURE (qui contient quoi, lié à quelle variable),
 * jamais sur des pixels rendus.
 */

type Props = Record<string, unknown>

export interface FakeNode {
  id: string
  type: string
  name: string
  parent: FakeNode | null
  children: FakeNode[]
  width: number
  height: number
  x: number
  y: number
  visible: boolean
  fills: Paint[]
  strokes: Paint[]
  characters: string
  description: string
  boundVariables: Record<string, { type: 'VARIABLE_ALIAS'; id: string }>
  componentPropertyDefinitions: Record<string, { type: ComponentPropertyType; defaultValue: unknown }>
  componentPropertyReferences: Record<string, string> | null
  mainComponent: FakeNode | null
  textStyleId: string
  [key: string]: unknown
}

let seq = 0

function makeNode(type: string, extra: Props = {}): FakeNode {
  const node: FakeNode = {
    id: `${type.toLowerCase()}:${++seq}`,
    type,
    name: '',
    parent: null,
    children: [],
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    visible: true,
    fills: [],
    strokes: [],
    characters: '',
    description: '',
    boundVariables: {},
    componentPropertyDefinitions: {},
    componentPropertyReferences: null,
    mainComponent: null,
    textStyleId: '',
    // Comme dans Figma : la propriété existe sur tout nœud de scène (le constructeur teste sa présence).
    layoutSizingHorizontal: 'HUG',
    layoutSizingVertical: 'HUG',
    layoutPositioning: 'AUTO',
    ...extra,
  }
  Object.assign(node, methods(node))
  strictSizing(node)
  return node
}

/** Pendant une copie d'arbre, les règles de Figma ne s'appliquent pas (la copie est posée d'un bloc). */
let copying = false

/**
 * Comme le VRAI Figma (défaut M, 25/09/2026 — des erreurs que le faux laissait passer) : `FILL` ne se pose
 * que sur l'enfant d'un cadre auto-layout, `HUG` que sur un cadre auto-layout ou un texte. Le vrai lève.
 */
function strictSizing(node: FakeNode): void {
  for (const field of ['layoutSizingHorizontal', 'layoutSizingVertical'] as const) {
    let value = node[field] as string
    Object.defineProperty(node, field, {
      enumerable: true,
      get: () => value,
      set: (v: string) => {
        if (!copying && v !== value) {
          const parentMode = node.parent?.layoutMode as string | undefined
          if (v === 'FILL' && (!parentMode || parentMode === 'NONE'))
            throw new Error(`FILL can only be set on children of auto-layout frames (${node.name})`)
          const mode = node.layoutMode as string | undefined
          if (v === 'HUG' && node.type !== 'TEXT' && (!mode || mode === 'NONE'))
            throw new Error(`HUG can only be set on auto-layout frames and text nodes (${node.name})`)
        }
        value = v
      },
    })
  }
}

function detach(child: FakeNode): void {
  if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child)
  child.parent = null
}

function defsOf(component: FakeNode): FakeNode['componentPropertyDefinitions'] {
  return component.parent?.type === 'COMPONENT_SET'
    ? component.parent.componentPropertyDefinitions
    : component.componentPropertyDefinitions
}

function cloneTree(src: FakeNode, asType?: string): FakeNode {
  const outer = copying
  copying = true
  try {
    return cloneInto(src, asType)
  } finally {
    copying = outer
  }
}

function cloneInto(src: FakeNode, asType?: string): FakeNode {
  const copy = makeNode(asType ?? src.type)
  for (const [k, v] of Object.entries(src)) {
    if (['id', 'type', 'parent', 'children'].includes(k) || typeof v === 'function') continue
    copy[k] = Array.isArray(v) ? [...v] : v && typeof v === 'object' && k !== 'mainComponent' ? { ...v } : v
  }
  for (const c of src.children) {
    const cc = cloneInto(c)
    cc.parent = copy
    copy.children.push(cc)
  }
  return copy
}

function walk(node: FakeNode, visit: (n: FakeNode) => void): void {
  visit(node)
  for (const c of node.children) walk(c, visit)
}

function methods(node: FakeNode): Props {
  return {
    appendChild(child: FakeNode) {
      detach(child)
      child.parent = node
      node.children.push(child)
    },
    insertChild(index: number, child: FakeNode) {
      detach(child)
      child.parent = node
      node.children.splice(index, 0, child)
    },
    remove() {
      detach(node)
      node.removed = true
    },
    resize(w: number, h: number) {
      node.width = w
      node.height = h
    },
    setBoundVariable(field: string, v: { id: string } | null) {
      if (v) node.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: v.id }
      else delete node.boundVariables[field]
    },
    async setTextStyleIdAsync(id: string) {
      node.textStyleId = id
    },
    async setEffectStyleIdAsync(id: string) {
      node.effectStyleId = id
    },
    async loadAsync() {},
    setExplicitVariableModeForCollection(collection: { id: string }, modeId: string) {
      node.explicitMode = { [collection.id]: modeId }
    },
    addComponentProperty(name: string, type: ComponentPropertyType, defaultValue: unknown) {
      const key = `${name}#${++seq}`
      node.componentPropertyDefinitions[key] = { type, defaultValue }
      return key
    },
    deleteComponentProperty(key: string) {
      delete node.componentPropertyDefinitions[key]
    },
    createInstance() {
      const inst = cloneTree(node, 'INSTANCE')
      inst.mainComponent = node
      const props: Record<string, { type: ComponentPropertyType; value: unknown }> = {}
      for (const [k, d] of Object.entries(defsOf(node))) props[k] = { type: d.type, value: d.defaultValue }
      inst.componentProperties = props
      return inst
    },
    setProperties(values: Record<string, unknown>) {
      // Ce que la page a FOURNI (et non la valeur d'auteur) : lu par les gardes de rendu.
      node.explicitProperties = { ...((node.explicitProperties as Record<string, unknown>) ?? {}), ...values }
      walk(node, n => {
        for (const [field, key] of Object.entries(n.componentPropertyReferences ?? {})) {
          if (!(key in values)) continue
          if (field === 'characters') n.characters = String(values[key])
          if (field === 'visible') n.visible = Boolean(values[key])
        }
      })
      const props = (node.componentProperties ?? {}) as Record<string, { value: unknown }>
      for (const [k, v] of Object.entries(values)) if (props[k]) props[k].value = v
    },
    detachInstance() {
      node.type = 'FRAME'
      node.mainComponent = null
      return node
    },
    findAll(pred: (n: FakeNode) => boolean) {
      const out: FakeNode[] = []
      for (const c of node.children) walk(c, n => pred(n) && out.push(n))
      return out
    },
    findOne(pred: (n: FakeNode) => boolean) {
      let found: FakeNode | null = null
      for (const c of node.children) walk(c, n => void (!found && pred(n) && (found = n)))
      return found
    },
  }
}

/** Le faux `figma` des constructeurs, et de quoi parcourir ce qu'il a construit. */
export function createFakeScene(fonts: FontName[] = []) {
  const pages: FakeNode[] = [makeNode('PAGE', { name: 'Page 1' })]
  const textStyles = ['display', 'title', 'heading', 'body', 'caption', 'label', 'mono'].map(n => ({
    id: `S:text/${n}`,
    name: `text/${n}`,
    fontName: { family: 'Inter', style: 'Regular' },
  }))
  // Les styles d'effet que `syncEffectStyles` écrit : un par ombre extraite et par mode.
  const effectStyles = tokensJson.shadows
    .map(s => s.name)
    .flatMap(n => ['light', 'dark'].map(m => ({ id: `S:shadow/${n}/${m}`, name: `shadow/${n}/${m}` })))
  const svgs: string[] = []
  const api = {
    createFrame: () => makeNode('FRAME'),
    createComponent: () => makeNode('COMPONENT'),
    createText: () => makeNode('TEXT', { fontSize: 12 }),
    createRectangle: () => makeNode('RECTANGLE'),
    createEllipse: () => makeNode('ELLIPSE'),
    createNodeFromSvg: (svg: string) => {
      svgs.push(svg)
      const frame = makeNode('FRAME')
      const vector = makeNode('VECTOR', {
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      })
      vector.parent = frame
      frame.children.push(vector)
      return frame
    },
    combineAsVariants: (nodes: FakeNode[], parent: FakeNode) => {
      const set = makeNode('COMPONENT_SET')
      for (const n of nodes) (set.appendChild as (c: FakeNode) => void)(n)
      ;(parent.appendChild as (c: FakeNode) => void)(set)
      return set
    },
    createPage: () => {
      const p = makeNode('PAGE')
      pages.push(p)
      return p
    },
    root: { children: pages },
    variables: {
      setBoundVariableForPaint: (p: SolidPaint, _field: 'color', v: { id: string } | null) => ({
        ...p,
        boundVariables: v ? { color: { type: 'VARIABLE_ALIAS', id: v.id } } : {},
      }),
    },
    loadFontAsync: async () => {},
    listAvailableFontsAsync: async () => fonts.map(fontName => ({ fontName })),
    getLocalTextStylesAsync: async () => textStyles,
    getLocalEffectStylesAsync: async () => effectStyles,
  }
  return { api: api as unknown as Scene['api'], pages, svgs }
}

/** Tous les nœuds sous une page (la page exclue). */
export function descendants(root: FakeNode): FakeNode[] {
  const out: FakeNode[] = []
  for (const c of root.children) walk(c, n => out.push(n))
  return out
}
