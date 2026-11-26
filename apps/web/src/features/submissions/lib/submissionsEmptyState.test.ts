import { describe, expect, it } from 'vitest'
import { submissionsEmptyStateAction } from './submissionsEmptyState'

/**
 * L'état vide de la page des positionnements — GA-197.
 *
 * La page (I-57) montrait « aucun CV envoyé » sans aucun geste : ni pour
 * démarrer, ni pour distinguer un portefeuille RÉELLEMENT vide d'une
 * recherche trop précise sur un portefeuille qui ne l'est pas. Même esprit
 * que `talentEmptyStateAction` (vivier) et `emptyListAction` (comptes) : un
 * axe de restriction posé et qui ne rend rien se RETIRE, il ne déclenche
 * jamais le geste de création.
 */
describe('submissionsEmptyStateAction', () => {
  it('aucune recherche posée : démarrer — le geste est d’aller matcher un talent', () => {
    expect(submissionsEmptyStateAction('')).toEqual({ kind: 'start' })
  })

  it('une recherche blanche compte comme aucune recherche', () => {
    expect(submissionsEmptyStateAction('   ')).toEqual({ kind: 'start' })
  })

  it('une recherche posée : le geste est de la RETIRER, jamais de créer', () => {
    expect(submissionsEmptyStateAction('Dupont')).toEqual({ kind: 'clearSearch', query: 'Dupont' })
  })

  it('une recherche posée avec des espaces autour : l’axe rendu est TRIMÉ', () => {
    expect(submissionsEmptyStateAction('  Dupont  ')).toEqual({ kind: 'clearSearch', query: 'Dupont' })
  })
})
