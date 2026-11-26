import { staleGesture } from './stale-alert'

/**
 * #1326 (6/9.2) — « Aujourd'hui "36 jours sans mouvement" informe mais ne
 * permet pas vraiment d'agir. Aucune alerte ne doit être affichée sans action
 * associée. »
 *
 * C'est la cause racine « une réponse juste sans chemin », et le dépôt l'a déjà
 * payée : trois familles de relances s'affichaient sans aucun geste pour les
 * fermer (#1285).
 *
 * Le geste se DÉDUIT de l'étape, qui est une donnée réelle — rien n'est
 * inventé. Les trois exemples de l'issue s'y retrouvent :
 *   « besoin exprimé mais aucun profil présenté » → lancer le matching
 *   « aucun contact actif »                       → trouver un interlocuteur
 *   « 36 jours sans mouvement »                   → préparer une relance
 */
describe('l’alerte de stagnation nomme le geste suivant', () => {
  it('sur un besoin confirmé, propose de lancer le matching', () => {
    expect(staleGesture('confirmed')).toBe('matching')
  })

  it('sur un projet seulement qualifié, propose de trouver un interlocuteur', () => {
    expect(staleGesture('qualified')).toBe('contact')
  })

  it('une fois des profils présentés, propose de relancer', () => {
    expect(staleGesture('profiles_submitted')).toBe('relance')
    expect(staleGesture('negotiation')).toBe('relance')
  })

  it('sur une piste seulement DÉTECTÉE, propose de qualifier — jamais de relancer', () => {
    // Relancer quelqu'un qu'on n'a jamais contacté n'a pas de sens, et
    // « détecté » n'est pas « exprimé par le client ».
    expect(staleGesture('detected')).toBe('qualifier')
    expect(staleGesture('potential')).toBe('qualifier')
  })

  it('sur une affaire CLOSE, ne propose RIEN — il n’y a rien à relancer', () => {
    // Une alerte sur un projet gagné ou perdu serait du bruit. `null` dit qu'il
    // n'y a pas de geste, il ne fabrique pas un geste par défaut.
    expect(staleGesture('won')).toBeNull()
    expect(staleGesture('lost')).toBeNull()
  })

  it('sur une étape qu’on ne connaît pas, ne DEVINE pas un geste', () => {
    expect(staleGesture('dormant')).toBeNull()
  })
})
