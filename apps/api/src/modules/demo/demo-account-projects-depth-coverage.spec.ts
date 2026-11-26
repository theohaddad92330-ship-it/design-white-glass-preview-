import { isPipelineStage } from '@bellum/contracts'
import { DEMO_ACCOUNT_PROJECTS_DEPTH_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #1889 — LA PARITÉ DÉMO DE LA BARRE D'OUTILS DE L'ONGLET PROJETS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RECOMPTE, ET POURQUOI ELLE NE CROIT PAS LA PROSE
 * ─────────────────────────────────────────────────────────────────────────────
 * La barre n'ajoute aucune table : `demo-coverage.spec.ts` ne lui pose aucune
 * question. Une pastille qui ne retire jamais rien se lit pourtant comme
 * cassée, et c'est ce qui arrivait à trois des quatre — toutes les opportunités
 * de la salle étaient des `besoin` à une étape du pipe.
 *
 * Cette garde vérifie donc sur le JEU que chaque facette a de quoi AGIR : au
 * moins un signal, au moins une ligne hors pipe, au moins une affaire sans
 * tâche ouverte et au moins une avec, et assez de libellés distincts pour
 * qu'une recherche ait un sens. Elle sait dire non : vider `detectedSignals`,
 * ou donner une `nextAction` aux trois affaires, la fait rougir.
 */
const pipeline = DEMO_DELIVERY_CLIENT.pipelineProjects
const signals = DEMO_DELIVERY_CLIENT.detectedSignals

describe('parité démo — la profondeur de l’onglet Projets d’un compte', () => {
  it('LIT un jeu réel — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(Array.isArray(pipeline)).toBe(true)
    expect(Array.isArray(signals)).toBe(true)
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
    expect(DEMO_SEEDED_TABLES).toContain('tasks')
  })

  it('porte au moins un SIGNAL — sans quoi « Projets » et « Signaux » ne séparent rien', () => {
    expect(signals.length).toBeGreaterThanOrEqual(1)
    // Des libellés distincts : deux signaux du même nom ne se départagent pas.
    expect(new Set(signals.map(signal => signal.label)).size).toBe(signals.length)
  })

  it('ne CHIFFRE aucun signal — un signal n’est pas une affaire', () => {
    // `amount_cents` et `expected_close_in_days` n'existent pas sur la forme :
    // le test le lit sur les données, pas sur le type, parce que c'est la
    // donnée semée qui atteint l'écran.
    // ⚠️ #2172 — `primary_domain_code` est ARRIVÉ sur deux signaux, et il ne
    // chiffre rien : c'est le domaine d'offre qui les fait CONVERGER dans la
    // file « Pistes à qualifier ». La garde reste stricte sur ce qui compte —
    // aucun montant, aucune échéance — au lieu de figer la forme entière, ce
    // qui aurait interdit tout enrichissement non chiffré du semis.
    for (const signal of signals) {
      const keys = Object.keys(signal).sort()
      expect(keys).toEqual(expect.arrayContaining(['detail', 'detected_days_ago', 'label']))
      expect(
        keys.filter(key => !['detail', 'detected_days_ago', 'label', 'primary_domain_code'].includes(key)),
      ).toEqual([])
      expect(signal).not.toHaveProperty('amount_cents')
      expect(signal).not.toHaveProperty('expected_close_in_days')
    }
  })

  it('porte une ligne HORS PIPE — sans quoi « Dans le pipe » ne retire jamais rien', () => {
    // Les signaux sont semés à `detected`, que `isPipelineStage` écarte : c'est
    // ce qui rend la pastille visible à l'œuvre en démonstration.
    expect(isPipelineStage('detected')).toBe(false)
    expect(signals.length).toBeGreaterThanOrEqual(1)
    // …et les affaires du pipe, elles, y sont bien.
    expect(pipeline.every(deal => isPipelineStage(deal.stage))).toBe(true)
  })

  it('porte une affaire AVEC tâche ouverte et une SANS — les deux états de la colonne', () => {
    const withAction = [DEMO_DELIVERY_CLIENT.openProject, ...pipeline].filter(deal => deal.nextAction)
    const withoutAction = pipeline.filter(deal => !deal.nextAction)

    expect(withAction.length).toBeGreaterThanOrEqual(1)
    expect(withoutAction.length).toBeGreaterThanOrEqual(1)
  })

  it('porte assez de libellés DISTINCTS pour qu’une recherche ait un sens', () => {
    const labels = [
      DEMO_DELIVERY_CLIENT.openProject.label,
      ...pipeline.map(deal => deal.label),
      ...signals.map(signal => signal.label),
    ]

    expect(labels.length).toBeGreaterThanOrEqual(4)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_ACCOUNT_PROJECTS_DEPTH_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_PROJECTS_DEPTH_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
