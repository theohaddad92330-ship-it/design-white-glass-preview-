import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditStrategicCombination } from './AuditStrategicCombination'

/**
 * #2066.19 / #2066.27 — DÉCISION Louis 17/09 : la combinaison de voies
 * générée s'affiche dans l'audit (à côté de la stratégie validée), en lecture
 * seule. Ce que ce fichier garde : la combinaison bornée s'affiche VERBATIM,
 * chaque canal NOMMÉ ; l'absence ne rend RIEN (pas de bloc vide, pas de « 0 »).
 */
describe('AuditStrategicCombination', () => {
  // Sait dire NON : sans combinaison générée, aucun bloc — ni titre, ni
  // placeholder « non mesuré ». Décision explicite de ce lot, distincte du
  // reste de l'audit.
  it('sans combinaison générée (moins de 2 canaux déclarés) : aucun bloc, pas de « 0 »', () => {
    const { container } = renderWithRouter(<AuditStrategicCombination strategicOptions={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche chaque voie de la combinaison, nommée verbatim', async () => {
    renderWithRouter(
      <AuditStrategicCombination
        strategicOptions={[
          { label: 'Direct client final', potential: null, prerequisite: null, limit: null, load: null },
          { label: 'Rang 2', potential: null, prerequisite: null, limit: null, load: null },
        ]}
      />,
    )
    expect(await screen.findByText('Direct client final')).toBeInTheDocument()
    expect(screen.getByText('Rang 2')).toBeInTheDocument()
  })
})
