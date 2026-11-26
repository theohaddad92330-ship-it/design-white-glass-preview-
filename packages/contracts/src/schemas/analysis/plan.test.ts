import { describe, expect, it } from 'vitest'
import { mainRisk, type PlanRisk } from './plan.js'

/**
 * #2304.8 (épopée #2932, LAU-FINAL-045) — Q7 « quel est le principal risque
 * du compte ». `risks` existait déjà (`planRiskSchema`, rendu par l'onglet
 * Évaluation) mais rien ne réduisait la liste à UN risque principal pour la
 * lecture verdict — la Synthèse n'avait pas de réponse à Q7.
 *
 * `mainRisk` est une DÉRIVATION pure (GA-26, comme `computeDossierScore`) :
 * jamais un second appel modèle pour une donnée déjà écrite. Le classement
 * porte sur l'IMPACT d'abord (critique > important > modéré), la probabilité
 * ensuite (haute > moyenne > basse) — un risque critique mais improbable
 * reste plus grave qu'un risque probable mais mineur.
 */
describe('mainRisk — le risque PRINCIPAL, dérivé, jamais un second calcul modèle', () => {
  it('rend null sur une liste vide ou absente — jamais un risque inventé', () => {
    expect(mainRisk(undefined)).toBeNull()
    expect(mainRisk([])).toBeNull()
  })

  it('un seul risque : il est le principal', () => {
    const risk: PlanRisk = { risk: 'Panel fournisseur fermé', probability: 'haute', impact: 'critique' }
    expect(mainRisk([risk])).toBe(risk)
  })

  it("l'IMPACT prime sur la probabilité — critique+basse bat important+haute", () => {
    const critiqueBasse: PlanRisk = { risk: 'Rupture de contrat cadre', probability: 'basse', impact: 'critique' }
    const importantHaute: PlanRisk = { risk: 'Cycle de vente long', probability: 'haute', impact: 'important' }
    expect(mainRisk([importantHaute, critiqueBasse])).toBe(critiqueBasse)
  })

  it('à impact égal, la probabilité la plus haute départage', () => {
    const haute: PlanRisk = { risk: 'Concurrent déjà en place', probability: 'haute', impact: 'important' }
    const basse: PlanRisk = { risk: 'Budget non confirmé', probability: 'basse', impact: 'important' }
    expect(mainRisk([basse, haute])).toBe(haute)
  })

  it('un impact ou une probabilité absente ou hors énumération se classe en dernier, jamais en premier', () => {
    const inconnu: PlanRisk = { risk: 'Risque non qualifié' }
    const modere: PlanRisk = { risk: 'Accès difficile au décideur', probability: 'moyenne', impact: 'modere' }
    expect(mainRisk([inconnu, modere])).toBe(modere)
  })

  it('premier arrivé gagne une égalité stricte — jamais un ordre qui varie sans raison', () => {
    const a: PlanRisk = { risk: 'A', probability: 'haute', impact: 'critique' }
    const b: PlanRisk = { risk: 'B', probability: 'haute', impact: 'critique' }
    expect(mainRisk([a, b])).toBe(a)
  })

  it('un risque sans texte lisible ne devient jamais le principal quand un autre en porte un', () => {
    const vide: PlanRisk = { risk: null, probability: 'haute', impact: 'critique' }
    const nomme: PlanRisk = { risk: 'Filiale sans budget propre', probability: 'basse', impact: 'modere' }
    expect(mainRisk([vide, nomme])).toBe(nomme)
  })
})
