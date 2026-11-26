import type { CollectionLike, EffectStyleLike, Log, PageLike, SyncApi, TextStyleLike, VariableLike } from './api'

/**
 * Un FAUX `figma`, pour les tests : juste ce que `SyncApi` déclare, avec un
 * état en mémoire qu'on peut compter après deux synchronisations.
 */
interface FakeVariable extends VariableLike {
  valuesByMode: Record<string, VariableValue>
  codeSyntax: Partial<Record<CodeSyntaxPlatform, string>>
}

interface FakeOptions {
  /** Simule le plan Starter : `addMode` lève. */
  singleModeOnly?: boolean
  /** Les polices installées. */
  fonts?: FontName[]
}

export function createFakeFigma(options: FakeOptions = {}) {
  let seq = 0
  const nextId = (prefix: string): string => `${prefix}:${++seq}`
  const collections: CollectionLike[] = []
  const variables: FakeVariable[] = []
  const textStyles: TextStyleLike[] = []
  const effectStyles: EffectStyleLike[] = []
  const pages: PageLike[] = [{ name: 'Page 1' }]
  const loadedFonts: FontName[] = []

  const api: SyncApi = {
    variables: {
      getLocalVariableCollectionsAsync: async () => [...collections],
      getLocalVariablesAsync: async () => [...variables],
      createVariableCollection: name => {
        const modes: { modeId: string; name: string }[] = [{ modeId: nextId('mode'), name: 'Mode 1' }]
        const c: CollectionLike = {
          id: nextId('collection'),
          name,
          modes,
          renameMode: (modeId, newName) => {
            const m = modes.find(x => x.modeId === modeId)
            if (m) m.name = newName
          },
          addMode: modeName => {
            if (options.singleModeOnly) throw new Error('Limited to 1 modes only')
            const modeId = nextId('mode')
            modes.push({ modeId, name: modeName })
            return modeId
          },
        }
        collections.push(c)
        return c
      },
      createVariable: (name, collection, type) => {
        const v: FakeVariable = {
          id: nextId('var'),
          name,
          description: '',
          resolvedType: type,
          variableCollectionId: collection.id,
          scopes: ['ALL_SCOPES'],
          valuesByMode: {},
          codeSyntax: {},
          setValueForMode(modeId, value) {
            this.valuesByMode[modeId] = value
          },
          setVariableCodeSyntax(platform, value) {
            this.codeSyntax[platform] = value
          },
        }
        variables.push(v)
        return v
      },
      createVariableAlias: v => ({ type: 'VARIABLE_ALIAS', id: v.id }),
    },
    getLocalTextStylesAsync: async () => [...textStyles],
    createTextStyle: () => {
      const s = {
        name: '',
        description: '',
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 12,
        lineHeight: { unit: 'AUTO' },
        letterSpacing: { unit: 'PERCENT', value: 0 },
      } as TextStyleLike
      textStyles.push(s)
      return s
    },
    getLocalEffectStylesAsync: async () => [...effectStyles],
    createEffectStyle: () => {
      const s: EffectStyleLike = { name: '', description: '', effects: [] }
      effectStyles.push(s)
      return s
    },
    listAvailableFontsAsync: async () => (options.fonts ?? []).map(fontName => ({ fontName })),
    loadFontAsync: async font => {
      loadedFonts.push(font)
    },
    root: { children: pages },
    createPage: () => {
      const p: PageLike = { name: '' }
      pages.push(p)
      return p
    },
  }
  return { api, collections, variables, textStyles, effectStyles, pages, loadedFonts }
}

export function createMemoryLog(): Log & { lines: { level: string; text: string }[] } {
  const lines: { level: string; text: string }[] = []
  return {
    lines,
    info: text => lines.push({ level: 'info', text }),
    warn: text => lines.push({ level: 'warn', text }),
    error: text => lines.push({ level: 'error', text }),
  }
}
