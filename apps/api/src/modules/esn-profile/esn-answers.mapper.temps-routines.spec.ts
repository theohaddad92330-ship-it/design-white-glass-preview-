import { mapRowToAnswers } from './esn-answers.mapper'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * #2050 / #2051 (lot L19) — garde de non-régression sur le motif n°1 de ce
 * dépôt : « du code juste, calculé, testé, que personne n'appelle ». La colonne
 * existe (migration 1794023117482), la question existe (sous-étapes `temps`,
 * `temps-charge`, `routines`) — sans cette projection, un profil rempli
 * reviendrait VIDE au rechargement de l'écran et les neuf réponses seraient
 * perdues en silence.
 *
 * Fichier séparé de `esn-answers.mapper.spec.ts` à dessein : sept lots écrivent
 * en parallèle sur le questionnaire cette nuit, et un fichier par lot évite que
 * deux gardes correctes se détruisent l'une l'autre à la fusion.
 */
describe('mapRowToAnswers — capacité réelle + continuité des dossiers (#2050, #2051)', () => {
  const row = {
    weekly_sales_time_declared: '5 à 10 heures par semaine',
    weekly_sales_time_protected: '2 à 5 heures par semaine',
    weekly_sales_time_residual: 'Moins de 2 heures par semaine',
    weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
    competing_workloads: ['Le delivery et le suivi des consultants en poste'],
    workload_variability: 'Elle est imprévisible, un imprévu peut manger la semaine',
    protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
    dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
    dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  } as unknown as EsnProfileEntity

  it('projette les 9 nouvelles colonnes vers EsnAnswers', () => {
    const answers = mapRowToAnswers(row)
    expect(answers.weekly_sales_time_declared).toBe('5 à 10 heures par semaine')
    expect(answers.weekly_sales_time_protected).toBe('2 à 5 heures par semaine')
    expect(answers.weekly_sales_time_residual).toBe('Moins de 2 heures par semaine')
    expect(answers.weekly_sales_time_slots).toEqual(['Tôt le matin, avant 9 h'])
    expect(answers.competing_workloads).toEqual(['Le delivery et le suivi des consultants en poste'])
    expect(answers.workload_variability).toBe('Elle est imprévisible, un imprévu peut manger la semaine')
    expect(answers.protected_slot_capacity).toBe('Je bloque des créneaux mais ils sautent souvent')
    expect(answers.dossier_continuity_practices).toEqual(['Une revue hebdomadaire du portefeuille'])
    expect(answers.dossier_continuity_breaks).toEqual(['Un compte reste sans prochaine action'])
  })

  it('garde les TROIS états du temps distincts, jamais fondus en un seul nombre (#2050.11/.12/.13)', () => {
    const answers = mapRowToAnswers(row)
    // Le témoin de la règle : trois valeurs DIFFÉRENTES survivent à la
    // projection. Une projection qui recopierait l'une sur les trois — ou qui
    // dériverait le résiduel par soustraction — rendrait ici trois fois la même
    // chose, et le produit aurait fabriqué le chiffre que #2050 combat.
    const trois = [
      answers.weekly_sales_time_declared,
      answers.weekly_sales_time_protected,
      answers.weekly_sales_time_residual,
    ]
    expect(new Set(trois).size).toBe(3)
  })

  it("rend `null` / `[]` — jamais `undefined` ni `'0'` — quand aucune ligne n'existe", () => {
    const answers = mapRowToAnswers(null)
    expect(answers.weekly_sales_time_declared).toBeNull()
    expect(answers.weekly_sales_time_protected).toBeNull()
    expect(answers.weekly_sales_time_residual).toBeNull()
    expect(answers.workload_variability).toBeNull()
    expect(answers.protected_slot_capacity).toBeNull()
    // Une liste vide n'est PAS « aucune routine » : le catalogue porte pour cela
    // une option explicite que la personne coche elle-même.
    expect(answers.weekly_sales_time_slots).toEqual([])
    expect(answers.competing_workloads).toEqual([])
    expect(answers.dossier_continuity_practices).toEqual([])
    expect(answers.dossier_continuity_breaks).toEqual([])
  })
})
