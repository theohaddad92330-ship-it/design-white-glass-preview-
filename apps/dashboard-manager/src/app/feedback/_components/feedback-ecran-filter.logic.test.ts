import { describe, expect, it } from 'vitest'
import type { FeedbackItem } from '@/lib/feedback'
import { ECRAN_TOUS, SENTINEL_ECRAN_INCONNU, matchEcranFiltre, optionsFiltreEcran } from './feedback-ecran-filter.logic'

/**
 * #1673.3 — LE FILTRE « ÉCRAN CONCERNÉ » de `/feedback`, absent avant ce lot
 * (mesuré : `feedback/page.tsx` n'avait qu'un filtre d'ÉTAT — ouvert/traité/
 * tous — aucune dimension d'écran, alors même que `grouperParEcran` existait
 * déjà pour la VUE « Par écran »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE FICHIER NE RECALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `optionsFiltreEcran` s'appuie sur `grouperParEcran`/`ecranDe`
 * (`feedback.logic.ts`, déjà testés) — deux dérivations du même
 * regroupement divergeraient (GA-26). Ce module ADAPTE seulement leur
 * résultat à la forme que `FilterBar` attend (`key`/`label`/`count`), et
 * décide si UN retour matche le filtre actif.
 */

function retour(patch: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: 'f1',
    user_id: 'u1',
    account_id: null,
    category: 'bug',
    message: 'ça plante',
    user_email: null,
    page_url: null,
    user_agent: null,
    console_logs: null,
    client_context: null,
    github_issue_number: 100,
    github_issue_url: 'https://github.com/o/r/issues/100',
    created_at: '2026-09-05T12:00:00Z',
    issue: null,
    ...patch,
  }
}

const AVEC_ROUTE = (route: string): FeedbackItem => retour({ client_context: { appContext: { route } } })

describe('optionsFiltreEcran — "Tous" en tête, puis un pilule par écran, dans l’ordre de `grouperParEcran`', () => {
  it('rend "Tous" avec le compte TOTAL, puis un écran par groupe avec SON compte', () => {
    const items = [AVEC_ROUTE('/analysis/:id'), AVEC_ROUTE('/analysis/:id'), AVEC_ROUTE('/feedback')]
    const options = optionsFiltreEcran(items, 'Tous les écrans')

    expect(options[0]).toEqual({ key: 'tous', label: 'Tous les écrans', count: 3 })
    // `/analysis/:id` signalé deux fois : trié EN PREMIER par volume (hérité
    // de `grouperParEcran`, pas recalculé ici).
    expect(options[1]).toEqual({ key: '/analysis/:id', label: '/analysis/:id', count: 2 })
    expect(options[2]).toEqual({ key: '/feedback', label: '/feedback', count: 1 })
  })

  it('un retour SANS écran devient l’option "écran inconnu", jamais absorbé dans une autre', () => {
    const items = [retour({ client_context: null, page_url: null })]
    const options = optionsFiltreEcran(items, 'Tous les écrans')
    expect(options).toHaveLength(2)
    expect(options[1]).toMatchObject({ key: SENTINEL_ECRAN_INCONNU, count: 1 })
  })

  it('sait dire NON : sans aucun retour, il ne reste QUE "Tous" (à zéro, un vrai zéro mesuré)', () => {
    expect(optionsFiltreEcran([], 'Tous les écrans')).toEqual([{ key: 'tous', label: 'Tous les écrans', count: 0 }])
  })
})

describe('matchEcranFiltre — "tous" ne filtre rien ; un écran précis ne matche QUE lui', () => {
  it('"tous" accepte tout retour, écran connu ou non', () => {
    expect(matchEcranFiltre(AVEC_ROUTE('/queues'), ECRAN_TOUS)).toBe(true)
    expect(matchEcranFiltre(retour({ client_context: null, page_url: null }), ECRAN_TOUS)).toBe(true)
  })

  it('un écran précis matche SEULEMENT les retours de cet écran', () => {
    expect(matchEcranFiltre(AVEC_ROUTE('/queues'), '/queues')).toBe(true)
    expect(matchEcranFiltre(AVEC_ROUTE('/feedback'), '/queues')).toBe(false)
  })

  it('le sentinel "écran inconnu" matche les retours SANS écran, jamais un retour qui EN a un', () => {
    expect(matchEcranFiltre(retour({ client_context: null, page_url: null }), SENTINEL_ECRAN_INCONNU)).toBe(true)
    expect(matchEcranFiltre(AVEC_ROUTE('/queues'), SENTINEL_ECRAN_INCONNU)).toBe(false)
  })
})
