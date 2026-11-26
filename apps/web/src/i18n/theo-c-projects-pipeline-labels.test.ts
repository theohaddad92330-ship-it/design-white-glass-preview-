import { DEFAULT_STAGE_LABELS, PIPELINE_STAGES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import projectsEn from '@/i18n/locales/en/projects.json'
import projectsFr from '@/i18n/locales/fr/projects.json'

// Théo C projects-pipeline.R1 / R2 — « Affaires » et les cinq colonnes de Théo (Louis 22/10/2026).
describe('Théo C projects-pipeline — titre et colonnes', () => {
  it('R1 — l’écran s’appelle « Affaires » et dit « Du premier échange au démarrage »', () => {
    expect(projectsFr.page.title).toBe('Affaires')
    expect(projectsFr.page.introTitleWithoutName).toBe('Affaires')
    expect(projectsFr.page.introSubtitle).toBe('Du premier échange au démarrage.')
    expect(projectsEn.page.title).toBe('Deals')
  })

  it('R2 — les libellés de colonne lus par l’écran sont ceux du contrat, en FR comme en EN', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(projectsFr.stage.states[stage]).toBe(DEFAULT_STAGE_LABELS[stage].fr)
      expect(projectsEn.stage.states[stage]).toBe(DEFAULT_STAGE_LABELS[stage].en)
    }
  })

  it('A1 — Perdue et En sommeil restent nommées : ce sont des sorties, pas des colonnes', () => {
    expect(projectsFr.stage.states.lost).toBe('Perdue')
    expect(projectsFr.stage.states.dormant).toBe('En sommeil')
  })
})
