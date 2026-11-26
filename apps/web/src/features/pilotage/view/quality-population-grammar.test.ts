import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/pilotage.json'

/**
 * L'ARTICLE de `quality.emptyPopulation` suit le GENRE du nom qu'il porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `DataToComplete` rend `t('quality.emptyPopulation', { population: t('quality.
 * population.<clé>') })` sur `/pilotage` (ex-onglet Qualité des données). Le gabarit portait
 * un article MASCULIN figé (« aucun {{population}} ») pendant que deux des huit
 * populations — les deux contrôles sur les missions — sont un nom FÉMININ
 * (« mission active »). Le résultat : « aucun mission active dans ton espace »,
 * un accord fautif, répété sur deux des huit lignes de l'écran.
 *
 * Le correctif déplace l'article DANS chaque population (déjà accordé), et le
 * gabarit ne porte plus que le reste de la phrase — ce que ce test vérifie en
 * recomposant la même interpolation que l'écran, sans avoir besoin de monter
 * `DataToComplete`.
 */
function interpolate(population: string): string {
  return fr.quality.emptyPopulation.replace('{{population}}', population)
}

describe('quality.emptyPopulation — l’article suit le genre du nom (FR)', () => {
  it('lit vraiment un corpus non vide — les huit populations existent', () => {
    expect(Object.keys(fr.quality.population).length).toBeGreaterThanOrEqual(8)
  })

  it('« mission » est féminin : jamais « aucun mission »', () => {
    const withoutEndDate = interpolate(fr.quality.population.missions_without_end_date)
    const withoutCost = interpolate(fr.quality.population.missions_without_cost)

    expect(withoutEndDate).not.toMatch(/\baucun mission\b/)
    expect(withoutCost).not.toMatch(/\baucun mission\b/)
    expect(withoutEndDate).toContain('aucune mission active')
    expect(withoutCost).toContain('aucune mission active')
  })

  it('les populations masculines gardent « aucun »', () => {
    expect(interpolate(fr.quality.population.talents_unknown_availability)).toContain('aucun consultant')
    expect(interpolate(fr.quality.population.contacts_without_email)).toContain('aucun contact')
    expect(interpolate(fr.quality.population.accounts_without_next_action)).toContain('aucun compte suivi')
    expect(interpolate(fr.quality.population.projects_without_amount)).toContain('aucun projet ouvert')
    expect(interpolate(fr.quality.population.needs_without_skills)).toContain('aucun besoin ouvert')
    expect(interpolate(fr.quality.population.unresolved_duplicates)).toContain('aucun doublon repéré')
  })

  it('la phrase entière reste inchangée pour un nom masculin — seul l’accord féminin bouge', () => {
    expect(interpolate(fr.quality.population.talents_unknown_availability)).toBe(
      'aucun consultant dans ton espace — rien à mesurer',
    )
  })
})
