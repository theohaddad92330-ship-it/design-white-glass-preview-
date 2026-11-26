import { PILOTAGE_METRIC_SOURCES, type PilotageMetric } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MetricRow } from './LevelDetail'

/**
 * #1440 — CHAQUE CHIFFRE OUVRE SA PROVENANCE.
 *
 * « Chaque KPI doit ouvrir source, période, dénominateur, dernière mise à
 * jour. C'est déjà la règle du produit ; si un chiffre de Pilotage n'ouvre pas
 * là-dessus, c'est un défaut. »
 *
 * Il l'était : `GET /pilotage/chain` ne rendait que `key`, `value`, `unit` et
 * `status`. Ce n'était donc pas un défaut d'affichage — la donnée n'existait
 * pas, et l'écran ne pouvait rien ouvrir.
 */
const metric = (over: Partial<PilotageMetric> = {}): PilotageMetric => ({
  key: 'contactsTargeted',
  value: 42,
  unit: 'count',
  status: 'ok',
  source: ['contacts'],
  window: 'current_state',
  ...over,
})

const renderRow = (m: PilotageMetric, generatedAt?: string) =>
  render(<MetricRow metric={m} known={new Set()} baseline={undefined} generatedAt={generatedAt} />)

describe('la provenance d’un indicateur de Pilotage', () => {
  it('nomme la source, la période et l’heure du calcul', () => {
    renderRow(metric(), '2026-09-06T21:12:00.000Z')
    expect(screen.getByText(/Source : contacts/)).toBeInTheDocument()
    // La période est un FAIT à dire : aucune requête de la chaîne ne porte de
    // fenêtre temporelle, et l'écran écrivait « aucun ce mois-ci » à côté.
    expect(screen.getByText(/État courant, pas une période/)).toBeInTheDocument()
    expect(screen.getByText(/Calculé à/)).toBeInTheDocument()
  })

  it('un taux ouvre AUSSI son dénominateur', () => {
    renderRow(metric({ key: 'conversionRate', unit: 'rate', value: 0.67, denominator: 6, source: ['project_needs'] }))
    expect(screen.getByText(/Sur 6/)).toBeInTheDocument()
  })

  it('un indicateur NON MESURÉ ne nomme aucune source', () => {
    // Nommer la table d'où viendrait un chiffre qu'on n'a pas lu laisserait
    // croire qu'on l'a lu — même règle que « non mesuré n'est pas zéro ».
    renderRow(metric({ key: 'profilesPushed', value: null, status: 'non_mesure', source: [] }))
    expect(screen.getByText(/Aucune source lue/)).toBeInTheDocument()
    expect(screen.queryByText(/Source : /)).not.toBeInTheDocument()
  })

  it('sans heure servie, la ligne se tait au lieu d’inventer « à l’instant »', () => {
    // Pendant un déploiement, l'écran lit l'API précédente : elle ne rend pas
    // `generatedAt`. Une heure inventée serait pire qu'une heure absente.
    renderRow(metric())
    expect(screen.getByText(/Source : contacts/)).toBeInTheDocument()
    expect(screen.queryByText(/Calculé à/)).not.toBeInTheDocument()
  })

  /**
   * #2500 (démo, GÊNANT, mesuré en prod le 17/09/2026) — `/pilotage` affichait
   * « Source : contacts, record_field_audits » : un nom de TABLE, brut, à
   * l'écran. `PILOTAGE_METRIC_SOURCES` (packages/contracts/src/schemas/pilotage.ts)
   * porte des identifiants SQL, pas des libellés — la garde ici prouve qu'AUCUN
   * ne s'affiche tel quel, pour toutes les tables du registre, pas seulement
   * celle vue en recette.
   */
  describe('une source ne s’affiche jamais comme un nom de table (#2500)', () => {
    afterEach(() => cleanup())

    it('traduit une source composée en libellé humain', () => {
      renderRow(metric({ key: 'correctionRate', source: ['contacts', 'record_field_audits'] }))
      expect(screen.queryByText(/record_field_audits/)).not.toBeInTheDocument()
      const line = screen.getByText(/^Source : /)
      expect(line.textContent).not.toMatch(/_/)
    })

    it('couvre TOUTES les tables déclarées par le registre, pas seulement celle vue en recette', () => {
      const tables = Array.from(new Set(Object.values(PILOTAGE_METRIC_SOURCES).flat()))
      expect(tables.length).toBeGreaterThan(0) // la garde LIT quelque chose (corpus non vide)
      for (const table of tables) {
        cleanup()
        renderRow(metric({ source: [table] }))
        const line = screen.getByText(/^Source : /)
        expect(line.textContent).not.toMatch(/_/)
      }
    })
  })
})
