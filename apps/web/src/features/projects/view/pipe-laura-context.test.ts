import { describe, expect, it } from 'vitest'
import { lauraPageContextSchema } from '@bellum/contracts'
import { pipeLauraContext } from './pipe-laura-context'

/**
 * #1904 — CE QUE LE PIPE DIT À LAURA.
 *
 * L'exemple de l'issue : « Cette page suit tes opportunités commerciales. Trois
 * dossiers n'ont aucune prochaine action. » Le compte « sans prochaine action »
 * ne retient qu'un `null` AFFIRMÉ : `undefined` veut dire que l'API ne l'a pas
 * dit (fenêtre de déploiement), et le compter serait un zéro qui ment à l'envers.
 */
const t = ((key: string) => key) as unknown as Parameters<typeof pipeLauraContext>[0]

const PROJECTS = [{ next_action: null }, { next_action: null }, { next_action: 'Relancer' }, {}]
const READY = {
  isLoading: false,
  summary: { total_count: 4, intake: 2 },
  pipelineProjects: PROJECTS as readonly { next_action?: unknown }[] | null,
  stageLabel: null as string | null,
}

describe('pipeLauraContext', () => {
  it('déclare l’utilité, la vue, les affaires du pipe et celles sans prochaine action', () => {
    const context = pipeLauraContext(t, READY)
    expect(context.label).toBe('page.title')
    expect(context.purpose).toBe('laura.purpose')
    expect(context.facets).toEqual([
      { label: 'laura.lens', value: 'lens.pipeline' },
      { label: 'laura.inPipe', value: '4' },
      { label: 'laura.withoutNextAction', value: '2' },
    ])
    expect(context.missing).toBeUndefined()
  })

  it('nomme le filtre d’étape posé', () => {
    const context = pipeLauraContext(t, { ...READY, stageLabel: 'Qualifié' })
    expect(context.facets).toContainEqual({ label: 'laura.stage', value: 'Qualifié' })
  })

  it('un pipe MESURÉ vide, sans rien à qualifier, le dit comme un manque', () => {
    const context = pipeLauraContext(t, { ...READY, summary: { total_count: 0, intake: 0 }, pipelineProjects: [] })
    expect(context.missing).toEqual(['emptyState.noProjectTitle'])
  })

  it('une lecture en échec ne déclare ni compte ni manque — non mesuré n’est pas zéro', () => {
    const context = pipeLauraContext(t, { ...READY, summary: null, pipelineProjects: null })
    expect(context.facets).toEqual([{ label: 'laura.lens', value: 'lens.pipeline' }])
    expect(context.missing).toBeUndefined()
  })

  it('se déclare en chargement, et reste un contexte valide', () => {
    expect(pipeLauraContext(t, { ...READY, isLoading: true }).state).toBe('loading')
    expect(lauraPageContextSchema.safeParse(pipeLauraContext(t, READY)).success).toBe(true)
  })
})
