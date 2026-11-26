import { beforeAll, describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { i18n } from '@/i18n'
import { pipelineHeaderSummary } from './pipeline-header-summary'

/**
 * #2169.18 — LA PHRASE DE TÊTE, PAS UN RECALCUL.
 *
 * Les quatre segments viennent des mêmes verdicts que `PipelineKpis` : ce test
 * ne vérifie pas une nouvelle règle métier, il vérifie que la phrase reste
 * fidèle à `pipelineWithoutNextAction` et au filtre `withoutProfile` déjà en
 * place sur `ProjectsPage.tsx`.
 */
describe('pipelineHeaderSummary', () => {
  let fr: TFunction<'projects'>
  let en: TFunction<'projects'>

  beforeAll(async () => {
    await i18n.loadNamespaces('projects')
    fr = i18n.getFixedT('fr', 'projects') as TFunction<'projects'>
    en = i18n.getFixedT('en', 'projects') as TFunction<'projects'>
  })

  // #4191 (E2) — « N pistes » = `pistes_to_review`, jamais `summary.intake` (les affaires à qualifier).
  const measured = (needs: number | null) => ({
    opportunities_active: { value: null, measured: false, definition_key: 'opportunities_active' },
    pistes_to_review: { value: needs, measured: needs !== null, definition_key: 'pistes_to_review' },
  })
  const summary = { total_count: 12, intake: 3, columns: [{ stage: 'qualified', count: 12, without_next_action: 4 }] }
  const projects = [
    { stage: 'qualified', positioned_count: 0 },
    { stage: 'qualified', positioned_count: 2 },
    { stage: 'qualified', positioned_count: 0 },
    // `isPipelineStage` couvre aussi « won » (même règle que le filtre rapide
    // `withoutProfile` de `ProjectsPage.tsx`, qui laisse les affaires signées
    // dans le périmètre) : ce projet compte donc dans le « sans profil ».
    { stage: 'won', positioned_count: 0 },
  ] as const

  it('combine les quatre nombres déjà connus, en FR', () => {
    expect(pipelineHeaderSummary(fr, summary as never, projects, measured(3))).toBe(
      '12 actives · 4 sans action · 3 pistes · 3 sans profil',
    )
  })

  it('combine les quatre nombres déjà connus, en EN', () => {
    expect(pipelineHeaderSummary(en, summary as never, projects, measured(3))).toBe(
      '12 active · 4 without action · 3 leads · 3 without a profile',
    )
  })

  it('nomme "sans action" au lieu de zéro quand le résumé n’a pas de colonnes', () => {
    const unmeasured = { total_count: 5, intake: 1, columns: [] }
    expect(pipelineHeaderSummary(fr, unmeasured as never, projects, measured(1))).toBe(
      '5 actives · Sans action : non mesuré · 1 piste · 3 sans profil',
    )
  })

  it('nomme "sans profil" au lieu de zéro quand aucun projet ne porte le champ', () => {
    const noProfileField = [{ stage: 'qualified' }, { stage: 'qualified' }] as const
    expect(pipelineHeaderSummary(fr, summary as never, noProfileField, measured(3))).toBe(
      '12 actives · 4 sans action · 3 pistes · Sans profil : non mesuré',
    )
  })

  // #4193 — « N actives » vient de `GET /crm-counters` (une définition écrite) :
  // quand le compteur est mesuré, il PRIME sur le résumé de la route pipeline.
  it('lit « actives » et « pistes » sur les compteurs CRM quand ils sont mesurés', () => {
    const counters = {
      opportunities_active: { value: 9, measured: true, definition_key: 'opportunities_active' },
      pistes_to_review: { value: 2, measured: true, definition_key: 'pistes_to_review' },
    }
    expect(pipelineHeaderSummary(fr, summary as never, projects, counters)).toBe(
      '9 actives · 4 sans action · 2 pistes · 3 sans profil',
    )
  })

  it('« pistes » non mesuré : NOMMÉ, sans repli sur les affaires à qualifier ni « 0 »', () => {
    expect(pipelineHeaderSummary(fr, summary as never, projects, measured(null))).toBe(
      '12 actives · 4 sans action · Pistes : non mesuré · 3 sans profil',
    )
    expect(pipelineHeaderSummary(fr, summary as never, projects)).toContain('Pistes : non mesuré')
  })
})
