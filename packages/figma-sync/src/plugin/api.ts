/**
 * Le sous-ensemble de l'API Figma dont la synchronisation a besoin.
 *
 * Déclaré ici, étroit, pour deux raisons : le vrai `figma` s'y assigne tel
 * quel (voir `code.ts`), et un FAUX `figma` de vingt lignes suffit à tester la
 * logique d'upsert (`upsert.test.ts`) — c'est elle qui garantit qu'une
 * deuxième synchronisation ne duplique rien.
 */

interface ModeLike {
  modeId: string
  name: string
}

export interface CollectionLike {
  id: string
  name: string
  modes: readonly ModeLike[]
  renameMode(modeId: string, newName: string): void
  /** Lève une exception quand le plan du fichier limite le nombre de modes (Starter : 1). */
  addMode(name: string): string
}

export interface VariableLike {
  id: string
  name: string
  description: string
  resolvedType: VariableResolvedDataType
  variableCollectionId: string
  scopes: VariableScope[]
  setValueForMode(modeId: string, value: VariableValue): void
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void
}

/** @public — nommé par le faux `figma` des tests (fake-figma.ts). */
export interface TextStyleLike {
  name: string
  description: string
  fontName: FontName
  fontSize: number
  lineHeight: LineHeight
  letterSpacing: LetterSpacing
}

/** @public — nommé par le faux `figma` des tests (fake-figma.ts). */
export interface EffectStyleLike {
  name: string
  description: string
  effects: ReadonlyArray<Effect>
}

export interface PageLike {
  name: string
}

export interface SyncApi {
  variables: {
    getLocalVariableCollectionsAsync(): Promise<CollectionLike[]>
    getLocalVariablesAsync(): Promise<VariableLike[]>
    createVariableCollection(name: string): CollectionLike
    createVariable(name: string, collection: CollectionLike, type: VariableResolvedDataType): VariableLike
    createVariableAlias(variable: VariableLike): VariableAlias
  }
  getLocalTextStylesAsync(): Promise<TextStyleLike[]>
  createTextStyle(): TextStyleLike
  getLocalEffectStylesAsync(): Promise<EffectStyleLike[]>
  createEffectStyle(): EffectStyleLike
  listAvailableFontsAsync(): Promise<Font[]>
  loadFontAsync(font: FontName): Promise<void>
  root: { children: readonly PageLike[] }
  createPage(): PageLike
}

/** Le journal que l'interface affiche. Rien n'est silencieux : un repli se dit. */
export interface Log {
  info(text: string): void
  warn(text: string): void
  error(text: string): void
}
