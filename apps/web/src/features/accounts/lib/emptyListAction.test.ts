import { describe, expect, it } from 'vitest'
import { emptyListAction } from './emptyListAction'

/**
 * #1134 — « c'est normal qu'il ne trouve aucun résultat alors que cette société
 * existe ? »
 *
 * Oui, et c'est le mot « aucun résultat » qui trompe : cette liste cherche dans
 * TON portefeuille, pas dans le monde. Une société qui existe mais que tu n'as
 * jamais analysée n'y est pas — et l'état vide ne proposait que « modifie ta
 * recherche ou réinitialise les filtres », c'est-à-dire deux gestes qui ne
 * peuvent pas la faire apparaître.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANQUE C DU 30/08 — GÉNÉRALISÉ À TOUS LES FILTRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rangement du cycle commercial (`lifecycle`) était le SEUL axe nommé : sous
 * `?lifecycle=opportunity`, l'écran savait dire « aucun de tes comptes n'est
 * rangé en “À potentiel” ». Un filtre de statut, de score, de secteur, de
 * priorité ou d'accessibilité qui ne rendait rien recevait le message
 * générique du portefeuille FILTRÉ — jamais nommé, jamais isolé.
 *
 * Le second paramètre n'est donc plus « le rangement, ou rien » : c'est la
 * liste des axes de restriction ACTIFS, quelle que soit leur nature. UN SEUL
 * axe actif ⇒ on le NOMME et on offre de le retirer, seul — jamais un geste
 * payant pour un problème qu'un clic résout. Plusieurs à la fois ⇒ on ne sait
 * plus dire LEQUEL retirer isolément : le geste générique reste.
 */
describe('emptyListAction', () => {
  it('propose d’ANALYSER le nom tapé — le seul geste qui peut le faire exister', () => {
    expect(emptyListAction('VIASANTE MUTUELLE', [])).toEqual({ kind: 'analyse', company: 'VIASANTE MUTUELLE' })
  })

  it('coupe les espaces autour du nom avant de le proposer', () => {
    // Le nom part dans une URL et s'affiche dans le bouton : un espace en trop
    // se voit dans les deux.
    expect(emptyListAction('  KLESIA  ', [])).toEqual({ kind: 'analyse', company: 'KLESIA' })
  })

  it('sans nom tapé et sans filtre, ne propose PAS d’analyser', () => {
    // Aucun filtre à facettes, aucun nom : rien à relâcher, rien à faire
    // apparaître. Proposer « analyser » sans nom ouvrirait une recherche vide.
    expect(emptyListAction('', [])).toEqual({ kind: 'filters' })
    expect(emptyListAction('   ', [])).toEqual({ kind: 'filters' })
  })

  it('le paramètre des filtres est optionnel — comportement inchangé sans lui', () => {
    expect(emptyListAction('VIASANTE MUTUELLE')).toEqual({ kind: 'analyse', company: 'VIASANTE MUTUELLE' })
    expect(emptyListAction('')).toEqual({ kind: 'filters' })
  })

  /**
   * UN SEUL axe actif — chacun testé ISOLÉMENT, quelle que soit sa nature.
   * C'est le corps du manque C : avant, seul `lifecycle` déclenchait ce
   * traitement ; désormais les cinq s'y comportent pareil, parce que la
   * fonction ne connaît AUCUN filtre par son nom — elle compte des axes.
   */
  it.each([
    ['lifecycle', 'opportunity'],
    ['status', 'completed'],
    ['score', 'high'],
    ['sector', 'Banque & Assurance'],
    ['gate', 'parked'],
    ['accessClass', 'A'],
  ])('un seul axe actif (%s) NOMME ce filtre — jamais « analyser », jamais le générique', (id, value) => {
    expect(emptyListAction('VIASANTE MUTUELLE', [{ id, value }])).toEqual({
      kind: 'namedFilter',
      axis: { id, value },
    })
    // Le geste payant ne revient pas non plus quand rien n'est tapé.
    expect(emptyListAction('', [{ id, value }])).toEqual({ kind: 'namedFilter', axis: { id, value } })
  })

  it('plusieurs axes actifs à la fois — retour au geste générique, on ne sait plus lequel nommer', () => {
    expect(
      emptyListAction('', [
        { id: 'status', value: 'completed' },
        { id: 'sector', value: 'Banque & Assurance' },
      ]),
    ).toEqual({ kind: 'filters' })
  })

  it('sans aucun axe, la proposition d’analyse revient', () => {
    expect(emptyListAction('VIASANTE MUTUELLE', [])).toEqual({ kind: 'analyse', company: 'VIASANTE MUTUELLE' })
  })
})
