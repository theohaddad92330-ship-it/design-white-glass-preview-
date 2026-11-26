import { describe, expect, it } from 'vitest'
import { lauraPageContextSchema, renderLauraPageContext } from '@bellum/contracts'
import { vivierLauraContext } from './vivier-laura-context'

/**
 * #1904 — CE QUE LE VIVIER DIT À LAURA.
 *
 * L'exemple de l'issue : « Cette page rassemble les consultants que tu peux
 * positionner. Ton vivier est vide. Tu peux créer un premier consultant. » Le
 * `t` de test rend la clé : on vérifie QUELLE phrase part, pas sa traduction.
 */
const t = ((key: string) => key) as unknown as Parameters<typeof vivierLauraContext>[0]

const READY = { isLoading: false, total: 12, hasQuery: false, filters: [] as string[] }

describe('vivierLauraContext', () => {
  it('dit à quoi sert l’écran et le geste qu’il offre', () => {
    const context = vivierLauraContext(t, READY)
    expect(context.label).toBe('page.title')
    expect(context.purpose).toBe('laura.purpose')
    expect(context.actions).toEqual(['add'])
    expect(context.facets).toContainEqual({ label: 'laura.inPool', value: '12' })
  })

  it('un vivier MESURÉ vide le dit comme un manque', () => {
    const context = vivierLauraContext(t, { ...READY, total: 0 })
    expect(context.missing).toEqual(['laura.emptyPool'])
  })

  // #1904.9 — LE GESTE LE PLUS UTILE. Un vivier vide n'a qu'un seul geste
  // rendu (« add ») : le recommander est honnête, ce n'est pas un rang
  // calculé sur plusieurs options.
  it('#1904.9 — recommande le seul geste utile quand le vivier est MESURÉ vide', () => {
    const context = vivierLauraContext(t, { ...READY, total: 0 })
    expect(context.recommendedAction).toBe('add')
  })

  it('#1904.9 — ne recommande rien quand le vivier a déjà du contenu', () => {
    const context = vivierLauraContext(t, READY)
    expect(context.recommendedAction).toBeUndefined()
  })

  it('un filtre qui ne ramène rien n’est PAS un vivier vide', () => {
    const context = vivierLauraContext(t, { ...READY, total: 0, hasQuery: true, filters: ['Compétences : Java'] })
    expect(context.missing).toBeUndefined()
    expect(context.facets).toContainEqual({ label: 'laura.found', value: '0' })
    expect(context.facets).toContainEqual({ label: 'laura.filters', value: 'Compétences : Java' })
  })

  it('une lecture qui n’a pas abouti ne dit ni un nombre ni « vide » — non mesuré n’est pas zéro', () => {
    const context = vivierLauraContext(t, { ...READY, total: null })
    expect(context.facets.some(facet => facet.label === 'laura.inPool')).toBe(false)
    expect(context.missing).toBeUndefined()
  })

  it('pendant le chargement, se déclare en chargement', () => {
    const context = vivierLauraContext(t, { ...READY, isLoading: true, total: null })
    expect(context.state).toBe('loading')
  })

  it('reste un contexte VALIDE même avec des filtres très longs — sinon il ne partirait pas', () => {
    const filters = Array.from({ length: 12 }, (_, index) => `Compétences : ${'TypeScript '.repeat(4)}${index}`)
    const context = vivierLauraContext(t, { ...READY, hasQuery: true, filters })
    expect(lauraPageContextSchema.safeParse(context).success).toBe(true)
  })

  it('arrive jusqu’au texte lu par le modèle', () => {
    const rendered = renderLauraPageContext(vivierLauraContext(t, { ...READY, total: 0 }))
    expect(rendered).toContain('laura.purpose')
    expect(rendered).toContain('laura.emptyPool')
    expect(rendered).toContain('add')
  })
})
