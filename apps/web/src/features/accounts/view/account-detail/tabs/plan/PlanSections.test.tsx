import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanSections } from './PlanSections'
import { buildPlanViewData } from './planViewData'

/**
 * #2123.11-.19 — les sections nommées du plan, verdict en tête.
 *
 * ⚠️ #2617.2 (21/09/2026) — RENVERSEMENT ASSUMÉ de ce que ce fichier gardait.
 * Il exigeait « une section non produite se NOMME vide, elle ne disparaît pas »
 * et comptait SEPT « Non produit par la dernière analyse. » sur un plan vide.
 * La doctrine du 20/09 (#2613) tranche l'inverse dans une LISTE : une absence
 * ne fait AUCUNE ligne. Mesuré en production le 21/09 sur AIRBUS — un plan
 * d'action entier réduit à sept fois « Non produit », qui ne dit rien de plus
 * qu'un écran vide et le dit sept fois. L'exception SCORE ne s'applique pas
 * ici : ces sections ne sont pas les axes d'une note, rien ne se lit « sur 7 ».
 */
describe('PlanSections', () => {
  it('ne rend QUE les sections produites, dans l’ordre', () => {
    render(
      <PlanSections
        data={buildPlanViewData({ action_plan: { strategy: 'Entrer par la DSI sur la refonte du SI RH.' } })}
        verdict={{ verdict: 'GO', name: 'AGIR MAINTENANT', line: 'Cycle d’infogérance ouvert en 2027.' }}
      />,
    )

    const titles = screen.getAllByRole('heading', { level: 4 }).map(node => node.textContent)
    expect(titles).toEqual(['Verdict stratégique', 'Objectif du compte'])
    expect(screen.getByText('Entrer par la DSI sur la refonte du SI RH.')).toBeInTheDocument()
  })

  it('#2617.2 — une section non produite ne fait AUCUNE ligne, pas même son titre', () => {
    render(
      <PlanSections
        data={buildPlanViewData({ action_plan: { strategy: 'Entrer par la DSI sur la refonte du SI RH.' } })}
      />,
    )

    expect(screen.queryByText('Non produit par la dernière analyse.')).toBeNull()
    expect(screen.queryByText('Trois prochaines actions')).toBeNull()
    expect(screen.queryByText("Ce qu'il ne faut pas faire")).toBeNull()
    // Le test qui sait dire NON : le titre de la section PRODUITE, lui, est là.
    // Sans cette ligne, un composant qui ne rendrait jamais rien passerait.
    expect(screen.getByText('Objectif du compte')).toBeInTheDocument()
  })

  it('#2617.2 — un plan dont RIEN n’est produit ne rend pas même son cadre', () => {
    const { container } = render(<PlanSections data={buildPlanViewData({})} />)

    // Ni les sept absences, ni la carte qui les porterait : un cadre vide
    // au-dessus d'un compte plein dit « il n'y a rien à faire », ce qui est faux.
    expect(screen.queryByText('Le plan, section par section')).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it('#2123.11 — ouvre sur le verdict LU, sa pastille et sa phrase', () => {
    render(
      <PlanSections
        data={buildPlanViewData({})}
        verdict={{ verdict: 'NO-GO', name: 'METTRE EN VEILLE', line: 'Contrat d’infogérance signé jusqu’en 2028.' }}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 4 })[0]).toHaveTextContent('Verdict stratégique')
    expect(screen.getByText('METTRE EN VEILLE')).toBeInTheDocument()
    expect(screen.queryByText('NO-GO')).not.toBeInTheDocument()
    expect(screen.getByText('Contrat d’infogérance signé jusqu’en 2028.')).toBeInTheDocument()
    // Aucune probabilité : le verdict est une décision nommée, jamais un pourcentage.
    expect(screen.queryByText(/%/)).toBeNull()
  })
})
